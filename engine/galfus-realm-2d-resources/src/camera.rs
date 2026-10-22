use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec2, Vec3, Vec4};
use serde::{Deserialize, Serialize};

use crate::transform::Transform2D;

/// 2D Camera component defining orthographic projection, culling layer mask, and viewport scale.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Camera2D {
    /// Vertical dimension in world units (e.g. 10.0 or screen height in pixels).
    pub ortho_scale: f32,
    /// Distance to near clipping plane.
    pub near: f32,
    /// Distance to far clipping plane.
    pub far: f32,
    /// Visibility bitmask determining which object layers this camera renders.
    pub layer_mask: u32,
    /// Rendering order when multiple cameras are active in the same frame.
    pub order: i32,
    /// Logical camera slot (e.g. 0 for main, 1 for UI overlay).
    pub camera_slot: u32,
    /// Whether this camera is actively rendering.
    pub active: bool,
}

impl Default for Camera2D {
    fn default() -> Self {
        Self {
            ortho_scale: 10.0,
            near: -1000.0,
            far: 1000.0,
            layer_mask: u32::MAX,
            order: 0,
            camera_slot: 0,
            active: true,
        }
    }
}

impl Camera2D {
    /// Creates a new orthographic 2D camera with specified vertical world scale.
    pub fn new(ortho_scale: f32, camera_slot: u32) -> Self {
        Self {
            ortho_scale,
            camera_slot,
            ..Default::default()
        }
    }

    /// Computes the orthographic projection matrix using Reverse-Z for optimal depth precision.
    pub fn projection_matrix(&self, aspect_ratio: f32) -> Mat4 {
        let half_height = self.ortho_scale / 2.0;
        let half_width = half_height * aspect_ratio;
        // Reverse-Z: near and far planes are swapped for reverse depth [1.0 -> 0.0]
        Mat4::orthographic_rh(
            -half_width,
            half_width,
            -half_height,
            half_height,
            self.far,
            self.near,
        )
    }

    /// Computes the view matrix from the camera's 2D transform.
    pub fn view_matrix(&self, transform: &Transform2D) -> Mat4 {
        let eye = Vec3::new(transform.position.x, transform.position.y, 10.0);
        let target = Vec3::new(transform.position.x, transform.position.y, 0.0);
        let cos_r = transform.rotation.cos();
        let sin_r = transform.rotation.sin();
        let up = Vec3::new(-sin_r, cos_r, 0.0);
        Mat4::look_at_rh(eye, target, up)
    }

    /// Builds the GPU-ready `Camera2DUniform` representation.
    pub fn build_uniform(
        &self,
        transform: &Transform2D,
        viewport_size: Vec2,
        ambient_light: f32,
        angular_resolution: f32,
        contact_offset: f32,
        time: f32,
    ) -> Camera2DUniform {
        let aspect = (viewport_size.x / viewport_size.y.max(1.0)).max(0.0001);
        let view = self.view_matrix(transform);
        let projection = self.projection_matrix(aspect);
        let view_projection = projection * view;

        Camera2DUniform {
            view,
            projection,
            view_projection,
            position: Vec4::new(transform.position.x, transform.position.y, 0.0, 1.0),
            params: Vec4::new(time, self.ortho_scale, aspect, self.near),
            viewport: Vec4::new(
                viewport_size.x,
                viewport_size.y,
                1.0 / viewport_size.x.max(1.0),
                1.0 / viewport_size.y.max(1.0),
            ),
            shadow_params: Vec4::new(ambient_light, 64.0, contact_offset, angular_resolution),
        }
    }
}

/// GPU uniform buffer representation of Camera2D, aligned to 16 bytes (WGSL standard).
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct Camera2DUniform {
    /// View matrix transforming from world space to view space.
    pub view: Mat4,
    /// Reverse-Z orthographic projection matrix.
    pub projection: Mat4,
    /// Combined view-projection matrix `VP = P * V`.
    pub view_projection: Mat4,
    /// World position of the camera eye `[x, y, 0.0, 1.0]`.
    pub position: Vec4,
    /// Camera parameters: `[ortho_scale, aspect_ratio, near, far]`.
    pub params: Vec4,
    /// Viewport dimensions: `[width, height, 1/width, 1/height]`.
    pub viewport: Vec4,
    /// Global shadow and lighting controls: `[ambient, max_lights, contact_offset, angular_resolution]`.
    pub shadow_params: Vec4,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_camera_2d_projection() {
        let cam = Camera2D::new(10.0, 0);
        let proj = cam.projection_matrix(16.0 / 9.0);
        assert!(proj.x_axis.x > 0.0);
        assert!(proj.y_axis.y > 0.0);
    }

    #[test]
    fn test_camera_2d_view() {
        let cam = Camera2D::default();
        let t = Transform2D::from_translation(Vec2::new(100.0, 50.0));
        let v = cam.view_matrix(&t);
        assert_eq!(v.w_axis.x, -100.0);
        assert_eq!(v.w_axis.y, -50.0);
    }
}
