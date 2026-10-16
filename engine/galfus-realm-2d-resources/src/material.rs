use bytemuck::{Pod, Zeroable};
use glam::{UVec4, Vec4};
use serde::{Deserialize, Serialize};

/// Rendering surface classification for 2D materials.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SurfaceType2D {
    /// Solid geometry writing to depth without alpha blending.
    Opaque,
    /// Standard semi-transparent surface with alpha blending.
    #[default]
    Transparent,
    /// Alpha-tested punch-through surface (discarding fragments under cutoff).
    Masked,
    /// Additive blending for glowing particles, fire, and magic energy.
    Additive,
}

/// 2D Material component specifying base color tint, textures, blending, and custom WGSL effects.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Material2D {
    /// Optional human-readable debug label.
    pub label: Option<String>,
    /// Alpha / blending classification.
    pub surface_type: SurfaceType2D,
    /// Base surface RGBA color multiplier.
    pub base_color: Vec4,
    /// Optional logical texture ID for diffuse / atlas map.
    pub texture_id: Option<u32>,
    /// Alpha cutoff threshold for `SurfaceType2D::Masked`.
    pub alpha_cutoff: f32,
    /// Optional custom WGSL snippet implementing `fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D`.
    pub shader_effect: Option<String>,
    /// Custom parameter vectors `[v0, v1, v2, v3]` accessible inside custom effects.
    #[serde(default = "default_custom_params")]
    pub custom_params: [Vec4; 4],
}

fn default_custom_params() -> [Vec4; 4] {
    [Vec4::ZERO; 4]
}

impl Default for Material2D {
    fn default() -> Self {
        Self {
            label: None,
            surface_type: SurfaceType2D::Transparent,
            base_color: Vec4::ONE,
            texture_id: None,
            alpha_cutoff: 0.5,
            shader_effect: None,
            custom_params: [Vec4::ZERO; 4],
        }
    }
}

impl Material2D {
    /// Returns the integer ID of the surface blending type for pipeline keys.
    pub fn surface_type_id(&self) -> u32 {
        match self.surface_type {
            SurfaceType2D::Opaque => 0,
            SurfaceType2D::Transparent => 1,
            SurfaceType2D::Masked => 2,
            SurfaceType2D::Additive => 3,
        }
    }

    /// Creates a material with solid color and transparent blending.
    pub fn solid_color(base_color: Vec4) -> Self {
        Self {
            base_color,
            ..Default::default()
        }
    }

    /// Creates a textured material.
    pub fn textured(texture_id: u32) -> Self {
        Self {
            texture_id: Some(texture_id),
            ..Default::default()
        }
    }

    /// Builds the GPU-ready uniform representation adhering to WGSL 16-byte alignment.
    pub fn build_uniform(&self) -> Material2DUniform {
        let mut flags = self.surface_type_id();

        if self.texture_id.is_some() {
            flags |= 1 << 4;
        }
        if self.shader_effect.is_some() {
            flags |= 1 << 8;
        }

        Material2DUniform {
            base_color: self.base_color,
            params: Vec4::new(self.alpha_cutoff, 1.0, 1.0, 0.0),
            flags: UVec4::new(flags, 0, 0, 0),
            custom_v0: self.custom_params[0],
            custom_v1: self.custom_params[1],
            custom_v2: self.custom_params[2],
            custom_v3: self.custom_params[3],
        }
    }
}

/// GPU layout of Material2D aligned to 16-byte boundaries (112 bytes).
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct Material2DUniform {
    /// Base RGBA color `[r, g, b, a]`.
    pub base_color: Vec4,
    /// Material parameters: `[alpha_cutoff, uv_scale_x, uv_scale_y, reserved]`.
    pub params: Vec4,
    /// Bitflags for active texture slots, surface type, and custom shader effects.
    pub flags: UVec4,
    /// Custom parameter vector v0.
    pub custom_v0: Vec4,
    /// Custom parameter vector v1.
    pub custom_v1: Vec4,
    /// Custom parameter vector v2.
    pub custom_v2: Vec4,
    /// Custom parameter vector v3.
    pub custom_v3: Vec4,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_material_2d_uniform_flags() {
        let mut mat = Material2D::textured(42);
        mat.shader_effect = Some("fn surface_effect(){}".into());
        let uniform = mat.build_uniform();
        assert_eq!(uniform.flags.x & (1 << 4), 1 << 4);
        assert_eq!(uniform.flags.x & (1 << 8), 1 << 8);
    }
}
