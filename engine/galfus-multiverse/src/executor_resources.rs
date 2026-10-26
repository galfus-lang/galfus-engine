//! Allocates per-invocation textures required by frame execution.

use std::collections::{HashMap, HashSet};

use galfus_gpu_manager::GpuManager;
use galfus_gpu_manager::handle::{GpuTextureHandle, GpuTextureViewHandle};
use galfus_gpu_manager::types::{
    GpuTextureDesc, NormalizedTextureFormat, TextureDimension, TextureUsageFlags,
};
use glam::UVec2;

use crate::context::TaaHistoryEntry;
use crate::error::{MultiverseError, MultiverseResult};
use crate::schedule::{MultiverseSchedule, ResolvedInvocationStep};
use crate::types::{AntiAliasingMode, InvocationFilter};

type TextureBinding = (GpuTextureHandle, GpuTextureViewHandle, wgpu::TextureFormat);

fn resource_ids_to_remove<T>(resources: &HashMap<u32, T>, active_ids: &HashSet<u32>) -> Vec<u32> {
    let mut ids: Vec<u32> = resources
        .keys()
        .filter(|id| !active_ids.contains(id))
        .copied()
        .collect();
    ids.sort_unstable();
    ids
}

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

/// Frees temporal resources no longer referenced by the resolved frame schedule.
pub(crate) fn prune_temporal_resources(
    target_history_textures: &mut HashMap<u32, TextureBinding>,
    scratch_textures: &mut HashMap<u32, (GpuTextureHandle, GpuTextureViewHandle, UVec2)>,
    taa_history: &mut HashMap<u32, TaaHistoryEntry>,
    gpu: &mut GpuManager,
    soft_cut_sources: &HashSet<u32>,
    active_invocation_ids: &HashSet<u32>,
    taa_invocation_ids: &HashSet<u32>,
) -> MultiverseResult<()> {
    for target_id in resource_ids_to_remove(target_history_textures, soft_cut_sources) {
        if let Some((texture, _, _)) = target_history_textures.remove(&target_id) {
            gpu.destroy_texture(texture)?;
        }
    }
    for invocation_id in resource_ids_to_remove(scratch_textures, active_invocation_ids) {
        if let Some((texture, _, _)) = scratch_textures.remove(&invocation_id) {
            gpu.destroy_texture(texture)?;
        }
    }
    for invocation_id in resource_ids_to_remove(taa_history, taa_invocation_ids) {
        if let Some(entry) = taa_history.remove(&invocation_id) {
            gpu.destroy_texture(entry.tex_a)?;
            gpu.destroy_texture(entry.tex_b)?;
        }
    }
    Ok(())
}

/// Prunes frame-temporal resources using the active resolved schedule.
pub(crate) fn prune_resources_for_schedule(
    target_history_textures: &mut HashMap<u32, TextureBinding>,
    scratch_textures: &mut HashMap<u32, (GpuTextureHandle, GpuTextureViewHandle, UVec2)>,
    taa_history: &mut HashMap<u32, TaaHistoryEntry>,
    gpu: &mut GpuManager,
    schedule: &MultiverseSchedule,
    default_aa: AntiAliasingMode,
) -> MultiverseResult<HashSet<u32>> {
    let soft_cut_sources: HashSet<u32> = schedule
        .soft_cut_edges
        .iter()
        .map(|(source_target_id, _)| *source_target_id)
        .collect();
    let active_invocation_ids: HashSet<u32> = schedule
        .target_blocks
        .iter()
        .flat_map(|block| &block.invocations)
        .map(|step| step.invocation_id)
        .collect();
    let taa_invocation_ids: HashSet<u32> = schedule
        .target_blocks
        .iter()
        .flat_map(|block| &block.invocations)
        .filter(|step| invocation_uses_taa(step, default_aa))
        .map(|step| step.invocation_id)
        .collect();

    prune_temporal_resources(
        target_history_textures,
        scratch_textures,
        taa_history,
        gpu,
        &soft_cut_sources,
        &active_invocation_ids,
        &taa_invocation_ids,
    )?;
    Ok(soft_cut_sources)
}

fn invocation_uses_taa(step: &ResolvedInvocationStep, default_aa: AntiAliasingMode) -> bool {
    step.anti_aliasing.unwrap_or(default_aa) == AntiAliasingMode::Taa
        || step
            .filters
            .iter()
            .any(|filter| matches!(filter, InvocationFilter::Taa))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resource_pruning_only_removes_inactive_ids() {
        let resources = HashMap::from([(1, ()), (2, ()), (3, ())]);
        let active_ids = HashSet::from([1, 3]);

        assert_eq!(resource_ids_to_remove(&resources, &active_ids), vec![2]);
    }

    #[test]
    fn taa_usage_tracks_the_effective_anti_aliasing_mode_and_filter() {
        let base_step = ResolvedInvocationStep {
            invocation_id: 1,
            realm_id: 1,
            camera_slot: None,
            resolved_viewport: glam::UVec4::ZERO,
            z_index: 0,
            clear_color: None,
            filters: Vec::new(),
            anti_aliasing: None,
        };
        let filter_step = ResolvedInvocationStep {
            filters: vec![InvocationFilter::Taa],
            ..base_step.clone()
        };
        let override_step = ResolvedInvocationStep {
            anti_aliasing: Some(AntiAliasingMode::None),
            ..base_step.clone()
        };

        assert!(invocation_uses_taa(&base_step, AntiAliasingMode::Taa));
        assert!(invocation_uses_taa(&filter_step, AntiAliasingMode::None));
        assert!(!invocation_uses_taa(&override_step, AntiAliasingMode::Taa));
    }
}
