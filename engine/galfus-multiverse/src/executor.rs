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
    let mut scratch = ctx.scratch_texture.take();

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

            // Ensure scratch texture matches invocation viewport size
            if let Some((old_tex, _, size)) = scratch
                && size != UVec2::new(width, height)
            {
                let _ = gpu.textures.destroy_texture(old_tex);
                scratch = None;
            }
            if scratch.is_none() {
                let tex_desc = GpuTextureDesc {
                    label: Some("Multiverse Invocation Scratch Texture".to_string()),
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
                scratch = Some((tex_h, view_h, UVec2::new(width, height)));
            }

            let (_, scratch_view_h, _) = scratch.as_ref().unwrap();
            let scratch_view = gpu
                .textures
                .get_view(*scratch_view_h)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                .raw()
                .clone();

            // Clear scratch texture with invocation clear color
            let clear = step.clear_color.unwrap_or([0.0, 0.0, 0.0, 1.0]);
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

            // Composite scratch texture into target_view with filter at viewport vp
            if let (Some(target_v), Some(target_fmt), Some(post_proc)) =
                (&target_view, target_format, &mut ctx.post_processor)
            {
                let filter = step.filters.first();
                let pass_desc = FilterPassDesc {
                    src_view: &scratch_view,
                    dst_view: target_v,
                    dst_format: target_fmt,
                    dst_size: target_size,
                    viewport: Some(vp),
                };
                let target_textures = &ctx.target_textures;
                let tex_resolver = |id: u32| {
                    if let Some((_, view_h, _)) = target_textures.get(&id)
                        && let Ok(view) = gpu.textures.get_view(*view_h)
                    {
                        return Some(view.raw());
                    }
                    gpu.textures.get_logical_view(id).ok().map(|v| v.raw())
                };
                post_proc.render_filter(
                    gpu.device(),
                    gpu.queue(),
                    filter,
                    &tex_resolver,
                    &pass_desc,
                )?;
            }
        }
    }

    ctx.scratch_texture = scratch;

    // Present all active window swapchains
    for (_, surface_tex) in surface_textures {
        surface_tex.present();
    }

    Ok(())
}
