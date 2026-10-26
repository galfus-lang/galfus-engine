//! Realm lifecycle methods for the multiverse context.

use super::*;

impl MultiverseContext {
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

    /// Registers a builtin ColorRealm for solid clear/tinting under its logical ID.
    pub fn register_color_realm(&mut self, realm_id: u32, color: [f32; 4]) -> MultiverseResult<()> {
        let realm = galfus_realm_core::ColorRealm::new(realm_id, color);
        self.register_realm(Box::new(realm))
    }

    /// Returns a downcasted reference to a registered Realm.
    pub fn get_realm<T: 'static>(&self, realm_id: u32) -> Option<&T> {
        self.realms.get(&realm_id)?.as_any().downcast_ref::<T>()
    }

    /// Returns a downcasted mutable reference to a registered Realm.
    pub fn get_realm_mut<T: 'static>(&mut self, realm_id: u32) -> Option<&mut T> {
        self.realms
            .get_mut(&realm_id)?
            .as_any_mut()
            .downcast_mut::<T>()
    }

    /// Clears a Realm's entities and scene resources without unregistering it.
    pub fn clear_realm(&mut self, realm_id: u32) -> MultiverseResult<()> {
        let realm = self
            .realms
            .get_mut(&realm_id)
            .ok_or(MultiverseError::RealmNotFound(realm_id))?;
        realm
            .clear()
            .map_err(|e| MultiverseError::RealmError(realm_id, e.to_string()))?;
        self.dirty = true;
        Ok(())
    }

    /// Unregisters a Realm after it releases its resources and clears its graph references.
    pub fn unregister_realm(&mut self, realm_id: u32) -> MultiverseResult<()> {
        self.destroy_realm(realm_id)?;
        self.remove_destroyed_realm(realm_id)
    }

    /// Releases every registered Realm, then resets the Multiverse to an empty reusable state.
    ///
    /// If a Realm fails to destroy, all Realm registrations and graph references remain intact.
    /// Successfully destroyed Realms must be idempotent because a later retry may call destroy again.
    pub fn shutdown(&mut self) -> MultiverseResult<()> {
        let mut realm_ids: Vec<u32> = self.realms.keys().copied().collect();
        realm_ids.sort_unstable();

        for realm_id in &realm_ids {
            self.destroy_realm(*realm_id)?;
        }
        for realm_id in realm_ids {
            self.remove_destroyed_realm(realm_id)?;
        }
        self.reset_after_realm_shutdown()?;
        Ok(())
    }

    fn destroy_realm(&mut self, realm_id: u32) -> MultiverseResult<()> {
        let realm = self
            .realms
            .get_mut(&realm_id)
            .ok_or(MultiverseError::RealmNotFound(realm_id))?;
        realm
            .destroy()
            .map_err(|e| MultiverseError::RealmError(realm_id, e.to_string()))
    }

    fn remove_destroyed_realm(&mut self, realm_id: u32) -> MultiverseResult<()> {
        if self.realms.remove(&realm_id).is_none() {
            return Err(MultiverseError::RealmNotFound(realm_id));
        }

        let invocation_ids: Vec<u32> = self
            .invocations
            .iter()
            .filter(|(_, invocation)| invocation.realm_id == realm_id)
            .map(|(&invocation_id, _)| invocation_id)
            .collect();
        for invocation_id in invocation_ids {
            self.destroy_invocation(invocation_id)?;
        }
        self.bindings.retain(|binding| binding.realm_id != realm_id);
        self.dirty = true;
        Ok(())
    }

    fn reset_after_realm_shutdown(&mut self) -> MultiverseResult<()> {
        let mut target_ids: Vec<u32> = self.targets.keys().copied().collect();
        target_ids.sort_unstable();
        for target_id in target_ids {
            self.destroy_target(target_id)?;
        }

        self.bindings.clear();
        self.scratch_textures.clear();
        self.taa_history.clear();
        self.ping_pong_texture = None;
        self.smaa_intermediates = None;
        self.post_processor = None;
        self.surfaces.clear();
        self.window_sizes.clear();
        self.gpu_manager = None;
        self.cached_schedule = None;
        self.anti_aliasing = AntiAliasingMode::None;
        self.dirty = true;
        Ok(())
    }
}
