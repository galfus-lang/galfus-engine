//! Entity management and scene configuration API for `Realm3DContext`.

use galfus_realm_3d_resources::camera::{Camera3D, CameraLookAt3D};
use galfus_realm_3d_resources::environment::EnvironmentRealm3D;
use galfus_realm_3d_resources::geometry::{Geometry3D, MorphTarget3D};
use galfus_realm_3d_resources::light::Light3D;
use galfus_realm_3d_resources::material::Material3D;
use galfus_realm_3d_resources::model::{InstanceData3D, InstancedModel3D, Model3D};
use galfus_realm_3d_resources::particle::{ParticleEmitter3D, ParticleEmitterState3D};
use galfus_realm_3d_resources::portal::Portal3D;
use galfus_realm_3d_resources::transform::Transform3D;
use galfus_realm_core::error::RealmResult;

use crate::context::{Realm3DContext, not_found};
use crate::types::validate_id;

fn validate_morph_weights(weights: &[f32], target_count: usize) -> RealmResult<()> {
    if !weights.is_empty() && weights.len() != target_count {
        return Err(galfus_realm_core::error::RealmError::Internal(format!(
            "Morph weight count {} does not match geometry target count {target_count}",
            weights.len()
        )));
    }
    if weights.iter().any(|weight| !weight.is_finite()) {
        return Err(galfus_realm_core::error::RealmError::Internal(
            "Morph weights must be finite".into(),
        ));
    }
    Ok(())
}

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

    /// Sets the optional world-space look-at point and up direction of an existing camera.
    pub fn set_camera_look_at(
        &mut self,
        id: u32,
        target: glam::Vec3,
        up: glam::Vec3,
    ) -> RealmResult<()> {
        let camera = &mut self
            .cameras
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Camera", id))?
            .0;
        camera
            .set_look_at(target, up)
            .map_err(galfus_realm_core::error::RealmError::Internal)?;
        self.dirty = true;
        Ok(())
    }

    /// Updates only the look-at target, preserving the existing up vector or using world up.
    pub fn set_camera_look_at_target(&mut self, id: u32, target: glam::Vec3) -> RealmResult<()> {
        let up = self
            .cameras
            .get(&id)
            .ok_or_else(|| not_found(self.id, "Camera", id))?
            .0
            .look_at
            .map(|look_at| look_at.up)
            .unwrap_or(glam::Vec3::Y);
        self.set_camera_look_at(id, target, up)
    }

    /// Returns the optional look-at configuration of an existing camera.
    pub fn get_camera_look_at(&self, id: u32) -> RealmResult<Option<CameraLookAt3D>> {
        self.cameras
            .get(&id)
            .map(|entry| entry.0.look_at)
            .ok_or_else(|| not_found(self.id, "Camera", id))
    }

    /// Clears the optional look-at configuration of an existing camera.
    pub fn clear_camera_look_at(&mut self, id: u32) -> RealmResult<()> {
        let camera = &mut self
            .cameras
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Camera", id))?
            .0;
        camera.clear_look_at();
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
        let geometry = self.geometries[&id].0.clone();
        let target_count = geometry.morph_targets.len();
        for entry in self
            .models
            .values_mut()
            .filter(|entry| entry.0.geometry_id == id)
        {
            if !entry.0.morph_weights.is_empty() && entry.0.morph_weights.len() != target_count {
                entry.0.morph_weights.clear();
                entry.4 = None;
            }
            entry.2 = geometry.aabb_for_morph_weights(&entry.0.morph_weights);
            entry.5 = None;
        }
        for entry in self
            .instanced_models
            .values_mut()
            .filter(|entry| entry.0.geometry_id == id)
        {
            if !entry.0.morph_weights.is_empty() && entry.0.morph_weights.len() != target_count {
                entry.0.morph_weights.clear();
                entry.4 = None;
            }
            entry.5 = None;
        }
        self.dirty = true;
        Ok(())
    }

    /// Replaces the direct binary morph-target data of an existing geometry.
    pub fn set_geometry_morph_targets(
        &mut self,
        id: u32,
        morph_targets: Vec<MorphTarget3D>,
    ) -> RealmResult<()> {
        let realm_id = self.id;
        let geometry = self
            .geometries
            .get_mut(&id)
            .ok_or_else(|| not_found(realm_id, "Geometry", id))?;
        geometry
            .0
            .set_morph_targets(morph_targets)
            .map_err(galfus_realm_core::error::RealmError::Internal)?;
        geometry.1 = None;
        let geometry = geometry.0.clone();

        let target_count = geometry.morph_targets.len();
        let aabb = geometry.aabb;
        for entry in self
            .models
            .values_mut()
            .filter(|entry| entry.0.geometry_id == id)
        {
            if !entry.0.morph_weights.is_empty() && entry.0.morph_weights.len() != target_count {
                entry.0.morph_weights.clear();
                entry.4 = None;
            }
            entry.2 = if entry.0.morph_weights.is_empty() {
                aabb
            } else {
                geometry.aabb_for_morph_weights(&entry.0.morph_weights)
            };
            entry.5 = None;
        }
        for entry in self
            .instanced_models
            .values_mut()
            .filter(|entry| entry.0.geometry_id == id)
        {
            if !entry.0.morph_weights.is_empty() && entry.0.morph_weights.len() != target_count {
                entry.0.morph_weights.clear();
                entry.4 = None;
            }
            entry.5 = None;
        }
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
        let aabb = self
            .geometries
            .get(&model.geometry_id)
            .map(|(geometry, _)| geometry.aabb_for_morph_weights(&model.morph_weights))
            .unwrap_or_default();
        self.models
            .insert(id, (model, transform, aabb, None, None, None));
        self.dirty = true;
        Ok(())
    }

    /// Registers or updates an `InstancedModel3D`.
    pub fn create_instanced_model(&mut self, id: u32, model: InstancedModel3D) -> RealmResult<()> {
        validate_id(id)?;
        self.instanced_models
            .insert(id, (model, Vec::new(), None, None, None, None));
        self.dirty = true;
        Ok(())
    }

    /// Sets or updates the instance collection data for an existing `InstancedModel3D`.
    pub fn set_instanced_model_data(
        &mut self,
        id: u32,
        instances: Vec<InstanceData3D>,
    ) -> RealmResult<()> {
        let entry = self
            .instanced_models
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "InstancedModel", id))?;
        entry.1 = instances
            .into_iter()
            .map(InstanceData3D::into_linear_gpu)
            .collect();
        self.dirty = true;
        Ok(())
    }

    /// Updates the blend weights of an existing model.
    pub fn set_model_morph_weights(&mut self, id: u32, weights: Vec<f32>) -> RealmResult<()> {
        let geometry_id = self
            .models
            .get(&id)
            .ok_or_else(|| not_found(self.id, "Model", id))?
            .0
            .geometry_id;
        let geometry = self
            .geometries
            .get(&geometry_id)
            .ok_or_else(|| not_found(self.id, "Geometry", geometry_id))?;
        validate_morph_weights(weights.as_slice(), geometry.0.morph_targets.len())?;
        let aabb = geometry.0.aabb_for_morph_weights(&weights);
        let entry = self.models.get_mut(&id).expect("model was checked above");
        entry.0.morph_weights = weights;
        entry.2 = aabb;
        self.dirty = true;
        Ok(())
    }

    /// Updates the blend weights shared by every instance in an instanced draw batch.
    pub fn set_instanced_model_morph_weights(
        &mut self,
        id: u32,
        weights: Vec<f32>,
    ) -> RealmResult<()> {
        let geometry_id = self
            .instanced_models
            .get(&id)
            .ok_or_else(|| not_found(self.id, "InstancedModel", id))?
            .0
            .geometry_id;
        let geometry = self
            .geometries
            .get(&geometry_id)
            .ok_or_else(|| not_found(self.id, "Geometry", geometry_id))?;
        validate_morph_weights(weights.as_slice(), geometry.0.morph_targets.len())?;
        let entry = self
            .instanced_models
            .get_mut(&id)
            .expect("instanced model was checked above");
        entry.0.morph_weights = weights;
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
        self.dirty = true;
        Ok(())
    }

    /// Returns the transform of an existing `Model3D`.
    pub fn get_model_transform(&self, id: u32) -> RealmResult<Transform3D> {
        self.models
            .get(&id)
            .map(|entry| entry.1)
            .ok_or_else(|| not_found(self.id, "Model", id))
    }

    /// Returns the transform of an existing `Camera3D`.
    pub fn get_camera_transform(&self, id: u32) -> RealmResult<Transform3D> {
        self.cameras
            .get(&id)
            .map(|entry| entry.1)
            .ok_or_else(|| not_found(self.id, "Camera", id))
    }

    /// Returns the world-space bounding box (min, max) for an existing `Model3D`.
    pub fn get_model_aabb(&self, id: u32) -> RealmResult<(glam::Vec3, glam::Vec3)> {
        let model_entry = self
            .models
            .get(&id)
            .ok_or_else(|| not_found(self.id, "Model", id))?;
        let geom_id = model_entry.0.geometry_id;
        let _geom = self
            .geometries
            .get(&geom_id)
            .ok_or_else(|| not_found(self.id, "Geometry", geom_id))?;
        let world_aabb = model_entry.2.transform(&model_entry.1.matrix());
        Ok((world_aabb.min, world_aabb.max))
    }

    /// Sets or updates the skeletal bone matrix palette for a specific model.
    pub fn update_model_bones(
        &mut self,
        model_id: u32,
        matrices: &[glam::Mat4],
    ) -> RealmResult<()> {
        let realm_id = self.id;
        if !self.models.contains_key(&model_id) {
            return Err(not_found(realm_id, "Model", model_id));
        }
        self.model_bones.insert(model_id, matrices.to_vec());
        self.dirty = true;
        Ok(())
    }

    /// Rebuilds the unified skeletal bone buffer from per-model bone states.
    pub(crate) fn rebuild_bones(&mut self) {
        if self.model_bones.is_empty() {
            return;
        }
        self.bones.clear();
        for (model_id, matrices) in &self.model_bones {
            if let Some(entry) = self.models.get_mut(model_id) {
                entry.0.bone_offset = self.bones.len() as u32;
                entry.0.bone_count = matrices.len() as u32;
                self.bones.extend_from_slice(matrices);
                entry.3 = None;
                entry.5 = None;
            }
        }
    }

    /// Destroys an existing `Camera3D`.
    pub fn destroy_camera(&mut self, id: u32) -> RealmResult<()> {
        self.cameras
            .remove(&id)
            .map(|_| {
                self.dirty = true;
            })
            .ok_or_else(|| not_found(self.id, "Camera", id))
    }

    /// Destroys an existing `Material3D`.
    pub fn destroy_material(&mut self, id: u32) -> RealmResult<()> {
        self.materials
            .remove(&id)
            .map(|_| {
                self.dirty = true;
            })
            .ok_or_else(|| not_found(self.id, "Material", id))
    }

    /// Destroys an existing `Geometry3D`.
    pub fn destroy_geometry(&mut self, id: u32) -> RealmResult<()> {
        self.geometries
            .remove(&id)
            .map(|_| {
                self.dirty = true;
            })
            .ok_or_else(|| not_found(self.id, "Geometry", id))
    }

    /// Destroys an existing `Model3D` and its skeletal bone palette if present.
    pub fn destroy_model(&mut self, id: u32) -> RealmResult<()> {
        self.model_bones.remove(&id);
        self.models
            .remove(&id)
            .map(|_| {
                self.dirty = true;
            })
            .ok_or_else(|| not_found(self.id, "Model", id))
    }

    /// Destroys an existing `InstancedModel3D`.
    pub fn destroy_instanced_model(&mut self, id: u32) -> RealmResult<()> {
        validate_id(id)?;
        self.instanced_models
            .remove(&id)
            .map(|_| {
                self.dirty = true;
            })
            .ok_or_else(|| not_found(self.id, "InstancedModel", id))
    }

    /// Destroys an existing `Light3D`.
    pub fn destroy_light(&mut self, id: u32) -> RealmResult<()> {
        self.lights
            .remove(&id)
            .map(|_| {
                self.dirty = true;
            })
            .ok_or_else(|| not_found(self.id, "Light", id))
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
