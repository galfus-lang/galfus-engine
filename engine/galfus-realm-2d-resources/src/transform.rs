use glam::{Mat4, Quat, Vec2, Vec3};
use serde::{Deserialize, Serialize};

/// 2D spatial transformation component with Z-layer sorting.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transform2D {
    /// 2D position in world units.
    pub position: Vec2,
    /// Rotation angle in radians around the Z axis.
    pub rotation: f32,
    /// 2D scale factor along X and Y axes.
    pub scale: Vec2,
    /// Explicit Z-layer depth for deterministic sorting.
    pub z_layer: i32,
}

impl Default for Transform2D {
    fn default() -> Self {
        Self {
            position: Vec2::ZERO,
            rotation: 0.0,
            scale: Vec2::ONE,
            z_layer: 0,
        }
    }
}

impl Transform2D {
    /// Creates a transform with a position and default rotation, scale, and z_layer.
    pub fn from_translation(position: Vec2) -> Self {
        Self {
            position,
            ..Default::default()
        }
    }

    /// Creates a transform with position and z_layer.
    pub fn from_translation_layer(position: Vec2, z_layer: i32) -> Self {
        Self {
            position,
            z_layer,
            ..Default::default()
        }
    }

    /// Creates a full transform with position, rotation, scale, and z_layer.
    pub fn new(position: Vec2, rotation: f32, scale: Vec2, z_layer: i32) -> Self {
        Self {
            position,
            rotation,
            scale,
            z_layer,
        }
    }

    /// Computes the 4x4 affine transformation matrix for 2D rendering and GPU shaders.
    ///
    /// The Z-translation is normalized to `z_layer as f32 * 0.0001` or preserved for layering.
    pub fn to_mat4(&self) -> Mat4 {
        Mat4::from_scale_rotation_translation(
            Vec3::new(self.scale.x, self.scale.y, 1.0),
            Quat::from_rotation_z(self.rotation),
            Vec3::new(self.position.x, self.position.y, self.z_layer as f32),
        )
    }

    /// Transforms a 2D local point into world space.
    pub fn transform_point(&self, point: Vec2) -> Vec2 {
        let cos_r = self.rotation.cos();
        let sin_r = self.rotation.sin();
        let scaled = point * self.scale;
        Vec2::new(
            scaled.x * cos_r - scaled.y * sin_r + self.position.x,
            scaled.x * sin_r + scaled.y * cos_r + self.position.y,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform_point() {
        let t = Transform2D::new(Vec2::new(10.0, 20.0), 0.0, Vec2::new(2.0, 3.0), 1);
        let pt = t.transform_point(Vec2::new(1.0, 1.0));
        assert_eq!(pt, Vec2::new(12.0, 23.0));
    }

    #[test]
    fn test_to_mat4() {
        let t = Transform2D::from_translation_layer(Vec2::new(5.0, -3.0), 2);
        let m = t.to_mat4();
        assert_eq!(m.w_axis, glam::Vec4::new(5.0, -3.0, 2.0, 1.0));
    }
}
