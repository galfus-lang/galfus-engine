//! Forward PBR decals and occluded texture projectors for Realm3D.

use bytemuck::{Pod, Zeroable};
use glam::{Mat4, UVec4, Vec3, Vec4};
use serde::{Deserialize, Serialize};

use crate::color::srgb_to_linear_rgba;
use crate::transform::Transform3D;

/// Projection volume geometry for a 3D decal or texture projector.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectorKind3D {
    /// Box-shaped orthographic projection (decals, footprints, graffiti, ground markers).
    #[default]
    Orthographic,
    /// Frustum-shaped perspective projection (projectors, gobos, spotlight textures).
    Perspective,
}

/// Blending behavior when a projector or decal composites onto a surface before PBR lighting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectorBlendMode3D {
    /// Standard alpha blending on albedo, roughness, and metallic.
    #[default]
    Alpha,
    /// Multiplicative darkening on surface albedo (stains, grime, blob shadows).
    Multiply,
    /// Additive emissive light projection (holograms, laser sights, gobo glow).
    Additive,
}

impl ProjectorBlendMode3D {
    pub const fn to_code(self) -> f32 {
        match self {
            Self::Alpha => 0.0,
            Self::Multiply => 1.0,
            Self::Additive => 2.0,
        }
    }
}

/// 3D Decal or Texture Projector component evaluated before Forward+ PBR lighting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Projector3D {
    /// Projection volume style (orthographic decal vs perspective projector).
    #[serde(default)]
    pub kind: ProjectorKind3D,
    /// Composite blending mode onto receiving surfaces.
    #[serde(default)]
    pub blend_mode: ProjectorBlendMode3D,
    /// Optional logical texture ID projected onto surfaces.
    #[serde(default)]
    pub texture_id: Option<u32>,
    /// sRGB RGBA tint and opacity multiplier.
    #[serde(default = "default_color")]
    pub color: Vec4,
    /// Sub-rectangle `[u0, v0, u1, v1]` for atlas/spritesheet decals.
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
    /// Optional PBR roughness override (`< 0.0` preserves surface roughness).
    #[serde(default = "default_neg_one")]
    pub roughness_override: f32,
    /// Optional PBR metallic override (`< 0.0` preserves surface metallic).
    #[serde(default = "default_neg_one")]
    pub metallic_override: f32,
    /// Bitmask of model layers that receive this projection.
    #[serde(default = "default_layer_mask")]
    pub layer_mask: u32,
    /// Bitmask of model layers that occlude this projection when `cast_occlusion` is enabled.
    #[serde(default = "default_layer_mask")]
    pub occlusion_mask: u32,
    /// Whether objects matching `occlusion_mask` block this projection via a depth map.
    #[serde(default)]
    pub cast_occlusion: bool,
    /// Whether this projector is active.
    #[serde(default = "default_true")]
    pub active: bool,
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
    0.1
}
fn default_far() -> f32 {
    20.0
}
fn default_angle_fade() -> f32 {
    0.15
}
fn default_neg_one() -> f32 {
    -1.0
}
fn default_layer_mask() -> u32 {
    u32::MAX
}
fn default_true() -> bool {
    true
}

impl Default for Projector3D {
    fn default() -> Self {
        Self {
            kind: ProjectorKind3D::Orthographic,
            blend_mode: ProjectorBlendMode3D::Alpha,
            texture_id: None,
            color: default_color(),
            uv_rect: default_uv_rect(),
            size: default_size(),
            fov_y: default_fov_y(),
            aspect: 1.0,
            near: default_near(),
            far: default_far(),
            angle_fade: default_angle_fade(),
            roughness_override: -1.0,
            metallic_override: -1.0,
            layer_mask: u32::MAX,
            occlusion_mask: u32::MAX,
            cast_occlusion: false,
            active: true,
        }
    }
}

