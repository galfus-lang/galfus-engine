//! Spline evaluation and path following animation curves for 2D and 3D trajectories.

use glam::{Quat, Vec2, Vec3};
use serde::{Deserialize, Serialize};

use crate::easing::Easing;
use crate::events::{AnimationEvent, AnimationEventType};
use crate::target::AnimationTarget;
use crate::transition::{LoopMode, TransitionStatus};
use crate::value::AnimValue;

/// Mathematical curve interpolation model for path traversal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CurveType {
    /// Direct linear segments connecting control waypoints.
    #[default]
    Linear,
    /// Smooth cubic Catmull-Rom spline passing directly through all waypoints.
    CatmullRom,
    /// Smooth cubic Bézier spline with explicit control handles.
    CubicBezier,
}

/// Configuration settings governing path traverse duration, curves, and orientation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathFollowConfig {
    /// Duration in seconds to traverse the entire path.
    pub duration: f32,
    /// Delay in seconds before traversal begins.
    #[serde(default)]
    pub delay: f32,
    /// Easing function applied along normalized path time t in [0, 1].
    #[serde(default)]
    pub easing: Easing,
    /// Traversal loop mode behavior.
    #[serde(default)]
    pub loop_mode: LoopMode,
    /// When true, automatically computes the rotation tangent to align facing direction.
    #[serde(default)]
    pub orient_to_path: bool,
}

impl Default for PathFollowConfig {
    fn default() -> Self {
        Self {
            duration: 1.0,
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::Once,
            orient_to_path: false,
        }
    }
}

/// Set of 2D or 3D coordinate points along a trajectory.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PathPoints {
    D2(Vec<[f32; 2]>),
    D3(Vec<[f32; 3]>),
}

/// Runtime snapshot of a path follow instance for host queries.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathFollowState {
    pub status: TransitionStatus,
    pub progress: f32,
    pub elapsed: f32,
    pub remaining_delay: f32,
    pub current_value: AnimValue,
}

/// Active path follower driving a bound target along a 2D or 3D spline.
#[derive(Debug, Clone)]
pub struct PathFollowInstance {
    pub id: u32,
    pub curve_type: CurveType,
    pub points: PathPoints,
    pub config: PathFollowConfig,
    pub target: Option<AnimationTarget>,
    pub status: TransitionStatus,
    pub elapsed: f32,
    pub progress: f32,
    pub remaining_delay: f32,
    pub current_value: AnimValue,
    ping_pong_forward: bool,
}

impl PathFollowInstance {
    /// Creates a new path follow instance.
    pub fn new(
        id: u32,
        curve_type: CurveType,
        points: PathPoints,
        config: PathFollowConfig,
    ) -> Self {
        let initial_status = if config.delay > 0.0 {
            TransitionStatus::Delay
        } else {
            TransitionStatus::Running
        };

        let mut instance = Self {
            id,
            curve_type,
            points,
            config,
            target: None,
            status: initial_status,
            elapsed: 0.0,
            progress: 0.0,
            remaining_delay: 0.0,
            current_value: AnimValue::Scalar(0.0),
            ping_pong_forward: true,
        };

        instance.remaining_delay = instance.config.delay;
        instance.current_value = instance.evaluate(0.0);
        instance
    }

    /// Evaluates the path at normalized progression parameter `u` in [0, 1].
    pub fn evaluate(&self, u: f32) -> AnimValue {
        let clamped_u = u.clamp(0.0, 1.0);
        match &self.points {
            PathPoints::D2(pts) => {
                let (pos, tangent) = sample_path_2d(pts, self.curve_type, clamped_u);
                let rot = if self.config.orient_to_path && tangent.length_squared() > 1e-6 {
                    tangent.y.atan2(tangent.x)
                } else {
                    0.0
                };
                AnimValue::Transform2D([pos.x, pos.y, rot, 1.0, 1.0, 0.0])
            }
            PathPoints::D3(pts) => {
                let (pos, tangent) = sample_path_3d(pts, self.curve_type, clamped_u);
                let rot = if self.config.orient_to_path && tangent.length_squared() > 1e-6 {
                    quat_look_at(pos, pos + tangent, Vec3::Y)
                } else {
                    Quat::IDENTITY
                };
                AnimValue::Transform3D([
                    pos.x, pos.y, pos.z, rot.x, rot.y, rot.z, rot.w, 1.0, 1.0, 1.0,
                ])
            }
        }
    }

