//! Central animation context coordinating active transitions, step ticks, and event dispatch.

use std::collections::{BTreeMap, HashMap, VecDeque};

use galfus_core::diagnostics::{self, DriftWarning, MemoryCategoryStats, MetricCounter, tags};
use galfus_core::id::validate_host_logical_id;
use galfus_multiverse::MultiverseContext;
use serde::Serialize;

use crate::applier::apply_target_value;
use crate::error::{AnimationError, AnimationResult};
use crate::events::AnimationEvent;
use crate::path::{PathCommand, PathFollowConfig, PathFollowInstance, PathFollowState};
use crate::target::AnimationTarget;
use crate::transition::{TransitionConfig, TransitionInstance, TransitionState, TransitionStatus};
use crate::value::AnimValue;

/// Diagnostic statistics for [`AnimationContext`].
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationDiagnosticsStats {
    pub transitions_total: usize,
    pub transitions_completed: usize,
    pub path_follows_total: usize,
    pub path_follows_completed: usize,
    pub target_locks_len: usize,
    pub custom_channels_len: usize,
    pub event_queue_len: usize,
    pub event_queue_cap: usize,
    pub estimated_cpu_bytes: u64,
}

impl AnimationDiagnosticsStats {
    pub fn memory_category(&self) -> MemoryCategoryStats {
        MemoryCategoryStats::new(
            "animation",
            "animation",
            self.estimated_cpu_bytes,
            0,
            self.estimated_cpu_bytes,
            self.transitions_total + self.path_follows_total + self.custom_channels_len,
        )
    }

