use std::collections::HashMap;

use galfus_gpu_manager::types::{
    GpuTextureDesc, NormalizedTextureFormat, TextureDimension, TextureUsageFlags,
};
use galfus_realm_core::{RealmInvocationContext, RealmPrepareContext};
use glam::UVec2;

use crate::context::MultiverseContext;
use crate::error::{MultiverseError, MultiverseResult};
use crate::postprocess::FilterPassDesc;
use crate::types::TargetKind;

/// Executes a single dispatched frame across realms, targets, and invocations.
pub(crate) fn execute_frame(
    ctx: &mut MultiverseContext,
    frame_id: u64,
    delta_time: f32,
) -> MultiverseResult<()> {
    let schedule = ctx.resolve()?.clone();

    ctx.ensure_gpu_manager()?;
    let gpu = ctx.gpu_manager.as_ref().unwrap();

    let target_textures = &ctx.target_textures;
    let tex_resolver = |id: u32| {
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
            let vp = step.resolved_viewport;
            let width = vp.z.max(1);
            let height = vp.w.max(1);
            let needed_size = UVec2::new(width, height);

            // Ensure invocation scratch texture matches its viewport size
            let needs_scratch_realloc = match ctx.scratch_textures.get(&step.invocation_id) {
                Some((_, _, size)) => *size != needed_size,
                None => true,
            };
            if needs_scratch_realloc {
                if let Some((old_tex, _, _)) = ctx.scratch_textures.remove(&step.invocation_id) {
                    let _ = gpu.textures.destroy_texture(old_tex);
                }
                let tex_desc = GpuTextureDesc {
                    label: Some(format!(
                        "Multiverse Invocation #{} Scratch",
                        step.invocation_id
                    )),
                    width,
                    height,
                    depth_or_layers: 1,
                    mip_levels: 1,
                    sample_count: 1,
                    dimension: TextureDimension::D2,
                    format: NormalizedTextureFormat::Rgba8Unorm,
                    usages: TextureUsageFlags::default(),
                };
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
                ctx.scratch_textures
                    .insert(step.invocation_id, (tex_h, view_h, needed_size));
            }

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

            // Invoke realm render
            if let Some(realm) = ctx.realms.get_mut(&step.realm_id) {
                let inv_ctx = RealmInvocationContext {
                    frame_id,
                    invocation_id: step.invocation_id,
                    target_id: block.target_id,
                    camera_slot: step.camera_slot,
                    viewport: step.resolved_viewport,
                    device: gpu.device(),
                    queue: gpu.queue(),
                    target_view: &scratch_view,
                    target_format: wgpu::TextureFormat::Rgba8Unorm,
                };
                realm
                    .render(&inv_ctx)
                    .map_err(|e| MultiverseError::RealmError(realm.id(), e.to_string()))?;
            }

            let effective_aa = step.anti_aliasing.unwrap_or(ctx.anti_aliasing);
            let mut filters = step.filters.clone();
            if effective_aa == crate::types::AntiAliasingMode::Fxaa
                && !filters.contains(&crate::types::InvocationFilter::Fxaa)
            {
                filters.push(crate::types::InvocationFilter::Fxaa);
            }

            if filters.len() > 1 {
                let needs_pp_realloc = match ctx.ping_pong_texture {
                    Some((_, _, size)) => size != needed_size,
                    None => true,
                };
                if needs_pp_realloc {
                    if let Some((old_tex, _, _)) = ctx.ping_pong_texture.take() {
                        let _ = gpu.textures.destroy_texture(old_tex);
                    }
                    let pp_desc = GpuTextureDesc {
                        label: Some("Multiverse Filter PingPong Texture".to_string()),
                        width,
                        height,
                        depth_or_layers: 1,
                        mip_levels: 1,
                        sample_count: 1,
                        dimension: TextureDimension::D2,
                        format: NormalizedTextureFormat::Rgba8Unorm,
                        usages: TextureUsageFlags::default(),
                    };
                    let device = gpu.context.device_arc();
                    let pp_tex_h = gpu
                        .textures
                        .create_texture(&device, &pp_desc)
                        .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
                    let pp_view_h = gpu
                        .textures
                        .get_texture(pp_tex_h)
                        .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                        .default_view();
                    ctx.ping_pong_texture = Some((pp_tex_h, pp_view_h, needed_size));
                }
            }

            // Composite scratch texture into target_view with filter chain at viewport vp
            if let (Some(target_v), Some(target_fmt), Some(post_proc)) =
                (&target_view, target_format, &mut ctx.post_processor)
            {
                let target_textures = &ctx.target_textures;
                let tex_resolver = |id: u32| {
                    if let Some((_, view_h, _)) = target_textures.get(&id)
                        && let Ok(view) = gpu.textures.get_view(*view_h)
                    {
                        return Some(view.raw());
                    }
                    gpu.textures.get_logical_view(id).ok().map(|v| v.raw())
                };

                if filters.is_empty() {
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
                    // Multi-filter chaining via ping-pong intermediate texture
                    let pp_view_h = ctx.ping_pong_texture.as_ref().unwrap().1;
                    let ping_pong_view = gpu
                        .textures
                        .get_view(pp_view_h)
                        .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                        .raw()
                        .clone();

                    let mut current_is_scratch = true;
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
    }

    // Present all active window swapchains
    for (_, surface_tex) in surface_textures {
        surface_tex.present();
    }

    Ok(())
}