    /// Advances the path traversal by `dt` seconds and returns any triggered event.
    pub fn step(&mut self, dt: f32) -> Option<AnimationEvent> {
        if self.status == TransitionStatus::Completed || self.status == TransitionStatus::Idle {
            return None;
        }

        // Handle initial start delay
        if self.status == TransitionStatus::Delay {
            self.remaining_delay -= dt;
            if self.remaining_delay <= 0.0 {
                let leftover = -self.remaining_delay;
                self.status = TransitionStatus::Running;
                self.elapsed = leftover;
                return Some(AnimationEvent {
                    transition_id: self.id,
                    event_type: AnimationEventType::Started,
                    target: self.target.clone(),
                    value: self.current_value.clone(),
                    elapsed: self.elapsed,
                });
            }
            return None;
        }

        self.elapsed += dt;
        let duration = self.config.duration.max(0.0001);
        let raw_t = (self.elapsed / duration).clamp(0.0, 1.0);

        let t = match self.config.loop_mode {
            LoopMode::PingPong => {
                if self.ping_pong_forward {
                    raw_t
                } else {
                    1.0 - raw_t
                }
            }
            _ => raw_t,
        };

        let eased_t = self.config.easing.evaluate(t);
        self.progress = eased_t;
        self.current_value = self.evaluate(eased_t);

        if self.elapsed >= duration {
            match self.config.loop_mode {
                LoopMode::Once => {
                    self.status = TransitionStatus::Completed;
                    return Some(AnimationEvent {
                        transition_id: self.id,
                        event_type: AnimationEventType::Completed,
                        target: self.target.clone(),
                        value: self.current_value.clone(),
                        elapsed: self.elapsed,
                    });
                }
                LoopMode::Loop => {
                    self.elapsed -= duration;
                    return Some(AnimationEvent {
                        transition_id: self.id,
                        event_type: AnimationEventType::Looped,
                        target: self.target.clone(),
                        value: self.current_value.clone(),
                        elapsed: self.elapsed,
                    });
                }
                LoopMode::PingPong => {
                    self.elapsed -= duration;
                    self.ping_pong_forward = !self.ping_pong_forward;
                    return Some(AnimationEvent {
                        transition_id: self.id,
                        event_type: AnimationEventType::Looped,
                        target: self.target.clone(),
                        value: self.current_value.clone(),
                        elapsed: self.elapsed,
                    });
                }
            }
        }

        None
    }

    /// Returns a serializable state snapshot.
    pub fn state(&self) -> PathFollowState {
        PathFollowState {
            status: self.status,
            progress: self.progress,
            elapsed: self.elapsed,
            remaining_delay: self.remaining_delay,
            current_value: self.current_value.clone(),
        }
    }
}

