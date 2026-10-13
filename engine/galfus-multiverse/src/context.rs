use std::collections::HashMap;

use galfus_core::id::validate_host_logical_id;
use galfus_realm_core::{Realm, RealmInvocationContext, RealmPrepareContext};
use glam::UVec2;

use crate::error::{MultiverseError, MultiverseResult};
use crate::resolver::resolve_schedule;
use crate::schedule::MultiverseSchedule;
use crate::types::{InvocationDesc, TargetDesc, TargetTextureBinding};

/// Central Multiverse Context coordinating targets, realms, and invocation scheduling.
pub struct MultiverseContext {
    targets: HashMap<u32, TargetDesc>,
    realms: HashMap<u32, Box<dyn Realm>>,
    invocations: HashMap<u32, InvocationDesc>,
    bindings: Vec<TargetTextureBinding>,
    window_sizes: HashMap<u32, UVec2>,

    /// Cached resolved schedule.
    cached_schedule: Option<MultiverseSchedule>,
    /// Dirty flag indicating graph mutations requiring recalculation.
    dirty: bool,
}

impl Default for MultiverseContext {
    fn default() -> Self {
        Self::new()
    }
}

impl MultiverseContext {
    /// Creates a new empty `MultiverseContext`.
    pub fn new() -> Self {
        Self {
            targets: HashMap::new(),
            realms: HashMap::new(),
            invocations: HashMap::new(),
            bindings: Vec::new(),
            window_sizes: HashMap::new(),
            cached_schedule: None,
            dirty: true,
        }
    }

    /// Registers a new Target (Window or Texture) under a host logical ID.
    pub fn create_target(&mut self, target_id: u32, desc: TargetDesc) -> MultiverseResult<()> {
        validate_host_logical_id(target_id)?;
        if self.targets.contains_key(&target_id) {
            return Err(MultiverseError::TargetAlreadyExists(target_id));
        }
        self.targets.insert(target_id, desc);
        self.dirty = true;
        Ok(())
    }

    /// Destroys a Target and removes associated invocations.
    pub fn destroy_target(&mut self, target_id: u32) -> MultiverseResult<()> {
        if self.targets.remove(&target_id).is_none() {
            return Err(MultiverseError::TargetNotFound(target_id));
        }
        self.invocations.retain(|_, inv| inv.target_id != target_id);
        self.bindings.retain(|b| b.source_target_id != target_id);
        self.dirty = true;
        Ok(())
    }

    /// Registers a Realm implementation under its logical ID.
    pub fn register_realm(&mut self, realm: Box<dyn Realm>) -> MultiverseResult<()> {
        let realm_id = realm.id();
        validate_host_logical_id(realm_id)?;
        if self.realms.contains_key(&realm_id) {
            return Err(MultiverseError::RealmAlreadyRegistered(realm_id));
        }
        self.realms.insert(realm_id, realm);
        self.dirty = true;
        Ok(())
    }

    /// Unregisters a Realm and clears associated invocations.
    pub fn unregister_realm(&mut self, realm_id: u32) -> MultiverseResult<()> {
        if self.realms.remove(&realm_id).is_none() {
            return Err(MultiverseError::RealmNotFound(realm_id));
        }
        self.invocations.retain(|_, inv| inv.realm_id != realm_id);
        self.bindings.retain(|b| b.realm_id != realm_id);
        self.dirty = true;
        Ok(())
    }

    /// Creates an invocation linking a Realm to a Target.
    pub fn create_invocation(
        &mut self,
        invocation_id: u32,
        desc: InvocationDesc,
    ) -> MultiverseResult<()> {
        validate_host_logical_id(invocation_id)?;
        if self.invocations.contains_key(&invocation_id) {
            return Err(MultiverseError::InvocationAlreadyExists(invocation_id));
        }
        if !self.realms.contains_key(&desc.realm_id) {
            return Err(MultiverseError::RealmNotFound(desc.realm_id));
        }
        if !self.targets.contains_key(&desc.target_id) {
            return Err(MultiverseError::TargetNotFound(desc.target_id));
        }
        self.invocations.insert(invocation_id, desc);
        self.dirty = true;
        Ok(())
    }

