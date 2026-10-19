use glam::{Vec2, Vec4};
use serde::{Deserialize, Serialize};

use crate::transform::Transform2D;

/// 2D Textured quad rendering entity with anchor/pivot point and shadow properties.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sprite2D {
    /// Optional human-readable debug label.
    pub label: Option<String>,
    /// Width and height of the sprite in world units.
    pub dimensions: Vec2,
    /// Normalized pivot/anchor offset `(0.0..1.0)` where `(0.5, 0.5)` is centered.
    pub pivot: Vec2,
    /// Texture coordinate rect `[u_min, v_min, u_max, v_max]`.
    pub uv_rect: Vec4,
    /// Optional logical material ID.
    pub material_id: Option<u32>,
    /// Whether this sprite blocks light and casts 2D shadows.
    pub cast_shadow: bool,
    /// Whether this sprite receives illumination from 2D shadows.
    pub receive_shadow: bool,
    /// If true, the sprite is invisible and serves purely as an occluder geometry.
    pub occluder_only: bool,
    /// Shadow projection height scalar.
    pub shadow_height: f32,
    /// Shadow layer filter mask.
    pub shadow_layer_mask: u32,
    /// Optional vertical height interval [min_z, max_z] where this occluder blocks light.
    #[serde(default)]
    pub height_range: Option<[f32; 2]>,
    /// Optional explicit draw order override within the same Z layer.
    #[serde(default)]
    pub draw_order: Option<i32>,
}

impl Default for Sprite2D {
    fn default() -> Self {
        Self {
            label: None,
            dimensions: Vec2::ONE,
            pivot: Vec2::new(0.5, 0.5),
            uv_rect: Vec4::new(0.0, 0.0, 1.0, 1.0),
            material_id: None,
            cast_shadow: true,
            receive_shadow: true,
            occluder_only: false,
            shadow_height: 1.0,
            shadow_layer_mask: u32::MAX,
            height_range: None,
            draw_order: None,
        }
    }
}

impl Sprite2D {
    /// Creates a centered sprite with specified dimensions.
    pub fn new(dimensions: Vec2, material_id: Option<u32>) -> Self {
        Self {
            dimensions,
            material_id,
            ..Default::default()
        }
    }

    /// Computes the 4 local space quad corners relative to its pivot point.
    /// Order: Bottom-Left, Bottom-Right, Top-Right, Top-Left.
    pub fn compute_local_corners(&self) -> [Vec2; 4] {
        let min_x = -self.pivot.x * self.dimensions.x;
        let max_x = (1.0 - self.pivot.x) * self.dimensions.x;
        let min_y = -self.pivot.y * self.dimensions.y;
        let max_y = (1.0 - self.pivot.y) * self.dimensions.y;

        [
            Vec2::new(min_x, min_y),
            Vec2::new(max_x, min_y),
            Vec2::new(max_x, max_y),
            Vec2::new(min_x, max_y),
        ]
    }

    /// Computes the 4 corners transformed into world space for rendering and shadow occlusion.
    pub fn compute_world_corners(&self, transform: &Transform2D) -> [Vec2; 4] {
        let local = self.compute_local_corners();
        [
            transform.transform_point(local[0]),
            transform.transform_point(local[1]),
            transform.transform_point(local[2]),
            transform.transform_point(local[3]),
        ]
    }

    /// Computes the GPU model matrix transforming the [-0.5, 0.5] unit quad to the sprite's dimensions, pivot, and world transform.
    pub fn compute_model_matrix(&self, transform: &Transform2D) -> glam::Mat4 {
        let size = self.dimensions * transform.scale;
        let offset = (Vec2::splat(0.5) - self.pivot) * size;
        let cos_r = transform.rotation.cos();
        let sin_r = transform.rotation.sin();
        let world_offset = Vec2::new(
            offset.x * cos_r - offset.y * sin_r,
            offset.x * sin_r + offset.y * cos_r,
        );
        glam::Mat4::from_scale_rotation_translation(
            glam::Vec3::new(size.x, size.y, 1.0),
            glam::Quat::from_rotation_z(transform.rotation),
            glam::Vec3::new(
                transform.position.x + world_offset.x,
                transform.position.y + world_offset.y,
                transform.z_layer as f32,
            ),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sprite_2d_corners() {
        let sprite = Sprite2D::new(Vec2::new(2.0, 4.0), None);
        let corners = sprite.compute_local_corners();
        assert_eq!(corners[0], Vec2::new(-1.0, -2.0));
        assert_eq!(corners[2], Vec2::new(1.0, 2.0));
    }
}
