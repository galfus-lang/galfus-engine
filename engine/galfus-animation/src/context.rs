//! Central animation context coordinating active transitions, step ticks, and event dispatch.

use std::collections::{BTreeMap, HashMap, VecDeque};

use galfus_core::id::validate_host_logical_id;
use galfus_multiverse::MultiverseContext;

use crate::applier::apply_target_value;
use crate::error::{AnimationError, AnimationResult};
use crate::events::AnimationEvent;
use crate::target::AnimationTarget;
use crate::transition::{TransitionConfig, TransitionInstance, TransitionState};
use crate::value::AnimValue;

/// Autonomous animation manager coordinating transitions, state queries, and event pumping.
pub struct AnimationContext {
    pub(crate) transitions: BTreeMap<u32, TransitionInstance>,
    pub(crate) target_locks: HashMap<AnimationTarget, u32>,
    pub(crate) custom_channels: HashMap<u32, AnimValue>,
    pub(crate) event_queue: VecDeque<AnimationEvent>,
}

impl Default for AnimationContext {
    fn default() -> Self {
        Self::new()
    }
}

impl AnimationContext {
    /// Creates a new empty `AnimationContext`.
    pub fn new() -> Self {
        Self {
            transitions: BTreeMap::new(),
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
        // Prevent concurrent transitions from writing to the same destination property
        if let Some(&owner_id) = self.target_locks.get(&target)
            && owner_id != id
        {
            return Err(AnimationError::TargetConflict {
                target: format!("{target:?}"),
                owner_id,
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

        self.target_locks.insert(target.clone(), id);
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
            }
            Ok(())
        } else {
            Err(AnimationError::TransitionNotFound(id))
        }
    }

    /// Advances all transitions by delta time `dt` seconds and collects triggered events.
    pub fn step(&mut self, dt: f32) {
        for instance in self.transitions.values_mut() {
            if let Some(event) = instance.step(dt) {
                self.event_queue.push_back(event);
            }
        }
    }

    /// Applies evaluated animated values to bound targets inside Multiverse.
    pub fn apply_to_multiverse(
        &mut self,
        multiverse: &mut MultiverseContext,
    ) -> AnimationResult<()> {
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
        Ok(())
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
}
