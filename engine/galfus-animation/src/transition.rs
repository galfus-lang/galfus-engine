//! Transition state machine with delay, retargeting, and lifecycle management.

use serde::{Deserialize, Serialize};

use crate::easing::Easing;
use crate::events::{AnimationEvent, AnimationEventType};
use crate::target::AnimationTarget;
use crate::value::AnimValue;

/// Playback repetition behavior for transitions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LoopMode {
    #[default]
    Once,
    Loop,
    PingPong,
}

/// Transition configuration defining curve, timing, delay, and repetition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionConfig {
    /// Active transition duration in seconds.
    pub duration: f32,
    /// Delay in seconds before interpolation begins.
    #[serde(default)]
    pub delay: f32,
    /// Easing curve or spring parameters.
    #[serde(default)]
    pub easing: Easing,
    /// Loop playback mode.
    #[serde(default)]
    pub loop_mode: LoopMode,
}

impl Default for TransitionConfig {
    fn default() -> Self {
        Self {
            duration: 1.0,
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::Once,
        }
    }
}

/// Runtime status of a transition.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TransitionStatus {
    #[default]
    Idle,
    Delay,
    Running,
    Completed,
}

/// Snapshot of the transition state for host queries.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionState {
    pub status: TransitionStatus,
    pub progress: f32,
    pub elapsed: f32,
    pub remaining_delay: f32,
    pub current_value: AnimValue,
    pub start_value: AnimValue,
    pub target_value: AnimValue,
}

/// Active transition instance tracking live interpolation between states.
#[derive(Debug, Clone)]
pub struct TransitionInstance {
    pub id: u32,
    pub config: TransitionConfig,
    pub target: Option<AnimationTarget>,
    pub status: TransitionStatus,
    pub elapsed: f32,
    pub remaining_delay: f32,
    pub ping_pong_forward: bool,
    pub start_value: AnimValue,
    pub target_value: AnimValue,
    pub current_value: AnimValue,
}

impl TransitionInstance {
    /// Creates a new transition initialized at the given value.
    pub fn new(id: u32, initial_value: AnimValue, config: TransitionConfig) -> Self {
        Self {
            id,
            config,
            target: None,
            status: TransitionStatus::Idle,
            elapsed: 0.0,
            remaining_delay: 0.0,
            ping_pong_forward: true,
            start_value: initial_value.clone(),
            target_value: initial_value.clone(),
            current_value: initial_value,
        }
    }

    /// Smoothly transitions from the current live value to a new target value.
    pub fn transition_to(&mut self, new_target: AnimValue, config: Option<TransitionConfig>) {
        // Retargeting: capture live current value as the start point to avoid abrupt snapping
        self.start_value = self.current_value.clone();
        self.target_value = new_target;

        if let Some(cfg) = config {
            self.config = cfg;
        }

        self.elapsed = 0.0;
        self.ping_pong_forward = true;

        if self.config.delay > 0.0 {
            self.remaining_delay = self.config.delay;
            self.status = TransitionStatus::Delay;
        } else {
            self.remaining_delay = 0.0;
            self.status = TransitionStatus::Running;
        }
    }

    /// Advances the transition state machine by `dt` seconds, returning an event if triggered.
    pub fn step(&mut self, dt: f32) -> Option<AnimationEvent> {
        if self.status == TransitionStatus::Delay {
            self.remaining_delay -= dt;
            if self.remaining_delay <= 0.0 {
                let excess = -self.remaining_delay;
                self.remaining_delay = 0.0;
                self.status = TransitionStatus::Running;
                self.elapsed = excess;

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

        if self.status == TransitionStatus::Running {
            self.elapsed += dt;
            let duration = self.config.duration.max(0.0001);
            let raw_t = self.elapsed / duration;

            if raw_t >= 1.0 {
                match self.config.loop_mode {
                    LoopMode::Once => {
                        self.status = TransitionStatus::Completed;
                        self.elapsed = duration;
                        let eased_t = self.config.easing.evaluate(1.0);
                        if let Ok(val) = self.start_value.interpolate(&self.target_value, eased_t) {
                            self.current_value = val;
                        }

                        return Some(AnimationEvent {
                            transition_id: self.id,
                            event_type: AnimationEventType::Completed,
                            target: self.target.clone(),
                            value: self.current_value.clone(),
                            elapsed: self.elapsed,
                        });
                    }
                    LoopMode::Loop => {
                        self.elapsed %= duration;
                        let loop_t = self.elapsed / duration;
                        let eased_t = self.config.easing.evaluate(loop_t);
                        if let Ok(val) = self.start_value.interpolate(&self.target_value, eased_t) {
                            self.current_value = val;
                        }

                        return Some(AnimationEvent {
                            transition_id: self.id,
                            event_type: AnimationEventType::Looped,
                            target: self.target.clone(),
                            value: self.current_value.clone(),
                            elapsed: self.elapsed,
                        });
                    }
                    LoopMode::PingPong => {
                        let num_flips = (self.elapsed / duration) as usize;
                        self.elapsed %= duration;
                        if !num_flips.is_multiple_of(2) {
                            self.ping_pong_forward = !self.ping_pong_forward;
                            std::mem::swap(&mut self.start_value, &mut self.target_value);
                        }

                        let ping_t = self.elapsed / duration;
                        let eased_t = self.config.easing.evaluate(ping_t);
                        if let Ok(val) = self.start_value.interpolate(&self.target_value, eased_t) {
                            self.current_value = val;
                        }

                        return Some(AnimationEvent {
                            transition_id: self.id,
                            event_type: AnimationEventType::Looped,
                            target: self.target.clone(),
                            value: self.current_value.clone(),
                            elapsed: self.elapsed,
                        });
                    }
                }
            } else {
                let eased_t = self.config.easing.evaluate(raw_t);
                if let Ok(val) = self.start_value.interpolate(&self.target_value, eased_t) {
                    self.current_value = val;
                }
                return None;
            }
        }

        None
    }

    /// Obtains an immutable snapshot of the transition's progress and state.
    pub fn state(&self) -> TransitionState {
        let duration = self.config.duration.max(0.0001);
        let progress = (self.elapsed / duration).clamp(0.0, 1.0);
        TransitionState {
            status: self.status,
            progress,
            elapsed: self.elapsed,
            remaining_delay: self.remaining_delay,
            current_value: self.current_value.clone(),
            start_value: self.start_value.clone(),
            target_value: self.target_value.clone(),
        }
    }
}
