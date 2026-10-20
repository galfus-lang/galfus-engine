//! Stable C-layout value types shared by hot-path host bindings.

use galfus_platform::audio::{SpatialAudioConfig, SpatialTransform};
use galfus_realm_2d_resources::Transform2D;
use galfus_realm_3d_resources::transform::Transform3D;
use glam::{Quat, Vec2, Vec3};

/// A 3D transform copied synchronously from a host-owned C struct.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GalfusTransform3D {
    pub position_x: f32,
    pub position_y: f32,
    pub position_z: f32,
    pub rotation_x: f32,
    pub rotation_y: f32,
    pub rotation_z: f32,
    pub rotation_w: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub scale_z: f32,
}

impl From<GalfusTransform3D> for Transform3D {
    fn from(value: GalfusTransform3D) -> Self {
        Self {
            position: Vec3::new(value.position_x, value.position_y, value.position_z),
            rotation: Quat::from_xyzw(
                value.rotation_x,
                value.rotation_y,
                value.rotation_z,
                value.rotation_w,
            ),
            scale: Vec3::new(value.scale_x, value.scale_y, value.scale_z),
        }
    }
}

impl From<Transform3D> for GalfusTransform3D {
    fn from(value: Transform3D) -> Self {
        Self {
            position_x: value.position.x,
            position_y: value.position.y,
            position_z: value.position.z,
            rotation_x: value.rotation.x,
            rotation_y: value.rotation.y,
            rotation_z: value.rotation.z,
            rotation_w: value.rotation.w,
            scale_x: value.scale.x,
            scale_y: value.scale.y,
            scale_z: value.scale.z,
        }
    }
}

/// A 2D transform copied synchronously from a host-owned C struct.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GalfusTransform2D {
    pub position_x: f32,
    pub position_y: f32,
    pub rotation: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub z_layer: i32,
    pub draw_order: i32,
}

impl From<GalfusTransform2D> for Transform2D {
    fn from(value: GalfusTransform2D) -> Self {
        Self {
            position: Vec2::new(value.position_x, value.position_y),
            rotation: value.rotation,
            scale: Vec2::new(value.scale_x, value.scale_y),
            z_layer: value.z_layer,
            draw_order: value.draw_order,
        }
    }
}

impl From<Transform2D> for GalfusTransform2D {
    fn from(value: Transform2D) -> Self {
        Self {
            position_x: value.position.x,
            position_y: value.position.y,
            rotation: value.rotation,
            scale_x: value.scale.x,
            scale_y: value.scale.y,
            z_layer: value.z_layer,
            draw_order: value.draw_order,
        }
    }
}

/// Optional camera look-at state. `enabled` is zero or one; all other fields are always present.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GalfusCameraLookAt3D {
    pub enabled: u32,
    pub target_x: f32,
    pub target_y: f32,
    pub target_z: f32,
    pub up_x: f32,
    pub up_y: f32,
    pub up_z: f32,
}

/// Spatial audio data consolidated into a fixed layout for frequent updates.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GalfusSpatialAudio {
    pub emitter_x: f32,
    pub emitter_y: f32,
    pub emitter_z: f32,
    pub emitter_rotation_x: f32,
    pub emitter_rotation_y: f32,
    pub emitter_rotation_z: f32,
    pub emitter_rotation_w: f32,
    pub listener_x: f32,
    pub listener_y: f32,
    pub listener_z: f32,
    pub listener_rotation_x: f32,
    pub listener_rotation_y: f32,
    pub listener_rotation_z: f32,
    pub listener_rotation_w: f32,
    pub volume: f32,
    pub min_distance: f32,
    pub max_distance: f32,
    pub rolloff: f32,
    pub speed: f32,
    pub looping: u32,
}

impl GalfusSpatialAudio {
    pub fn into_parts(self) -> (SpatialTransform, SpatialTransform, SpatialAudioConfig) {
        (
            SpatialTransform {
                position: [self.emitter_x, self.emitter_y, self.emitter_z],
                rotation: [
                    self.emitter_rotation_x,
                    self.emitter_rotation_y,
                    self.emitter_rotation_z,
                    self.emitter_rotation_w,
                ],
            },
            SpatialTransform {
                position: [self.listener_x, self.listener_y, self.listener_z],
                rotation: [
                    self.listener_rotation_x,
                    self.listener_rotation_y,
                    self.listener_rotation_z,
                    self.listener_rotation_w,
                ],
            },
            SpatialAudioConfig {
                volume: self.volume,
                min_distance: self.min_distance,
                max_distance: self.max_distance,
                rolloff: self.rolloff,
                speed: self.speed,
                looping: self.looping != 0,
            },
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_struct_layouts_are_stable() {
        assert_eq!(std::mem::size_of::<GalfusTransform3D>(), 40);
        assert_eq!(std::mem::align_of::<GalfusTransform3D>(), 4);
        assert_eq!(std::mem::size_of::<GalfusTransform2D>(), 28);
        assert_eq!(std::mem::align_of::<GalfusTransform2D>(), 4);
        assert_eq!(std::mem::size_of::<GalfusCameraLookAt3D>(), 28);
        assert_eq!(std::mem::size_of::<GalfusSpatialAudio>(), 80);
    }
}
