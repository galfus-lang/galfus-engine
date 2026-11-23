//! UV-space texture baking decals (tattoos, scars, body paint, permanent surface stamps).

use bytemuck::{Pod, Zeroable};
use glam::{Mat4, UVec4, Vec3, Vec4};
use serde::{Deserialize, Serialize};

use crate::color::srgb_to_linear_rgba;
use crate::material::TextureUvSet3D;
use crate::projector::{ProjectorBlendMode3D, ProjectorKind3D, build_projector_view_proj};
use crate::transform::Transform3D;

/// Command describing a one-shot UV-space decal bake onto a model's target texture.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UvDecalBake3D {
    /// Target 3D model logical ID whose mesh (and optional active skinning/morphs) is rasterized.
    pub model_id: u32,
    /// Destination logical texture ID to stamp into (must have `renderAttachment` usage).
    pub target_texture_id: u32,
    /// Optional logical texture ID of the decal/tattoo image (`None` stamps solid `color`).
    #[serde(default)]
    pub decal_texture_id: Option<u32>,
    /// Projection volume style (orthographic box vs perspective frustum).
    #[serde(default)]
    pub kind: ProjectorKind3D,
    /// Composite blending mode onto the destination texture.
    #[serde(default)]
    pub blend_mode: ProjectorBlendMode3D,
    /// Mesh UV channel to rasterize into (`Uv0` or `Uv1`).
    #[serde(default)]
    pub uv_set: TextureUvSet3D,
    /// sRGB RGBA tint and opacity multiplier.
    #[serde(default = "default_color")]
    pub color: Vec4,
    /// Sub-rectangle `[u0, v0, u1, v1]` in the decal texture.
    #[serde(default = "default_uv_rect")]
    pub uv_rect: Vec4,
    /// Orthographic box extents `[width, height, depth]` (used by `Orthographic`).
    #[serde(default = "default_size")]
    pub size: Vec3,
    /// Vertical field of view in radians (used by `Perspective`).
    #[serde(default = "default_fov_y")]
    pub fov_y: f32,
    /// Aspect ratio `width / height` (used by `Perspective`).
    #[serde(default = "default_one")]
    pub aspect: f32,
    /// Near clipping plane distance (used by `Perspective`).
    #[serde(default = "default_near")]
    pub near: f32,
    /// Far clipping plane distance (used by `Perspective`).
    #[serde(default = "default_far")]
    pub far: f32,
    /// Cosine threshold for grazing-angle fadeout (`0.0..1.0`).
    #[serde(default = "default_angle_fade")]
    pub angle_fade: f32,
    /// Whether to apply the model's active skeletal skinning and morph targets when baking.
    #[serde(default = "default_true")]
    pub use_skinned_pose: bool,
    /// Whether to clear `target_texture_id` to `clear_color` before stamping.
    #[serde(default)]
    pub clear_target: bool,
    /// Linear RGBA clear color used when `clear_target` is true.
    #[serde(default)]
    pub clear_color: Vec4,
}

fn default_color() -> Vec4 {
    Vec4::ONE
}
fn default_uv_rect() -> Vec4 {
    Vec4::new(0.0, 0.0, 1.0, 1.0)
}
fn default_size() -> Vec3 {
    Vec3::ONE
}
fn default_fov_y() -> f32 {
    45.0_f32.to_radians()
}
fn default_one() -> f32 {
    1.0
}
fn default_near() -> f32 {
    0.05
}
fn default_far() -> f32 {
    10.0
}
fn default_angle_fade() -> f32 {
    0.25
}
fn default_true() -> bool {
    true
}

impl Default for UvDecalBake3D {
    fn default() -> Self {
        Self {
            model_id: 0,
            target_texture_id: 0,
            decal_texture_id: None,
            kind: ProjectorKind3D::Orthographic,
            blend_mode: ProjectorBlendMode3D::Alpha,
            uv_set: TextureUvSet3D::Uv0,
            color: default_color(),
            uv_rect: default_uv_rect(),
            size: default_size(),
            fov_y: default_fov_y(),
            aspect: 1.0,
            near: default_near(),
            far: default_far(),
            angle_fade: default_angle_fade(),
            use_skinned_pose: true,
            clear_target: false,
            clear_color: Vec4::ZERO,
        }
    }
}

impl UvDecalBake3D {
    /// Builds the GPU uniform representation for this UV-space bake pass.
    pub fn build_uniform(
        &self,
        transform: &Transform3D,
        has_texture: bool,
        target_is_srgb: bool,
    ) -> UvDecalBake3DUniform {
        let view_proj = build_projector_view_proj(
            self.kind,
            self.size,
            self.fov_y,
            self.aspect,
            self.near,
            self.far,
            transform,
        );
        let dir = transform.forward();
        // sRGB targets auto-encode linear output; linear targets write sRGB values directly.
        let color = if target_is_srgb {
            srgb_to_linear_rgba(self.color)
        } else {
            self.color
        };
        UvDecalBake3DUniform {
            view_proj,
            direction: dir.extend(self.angle_fade.clamp(0.0, 0.99)),
            color,
            uv_rect: self.uv_rect,
            flags: UVec4::new(
                u32::from(self.use_skinned_pose),
                self.uv_set as u32,
                u32::from(has_texture),
                self.blend_mode as u32,
            ),
        }
    }
}

/// GPU uniform for the UV-space decal baking pass, aligned to 16-byte boundaries.
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct UvDecalBake3DUniform {
    /// World-to-projector Reverse-Z view-projection matrix.
    pub view_proj: Mat4,
    /// Projector forward direction and grazing-angle cosine fade `[dx, dy, dz, angle_fade]`.
    pub direction: Vec4,
    /// RGBA tint and opacity multiplier.
    pub color: Vec4,
    /// UV sub-rectangle `[u0, v0, u1, v1]`.
    pub uv_rect: Vec4,
    /// `[use_skinned_pose, uv_set, has_texture, blend_mode]`.
    pub flags: UVec4,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uv_decal_uniform_alignment_and_defaults() {
        assert_eq!(std::mem::size_of::<UvDecalBake3DUniform>() % 16, 0);
        let bake = UvDecalBake3D {
            model_id: 1,
            target_texture_id: 10,
            decal_texture_id: Some(20),
            ..Default::default()
        };
        assert!(bake.use_skinned_pose);
        assert!(!bake.clear_target);
        let u = bake.build_uniform(&Transform3D::default(), true, true);
        assert_eq!(u.flags, UVec4::new(1, 0, 1, 0));
    }
}
