//! Entity management and scene configuration API for `Realm3DContext`.

use galfus_realm_3d_resources::camera::Camera3D;
use galfus_realm_3d_resources::environment::EnvironmentRealm3D;
use galfus_realm_3d_resources::geometry::Geometry3D;
use galfus_realm_3d_resources::light::Light3D;
use galfus_realm_3d_resources::material::Material3D;
use galfus_realm_3d_resources::model::Model3D;
use galfus_realm_3d_resources::particle::{ParticleEmitter3D, ParticleEmitterState3D};
use galfus_realm_3d_resources::portal::Portal3D;
use galfus_realm_3d_resources::transform::Transform3D;
use galfus_realm_core::error::RealmResult;

use crate::context::{Realm3DContext, not_found};
use crate::types::validate_id;

impl Realm3DContext {
    /// Registers or updates a `Camera3D` with its `Transform3D`.
    pub fn create_camera(
        &mut self,
        id: u32,
        camera: Camera3D,
        transform: Transform3D,
    ) -> RealmResult<()> {
        validate_id(id)?;
        self.cameras.insert(id, (camera, transform));
        self.dirty = true;
        Ok(())
    }

    /// Updates the transform of an existing `Camera3D`.
    pub fn set_camera_transform(&mut self, id: u32, transform: Transform3D) -> RealmResult<()> {
        self.cameras
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Camera", id))?
            .1 = transform;
        self.dirty = true;
        Ok(())
    }

    /// Registers or updates a `Material3D`.
    pub fn create_material(&mut self, id: u32, material: Material3D) -> RealmResult<()> {
        validate_id(id)?;
        self.materials.insert(id, (material, None, None));
        self.dirty = true;
        Ok(())
    }

    /// Registers or updates a `Geometry3D`.
    pub fn create_geometry(&mut self, id: u32, geometry: Geometry3D) -> RealmResult<()> {
        validate_id(id)?;
        self.geometries.insert(id, (geometry, None));
        self.dirty = true;
        Ok(())
    }

    /// Registers or updates a `Model3D` with its `Transform3D`.
    pub fn create_model(
        &mut self,
        id: u32,
        model: Model3D,
        transform: Transform3D,
    ) -> RealmResult<()> {
        validate_id(id)?;
        self.models.insert(id, (model, transform, None, None));
        self.dirty = true;
        Ok(())
    }

    /// Updates the transform of an existing `Model3D`.
    pub fn set_model_transform(&mut self, id: u32, transform: Transform3D) -> RealmResult<()> {
        let entry = self
            .models
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Model", id))?;
        entry.1 = transform;
        entry.2 = None;
        entry.3 = None;
        self.dirty = true;
        Ok(())
    }

    /// Sets or updates the skeletal bone matrix palette for a specific model.
    pub fn update_model_bones(
        &mut self,
        model_id: u32,
        matrices: &[glam::Mat4],
    ) -> RealmResult<()> {
        let realm_id = self.id;
        let entry = self
            .models
            .get_mut(&model_id)
            .ok_or_else(|| not_found(realm_id, "Model", model_id))?;
        let bone_offset = self.bones.len() as u32;
        let bone_count = matrices.len() as u32;
        self.bones.extend_from_slice(matrices);
        entry.0.bone_offset = bone_offset;
        entry.0.bone_count = bone_count;
        entry.2 = None;
        entry.3 = None;
        self.dirty = true;
        Ok(())
    }

    /// Registers or updates a `Light3D` with its `Transform3D`.
    pub fn create_light(
        &mut self,
        id: u32,
        light: Light3D,
        transform: Transform3D,
    ) -> RealmResult<()> {
        validate_id(id)?;
        self.lights.insert(id, (light, transform));
        self.dirty = true;
        Ok(())
    }

    /// Updates the transform of an existing `Light3D`.
    pub fn set_light_transform(&mut self, id: u32, transform: Transform3D) -> RealmResult<()> {
        self.lights
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Light", id))?
            .1 = transform;
        self.dirty = true;
        Ok(())
    }

    /// Updates the global `EnvironmentRealm3D` atmospheric configuration.
    pub fn set_environment(&mut self, environment: EnvironmentRealm3D) {
        self.environment = environment;
        self.dirty = true;
    }

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
            .map(|_| ())
            .ok_or_else(|| not_found(self.id, "ParticleEmitter", id))
    }

    /// Registers or updates a 3D optical portal or planar mirror.
    pub fn create_portal(&mut self, id: u32, portal: Portal3D) -> RealmResult<()> {
        validate_id(id)?;
        self.portals.insert(id, portal);
        self.dirty = true;
        Ok(())
    }

    /// Sets whether an existing portal is active.
    pub fn set_portal_active(&mut self, id: u32, active: bool) -> RealmResult<()> {
        self.portals
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Portal", id))?
            .active = active;
        self.dirty = true;
        Ok(())
    }

    /// Destroys an existing portal.
    pub fn destroy_portal(&mut self, id: u32) -> RealmResult<()> {
        self.portals
            .remove(&id)
            .map(|_| ())
            .ok_or_else(|| not_found(self.id, "Portal", id))
    }

    /// Queues debug gizmo drawing primitives.
    pub fn draw_line(&mut self, s: glam::Vec3, e: glam::Vec3, c: glam::Vec4) {
        self.gizmos.draw_line(s, e, c);
    }
    pub fn draw_aabb(&mut self, min: glam::Vec3, max: glam::Vec3, c: glam::Vec4) {
        self.gizmos.draw_aabb(min, max, c);
    }
    pub fn draw_polyline(&mut self, pts: &[glam::Vec3], c: glam::Vec4, cl: bool) {
        self.gizmos.draw_polyline(pts, c, cl);
    }
    pub fn clear_gizmos(&mut self) {
        self.gizmos.clear();
    }
}