/// Samples a 2D trajectory at parameter `t` in [0, 1], returning (position, tangent).
fn sample_path_2d(points: &[[f32; 2]], curve: CurveType, t: f32) -> (Vec2, Vec2) {
    if points.is_empty() {
        return (Vec2::ZERO, Vec2::X);
    }
    if points.len() == 1 {
        return (Vec2::from_array(points[0]), Vec2::X);
    }

    match curve {
        CurveType::Linear => {
            let seg_count = points.len() - 1;
            let s = t * seg_count as f32;
            let idx = (s.floor() as usize).min(seg_count - 1);
            let u = s - idx as f32;
            let p0 = Vec2::from_array(points[idx]);
            let p1 = Vec2::from_array(points[idx + 1]);
            let pos = p0.lerp(p1, u);
            let tangent = (p1 - p0).normalize_or_zero();
            (pos, tangent)
        }
        CurveType::CatmullRom => {
            let seg_count = points.len() - 1;
            let s = t * seg_count as f32;
            let idx = (s.floor() as usize).min(seg_count - 1);
            let u = s - idx as f32;

            let p1 = Vec2::from_array(points[idx]);
            let p2 = Vec2::from_array(points[idx + 1]);
            let p0 = if idx == 0 {
                p1 * 2.0 - p2
            } else {
                Vec2::from_array(points[idx - 1])
            };
            let p3 = if idx + 2 < points.len() {
                Vec2::from_array(points[idx + 2])
            } else {
                p2 * 2.0 - p1
            };

            let pos = catmull_rom_2d(p0, p1, p2, p3, u);
            let tangent = catmull_rom_tangent_2d(p0, p1, p2, p3, u).normalize_or_zero();
            (pos, tangent)
        }
        CurveType::CubicBezier => {
            // Cubic Bezier expects sets of 4 control points (start, c1, c2, end)
            if points.len() < 4 {
                return sample_path_2d(points, CurveType::CatmullRom, t);
            }
            let seg_count = (points.len() - 1) / 3;
            if seg_count == 0 {
                return sample_path_2d(points, CurveType::CatmullRom, t);
            }
            let s = t * seg_count as f32;
            let idx = (s.floor() as usize).min(seg_count - 1);
            let u = s - idx as f32;
            let base = idx * 3;
            let p0 = Vec2::from_array(points[base]);
            let p1 = Vec2::from_array(points[base + 1]);
            let p2 = Vec2::from_array(points[base + 2]);
            let p3 = Vec2::from_array(points[base + 3]);
            let pos = bezier_cubic_2d(p0, p1, p2, p3, u);
            let tangent = bezier_cubic_tangent_2d(p0, p1, p2, p3, u).normalize_or_zero();
            (pos, tangent)
        }
    }
}

/// Samples a 3D trajectory at parameter `t` in [0, 1], returning (position, tangent).
fn sample_path_3d(points: &[[f32; 3]], curve: CurveType, t: f32) -> (Vec3, Vec3) {
    if points.is_empty() {
        return (Vec3::ZERO, Vec3::Z);
    }
    if points.len() == 1 {
        return (Vec3::from_array(points[0]), Vec3::Z);
    }

    match curve {
        CurveType::Linear => {
            let seg_count = points.len() - 1;
            let s = t * seg_count as f32;
            let idx = (s.floor() as usize).min(seg_count - 1);
            let u = s - idx as f32;
            let p0 = Vec3::from_array(points[idx]);
            let p1 = Vec3::from_array(points[idx + 1]);
            let pos = p0.lerp(p1, u);
            let tangent = (p1 - p0).normalize_or_zero();
            (pos, tangent)
        }
        CurveType::CatmullRom => {
            let seg_count = points.len() - 1;
            let s = t * seg_count as f32;
            let idx = (s.floor() as usize).min(seg_count - 1);
            let u = s - idx as f32;

            let p1 = Vec3::from_array(points[idx]);
            let p2 = Vec3::from_array(points[idx + 1]);
            let p0 = if idx == 0 {
                p1 * 2.0 - p2
            } else {
                Vec3::from_array(points[idx - 1])
            };
            let p3 = if idx + 2 < points.len() {
                Vec3::from_array(points[idx + 2])
            } else {
                p2 * 2.0 - p1
            };

            let pos = catmull_rom_3d(p0, p1, p2, p3, u);
            let tangent = catmull_rom_tangent_3d(p0, p1, p2, p3, u).normalize_or_zero();
            (pos, tangent)
        }
        CurveType::CubicBezier => {
            if points.len() < 4 {
                return sample_path_3d(points, CurveType::CatmullRom, t);
            }
            let seg_count = (points.len() - 1) / 3;
            if seg_count == 0 {
                return sample_path_3d(points, CurveType::CatmullRom, t);
            }
            let s = t * seg_count as f32;
            let idx = (s.floor() as usize).min(seg_count - 1);
            let u = s - idx as f32;
            let base = idx * 3;
            let p0 = Vec3::from_array(points[base]);
            let p1 = Vec3::from_array(points[base + 1]);
            let p2 = Vec3::from_array(points[base + 2]);
            let p3 = Vec3::from_array(points[base + 3]);
            let pos = bezier_cubic_3d(p0, p1, p2, p3, u);
            let tangent = bezier_cubic_tangent_3d(p0, p1, p2, p3, u).normalize_or_zero();
            (pos, tangent)
        }
    }
}

