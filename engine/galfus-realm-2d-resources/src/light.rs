use bytemuck::{Pod, Zeroable};
use glam::{UVec4, Vec2, Vec3, Vec4};
use serde::{Deserialize, Serialize};

/// 2D dynamic point light source with support for soft penumbra shadows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Light2D {
    /// Optional human-readable debug label.
    pub label: Option<String>,
    /// 2D position in world coordinates.
    pub position: Vec2,
    /// Optional elevation / z-height of the light.
    #[serde(default)]
    pub z: f32,
    /// Light emission color in linear RGB.
    pub color: Vec3,
    /// Radiance multiplier.
    pub intensity: f32,
    /// Maximum attenuation distance in world units.
    pub range: f32,
    /// Physical radius of the light emitter disk for soft penumbra projection.
    pub light_radius: f32,
    /// Bitmask defining which occluder layers cast shadows for this light.
    pub shadow_layer_mask: u32,
    /// Whether this light casts dynamic 2D shadows.
    pub cast_shadow: bool,
    /// Whether the light is active.
    pub active: bool,
}

impl Default for Light2D {
    fn default() -> Self {
        Self {
            label: None,
            position: Vec2::ZERO,
            z: 0.0,
            color: Vec3::ONE,
            intensity: 1.0,
            range: 10.0,
            light_radius: 0.25,
            shadow_layer_mask: u32::MAX,
            cast_shadow: true,
            active: true,
        }
    }
}

impl Light2D {
    /// Creates a point light with position, color, and range.
    pub fn point(position: Vec2, color: Vec3, intensity: f32, range: f32) -> Self {
        Self {
            position,
            color,
            intensity,
            range,
            ..Default::default()
        }
    }

    /// Builds the GPU-ready `Light2DUniform` representation.
    pub fn build_uniform(&self, shadow_index: u32) -> Light2DUniform {
        Light2DUniform {
            position: Vec4::new(self.position.x, self.position.y, self.z, 1.0),
            color: Vec4::new(self.color.x, self.color.y, self.color.z, 1.0),
            params: Vec4::new(
                self.intensity,
                self.range.max(0.0001),
                self.light_radius.max(0.0001),
                if self.cast_shadow { 1.0 } else { 0.0 },
            ),
            light_meta: UVec4::new(
                self.shadow_layer_mask,
                shadow_index,
                if self.active { 1 } else { 0 },
                0,
            ),
        }
    }
}

/// GPU layout of Light2D aligned to 16 bytes (64 bytes).
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct Light2DUniform {
    /// Light position in world space `[x, y, 0.0, 1.0]`.
    pub position: Vec4,
    /// Emissive color `[r, g, b, 1.0]`.
    pub color: Vec4,
    /// Light parameters: `[intensity, range, light_radius, cast_shadow_flag]`.
    pub params: Vec4,
    /// Meta attributes: `[shadow_layer_mask, shadow_index, active_flag, reserved]`.
    pub light_meta: UVec4,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_light_2d_uniform() {
        let light = Light2D::point(Vec2::new(5.0, 10.0), Vec3::new(1.0, 0.5, 0.2), 2.0, 15.0);
        let u = light.build_uniform(3);
        assert_eq!(u.position.x, 5.0);
        assert_eq!(u.position.y, 10.0);
        assert_eq!(u.params.x, 2.0);
        assert_eq!(u.params.y, 15.0);
        assert_eq!(u.light_meta.y, 3);
    }
}
