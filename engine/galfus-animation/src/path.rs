//! Spline evaluation and declarative command path following for 2D/3D trajectories.

use glam::{Quat, Vec2, Vec3};
use serde::{Deserialize, Serialize};

use crate::path_math::*;

use crate::easing::Easing;
use crate::events::{AnimationEvent, AnimationEventType};
use crate::target::AnimationTarget;
use crate::transition::{LoopMode, TransitionStatus};
use crate::value::AnimValue;

/// Target evaluated animation value produced by the path follower.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PathValueType {
    /// Full 3D Transform: [px, py, pz, rx, ry, rz, rw, sx, sy, sz]
    #[default]
    Transform3D,
    /// Pure 3D Position: [x, y, z] (ideal for camera position or camera target)
    Position3D,
    /// Full 2D Transform: [px, py, rot, sx, sy, z_layer]
    Transform2D,
    /// Pure 2D Position: [x, y]
    Position2D,
}

/// Declarative SVG-like path motion commands with individual duration and easing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PathCommand {
    /// Teleports or sets initial origin without consuming traversal duration.
    MoveTo { to: Vec<f32> },

    /// Moves in a straight linear segment to target coordinates.
    LineTo {
        to: Vec<f32>,
        #[serde(default)]
        duration: Option<f32>,
        #[serde(default)]
        easing: Option<Easing>,
    },

    /// Quadratic Bézier curve with 1 control point.
    QuadTo {
        control: Vec<f32>,
        to: Vec<f32>,
        #[serde(default)]
        duration: Option<f32>,
        #[serde(default)]
        easing: Option<Easing>,
    },

    /// Cubic Bézier curve with 2 control points.
    CubicTo {
        control1: Vec<f32>,
        control2: Vec<f32>,
        to: Vec<f32>,
        #[serde(default)]
        duration: Option<f32>,
        #[serde(default)]
        easing: Option<Easing>,
    },

    /// Auto-smoothed Catmull-Rom curve through target coordinates without manual handles.
    SmoothTo {
        to: Vec<f32>,
        #[serde(default)]
        duration: Option<f32>,
        #[serde(default)]
        easing: Option<Easing>,
    },

    /// Static pause staying at current coordinate for the specified duration.
    Pause { duration: f32 },

    /// Closes path returning to the initial MoveTo origin.
    Close {
        #[serde(default)]
        duration: Option<f32>,
        #[serde(default)]
        easing: Option<Easing>,
    },
}

/// Configuration settings governing path traverse duration, curves, and orientation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathFollowConfig {
    /// Overall duration override. If omitted, duration is the sum of command durations.
    #[serde(default)]
    pub duration: Option<f32>,
    /// Delay in seconds before traversal begins.
    #[serde(default)]
    pub delay: f32,
    /// Default fallback easing for segments without explicit easing.
    #[serde(default)]
    pub easing: Easing,
    /// Traversal loop mode behavior.
    #[serde(default)]
    pub loop_mode: LoopMode,
    /// When true, automatically computes the rotation tangent to align facing direction.
    #[serde(default)]
    pub orient_to_path: bool,
    /// Output animated value format (Transform3D, Position3D, Transform2D, Position2D).
    #[serde(default)]
    pub value_type: Option<PathValueType>,
}