    pub fn drift_warnings(&self) -> Vec<DriftWarning> {
        let mut warnings = Vec::new();
        let completed = self.transitions_completed + self.path_follows_completed;
        if completed > 0 {
            warnings.push(DriftWarning {
                category: "animation".to_string(),
                metric: "completedAnimationsRetained".to_string(),
                expected: 0,
                actual: completed as u64,
                delta: completed as i64,
                message: format!(
                    "{completed} completed transitions/path_follows remain retained in AnimationContext"
                ),
            });
        }
        warnings
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum AnimationOwner {
    Transition(u32),
    PathFollow(u32),
}

impl AnimationOwner {
    fn id(self) -> u32 {
        match self {
            Self::Transition(id) | Self::PathFollow(id) => id,
        }
    }
}

/// Autonomous animation manager coordinating transitions, state queries, and event pumping.
pub struct AnimationContext {
    pub(crate) transitions: BTreeMap<u32, TransitionInstance>,
    pub(crate) path_follows: BTreeMap<u32, PathFollowInstance>,
    pub(crate) target_locks: HashMap<AnimationTarget, AnimationOwner>,
    pub(crate) custom_channels: HashMap<u32, AnimValue>,
    pub(crate) event_queue: VecDeque<AnimationEvent>,
}

impl Default for AnimationContext {
    fn default() -> Self {
        Self::new()
    }
}

impl AnimationContext {
    /// Maximum number of unpolled animation events retained before oldest events are evicted.
    pub const DEFAULT_MAX_EVENT_QUEUE_SIZE: usize = 1024;

    /// Creates a new empty `AnimationContext`.
    pub fn new() -> Self {
        Self {
            transitions: BTreeMap::new(),
            path_follows: BTreeMap::new(),
            target_locks: HashMap::new(),
            custom_channels: HashMap::new(),
            event_queue: VecDeque::new(),
        }
    }

    /// Registers a new transition with an initial value and transition configuration.
    pub fn create_transition(
        &mut self,
        id: u32,
        initial_value: AnimValue,
        config: TransitionConfig,
    ) -> AnimationResult<()> {
        validate_host_logical_id(id).map_err(|e| AnimationError::General(e.to_string()))?;
        if self.transitions.contains_key(&id) {
            return Err(AnimationError::TransitionAlreadyExists(id));
        }

        self.transitions
            .insert(id, TransitionInstance::new(id, initial_value, config));
        Ok(())
    }

    /// Binds an existing transition to an entity property target with conflict locking.
    pub fn bind_target(&mut self, id: u32, target: AnimationTarget) -> AnimationResult<()> {
        let owner = AnimationOwner::Transition(id);
        // Prevent concurrent transitions from writing to the same destination property
        if let Some(&existing) = self.target_locks.get(&target)
            && existing != owner
        {
            return Err(AnimationError::TargetConflict {
                target: format!("{target:?}"),
                owner_id: existing.id(),
            });
        }

        let instance = self
            .transitions
            .get_mut(&id)
            .ok_or(AnimationError::TransitionNotFound(id))?;

        // Release old target lock if re-binding to a different property
        if let Some(ref old_target) = instance.target
            && old_target != &target
        {
            self.target_locks.remove(old_target);
        }

        self.target_locks.insert(target.clone(), owner);
        instance.target = Some(target);
        Ok(())
    }

    /// Unbinds a target from a transition and releases its property lock.
    pub fn unbind_target(&mut self, id: u32) -> AnimationResult<()> {
        let instance = self
            .transitions
            .get_mut(&id)
            .ok_or(AnimationError::TransitionNotFound(id))?;
        if let Some(ref target) = instance.target {
            self.target_locks.remove(target);
        }
        instance.target = None;
        Ok(())
    }

    /// Triggers a smooth transition towards a new target value.
    pub fn transition_to(
        &mut self,
        id: u32,
        target_value: AnimValue,
        config: Option<TransitionConfig>,
    ) -> AnimationResult<()> {
        let instance = self
            .transitions
            .get_mut(&id)
            .ok_or(AnimationError::TransitionNotFound(id))?;
        instance.transition_to(target_value, config);
        Ok(())
    }

    /// Queries the current state of a transition.
    pub fn get_state(&self, id: u32) -> Option<TransitionState> {
        self.transitions.get(&id).map(|t| t.state())
    }

    /// Queries the current evaluated value of a transition.
    pub fn get_value(&self, id: u32) -> Option<AnimValue> {
        self.transitions.get(&id).map(|t| t.current_value.clone())
    }

    /// Destroys a transition by ID and releases any associated property locks.
    pub fn destroy_transition(&mut self, id: u32) -> AnimationResult<()> {
        if let Some(instance) = self.transitions.remove(&id) {
            if let Some(ref target) = instance.target {
                self.target_locks.remove(target);
                if let AnimationTarget::CustomChannel { channel_id } = target {
                    self.custom_channels.remove(channel_id);
                }
            }
            Ok(())
        } else {
            Err(AnimationError::TransitionNotFound(id))
        }
    }

    /// Advances all transitions and path followers by delta time `dt` seconds and collects triggered events.
    pub fn step(&mut self, dt: f32) {
        let _span = diagnostics::SpanGuard::new(tags::ANIMATION, "animation.step");
        for instance in self.transitions.values_mut() {
            if let Some(event) = instance.step(dt) {
                Self::push_event_to_queue(&mut self.event_queue, event);
            }
        }
        for instance in self.path_follows.values_mut() {
            if let Some(event) = instance.step(dt) {
                Self::push_event_to_queue(&mut self.event_queue, event);
            }
        }
    }

    fn push_event_to_queue(queue: &mut VecDeque<AnimationEvent>, event: AnimationEvent) {
        if queue.len() >= Self::DEFAULT_MAX_EVENT_QUEUE_SIZE {
            queue.pop_front();
            diagnostics::counter_add(MetricCounter::AnimationEventEvictions, 1);
        }
        queue.push_back(event);
    }

    /// Pushes an event to the queue, discarding the oldest event if capacity is exceeded.
    pub fn push_event(&mut self, event: AnimationEvent) {
        Self::push_event_to_queue(&mut self.event_queue, event);
    }

    /// Applies evaluated animated values to bound targets inside Multiverse.
    pub fn apply_to_multiverse(
        &mut self,
        multiverse: &mut MultiverseContext,
    ) -> AnimationResult<()> {
        let _span = diagnostics::SpanGuard::new(tags::ANIMATION, "animation.apply");
        for instance in self.transitions.values() {
            if let Some(ref target) = instance.target {
                apply_target_value(
                    target,
                    &instance.current_value,
                    multiverse,
                    &mut self.custom_channels,
                )?;
            }
        }
        for instance in self.path_follows.values() {
            if let Some(ref target) = instance.target {
                apply_target_value(
                    target,
                    &instance.current_value,
                    multiverse,
                    &mut self.custom_channels,
                )?;
            }
        }
        Ok(())
    }

    // === Path Follow Operations ===

    /// Registers a new path follower traversing a declarative path command sequence.
    pub fn create_path_follow(
        &mut self,
        id: u32,
        commands: Vec<PathCommand>,
        config: PathFollowConfig,
    ) -> AnimationResult<()> {
        validate_host_logical_id(id).map_err(|e| AnimationError::General(e.to_string()))?;
        if self.path_follows.contains_key(&id) {
            return Err(AnimationError::PathFollowAlreadyExists(id));
        }
        if commands.is_empty() {
            return Err(AnimationError::InvalidPathCommands(
                "empty path commands list".into(),
            ));
        }

        self.path_follows
            .insert(id, PathFollowInstance::new(id, commands, config));
        Ok(())
    }

    /// Binds a path follower to an entity property target with conflict locking.
    pub fn bind_path_follow_target(
        &mut self,
        id: u32,
        target: AnimationTarget,
    ) -> AnimationResult<()> {
        let owner = AnimationOwner::PathFollow(id);
        if let Some(&existing) = self.target_locks.get(&target)
            && existing != owner
        {
            return Err(AnimationError::TargetConflict {
                target: format!("{target:?}"),
                owner_id: existing.id(),
            });
        }

        let instance = self
            .path_follows
            .get_mut(&id)
            .ok_or(AnimationError::PathFollowNotFound(id))?;

        if let Some(ref old_target) = instance.target
            && old_target != &target
        {
            self.target_locks.remove(old_target);
        }

        self.target_locks.insert(target.clone(), owner);
        instance.target = Some(target);
        Ok(())
    }

    /// Unbinds a target from a path follower and releases its property lock.
    pub fn unbind_path_follow_target(&mut self, id: u32) -> AnimationResult<()> {
        let instance = self
            .path_follows
            .get_mut(&id)
            .ok_or(AnimationError::PathFollowNotFound(id))?;
        if let Some(ref target) = instance.target {
            self.target_locks.remove(target);
        }
        instance.target = None;
        Ok(())
    }

    /// Queries the current runtime state of a path follower.
    pub fn get_path_follow_state(&self, id: u32) -> Option<PathFollowState> {
        self.path_follows.get(&id).map(|p| p.state())
    }

    /// Queries the current evaluated value of a path follower.
    pub fn get_path_follow_value(&self, id: u32) -> Option<AnimValue> {
        self.path_follows.get(&id).map(|p| p.current_value.clone())
    }

    /// Destroys a path follower by ID and releases any associated property locks.
    pub fn destroy_path_follow(&mut self, id: u32) -> AnimationResult<()> {
        if let Some(instance) = self.path_follows.remove(&id) {
            if let Some(ref target) = instance.target {
                self.target_locks.remove(target);
                if let AnimationTarget::CustomChannel { channel_id } = target {
                    self.custom_channels.remove(channel_id);
                }
            }
            Ok(())
        } else {
            Err(AnimationError::PathFollowNotFound(id))
        }
    }

    /// Removes all transitions and path followers that have reached `Completed` status,
    /// releasing their target locks and custom channels. Returns the number of pruned instances.
    pub fn prune_completed(&mut self) -> usize {
        let completed_t: Vec<u32> = self
            .transitions
            .iter()
            .filter(|(_, inst)| inst.state().status == TransitionStatus::Completed)
            .map(|(&id, _)| id)
            .collect();
        let completed_p: Vec<u32> = self
            .path_follows
            .iter()
            .filter(|(_, inst)| inst.state().status == TransitionStatus::Completed)
            .map(|(&id, _)| id)
            .collect();
        let count = completed_t.len() + completed_p.len();
        for id in completed_t {
            let _ = self.destroy_transition(id);
        }
        for id in completed_p {
            let _ = self.destroy_path_follow(id);
        }
        count
    }

    /// Clears all transitions, path followers, locks, custom channels, and queued events.
    pub fn clear(&mut self) {
        self.transitions.clear();
        self.path_follows.clear();
        self.target_locks.clear();
        self.custom_channels.clear();
        self.event_queue.clear();
    }

    /// Drains and returns all queued animation lifecycle events.
    pub fn pump_events(&mut self) -> Vec<AnimationEvent> {
        self.event_queue.drain(..).collect()
    }

    /// Reads a custom channel value.
    pub fn get_custom_channel(&self, channel_id: u32) -> Option<&AnimValue> {
        self.custom_channels.get(&channel_id)
    }

    /// Sets a custom channel value directly.
    pub fn set_custom_channel(&mut self, channel_id: u32, value: AnimValue) {
        self.custom_channels.insert(channel_id, value);
    }

    /// Removes a custom channel by ID, releasing its stored value.
    pub fn remove_custom_channel(&mut self, channel_id: u32) -> Option<AnimValue> {
        self.custom_channels.remove(&channel_id)
    }

    /// Clears all custom channels.
    pub fn clear_custom_channels(&mut self) {
        self.custom_channels.clear();
    }

    /// Returns diagnostic statistics for this animation context.
    pub fn diagnostic_stats(&self) -> AnimationDiagnosticsStats {
        let transitions_completed = self
            .transitions
            .values()
            .filter(|t| t.state().status == TransitionStatus::Completed)
            .count();
        let path_follows_completed = self
            .path_follows
            .values()
            .filter(|p| p.state().status == TransitionStatus::Completed)
            .count();
        let estimated_cpu_bytes = (self.transitions.len()
            * std::mem::size_of::<(u32, TransitionInstance)>()
            + self.path_follows.len() * std::mem::size_of::<(u32, PathFollowInstance)>()
            + self.target_locks.capacity() * std::mem::size_of::<(AnimationTarget, u32)>()
            + self.custom_channels.capacity() * std::mem::size_of::<(u32, AnimValue)>()
            + self.event_queue.capacity() * std::mem::size_of::<AnimationEvent>())
            as u64;

        AnimationDiagnosticsStats {
            transitions_total: self.transitions.len(),
            transitions_completed,
            path_follows_total: self.path_follows.len(),
            path_follows_completed,
            target_locks_len: self.target_locks.len(),
            custom_channels_len: self.custom_channels.len(),
            event_queue_len: self.event_queue.len(),
            event_queue_cap: self.event_queue.capacity(),
            estimated_cpu_bytes,
        }
    }
}