    /// Destroys an invocation.
    pub fn destroy_invocation(&mut self, invocation_id: u32) -> MultiverseResult<()> {
        if self.invocations.remove(&invocation_id).is_none() {
            return Err(MultiverseError::InvocationNotFound(invocation_id));
        }
        self.dirty = true;
        Ok(())
    }

    /// Enables or disables an invocation without removing it.
    pub fn set_invocation_enabled(
        &mut self,
        invocation_id: u32,
        enabled: bool,
    ) -> MultiverseResult<()> {
        let inv = self
            .invocations
            .get_mut(&invocation_id)
            .ok_or(MultiverseError::InvocationNotFound(invocation_id))?;
        if inv.enabled != enabled {
            inv.enabled = enabled;
            self.dirty = true;
        }
        Ok(())
    }

    /// Binds a Target's output texture to a Realm slot (e.g. portal surface material).
    pub fn bind_target_texture(&mut self, binding: TargetTextureBinding) -> MultiverseResult<()> {
        if !self.targets.contains_key(&binding.source_target_id) {
            return Err(MultiverseError::TargetNotFound(binding.source_target_id));
        }
        if !self.realms.contains_key(&binding.realm_id) {
            return Err(MultiverseError::RealmNotFound(binding.realm_id));
        }
        self.bindings
            .retain(|b| !(b.realm_id == binding.realm_id && b.slot == binding.slot));
        self.bindings.push(binding);
        self.dirty = true;
        Ok(())
    }

    /// Unbinds a Target texture from a Realm slot.
    pub fn unbind_target_texture(&mut self, realm_id: u32, slot: &str) -> MultiverseResult<()> {
        self.bindings
            .retain(|b| !(b.realm_id == realm_id && b.slot == slot));
        self.dirty = true;
        Ok(())
    }

    /// Updates the known size for a window target (usually updated on window resize event).
    pub fn update_window_size(&mut self, window_id: u32, size: UVec2) {
        self.window_sizes.insert(window_id, size);
        self.dirty = true;
    }

    /// Resolves and returns the execution schedule, caching the result until the graph is mutated.
    pub fn resolve(&mut self) -> MultiverseResult<&MultiverseSchedule> {
        if self.dirty || self.cached_schedule.is_none() {
            let schedule = resolve_schedule(
                &self.targets,
                &self.invocations,
                &self.bindings,
                &self.window_sizes,
            )?;
            self.cached_schedule = Some(schedule);
            self.dirty = false;
        }
        Ok(self.cached_schedule.as_ref().unwrap())
    }

    /// Dispatches a frame by preparing realms and rendering active invocations in scheduled order.
    pub fn dispatch(&mut self, frame_id: u64, delta_time: f32) -> MultiverseResult<()> {
        let schedule = self.resolve()?.clone();

        // 1. Prepare all active realms once
        let prep_ctx = RealmPrepareContext {
            frame_id,
            delta_time,
        };
        for realm in self.realms.values_mut() {
            realm
                .prepare(&prep_ctx)
                .map_err(|e| MultiverseError::RealmError(realm.id(), e.to_string()))?;
        }

        // 2. Dispatch invocations block by block (target by target)
        for block in &schedule.target_blocks {
            for step in &block.invocations {
                if let Some(realm) = self.realms.get_mut(&step.realm_id) {
                    let inv_ctx = RealmInvocationContext {
                        frame_id,
                        invocation_id: step.invocation_id,
                        target_id: block.target_id,
                        camera_id: step.camera_id,
                        viewport: step.resolved_viewport,
                    };
                    realm
                        .render(&inv_ctx)
                        .map_err(|e| MultiverseError::RealmError(realm.id(), e.to_string()))?;
                }
            }
        }

        Ok(())
    }
}
