use glam::{Mat4, Quat, Vec3};
use serde::{Deserialize, Serialize};

/// 3D spatial transformation component representing position, rotation, and scale.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transform3D {
    /// World or local translation position.
    pub position: Vec3,
    /// Orientation quaternion.
    pub rotation: Quat,
    /// 3D axis scaling factors.
    pub scale: Vec3,
}

impl Default for Transform3D {
    fn default() -> Self {
        Self {
            position: Vec3::ZERO,
            rotation: Quat::IDENTITY,
            scale: Vec3::ONE,
        }
    }
}

impl Transform3D {
    /// Creates a new transformation with position, rotation, and scale.
    pub fn new(position: Vec3, rotation: Quat, scale: Vec3) -> Self {
        Self {
            position,
            rotation,
            scale,
        }
    }

    /// Creates a transformation from a position with default rotation and scale.
    pub fn from_position(position: Vec3) -> Self {
        Self {
            position,
            ..Default::default()
        }
    }

    /// Computes the 4x4 affine transformation matrix `M = T * R * S`.
    pub fn to_mat4(&self) -> Mat4 {
        Mat4::from_scale_rotation_translation(self.scale, self.rotation, self.position)
    }

    /// Extracts the forward direction vector (-Z in right-handed coordinates).
    pub fn forward(&self) -> Vec3 {
        self.rotation * Vec3::NEG_Z
    }

    /// Extracts the right direction vector (+X in right-handed coordinates).
    pub fn right(&self) -> Vec3 {
        self.rotation * Vec3::X
    }

    /// Extracts the up direction vector (+Y in right-handed coordinates).
    pub fn up(&self) -> Vec3 {
        self.rotation * Vec3::Y
    }

    /// Creates a transformation located at `eye` looking towards `target` with the given `up` vector.
    pub fn look_at(eye: Vec3, target: Vec3, up: Vec3) -> Self {
        let f = (target - eye).normalize_or_zero();
        let mut s = f.cross(up).normalize_or_zero();
        if s.length_squared() < 0.0001 {
            s = f.cross(Vec3::Z).normalize_or_zero();
        }
        let u = s.cross(f).normalize_or_zero();
        let rot_mat = Mat4::from_cols(
            s.extend(0.0),
            u.extend(0.0),
            (-f).extend(0.0),
            glam::Vec4::W,
        );
        let rotation = Quat::from_mat4(&rot_mat);
        Self {
            position: eye,
            rotation,
            scale: Vec3::ONE,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform3d_matrix_generation() {
        let t = Transform3D::new(
            Vec3::new(10.0, 20.0, 30.0),
            Quat::IDENTITY,
            Vec3::new(2.0, 2.0, 2.0),
        );
        let m = t.to_mat4();
        let (scale, rot, trans) = m.to_scale_rotation_translation();

        assert_eq!(trans, Vec3::new(10.0, 20.0, 30.0));
        assert_eq!(rot, Quat::IDENTITY);
        assert_eq!(scale, Vec3::new(2.0, 2.0, 2.0));
    }

    #[test]
    fn test_transform3d_directions() {
        let t = Transform3D::default();
        assert_eq!(t.forward(), Vec3::NEG_Z);
        assert_eq!(t.right(), Vec3::X);
        assert_eq!(t.up(), Vec3::Y);
    }

    #[test]
    fn test_transform3d_look_at() {
        let eye = Vec3::new(0.0, 2.0, 5.0);
        let target = Vec3::new(0.0, 0.0, 0.0);
        let t = Transform3D::look_at(eye, target, Vec3::Y);
        let expected_f = (target - eye).normalize();
        assert!((t.forward() - expected_f).length() < 1e-5);
    }
}
