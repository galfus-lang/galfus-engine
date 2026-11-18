use galfus_realm_3d_resources::particle::{ParticleEmitter3D, ParticleEmitterState3D};
use galfus_realm_3d_resources::portal::Portal3D;
use galfus_realm_3d_resources::transform::Transform3D;
use galfus_realm_core::error::RealmResult;
use glam::{Vec3, Vec4};

use crate::context::{Realm3DContext, not_found};
use crate::types::validate_id;

impl Realm3DContext {
    /// Creates or updates a 3D particle emitter.
    pub fn create_particle_emitter(
        &mut self,
        id: u32,
        emitter: ParticleEmitter3D,
        transform: Transform3D,
    ) -> RealmResult<()> {
        validate_id(id)?;
        self.emitters
            .insert(id, (emitter, transform, ParticleEmitterState3D::new()));
        self.dirty = true;
        Ok(())
    }

    /// Sets the transform of an existing 3D particle emitter.
    pub fn set_particle_emitter_transform(
        &mut self,
        id: u32,
        transform: Transform3D,
    ) -> RealmResult<()> {
        let entry = self
            .emitters
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "ParticleEmitter", id))?;
        entry.1 = transform;
        self.dirty = true;
        Ok(())
    }

    /// Triggers an immediate burst of particles on an emitter.
    pub fn particle_emitter_burst(&mut self, id: u32, count: u32) -> RealmResult<()> {
        let (emitter, transform, state) = self
            .emitters
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "ParticleEmitter", id))?;
        state.burst(emitter, count, transform.position, transform.rotation);
        Ok(())
    }

    /// Destroys an existing 3D particle emitter.
    pub fn destroy_particle_emitter(&mut self, id: u32) -> RealmResult<()> {
        self.emitters
            .remove(&id)
            .map(|_| {
                self.dirty = true;
            })
            .ok_or_else(|| not_found(self.id, "ParticleEmitter", id))
    }

    /// Registers or updates a 3D optical portal or planar mirror.
    pub fn create_portal(&mut self, id: u32, portal: Portal3D) -> RealmResult<()> {
        validate_id(id)?;
        self.portals.insert(id, portal);
        self.prune_portal_pipelines();
        self.dirty = true;
        Ok(())
    }

    /// Sets whether an existing portal is active.
    pub fn set_portal_active(&mut self, id: u32, active: bool) -> RealmResult<()> {
        self.portals
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Portal", id))?
            .active = active;
        self.prune_portal_pipelines();
        self.dirty = true;
        Ok(())
    }

    /// Destroys an existing portal.
    pub fn destroy_portal(&mut self, id: u32) -> RealmResult<()> {
        self.portals
            .remove(&id)
            .ok_or_else(|| not_found(self.id, "Portal", id))?;
        self.prune_portal_pipelines();
        Ok(())
    }

    /// Queues debug gizmo drawing primitives.
    pub fn draw_line(&mut self, s: Vec3, e: Vec3, c: Vec4) {
        self.gizmos.draw_line(s, e, c);
    }

    pub fn draw_aabb(&mut self, min: Vec3, max: Vec3, c: Vec4) {
        self.gizmos.draw_aabb(min, max, c);
    }

    pub fn draw_polyline(&mut self, pts: &[Vec3], c: Vec4, cl: bool) {
        self.gizmos.draw_polyline(pts, c, cl);
    }

    pub fn clear_gizmos(&mut self) {
        self.gizmos.clear();
    }
}
