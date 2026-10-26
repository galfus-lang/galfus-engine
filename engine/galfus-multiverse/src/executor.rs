use std::collections::{HashMap, HashSet};

use galfus_gpu_manager::types::{
    GpuTextureDesc, NormalizedTextureFormat, TextureDimension, TextureUsageFlags,
};
use galfus_realm_core::{RealmInvocationContext, RealmPrepareContext};
use glam::UVec2;

use crate::context::MultiverseContext;
use crate::error::{MultiverseError, MultiverseResult};
use crate::postprocess::FilterPassDesc;
use crate::types::TargetKind;

#[path = "executor_resources.rs"]
mod executor_resources;

/// Executes a single dispatched frame across realms, targets, and invocations.
pub(crate) fn execute_frame(
    ctx: &mut MultiverseContext,
    frame_id: u64,
    delta_time: f32,
) -> MultiverseResult<()> {
    let schedule = ctx.resolve()?.clone();

    ctx.ensure_gpu_manager()?;

    let soft_cut_sources = {
        let default_aa = ctx.anti_aliasing;
        let gpu = ctx.gpu_manager.as_mut().unwrap();
        executor_resources::prune_resources_for_schedule(
            &mut ctx.target_history_textures,
            &mut ctx.scratch_textures,
            &mut ctx.taa_history,
            gpu,
            &schedule,
            default_aa,
        )?
    };

    for src_id in &soft_cut_sources {
        if !ctx.target_history_textures.contains_key(src_id)
            && let Some(target) = ctx.targets.get(src_id)
            && let TargetKind::Texture {
                width,
                height,
                format,
            } = &target.kind
        {
            let norm_format = NormalizedTextureFormat::parse_str(format).ok_or_else(|| {
                MultiverseError::InvalidConfig(format!(
                    "Unsupported render target texture format: '{format}'"
                ))
            })?;
            let wgpu_format = norm_format.to_wgpu();
            let tex_desc = GpuTextureDesc {
                label: Some(format!("Multiverse Target {src_id} History Texture")),
                width: *width,
                height: *height,
                depth_or_layers: 1,
                mip_levels: 1,
                sample_count: 1,
                dimension: TextureDimension::D2,
                format: norm_format,
                usages: TextureUsageFlags::default(),
            };
            let gpu = ctx.gpu_manager.as_mut().unwrap();
            let device = gpu.context.device_arc();
            let tex_h = gpu
                .textures
                .create_texture(&device, &tex_desc)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            let view_h = gpu
                .textures
                .get_texture(tex_h)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                .default_view();
            ctx.target_history_textures
                .insert(*src_id, (tex_h, view_h, wgpu_format));
        }
    }

    let gpu = ctx.gpu_manager.as_ref().unwrap();

    let target_textures = &ctx.target_textures;
    let target_history_textures = &ctx.target_history_textures;
    let tex_resolver = |id: u32| {
        // In the prepare phase before rendering any targets, return the N-1 historical texture
        // if this target is an unresolved dependency in a soft cut.
        if let Some((_, view_h, _)) = target_history_textures.get(&id)
            && let Ok(view) = gpu.textures.get_view(*view_h)
        {
            return Some(view.raw());
        }
        if let Some((_, view_h, _)) = target_textures.get(&id)
            && let Ok(view) = gpu.textures.get_view(*view_h)
        {
            return Some(view.raw());
        }
        gpu.textures.get_logical_view(id).ok().map(|v| v.raw())
    };

    // 1. Prepare all active realms once
    let prep_ctx = RealmPrepareContext {
        frame_id,
        delta_time,
        device: gpu.device(),
        queue: gpu.queue(),
        textures: &tex_resolver,
    };
    for realm in ctx.realms.values_mut() {
        realm
            .prepare(&prep_ctx)
            .map_err(|e| MultiverseError::RealmError(realm.id(), e.to_string()))?;
    }

    // 2. GPU execution path
    let gpu = ctx.gpu_manager.as_mut().unwrap();
    let mut surface_textures: HashMap<u32, wgpu::SurfaceTexture> = HashMap::new();
    let mut rendered_targets: HashSet<u32> = HashSet::new();

    for block in &schedule.target_blocks {
        let target = ctx.targets.get(&block.target_id);

        let (target_view, target_format, target_size) = match target.map(|t| &t.kind) {
            Some(TargetKind::Window { window_id }) => {
                if let Some(surface) = ctx.surfaces.get(window_id) {
                    let surface_tex = surface
                        .acquire_current_texture()
                        .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
                    let view = surface_tex
                        .texture
                        .create_view(&wgpu::TextureViewDescriptor::default());
                    let format = surface.format();
                    let size = surface.size();
                    surface_textures.insert(*window_id, surface_tex);
                    (Some(view), Some(format), size)
                } else {
                    (None, None, UVec2::new(1, 1))
                }
            }
            Some(TargetKind::Texture { width, height, .. }) => {
                let size = UVec2::new(*width, *height);
                if let Some((_, view_handle, format)) = ctx.target_textures.get(&block.target_id) {
                    if let Ok(tex_view) = gpu.textures.get_view(*view_handle) {
                        (Some(tex_view.raw().clone()), Some(*format), size)
                    } else {
                        (None, None, size)
                    }
                } else {
                    (None, None, size)
                }
            }
            None => (None, None, UVec2::new(1, 1)),
        };

        // Clear target surface once at the start of the target block
        if let Some(view) = &target_view {
            let mut encoder =
                gpu.device()
                    .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                        label: Some("Target Initial Clear Encoder"),
                    });
            {
                let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("Target Initial Clear Pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view,
                        resolve_target: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color {
                                r: 0.02,
                                g: 0.02,
                                b: 0.02,
                                a: 1.0,
                            }),
                            store: wgpu::StoreOp::Store,
                        },
                        depth_slice: None,
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });
            }
            gpu.queue().submit(Some(encoder.finish()));
        }

        // Execute Invocations
        for step in &block.invocations {
            let effective_aa = step.anti_aliasing.unwrap_or(ctx.anti_aliasing);
            let ssaa_scale = match effective_aa {
                crate::types::AntiAliasingMode::Ssaa2x => 2,
                crate::types::AntiAliasingMode::Ssaa4x => 4,
                _ => 1,
            };

            let vp = step.resolved_viewport;
            let width = vp.z.max(1) * ssaa_scale;
            let height = vp.w.max(1) * ssaa_scale;
            let needed_size = UVec2::new(width, height);

            executor_resources::ensure_scratch_texture(
                &mut ctx.scratch_textures,
                gpu,
                step.invocation_id,
                width,
                height,
                needed_size,
            )?;

            let (_, scratch_view_h, _) = ctx.scratch_textures.get(&step.invocation_id).unwrap();
            let scratch_view = gpu
                .textures
                .get_view(*scratch_view_h)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                .raw()
                .clone();

            // Clear scratch texture with invocation clear color
            let clear = step.clear_color.unwrap_or([0.0, 0.0, 0.0, 0.0]);
            let mut encoder =
                gpu.device()
                    .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                        label: Some("Invocation Clear Encoder"),
                    });
            {
                let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("Invocation Clear Pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &scratch_view,
                        resolve_target: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color {
                                r: clear[0] as f64,
                                g: clear[1] as f64,
                                b: clear[2] as f64,
                                a: clear[3] as f64,
                            }),
                            store: wgpu::StoreOp::Store,
                        },
                        depth_slice: None,
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });
            }
            gpu.queue().submit(Some(encoder.finish()));

            // Invoke realm render (scaled by ssaa_scale if SSAA is active)
            if let Some(realm) = ctx.realms.get_mut(&step.realm_id) {
                let mut realm_vp = step.resolved_viewport;
                realm_vp.z *= ssaa_scale;
                realm_vp.w *= ssaa_scale;

                let subpixel_jitter = if effective_aa == crate::types::AntiAliasingMode::Taa {
                    Some(crate::taa::compute_subpixel_jitter(frame_id, width, height))
                } else {
                    None
                };

                let inv_ctx = RealmInvocationContext {
                    frame_id,
                    invocation_id: step.invocation_id,
                    target_id: block.target_id,
                    camera_slot: step.camera_slot,
                    viewport: realm_vp,
                    subpixel_jitter,
                    device: gpu.device(),
                    queue: gpu.queue(),
                    target_view: &scratch_view,
                    target_format: wgpu::TextureFormat::Rgba8Unorm,
                };
                realm
                    .render(&inv_ctx)
                    .map_err(|e| MultiverseError::RealmError(realm.id(), e.to_string()))?;
            }

            let mut filters = step.filters.clone();
            if effective_aa == crate::types::AntiAliasingMode::Fxaa
                && !filters.contains(&crate::types::InvocationFilter::Fxaa)
            {
                filters.push(crate::types::InvocationFilter::Fxaa);
            } else if (effective_aa == crate::types::AntiAliasingMode::Ssaa2x
                || effective_aa == crate::types::AntiAliasingMode::Ssaa4x)
                && !filters.contains(&crate::types::InvocationFilter::SsaaDownsample)
            {
                filters.push(crate::types::InvocationFilter::SsaaDownsample);
            }

            let is_smaa = effective_aa == crate::types::AntiAliasingMode::Smaa
                || filters
                    .iter()
                    .any(|f| matches!(f, crate::types::InvocationFilter::Smaa));
            filters.retain(|f| !matches!(f, crate::types::InvocationFilter::Smaa));

            let is_taa = effective_aa == crate::types::AntiAliasingMode::Taa
                || filters
                    .iter()
                    .any(|f| matches!(f, crate::types::InvocationFilter::Taa));
            filters.retain(|f| !matches!(f, crate::types::InvocationFilter::Taa));

            let needs_pp = filters.len() > 1 || (filters.len() == 1 && (is_smaa || is_taa));
            executor_resources::ensure_postprocess_resources(
                executor_resources::PostprocessResources {
                    smaa_intermediates: &mut ctx.smaa_intermediates,
                    taa_history: &mut ctx.taa_history,
                    ping_pong_texture: &mut ctx.ping_pong_texture,
                },
                gpu,
                executor_resources::PostprocessResourceRequest {
                    invocation_id: step.invocation_id,
                    width,
                    height,
                    needed_size,
                    is_smaa,
                    is_taa,
                    needs_ping_pong: needs_pp,
                },
            )?;

            // Composite scratch texture into target_view with filter chain at viewport vp
            if let (Some(target_v), Some(target_fmt), Some(post_proc)) =
                (&target_view, target_format, &mut ctx.post_processor)
            {
                let target_textures = &ctx.target_textures;
                let target_history_textures = &ctx.target_history_textures;
                let rendered_targets_ref = &rendered_targets;
                let tex_resolver = |id: u32| {
                    if !rendered_targets_ref.contains(&id)
                        && let Some((_, view_h, _)) = target_history_textures.get(&id)
                        && let Ok(view) = gpu.textures.get_view(*view_h)
                    {
                        return Some(view.raw());
                    }
                    if let Some((_, view_h, _)) = target_textures.get(&id)
                        && let Ok(view) = gpu.textures.get_view(*view_h)
                    {
                        return Some(view.raw());
                    }
                    gpu.textures.get_logical_view(id).ok().map(|v| v.raw())
                };

                let pp_view_raw = if needs_pp {
                    let pp_view_h = ctx.ping_pong_texture.as_ref().unwrap().1;
                    Some(
                        gpu.textures
                            .get_view(pp_view_h)
                            .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                            .raw()
                            .clone(),
                    )
                } else {
                    None
                };

                let mut current_is_scratch = true;
                if is_smaa {
                    for filter in &filters {
                        let (src, dst) = if current_is_scratch {
                            (&scratch_view, pp_view_raw.as_ref().unwrap())
                        } else {
                            (pp_view_raw.as_ref().unwrap(), &scratch_view)
                        };
                        let pass_desc = FilterPassDesc {
                            src_view: src,
                            dst_view: dst,
                            dst_format: wgpu::TextureFormat::Rgba8Unorm,
                            dst_size: needed_size,
                            viewport: None,
                        };
                        post_proc.render_filter(
                            gpu.device(),
                            gpu.queue(),
                            Some(filter),
                            &tex_resolver,
                            &pass_desc,
                        )?;
                        current_is_scratch = !current_is_scratch;
                    }

                    let smaa_source = if current_is_scratch {
                        &scratch_view
                    } else {
                        pp_view_raw.as_ref().unwrap()
                    };

                    let (_, e_v, _, w_v, _) = ctx.smaa_intermediates.as_ref().unwrap();
                    let edge_raw = gpu
                        .textures
                        .get_view(*e_v)
                        .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                        .raw()
                        .clone();
                    let weight_raw = gpu
                        .textures
                        .get_view(*w_v)
                        .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                        .raw()
                        .clone();

                    let smaa = post_proc.ensure_smaa(gpu.device(), gpu.queue(), target_fmt);
                    smaa.render_smaa(
                        gpu.device(),
                        gpu.queue(),
                        smaa_source,
                        target_v,
                        &edge_raw,
                        &weight_raw,
                        Some(vp),
                    );
                } else if is_taa {
                    for filter in &filters {
                        let (src, dst) = if current_is_scratch {
                            (&scratch_view, pp_view_raw.as_ref().unwrap())
                        } else {
                            (pp_view_raw.as_ref().unwrap(), &scratch_view)
                        };
                        let pass_desc = FilterPassDesc {
                            src_view: src,
                            dst_view: dst,
                            dst_format: wgpu::TextureFormat::Rgba8Unorm,
                            dst_size: needed_size,
                            viewport: None,
                        };
                        post_proc.render_filter(
                            gpu.device(),
                            gpu.queue(),
                            Some(filter),
                            &tex_resolver,
                            &pass_desc,
                        )?;
                        current_is_scratch = !current_is_scratch;
                    }

                    let taa_source = if current_is_scratch {
                        &scratch_view
                    } else {
                        pp_view_raw.as_ref().unwrap()
                    };

                    let entry = ctx.taa_history.get_mut(&step.invocation_id).unwrap();
                    let (read_vh, write_vh) = if entry.flip {
                        (entry.view_b, entry.view_a)
                    } else {
                        (entry.view_a, entry.view_b)
                    };
                    let read_view_raw = gpu
                        .textures
                        .get_view(read_vh)
                        .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                        .raw()
                        .clone();
                    let write_view_raw = gpu
                        .textures
                        .get_view(write_vh)
                        .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                        .raw()
                        .clone();

                    let blend_factor = if entry.has_history { 0.90 } else { 0.0 };
                    entry.has_history = true;
                    entry.flip = !entry.flip;

                    let taa = post_proc.ensure_taa(gpu.device(), wgpu::TextureFormat::Rgba8Unorm);
                    taa.render_taa(
                        gpu.device(),
                        gpu.queue(),
                        taa_source,
                        &read_view_raw,
                        &write_view_raw,
                        blend_factor,
                        None,
                    );

                    let pass_desc = FilterPassDesc {
                        src_view: &write_view_raw,
                        dst_view: target_v,
                        dst_format: target_fmt,
                        dst_size: target_size,
                        viewport: Some(vp),
                    };
                    post_proc.render_filter(
                        gpu.device(),
                        gpu.queue(),
                        None,
                        &tex_resolver,
                        &pass_desc,
                    )?;
                } else if filters.is_empty() {
                    let pass_desc = FilterPassDesc {
                        src_view: &scratch_view,
                        dst_view: target_v,
                        dst_format: target_fmt,
                        dst_size: target_size,
                        viewport: Some(vp),
                    };
                    post_proc.render_filter(
                        gpu.device(),
                        gpu.queue(),
                        None,
                        &tex_resolver,
                        &pass_desc,
                    )?;
                } else if filters.len() == 1 {
                    let pass_desc = FilterPassDesc {
                        src_view: &scratch_view,
                        dst_view: target_v,
                        dst_format: target_fmt,
                        dst_size: target_size,
                        viewport: Some(vp),
                    };
                    post_proc.render_filter(
                        gpu.device(),
                        gpu.queue(),
                        Some(&filters[0]),
                        &tex_resolver,
                        &pass_desc,
                    )?;
                } else {
                    let ping_pong_view = pp_view_raw.unwrap();
                    for (i, filter) in filters.iter().enumerate() {
                        let is_last = i == filters.len() - 1;
                        if is_last {
                            let src = if current_is_scratch {
                                &scratch_view
                            } else {
                                &ping_pong_view
                            };
                            let pass_desc = FilterPassDesc {
                                src_view: src,
                                dst_view: target_v,
                                dst_format: target_fmt,
                                dst_size: target_size,
                                viewport: Some(vp),
                            };
                            post_proc.render_filter(
                                gpu.device(),
                                gpu.queue(),
                                Some(filter),
                                &tex_resolver,
                                &pass_desc,
                            )?;
                        } else {
                            let (src, dst) = if current_is_scratch {
                                (&scratch_view, &ping_pong_view)
                            } else {
                                (&ping_pong_view, &scratch_view)
                            };
                            let pass_desc = FilterPassDesc {
                                src_view: src,
                                dst_view: dst,
                                dst_format: wgpu::TextureFormat::Rgba8Unorm,
                                dst_size: needed_size,
                                viewport: None,
                            };
                            post_proc.render_filter(
                                gpu.device(),
                                gpu.queue(),
                                Some(filter),
                                &tex_resolver,
                                &pass_desc,
                            )?;
                            current_is_scratch = !current_is_scratch;
                        }
                    }
                }
            }
        }

        rendered_targets.insert(block.target_id);

        executor_resources::copy_target_history(
            &ctx.target_textures,
            &ctx.target_history_textures,
            gpu,
            block.target_id,
            target_size,
        );
    }

    // Present all active window swapchains
    for (_, surface_tex) in surface_textures {
        surface_tex.present();
    }

    Ok(())
}