// Catmull-Rom math formulas:
// P(u) = 0.5 * (2*P1 + (-P0 + P2)*u + (2*P0 - 5*P1 + 4*P2 - P3)*u^2 + (-P0 + 3*P1 - 3*P2 + P3)*u^3)
fn catmull_rom_2d(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: f32) -> Vec2 {
    let u2 = u * u;
    let u3 = u2 * u;
    0.5 * ((2.0 * p1)
        + (-p0 + p2) * u
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * u2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * u3)
}

fn catmull_rom_tangent_2d(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: f32) -> Vec2 {
    let u2 = u * u;
    0.5 * ((-p0 + p2)
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * (2.0 * u)
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * (3.0 * u2))
}

fn catmull_rom_3d(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: f32) -> Vec3 {
    let u2 = u * u;
    let u3 = u2 * u;
    0.5 * ((2.0 * p1)
        + (-p0 + p2) * u
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * u2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * u3)
}

fn catmull_rom_tangent_3d(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: f32) -> Vec3 {
    let u2 = u * u;
    0.5 * ((-p0 + p2)
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * (2.0 * u)
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * (3.0 * u2))
}

fn bezier_cubic_2d(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: f32) -> Vec2 {
    let inv = 1.0 - u;
    inv * inv * inv * p0 + 3.0 * inv * inv * u * p1 + 3.0 * inv * u * u * p2 + u * u * u * p3
}

fn bezier_cubic_tangent_2d(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: f32) -> Vec2 {
    let inv = 1.0 - u;
    3.0 * inv * inv * (p1 - p0) + 6.0 * inv * u * (p2 - p1) + 3.0 * u * u * (p3 - p2)
}

fn bezier_cubic_3d(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: f32) -> Vec3 {
    let inv = 1.0 - u;
    inv * inv * inv * p0 + 3.0 * inv * inv * u * p1 + 3.0 * inv * u * u * p2 + u * u * u * p3
}

fn bezier_cubic_tangent_3d(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: f32) -> Vec3 {
    let inv = 1.0 - u;
    3.0 * inv * inv * (p1 - p0) + 6.0 * inv * u * (p2 - p1) + 3.0 * u * u * (p3 - p2)
}

/// Computes look-at quaternion looking from `eye` towards `target`.
fn quat_look_at(eye: Vec3, target: Vec3, up: Vec3) -> Quat {
    let f = (target - eye).normalize_or_zero();
    if f.length_squared() < 1e-6 {
        return Quat::IDENTITY;
    }
    let mut s = f.cross(up).normalize_or_zero();
    if s.length_squared() < 1e-6 {
        s = f.cross(Vec3::Z).normalize_or_zero();
    }
    let u = s.cross(f).normalize_or_zero();
    let rot_mat = glam::Mat4::from_cols(
        s.extend(0.0),
        u.extend(0.0),
        (-f).extend(0.0),
        glam::Vec4::W,
    );
    Quat::from_mat4(&rot_mat)
}
