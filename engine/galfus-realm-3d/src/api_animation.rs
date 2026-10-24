//! Property-level mutation API used by the animation system.

use glam::{Vec3, Vec4};

use crate::context::{Realm3DContext, not_found};

impl Realm3DContext {
    /// Updates only the position of an existing model.
    pub fn set_model_position(
        &mut self,
        id: u32,
        position: Vec3,
    ) -> galfus_realm_core::RealmResult<()> {
        self.models
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Model", id))?
            .1
            .position = position;
        self.dirty = true;
        Ok(())
    }

    /// Updates the outline tint of an existing model.
    pub fn set_model_tint_color(
        &mut self,
        id: u32,
        color: Vec4,
    ) -> galfus_realm_core::RealmResult<()> {
        self.models
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Model", id))?
            .0
            .outline_color = color;
        self.dirty = true;
        Ok(())
    }

    /// Updates only the position of an existing camera.
    pub fn set_camera_position(
        &mut self,
        id: u32,
        position: Vec3,
    ) -> galfus_realm_core::RealmResult<()> {
        self.cameras
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Camera", id))?
            .1
            .position = position;
        self.dirty = true;
        Ok(())
    }

    /// Updates the vertical field of view of an existing camera.
    pub fn set_camera_fov(&mut self, id: u32, fov_y: f32) -> galfus_realm_core::RealmResult<()> {
        self.cameras
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Camera", id))?
            .0
            .fov_y = fov_y;
        self.dirty = true;
        Ok(())
    }

    /// Updates only the position of an existing light.
    pub fn set_light_position(
        &mut self,
        id: u32,
        position: Vec3,
    ) -> galfus_realm_core::RealmResult<()> {
        self.lights
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Light", id))?
            .1
            .position = position;
        self.lights_dirty = true;
        self.dirty = true;
        Ok(())
    }

    /// Updates the base color of an existing material.
    pub fn set_material_base_color(
        &mut self,
        id: u32,
        color: Vec4,
    ) -> galfus_realm_core::RealmResult<()> {
        self.materials
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Material", id))?
            .0
            .base_color = color;
        self.dirty = true;
        Ok(())
    }

    /// Updates the emissive color of an existing material.
    pub fn set_material_emissive_color(
        &mut self,
        id: u32,
        color: Vec4,
    ) -> galfus_realm_core::RealmResult<()> {
        self.materials
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Material", id))?
            .0
            .emissive_color = color;
        self.dirty = true;
        Ok(())
    }

    /// Updates the roughness of an existing material.
    pub fn set_material_roughness(
        &mut self,
        id: u32,
        roughness: f32,
    ) -> galfus_realm_core::RealmResult<()> {
        self.materials
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Material", id))?
            .0
            .roughness = roughness;
        self.dirty = true;
        Ok(())
    }

    /// Updates the metallic value of an existing material.
    pub fn set_material_metallic(
        &mut self,
        id: u32,
        metallic: f32,
    ) -> galfus_realm_core::RealmResult<()> {
        self.materials
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Material", id))?
            .0
            .metallic = metallic;
        self.dirty = true;
        Ok(())
    }

    /// Updates the color of the procedural environment sun.
    pub fn set_environment_sun_color(&mut self, color: Vec4) {
        self.environment.skybox.sun_color = color;
        self.dirty = true;
    }

    /// Updates the intensity of the procedural environment sun.
    pub fn set_environment_sun_intensity(&mut self, intensity: f32) {
        self.environment.skybox.intensity = intensity;
        self.dirty = true;
    }

    /// Updates the ambient environment color.
    pub fn set_environment_ambient_color(&mut self, color: Vec4) {
        self.environment.ambient_color = color;
        self.dirty = true;
    }

    /// Updates only the position of an existing particle emitter.
    pub fn set_particle_emitter_position(
        &mut self,
        id: u32,
        position: Vec3,
    ) -> galfus_realm_core::RealmResult<()> {
        self.emitters
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "ParticleEmitter", id))?
            .1
            .position = position;
        self.dirty = true;
        Ok(())
    }

    /// Updates the uniform speed of an existing particle emitter.
    pub fn set_particle_emitter_speed(
        &mut self,
        id: u32,
        speed: f32,
    ) -> galfus_realm_core::RealmResult<()> {
        self.emitters
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "ParticleEmitter", id))?
            .0
            .speed_range = [speed, speed];
        self.dirty = true;
        Ok(())
    }

    /// Updates the starting color of an existing particle emitter.
    pub fn set_particle_emitter_start_color(
        &mut self,
        id: u32,
        color: Vec4,
    ) -> galfus_realm_core::RealmResult<()> {
        self.emitters
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "ParticleEmitter", id))?
            .0
            .start_color = color;
        self.dirty = true;
        Ok(())
    }

    /// Updates the ending color of an existing particle emitter.
    pub fn set_particle_emitter_end_color(
        &mut self,
        id: u32,
        color: Vec4,
    ) -> galfus_realm_core::RealmResult<()> {
        self.emitters
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "ParticleEmitter", id))?
            .0
            .end_color = color;
        self.dirty = true;
        Ok(())
    }
}
