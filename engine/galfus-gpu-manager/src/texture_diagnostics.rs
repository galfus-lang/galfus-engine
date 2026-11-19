//! Diagnostic statistics and VRAM byte estimation for [`TextureManager`].

use galfus_core::handle::PoolStats;
use serde::Serialize;

use crate::types::{GpuTextureDesc, NormalizedTextureFormat};

/// Diagnostic statistics for [`super::TextureManager`].
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureManagerStats {
    pub textures_pool: PoolStats,
    pub views_pool: PoolStats,
    pub logical_map_len: usize,
    pub views_by_texture_len: usize,
    pub estimated_vram_bytes: u64,
}

impl super::TextureManager {
    /// Returns diagnostic statistics for this texture manager.
    pub fn diagnostic_stats(&self) -> TextureManagerStats {
        TextureManagerStats {
            textures_pool: self.textures.stats(),
            views_pool: self.views.stats(),
            logical_map_len: self.logical_map.len(),
            views_by_texture_len: self.views_by_texture.len(),
            estimated_vram_bytes: self.estimated_vram_bytes,
        }
    }
}

pub(super) fn estimate_texture_vram_bytes(desc: &GpuTextureDesc) -> u64 {
    let bpp: u64 = match desc.format {
        NormalizedTextureFormat::R8Unorm => 1,
        NormalizedTextureFormat::Rg8Unorm | NormalizedTextureFormat::R16Float => 2,
        NormalizedTextureFormat::Rgba8Unorm
        | NormalizedTextureFormat::Rgba8UnormSrgb
        | NormalizedTextureFormat::Bgra8Unorm
        | NormalizedTextureFormat::Bgra8UnormSrgb
        | NormalizedTextureFormat::Depth32Float
        | NormalizedTextureFormat::Depth24Plus
        | NormalizedTextureFormat::Depth24PlusStencil8
        | NormalizedTextureFormat::R32Float
        | NormalizedTextureFormat::Rg16Float => 4,
        NormalizedTextureFormat::Rg32Float | NormalizedTextureFormat::Rgba16Float => 8,
        NormalizedTextureFormat::Rgba32Float => 16,
    };
    let base = u64::from(desc.width.max(1))
        .saturating_mul(u64::from(desc.height.max(1)))
        .saturating_mul(u64::from(desc.depth_or_layers.max(1)))
        .saturating_mul(bpp)
        .saturating_mul(u64::from(desc.sample_count.max(1)));
    if desc.mip_levels > 1 {
        base.saturating_add(base / 3)
    } else {
        base
    }
}
