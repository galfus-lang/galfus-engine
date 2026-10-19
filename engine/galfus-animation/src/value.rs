//! Universal animatable property values and interpolation routines.

use galfus_realm_2d_resources::Transform2D;
use galfus_realm_3d_resources::transform::Transform3D;
use glam::{Quat, Vec2, Vec3, Vec4};
use serde::{Deserialize, Serialize};
use std::f32::consts::PI;

use crate::error::{AnimationError, AnimationResult};

/// Universal polymorphic value for animatable properties.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum AnimValue {
    Scalar(f32),
    Vec2(Vec2),
    Vec3(Vec3),
    Vec4(Vec4),
    Quat(Quat),
    /// 3D Transform represented as 10 contiguous floats:
    /// `[px, py, pz, rx, ry, rz, rw, sx, sy, sz]`
    Transform3D([f32; 10]),
    /// 2D Transform represented as 6 contiguous floats:
    /// `[px, py, rot, sx, sy, z_layer]`
    Transform2D([f32; 6]),
}

impl AnimValue {
    /// Creates an `AnimValue` from a 3D Transform.
    pub fn from_transform3d(t: &Transform3D) -> Self {
        Self::Transform3D([
            t.position.x,
            t.position.y,
            t.position.z,
            t.rotation.x,
            t.rotation.y,
            t.rotation.z,
            t.rotation.w,
            t.scale.x,
            t.scale.y,
            t.scale.z,
        ])
    }

    /// Converts this value into a 3D Transform if valid.
    pub fn to_transform3d(&self) -> AnimationResult<Transform3D> {
        match self {
            Self::Transform3D(arr) => Ok(Transform3D {
                position: Vec3::new(arr[0], arr[1], arr[2]),
                rotation: Quat::from_xyzw(arr[3], arr[4], arr[5], arr[6]).normalize(),
                scale: Vec3::new(arr[7], arr[8], arr[9]),
            }),
            other => Err(AnimationError::InvalidValue(format!(
                "Expected Transform3D, found {other:?}"
            ))),
        }
    }

    /// Creates an `AnimValue` from a 2D Transform.
    pub fn from_transform2d(t: &Transform2D) -> Self {
        Self::Transform2D([
            t.position.x,
            t.position.y,
            t.rotation,
            t.scale.x,
            t.scale.y,
            t.z_layer as f32,
        ])
    }

    /// Converts this value into a 2D Transform if valid.
    pub fn to_transform2d(&self) -> AnimationResult<Transform2D> {
        match self {
            Self::Transform2D(arr) => Ok(Transform2D {
                position: Vec2::new(arr[0], arr[1]),
                rotation: arr[2],
                scale: Vec2::new(arr[3], arr[4]),
                z_layer: arr[5].round() as i32,
                draw_order: 0,
            }),
            other => Err(AnimationError::InvalidValue(format!(
                "Expected Transform2D, found {other:?}"
            ))),
        }
    }

    /// Extracts a scalar float value.
    pub fn as_scalar(&self) -> Option<f32> {
        match self {
            Self::Scalar(v) => Some(*v),
            _ => None,
        }
    }

    /// Extracts a Vec2 value.
    pub fn as_vec2(&self) -> Option<Vec2> {
        match self {
            Self::Vec2(v) => Some(*v),
            _ => None,
        }
    }

    /// Extracts a Vec3 value.
    pub fn as_vec3(&self) -> Option<Vec3> {
        match self {
            Self::Vec3(v) => Some(*v),
            _ => None,
        }
    }

    /// Extracts a Vec4 value.
    pub fn as_vec4(&self) -> Option<Vec4> {
        match self {
            Self::Vec4(v) => Some(*v),
            _ => None,
        }
    }

    /// Interpolates smoothly between `from` and `to` by factor `t` in `[0.0, 1.0]`.
    pub fn interpolate(&self, to: &Self, t: f32) -> AnimationResult<Self> {
        match (self, to) {
            (Self::Scalar(a), Self::Scalar(b)) => Ok(Self::Scalar(a + (b - a) * t)),
            (Self::Vec2(a), Self::Vec2(b)) => Ok(Self::Vec2(a.lerp(*b, t))),
            (Self::Vec3(a), Self::Vec3(b)) => Ok(Self::Vec3(a.lerp(*b, t))),
            (Self::Vec4(a), Self::Vec4(b)) => Ok(Self::Vec4(a.lerp(*b, t))),
            (Self::Quat(a), Self::Quat(b)) => {
                let target = if a.dot(*b) < 0.0 { -*b } else { *b };
                Ok(Self::Quat(a.slerp(target, t).normalize()))
            }
            (Self::Transform3D(a), Self::Transform3D(b)) => {
                let pos_a = Vec3::new(a[0], a[1], a[2]);
                let pos_b = Vec3::new(b[0], b[1], b[2]);
                let pos = pos_a.lerp(pos_b, t);

                let quat_a = Quat::from_xyzw(a[3], a[4], a[5], a[6]).normalize();
                let quat_b = Quat::from_xyzw(b[3], b[4], b[5], b[6]).normalize();
                let target_quat = if quat_a.dot(quat_b) < 0.0 {
                    -quat_b
                } else {
                    quat_b
                };
                let quat = quat_a.slerp(target_quat, t).normalize();

                let scale_a = Vec3::new(a[7], a[8], a[9]);
                let scale_b = Vec3::new(b[7], b[8], b[9]);
                let scale = scale_a.lerp(scale_b, t);

                Ok(Self::Transform3D([
                    pos.x, pos.y, pos.z, quat.x, quat.y, quat.z, quat.w, scale.x, scale.y, scale.z,
                ]))
            }
            (Self::Transform2D(a), Self::Transform2D(b)) => {
                let pos_a = Vec2::new(a[0], a[1]);
                let pos_b = Vec2::new(b[0], b[1]);
                let pos = pos_a.lerp(pos_b, t);

                // Shortest angular difference for 2D rotation
                let mut diff = (b[2] - a[2]) % (2.0 * PI);
                if diff > PI {
                    diff -= 2.0 * PI;
                } else if diff < -PI {
                    diff += 2.0 * PI;
                }
                let rot = a[2] + diff * t;

                let scale_a = Vec2::new(a[3], a[4]);
                let scale_b = Vec2::new(b[3], b[4]);
                let scale = scale_a.lerp(scale_b, t);

                let z_layer = a[5] + (b[5] - a[5]) * t;

                Ok(Self::Transform2D([
                    pos.x, pos.y, rot, scale.x, scale.y, z_layer,
                ]))
            }
            _ => Err(AnimationError::TypeMismatch {
                from: format!("{self:?}"),
                to: format!("{to:?}"),
            }),
        }
    }
}

impl From<f32> for AnimValue {
    fn from(val: f32) -> Self {
        Self::Scalar(val)
    }
}

impl From<Vec2> for AnimValue {
    fn from(val: Vec2) -> Self {
        Self::Vec2(val)
    }
}

impl From<Vec3> for AnimValue {
    fn from(val: Vec3) -> Self {
        Self::Vec3(val)
    }
}

impl From<Vec4> for AnimValue {
    fn from(val: Vec4) -> Self {
        Self::Vec4(val)
    }
}

impl From<Quat> for AnimValue {
    fn from(val: Quat) -> Self {
        Self::Quat(val)
    }
}

impl From<Transform3D> for AnimValue {
    fn from(val: Transform3D) -> Self {
        Self::from_transform3d(&val)
    }
}

impl From<Transform2D> for AnimValue {
    fn from(val: Transform2D) -> Self {
        Self::from_transform2d(&val)
    }
}
