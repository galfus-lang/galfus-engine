//! Animation lifecycle events emitted during transition playback.

use serde::{Deserialize, Serialize};

use crate::target::AnimationTarget;
use crate::value::AnimValue;

/// Classification of animation lifecycle events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AnimationEventType {
    Started,
    Completed,
    Looped,
}

/// An animation event describing a lifecycle transition change.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationEvent {
    pub transition_id: u32,
    pub event_type: AnimationEventType,
    pub target: Option<AnimationTarget>,
    pub value: AnimValue,
    pub elapsed: f32,
}
