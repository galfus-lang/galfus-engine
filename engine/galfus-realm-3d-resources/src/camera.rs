use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec2, Vec4};
use serde::{Deserialize, Serialize};

use crate::transform::Transform3D;

/// Projection model of a 3D camera.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CameraKind3D {
    /// Standard perspective projection with distance foreshortening.
    #[default]
    Perspective,
    /// Parallel orthographic projection preserving scale regardless of distance.
    Orthographic,
}

/// 3D Camera component defining view frustum, projection characteristics, and slot binding.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Camera3D {
    /// Projection style (perspective vs orthographic).
    pub kind: CameraKind3D,
    /// Vertical field of view in radians (perspective only, default ~45 degrees).
    pub fov_y: f32,
    /// Distance to near clipping plane.
    pub near: f32,
    /// Distance to far clipping plane.
    pub far: f32,
    /// Vertical dimension in world units (orthographic only).
    pub ortho_scale: f32,
    /// Optional logical camera slot (e.g. 0 for main, 1 for secondary/portal).
    pub camera_slot: u32,
    /// Whether the camera is active.
    pub active: bool,
}

impl Default for Camera3D {
    fn default() -> Self {
        Self {
            kind: CameraKind3D::Perspective,
            fov_y: 45.0_f32.to_radians(),
            near: 0.1,
            far: 1000.0,
            ortho_scale: 10.0,
            camera_slot: 0,
            active: true,
        }
    }
}

impl Camera3D {
    /// Creates a new perspective 3D camera.
    pub fn perspective(fov_y_deg: f32, near: f32, far: f32, camera_slot: u32) -> Self {
        Self {
            kind: CameraKind3D::Perspective,
            fov_y: fov_y_deg.to_radians(),
            near,
            far,
            camera_slot,
            ..Default::default()
        }
    }

    /// Creates a new orthographic 3D camera.
    pub fn orthographic(ortho_scale: f32, near: f32, far: f32, camera_slot: u32) -> Self {
        Self {
            kind: CameraKind3D::Orthographic,
            near,
            far,
            ortho_scale,
            camera_slot,
            ..Default::default()
        }
    }

    /// Computes the Reverse-Z projection matrix for this camera given an aspect ratio.
    ///
    /// In Reverse-Z, `near` maps to depth 1.0 and `far` maps to depth 0.0,
    /// providing superior floating-point precision across long distances.
    pub fn projection_matrix(&self, aspect_ratio: f32) -> Mat4 {
        let aspect = if aspect_ratio > 0.0 {
            aspect_ratio
        } else {
            1.0
        };
        match self.kind {
            CameraKind3D::Perspective => {
                // Reverse-Z: swap near and far in perspective_rh
                Mat4::perspective_rh(self.fov_y, aspect, self.far, self.near)
            }
            CameraKind3D::Orthographic => {
                let half_height = self.ortho_scale / 2.0;
                let half_width = half_height * aspect;
                // Reverse-Z: swap near and far in orthographic_rh
                Mat4::orthographic_rh(
                    -half_width,
                    half_width,
                    -half_height,
                    half_height,
                    self.far,
                    self.near,
                )
            }
        }
    }

    /// Builds the GPU-ready `Camera3DUniform` struct from this camera and a transform.
    pub fn build_uniform(&self, transform: &Transform3D, aspect_ratio: f32) -> Camera3DUniform {
        let position = transform.position;
        let direction = transform.forward();
        let up = transform.up();

        let view = Mat4::look_to_rh(position, direction, up);
        let projection = self.projection_matrix(aspect_ratio);
        let view_projection = projection * view;

        Camera3DUniform {
            view,
            projection,
            view_projection,
            position: position.extend(1.0),
            direction: direction.extend(0.0),
            up: up.extend(0.0),
            near_far: Vec2::new(self.near, self.far),
            _padding: [0.0; 2],
        }
    }
}

/// GPU uniform buffer representation of a 3D camera, adhering to WGSL 16-byte alignment.
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct Camera3DUniform {
    /// View matrix transforming from world space to view space.
    pub view: Mat4,
    /// Reverse-Z projection matrix transforming from view space to clip space.
    pub projection: Mat4,
    /// Combined view-projection matrix `VP = P * V`.
    pub view_projection: Mat4,
    /// World position of the camera eye `[x, y, z, 1.0]`.
    pub position: Vec4,
    /// Normalized viewing direction vector in world space `[x, y, z, 0.0]`.
    pub direction: Vec4,
    /// Camera up vector in world space `[x, y, z, 0.0]`.
    pub up: Vec4,
    /// Frustum clipping boundaries `[near, far]`.
    pub near_far: Vec2,
    /// 16-byte alignment padding.
    pub _padding: [f32; 2],
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reverse_z_perspective_depth() {
        let cam = Camera3D::perspective(60.0, 0.1, 100.0, 0);
        let proj = cam.projection_matrix(16.0 / 9.0);

        // Transform a point on the near plane (-Z in view space)
        let near_view = Vec4::new(0.0, 0.0, -0.1, 1.0);
        let near_clip = proj * near_view;
        let near_ndc_z = near_clip.z / near_clip.w;

        // Transform a point on the far plane (-100.0 in view space)
        let far_view = Vec4::new(0.0, 0.0, -100.0, 1.0);
        let far_clip = proj * far_view;
        let far_ndc_z = far_clip.z / far_clip.w;

        // In Reverse-Z, near is 1.0 and far is 0.0
        assert!((near_ndc_z - 1.0).abs() < 1e-4);
        assert!(far_ndc_z.abs() < 1e-4);
    }

    #[test]
    fn test_camera_uniform_alignment() {
        assert_eq!(std::mem::size_of::<Camera3DUniform>() % 16, 0);
        let uniform = Camera3DUniform::zeroed();
        let bytes = bytemuck::bytes_of(&uniform);
        assert_eq!(bytes.len(), std::mem::size_of::<Camera3DUniform>());
    }
}