impl Default for PathFollowConfig {
    fn default() -> Self {
        Self {
            duration: None,
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::Once,
            orient_to_path: false,
            value_type: None,
        }
    }
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

#[derive(Debug, Clone)]
enum SegmentKind {
    Line {
        to: Vec3,
    },
    Quad {
        control: Vec3,
        to: Vec3,
    },
    Cubic {
        control1: Vec3,
        control2: Vec3,
        to: Vec3,
    },
    Smooth {
        p0: Vec3,
        p1: Vec3,
        p2: Vec3,
        p3: Vec3,
    },
    Pause,
}

#[derive(Debug, Clone)]
struct CompiledSegment {
    t_start: f32,
    t_end: f32,
    duration: f32,
    start_pos: Vec3,
    easing: Option<Easing>,
    kind: SegmentKind,
}

/// Active path follower driving a bound target along a 2D or 3D trajectory.
#[derive(Debug, Clone)]
pub struct PathFollowInstance {
    pub id: u32,
    pub config: PathFollowConfig,
    pub target: Option<AnimationTarget>,
    pub status: TransitionStatus,
    pub elapsed: f32,
    pub progress: f32,
    pub remaining_delay: f32,
    pub current_value: AnimValue,
    pub total_duration: f32,
    pub value_type: PathValueType,
    segments: Vec<CompiledSegment>,
    ping_pong_forward: bool,
}

impl PathFollowInstance {
    /// Compiles a new path follow instance from declarative SVG-like path commands.
    pub fn new(id: u32, commands: Vec<PathCommand>, config: PathFollowConfig) -> Self {
        let (segments, total_dur, is_3d) = compile_commands(&commands, &config);

        let value_type = config.value_type.unwrap_or(if is_3d {
            PathValueType::Transform3D
        } else {
            PathValueType::Transform2D
        });

        let initial_status = if config.delay > 0.0 {
            TransitionStatus::Delay
        } else {
            TransitionStatus::Running
        };

        let mut instance = Self {
            id,
            config,
            target: None,
            status: initial_status,
            elapsed: 0.0,
            progress: 0.0,
            remaining_delay: 0.0,
            current_value: AnimValue::Scalar(0.0),
            total_duration: total_dur.max(0.0001),
            value_type,
            segments,
            ping_pong_forward: true,
        };

        instance.remaining_delay = instance.config.delay;
        instance.current_value = instance.evaluate_at_time(0.0);
        instance
    }

    /// Evaluates the path at a specific elapsed time in seconds.
    pub fn evaluate_at_time(&self, time: f32) -> AnimValue {
        let (pos, tangent) = self.sample_at_time(time);
        match self.value_type {
            PathValueType::Position3D => AnimValue::Vec3(pos),
            PathValueType::Transform3D => {
                let rot = if self.config.orient_to_path && tangent.length_squared() > 1e-6 {
                    quat_look_at(pos, pos + tangent, Vec3::Y)
                } else {
                    Quat::IDENTITY
                };
                AnimValue::Transform3D([
                    pos.x, pos.y, pos.z, rot.x, rot.y, rot.z, rot.w, 1.0, 1.0, 1.0,
                ])
            }
            PathValueType::Position2D => AnimValue::Vec2(Vec2::new(pos.x, pos.y)),
            PathValueType::Transform2D => {
                let rot = if self.config.orient_to_path && tangent.length_squared() > 1e-6 {
                    tangent.y.atan2(tangent.x)
                } else {
                    0.0
                };
                AnimValue::Transform2D([pos.x, pos.y, rot, 1.0, 1.0, 0.0])
            }
        }
    }

    fn sample_at_time(&self, time: f32) -> (Vec3, Vec3) {
        if self.segments.is_empty() {
            return (Vec3::ZERO, Vec3::Z);
        }

        let clamped_t = time.clamp(0.0, self.total_duration);
        let seg = self
            .segments
            .iter()
            .find(|s| clamped_t >= s.t_start && clamped_t <= s.t_end)
            .unwrap_or_else(|| self.segments.last().unwrap());

        let u = if seg.duration > 0.0 {
            ((clamped_t - seg.t_start) / seg.duration).clamp(0.0, 1.0)
        } else {
            1.0
        };

        let easing = seg.easing.unwrap_or(self.config.easing);
        let u_eased = easing.evaluate(u);

        match &seg.kind {
            SegmentKind::Line { to } => {
                let pos = seg.start_pos.lerp(*to, u_eased);
                let tangent = (*to - seg.start_pos).normalize_or_zero();
                (pos, tangent)
            }
            SegmentKind::Quad { control, to } => {
                let pos = bezier_quad_3d(seg.start_pos, *control, *to, u_eased);
                let tangent = bezier_quad_tangent_3d(seg.start_pos, *control, *to, u_eased)
                    .normalize_or_zero();
                (pos, tangent)
            }
            SegmentKind::Cubic {
                control1,
                control2,
                to,
            } => {
                let pos = bezier_cubic_3d(seg.start_pos, *control1, *control2, *to, u_eased);
                let tangent =
                    bezier_cubic_tangent_3d(seg.start_pos, *control1, *control2, *to, u_eased)
                        .normalize_or_zero();
                (pos, tangent)
            }
            SegmentKind::Smooth { p0, p1, p2, p3 } => {
                let pos = catmull_rom_3d(*p0, *p1, *p2, *p3, u_eased);
                let tangent =
                    catmull_rom_tangent_3d(*p0, *p1, *p2, *p3, u_eased).normalize_or_zero();
                (pos, tangent)
            }
            SegmentKind::Pause => (seg.start_pos, Vec3::ZERO),
        }
    }