/// Computes a world-to-projector Reverse-Z view-projection matrix.
pub fn build_projector_view_proj(
    kind: ProjectorKind3D,
    size: Vec3,
    fov_y: f32,
    aspect: f32,
    near: f32,
    far: f32,
    transform: &Transform3D,
) -> Mat4 {
    let pos = transform.position;
    let dir = transform.forward();
    let up = (transform.rotation * Vec3::Y).normalize_or_zero();
    let up = if up.length_squared() < 1e-6 || dir.dot(up).abs() > 0.99 {
        if dir.dot(Vec3::Y).abs() > 0.95 {
            Vec3::Z
        } else {
            Vec3::Y
        }
    } else {
        up
    };
    let view = glam::camera::rh::view::look_to_mat4(pos, dir, up);
    let proj = match kind {
        ProjectorKind3D::Orthographic => {
            let hw = (size.x.abs() * 0.5).max(1e-4);
            let hh = (size.y.abs() * 0.5).max(1e-4);
            let hd = (size.z.abs() * 0.5).max(1e-4);
            glam::camera::rh::proj::directx::orthographic(-hw, hw, -hh, hh, hd, -hd)
        }
        ProjectorKind3D::Perspective => {
            let fov = fov_y.clamp(0.05, std::f32::consts::PI - 0.05);
            let aspect = aspect.max(1e-4);
            let near = near.max(0.01);
            let far = far.max(near + 0.01);
            glam::camera::rh::proj::directx::perspective(fov, aspect, far, near)
        }
    };
    proj * view
}

impl Projector3D {
    /// Computes the world-to-projector Reverse-Z view-projection matrix.
    pub fn build_view_projection(&self, transform: &Transform3D) -> Mat4 {
        build_projector_view_proj(
            self.kind,
            self.size,
            self.fov_y,
            self.aspect,
            self.near,
            self.far,
            transform,
        )
    }

    /// Builds the GPU uniform representation for this projector.
    pub fn build_uniform(
        &self,
        transform: &Transform3D,
        texture_layer: u32,
        occlusion_layer: u32,
    ) -> Projector3DUniform {
        let dir = transform.forward();
        let has_texture = if texture_layer != u32::MAX { 1.0 } else { 0.0 };
        Projector3DUniform {
            view_proj: self.build_view_projection(transform),
            direction: dir.extend(self.angle_fade.clamp(0.0, 0.99)),
            color: srgb_to_linear_rgba(self.color),
            uv_rect: self.uv_rect,
            pbr_params: Vec4::new(
                self.roughness_override,
                self.metallic_override,
                self.blend_mode.to_code(),
                has_texture,
            ),
            masks: UVec4::new(self.layer_mask, texture_layer, occlusion_layer, 0),
        }
    }
}

/// GPU representation of a 3D decal or texture projector aligned to 16-byte boundaries.
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct Projector3DUniform {
    /// World-to-projector Reverse-Z view-projection matrix.
    pub view_proj: Mat4,
    /// Projector forward direction and grazing-angle cosine fade `[dx, dy, dz, angle_fade]`.
    pub direction: Vec4,
    /// Linear RGBA tint and opacity multiplier.
    pub color: Vec4,
    /// UV sub-rectangle `[u0, v0, u1, v1]`.
    pub uv_rect: Vec4,
    /// `[roughness_override, metallic_override, blend_mode_code, has_texture]`.
    pub pbr_params: Vec4,
    /// `[layer_mask, texture_layer, occlusion_layer, flags]`.
    pub masks: UVec4,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projector_uniform_alignment_and_ortho_bounds() {
        assert_eq!(std::mem::size_of::<Projector3DUniform>() % 16, 0);
        let proj = Projector3D {
            size: Vec3::new(2.0, 2.0, 4.0),
            layer_mask: 0b1010,
            ..Default::default()
        };
        let tf = Transform3D::default();
        let u = proj.build_uniform(&tf, 0, u32::MAX);
        assert_eq!(u.masks.x, 0b1010);
        assert_eq!(u.masks.y, 0);
        assert_eq!(u.masks.z, u32::MAX);

        // Origin should project to NDC (0, 0, 0.5)
        let clip = u.view_proj * Vec4::new(0.0, 0.0, 0.0, 1.0);
        let ndc = clip.truncate() / clip.w;
        assert!(ndc.x.abs() < 1e-5);
        assert!(ndc.y.abs() < 1e-5);
        assert!((ndc.z - 0.5).abs() < 1e-5);
    }
}
