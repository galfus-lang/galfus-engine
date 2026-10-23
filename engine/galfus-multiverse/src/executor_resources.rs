//! Allocates per-invocation textures required by frame execution.

use std::collections::HashMap;

use galfus_gpu_manager::GpuManager;
use galfus_gpu_manager::handle::{GpuTextureHandle, GpuTextureViewHandle};
use galfus_gpu_manager::types::{
    GpuTextureDesc, NormalizedTextureFormat, TextureDimension, TextureUsageFlags,
};
use glam::UVec2;

use crate::context::TaaHistoryEntry;
use crate::error::{MultiverseError, MultiverseResult};

type TextureBinding = (GpuTextureHandle, GpuTextureViewHandle, wgpu::TextureFormat);

pub(crate) struct PostprocessResources<'a> {
    pub smaa_intermediates: &'a mut Option<(
        GpuTextureHandle,
        GpuTextureViewHandle,
        GpuTextureHandle,
        GpuTextureViewHandle,
        UVec2,
    )>,
    pub taa_history: &'a mut HashMap<u32, TaaHistoryEntry>,
    pub ping_pong_texture: &'a mut Option<(GpuTextureHandle, GpuTextureViewHandle, UVec2)>,
}

pub(crate) struct PostprocessResourceRequest {
    pub invocation_id: u32,
    pub width: u32,
    pub height: u32,
    pub needed_size: UVec2,
    pub is_smaa: bool,
    pub is_taa: bool,
    pub needs_ping_pong: bool,
}

pub(crate) fn ensure_scratch_texture(
    scratch_textures: &mut HashMap<u32, (GpuTextureHandle, GpuTextureViewHandle, UVec2)>,
    gpu: &mut GpuManager,
    invocation_id: u32,
    width: u32,
    height: u32,
    needed_size: UVec2,
) -> MultiverseResult<()> {
    // Ensure invocation scratch texture matches its viewport size
    let needs_scratch_realloc = match scratch_textures.get(&invocation_id) {
        Some((_, _, size)) => *size != needed_size,
        None => true,
    };
    if needs_scratch_realloc {
        if let Some((old_tex, _, _)) = scratch_textures.remove(&invocation_id) {
            let _ = gpu.destroy_texture(old_tex);
        }
        let tex_desc = GpuTextureDesc {
            label: Some(format!("Multiverse Invocation #{} Scratch", invocation_id)),
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
        scratch_textures.insert(invocation_id, (tex_h, view_h, needed_size));
    }

    Ok(())
}

pub(crate) fn ensure_postprocess_resources(
    resources: PostprocessResources<'_>,
    gpu: &mut GpuManager,
    request: PostprocessResourceRequest,
) -> MultiverseResult<()> {
    let PostprocessResources {
        smaa_intermediates,
        taa_history,
        ping_pong_texture,
    } = resources;
    let PostprocessResourceRequest {
        invocation_id,
        width,
        height,
        needed_size,
        is_smaa,
        is_taa,
        needs_ping_pong,
    } = request;

    // Ensure SMAA intermediate textures if SMAA is active
    if is_smaa {
        let smaa_size = UVec2::new(width, height);
        let needs_smaa_realloc = match &smaa_intermediates {
            Some((_, _, _, _, size)) => *size != smaa_size,
            None => true,
        };
        if needs_smaa_realloc {
            if let Some((old_e, _, old_w, _, _)) = smaa_intermediates.take() {
                let _ = gpu.destroy_texture(old_e);
                let _ = gpu.destroy_texture(old_w);
            }
            let edge_desc = GpuTextureDesc {
                label: Some("Multiverse SMAA Edge Texture".to_string()),
                width,
                height,
                depth_or_layers: 1,
                mip_levels: 1,
                sample_count: 1,
                dimension: TextureDimension::D2,
                format: NormalizedTextureFormat::Rg8Unorm,
                usages: TextureUsageFlags::default(),
            };
            let weight_desc = GpuTextureDesc {
                label: Some("Multiverse SMAA Weight Texture".to_string()),
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
            let e_h = gpu
                .textures
                .create_texture(&device, &edge_desc)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            let e_v = gpu
                .textures
                .get_texture(e_h)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                .default_view();
            let w_h = gpu
                .textures
                .create_texture(&device, &weight_desc)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            let w_v = gpu
                .textures
                .get_texture(w_h)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                .default_view();
            *smaa_intermediates = Some((e_h, e_v, w_h, w_v, smaa_size));
        }
    }

    // Ensure TAA double-buffered history textures if TAA is active
    if is_taa {
        let taa_size = UVec2::new(width, height);
        let needs_taa_realloc = match taa_history.get(&invocation_id) {
            Some(entry) => entry.size != taa_size,
            None => true,
        };
        if needs_taa_realloc {
            if let Some(old) = taa_history.remove(&invocation_id) {
                let _ = gpu.destroy_texture(old.tex_a);
                let _ = gpu.destroy_texture(old.tex_b);
            }
            let desc_a = GpuTextureDesc {
                label: Some(format!("Multiverse TAA History A #{}", invocation_id)),
                width,
                height,
                depth_or_layers: 1,
                mip_levels: 1,
                sample_count: 1,
                dimension: TextureDimension::D2,
                format: NormalizedTextureFormat::Rgba8Unorm,
                usages: TextureUsageFlags::default(),
            };
            let desc_b = GpuTextureDesc {
                label: Some(format!("Multiverse TAA History B #{}", invocation_id)),
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
            let t_a = gpu
                .textures
                .create_texture(&device, &desc_a)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            let v_a = gpu
                .textures
                .get_texture(t_a)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                .default_view();
            let t_b = gpu
                .textures
                .create_texture(&device, &desc_b)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            let v_b = gpu
                .textures
                .get_texture(t_b)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                .default_view();
            taa_history.insert(
                invocation_id,
                TaaHistoryEntry {
                    tex_a: t_a,
                    view_a: v_a,
                    tex_b: t_b,
                    view_b: v_b,
                    size: taa_size,
                    flip: false,
                    has_history: false,
                },
            );
        }
    }

    if needs_ping_pong {
        let needs_pp_realloc = match ping_pong_texture {
            Some((_, _, size)) => *size != needed_size,
            None => true,
        };
        if needs_pp_realloc {
            if let Some((old_tex, _, _)) = ping_pong_texture.take() {
                let _ = gpu.destroy_texture(old_tex);
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
            *ping_pong_texture = Some((pp_tex_h, pp_view_h, needed_size));
        }
    }
    Ok(())
}

pub(crate) fn copy_target_history(
    target_textures: &HashMap<u32, TextureBinding>,
    target_history_textures: &HashMap<u32, TextureBinding>,
    gpu: &mut GpuManager,
    target_id: u32,
    target_size: UVec2,
) {
    if let (Some((target_tex_h, _, _)), Some((hist_tex_h, _, _))) = (
        target_textures.get(&target_id),
        target_history_textures.get(&target_id),
    ) && let (Ok(src_entry), Ok(dst_entry)) = (
        gpu.textures.get_texture(*target_tex_h),
        gpu.textures.get_texture(*hist_tex_h),
    ) {
        let mut copy_encoder =
            gpu.device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("Multiverse Target Soft-Cut History Copy"),
                });
        copy_encoder.copy_texture_to_texture(
            wgpu::TexelCopyTextureInfo {
                texture: src_entry.raw(),
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyTextureInfo {
                texture: dst_entry.raw(),
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::Extent3d {
                width: target_size.x,
                height: target_size.y,
                depth_or_array_layers: 1,
            },
        );
        gpu.queue().submit(Some(copy_encoder.finish()));
    }
}