    /// Advances the path traversal by `dt` seconds and returns any triggered event.
    pub fn step(&mut self, dt: f32) -> Option<AnimationEvent> {
        if self.status == TransitionStatus::Completed || self.status == TransitionStatus::Idle {
            return None;
        }

        if self.status == TransitionStatus::Delay {
            self.remaining_delay -= dt;
            if self.remaining_delay <= 0.0 {
                let leftover = -self.remaining_delay;
                self.status = TransitionStatus::Running;
                self.elapsed = leftover;
                self.current_value = self.evaluate_at_time(self.elapsed);
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
        let effective_time = match self.config.loop_mode {
            LoopMode::PingPong => {
                let raw = self.elapsed.clamp(0.0, self.total_duration);
                if self.ping_pong_forward {
                    raw
                } else {
                    self.total_duration - raw
                }
            }
            _ => self.elapsed.clamp(0.0, self.total_duration),
        };

        self.progress = (effective_time / self.total_duration).clamp(0.0, 1.0);
        self.current_value = self.evaluate_at_time(effective_time);

        if self.elapsed >= self.total_duration {
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
                    self.elapsed -= self.total_duration;
                    return Some(AnimationEvent {
                        transition_id: self.id,
                        event_type: AnimationEventType::Looped,
                        target: self.target.clone(),
                        value: self.current_value.clone(),
                        elapsed: self.elapsed,
                    });
                }
                LoopMode::PingPong => {
                    self.elapsed -= self.total_duration;
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

fn to_vec3_coord(slice: &[f32]) -> Vec3 {
    match slice.len() {
        0 => Vec3::ZERO,
        1 => Vec3::new(slice[0], 0.0, 0.0),
        2 => Vec3::new(slice[0], slice[1], 0.0),
        _ => Vec3::new(slice[0], slice[1], slice[2]),
    }
}

fn compile_commands(
    cmds: &[PathCommand],
    config: &PathFollowConfig,
) -> (Vec<CompiledSegment>, f32, bool) {
    let mut is_3d = false;
    for cmd in cmds {
        match cmd {
            PathCommand::MoveTo { to }
            | PathCommand::LineTo { to, .. }
            | PathCommand::QuadTo { to, .. }
            | PathCommand::CubicTo { to, .. }
            | PathCommand::SmoothTo { to, .. }
                if to.len() >= 3 =>
            {
                is_3d = true;
                break;
            }
            _ => {}
        }
    }

    let mut segments = Vec::new();
    let mut current_pos = Vec3::ZERO;
    let mut origin_pos = Vec3::ZERO;
    let mut prev_pos = Vec3::ZERO;
    let mut current_time = 0.0;

    for (i, cmd) in cmds.iter().enumerate() {
        match cmd {
            PathCommand::MoveTo { to } => {
                let p = to_vec3_coord(to);
                current_pos = p;
                origin_pos = p;
                prev_pos = p;
            }
            PathCommand::LineTo {
                to,
                duration,
                easing,
            } => {
                let dest = to_vec3_coord(to);
                let dur = duration.unwrap_or(1.0).max(0.0001);
                segments.push(CompiledSegment {
                    t_start: current_time,
                    t_end: current_time + dur,
                    duration: dur,
                    start_pos: current_pos,
                    easing: *easing,
                    kind: SegmentKind::Line { to: dest },
                });
                current_time += dur;
                prev_pos = current_pos;
                current_pos = dest;
            }
            PathCommand::QuadTo {
                control,
                to,
                duration,
                easing,
            } => {
                let ctrl = to_vec3_coord(control);
                let dest = to_vec3_coord(to);
                let dur = duration.unwrap_or(1.0).max(0.0001);
                segments.push(CompiledSegment {
                    t_start: current_time,
                    t_end: current_time + dur,
                    duration: dur,
                    start_pos: current_pos,
                    easing: *easing,
                    kind: SegmentKind::Quad {
                        control: ctrl,
                        to: dest,
                    },
                });
                current_time += dur;
                prev_pos = ctrl;
                current_pos = dest;
            }
            PathCommand::CubicTo {
                control1,
                control2,
                to,
                duration,
                easing,
            } => {
                let c1 = to_vec3_coord(control1);
                let c2 = to_vec3_coord(control2);
                let dest = to_vec3_coord(to);
                let dur = duration.unwrap_or(1.0).max(0.0001);
                segments.push(CompiledSegment {
                    t_start: current_time,
                    t_end: current_time + dur,
                    duration: dur,
                    start_pos: current_pos,
                    easing: *easing,
                    kind: SegmentKind::Cubic {
                        control1: c1,
                        control2: c2,
                        to: dest,
                    },
                });
                current_time += dur;
                prev_pos = c2;
                current_pos = dest;
            }
            PathCommand::SmoothTo {
                to,
                duration,
                easing,
            } => {
                let dest = to_vec3_coord(to);
                let dur = duration.unwrap_or(1.0).max(0.0001);
                let p0 = if prev_pos == current_pos {
                    current_pos * 2.0 - dest
                } else {
                    prev_pos
                };
                let p3 = if i + 1 < cmds.len() {
                    match &cmds[i + 1] {
                        PathCommand::LineTo { to: nxt, .. }
                        | PathCommand::SmoothTo { to: nxt, .. }
                        | PathCommand::QuadTo { to: nxt, .. }
                        | PathCommand::CubicTo { to: nxt, .. } => to_vec3_coord(nxt),
                        _ => dest * 2.0 - current_pos,
                    }
                } else {
                    dest * 2.0 - current_pos
                };

                segments.push(CompiledSegment {
                    t_start: current_time,
                    t_end: current_time + dur,
                    duration: dur,
                    start_pos: current_pos,
                    easing: *easing,
                    kind: SegmentKind::Smooth {
                        p0,
                        p1: current_pos,
                        p2: dest,
                        p3,
                    },
                });
                current_time += dur;
                prev_pos = current_pos;
                current_pos = dest;
            }
            PathCommand::Pause { duration } => {
                let dur = duration.max(0.0001);
                segments.push(CompiledSegment {
                    t_start: current_time,
                    t_end: current_time + dur,
                    duration: dur,
                    start_pos: current_pos,
                    easing: None,
                    kind: SegmentKind::Pause,
                });
                current_time += dur;
            }
            PathCommand::Close { duration, easing } => {
                let dest = origin_pos;
                let dur = duration.unwrap_or(1.0).max(0.0001);
                segments.push(CompiledSegment {
                    t_start: current_time,
                    t_end: current_time + dur,
                    duration: dur,
                    start_pos: current_pos,
                    easing: *easing,
                    kind: SegmentKind::Line { to: dest },
                });
                current_time += dur;
                prev_pos = current_pos;
                current_pos = dest;
            }
        }
    }

    let natural_duration = current_time.max(0.0001);
    let final_duration = config.duration.unwrap_or(natural_duration).max(0.0001);

    if (final_duration - natural_duration).abs() > 1e-4 && natural_duration > 0.0 {
        let scale = final_duration / natural_duration;
        for s in &mut segments {
            s.t_start *= scale;
            s.t_end *= scale;
            s.duration *= scale;
        }
    }

    (segments, final_duration, is_3d)
}
