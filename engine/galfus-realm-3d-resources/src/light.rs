use bytemuck::{Pod, Zeroable};
use glam::{Mat4, UVec4, Vec2, Vec3, Vec4};
use serde::{Deserialize, Serialize};

use crate::color::srgb_to_linear_rgb;
use crate::transform::Transform3D;

/// Category of light emitter in the 3D scene.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LightKind3D {
    /// Infinitely distant parallel light source (e.g. sun).
    #[default]
    Directional,
    /// Omni-directional point light with radial attenuation.
    Point,
    /// Conical spotlight with inner/outer cutoff angles.
    Spot,
    /// Ambient uniform baseline illumination.
    Ambient,
}

impl LightKind3D {
    /// Numerical code representing the light type in shaders.
    pub const fn to_code(self) -> u32 {
        match self {
            Self::Directional => 0,
            Self::Point => 1,
            Self::Spot => 2,
            Self::Ambient => 3,
        }
    }
}

/// 3D Light component defining illumination color, falloff, and shadow options.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Light3D {
    /// Category of the light source.
    pub kind: LightKind3D,
    /// sRGB color multiplier.
    pub color: Vec3,
    /// Lumens or relative intensity factor.
    pub intensity: f32,
    /// Maximum attenuation distance for point/spot lights.
    pub range: f32,
    /// Cosine of inner and outer spotlight angles: `[cos(inner), cos(outer)]`.
    pub spot_inner_outer: Vec2,
    /// Whether this light projects shadow maps.
    pub cast_shadow: bool,
    /// Active state flag.
    pub active: bool,
}

impl Default for Light3D {
    fn default() -> Self {
        Self {
            kind: LightKind3D::Directional,
            color: Vec3::ONE,
            intensity: 1.0,
            range: 50.0,
            spot_inner_outer: Vec2::new(0.9, 0.8),
            cast_shadow: true,
            active: true,
        }
    }
}

impl Light3D {
    /// Creates a directional light (e.g. sun).
    pub fn directional(color: Vec3, intensity: f32, cast_shadow: bool) -> Self {
        Self {
            kind: LightKind3D::Directional,
            color,
            intensity,
            cast_shadow,
            ..Default::default()
        }
    }

    /// Creates an omni-directional point light.
    pub fn point(color: Vec3, intensity: f32, range: f32, cast_shadow: bool) -> Self {
        Self {
            kind: LightKind3D::Point,
            color,
            intensity,
            range,
            cast_shadow,
            ..Default::default()
        }
    }

    /// Creates a spotlight.
    pub fn spot(
        color: Vec3,
        intensity: f32,
        range: f32,
        inner_angle_rad: f32,
        outer_angle_rad: f32,
        cast_shadow: bool,
    ) -> Self {
        Self {
            kind: LightKind3D::Spot,
            color,
            intensity,
            range,
            spot_inner_outer: Vec2::new(inner_angle_rad.cos(), outer_angle_rad.cos()),
            cast_shadow,
            ..Default::default()
        }
    }

    /// Converts this light and its transform into a GPU-ready `Light3DUniform`.
    pub fn build_uniform(&self, transform: &Transform3D) -> Light3DUniform {
        let pos = transform.position;
        let dir = transform.forward();

        let mut flags = 0u32;
        if self.cast_shadow {
            flags |= 1;
        }

        // Compute shadow view-projection if directional or spot
        let shadow_view_proj = match self.kind {
            LightKind3D::Directional => {
                let up = if dir.dot(Vec3::Y).abs() > 0.95 {
                    Vec3::Z
                } else {
                    Vec3::Y
                };
                let view = Mat4::look_to_rh(pos, dir, up);
                // Reverse-Z shadow projection matching .old (size: 50.0, far: 100.0, near: -100.0)
                let size = 50.0;
                let near = -100.0;
                let far = 100.0;
                let proj = Mat4::orthographic_rh(-size, size, -size, size, far, near);
                proj * view
            }
            LightKind3D::Spot => {
                let up = if dir.dot(Vec3::Y).abs() > 0.95 {
                    Vec3::Z
                } else {
                    Vec3::Y
                };
                let view = Mat4::look_to_rh(pos, dir, up);
                let fov =
                    (self.spot_inner_outer.y.acos() * 2.0).clamp(0.1, std::f32::consts::PI - 0.1);
                let proj = Mat4::perspective_rh(fov, 1.0, self.range, 0.1);
                proj * view
            }
            LightKind3D::Point => {
                let up = if dir.dot(Vec3::Y).abs() > 0.95 {
                    Vec3::Z
                } else {
                    Vec3::Y
                };
                let view = Mat4::look_to_rh(pos, dir, up);
                let fov = 120.0f32.to_radians();
                let proj = Mat4::perspective_rh(fov, 1.0, self.range, 0.1);
                proj * view
            }
            _ => Mat4::IDENTITY,
        };

        let shadow_layer = if self.cast_shadow { 0 } else { 0xFFFF_FFFF };

        Light3DUniform {
            position: pos.extend(1.0),
            direction: dir.extend(0.0),
            color_intensity: srgb_to_linear_rgb(self.color).extend(self.intensity),
            params: Vec4::new(
                self.range,
                self.spot_inner_outer.x,
                self.spot_inner_outer.y,
                self.kind.to_code() as f32,
            ),
            shadow_view_proj,
            flags: UVec4::new(flags, shadow_layer, 0, 0),
        }
    }

    /// Converts this light, its transform, and assigned shadow layer into a GPU-ready `Light3DUniform`.
    pub fn build_uniform_with_layer(
        &self,
        transform: &Transform3D,
        shadow_layer: u32,
    ) -> Light3DUniform {
        let mut u = self.build_uniform(transform);
        if self.cast_shadow {
            u.flags.y = shadow_layer;
        } else {
            u.flags.y = 0xFFFF_FFFF;
        }
        u
    }
}

/// GPU representation of a 3D light aligned to 16-byte boundaries.
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct Light3DUniform {
    /// World position of the light source `[x, y, z, 1.0]`.
    pub position: Vec4,
    /// Forward pointing direction `[x, y, z, 0.0]`.
    pub direction: Vec4,
    /// RGB linear color and intensity scalar `[r, g, b, intensity]`.
    pub color_intensity: Vec4,
    /// Light parameters: `[range, spot_inner, spot_outer, kind_code]`.
    pub params: Vec4,
    /// Shadow map view-projection matrix (with Reverse-Z).
    pub shadow_view_proj: Mat4,
    /// Bit flags: `[bit 0: cast_shadow, unused, unused, unused]`.
    pub flags: UVec4,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_light_uniform_alignment() {
        assert_eq!(std::mem::size_of::<Light3DUniform>() % 16, 0);
        let uniform = Light3DUniform::zeroed();
        let bytes = bytemuck::bytes_of(&uniform);
        assert_eq!(bytes.len(), std::mem::size_of::<Light3DUniform>());
    }

    #[test]
    fn test_directional_light_flags() {
        let light = Light3D::directional(Vec3::ONE, 2.5, true);
        let u = light.build_uniform(&Transform3D::default());
        assert_eq!(u.flags.x & 1, 1);
        assert_eq!(u.color_intensity.w, 2.5);
    }

    #[test]
    fn light_color_is_converted_from_srgb_for_the_gpu() {
        let light = Light3D::directional(Vec3::splat(0.5), 2.0, false);
        let uniform = light.build_uniform(&Transform3D::default());
        assert!((uniform.color_intensity.x - 0.214_041_14).abs() < 1e-6);
        assert_eq!(uniform.color_intensity.w, 2.0);
    }
}
