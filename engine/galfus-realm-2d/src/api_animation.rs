//! Property-level mutation API used by the animation system.

use galfus_realm_2d_resources::shape::ShapeKind2D;
use glam::{Vec2, Vec3, Vec4};

use crate::context::Realm2DContext;

fn not_found(realm_id: u32, kind: &str, id: u32) -> galfus_realm_core::RealmError {
    galfus_realm_core::RealmError::ResourceNotFound(realm_id, format!("{kind} {id}"))
}

impl Realm2DContext {
    /// Updates the transform of an existing sprite, returning an error when it is absent.
    pub fn set_sprite_transform_checked(
        &mut self,
        id: u32,
        transform: galfus_realm_2d_resources::transform::Transform2D,
    ) -> galfus_realm_core::RealmResult<()> {
        if !self.sprites.contains_key(&id) {
            return Err(not_found(self.id, "Sprite", id));
        }
        self.set_sprite_transform(id, transform);
        Ok(())
    }

    /// Updates only the position of an existing sprite.
    pub fn set_sprite_position(
        &mut self,
        id: u32,
        position: Vec2,
    ) -> galfus_realm_core::RealmResult<()> {
        self.sprites
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Sprite", id))?
            .1
            .position = position;
        self.shadow_manager.mark_dirty();
        self.dirty = true;
        Ok(())
    }

    /// Updates the dimensions of an existing sprite.
    pub fn set_sprite_dimensions(
        &mut self,
        id: u32,
        dimensions: Vec2,
    ) -> galfus_realm_core::RealmResult<()> {
        self.sprites
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Sprite", id))?
            .0
            .dimensions = dimensions;
        self.shadow_manager.mark_dirty();
        self.dirty = true;
        Ok(())
    }

    /// Updates the base color of the material assigned to an existing sprite.
    pub fn set_sprite_color(&mut self, id: u32, color: Vec4) -> galfus_realm_core::RealmResult<()> {
        let material_id = self
            .sprites
            .get(&id)
            .ok_or_else(|| not_found(self.id, "Sprite", id))?
            .0
            .material_id;
        if let Some(material_id) = material_id {
            self.set_material_base_color(material_id, color)?;
        }
        Ok(())
    }

    /// Updates only the position of an existing camera.
    pub fn set_camera_position(
        &mut self,
        id: u32,
        position: Vec2,
    ) -> galfus_realm_core::RealmResult<()> {
        self.cameras
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Camera", id))?
            .1
            .position = position;
        self.dirty = true;
        Ok(())
    }

    /// Updates the transform of an existing camera, returning an error when it is absent.
    pub fn set_camera_transform_checked(
        &mut self,
        id: u32,
        transform: galfus_realm_2d_resources::transform::Transform2D,
    ) -> galfus_realm_core::RealmResult<()> {
        if !self.cameras.contains_key(&id) {
            return Err(not_found(self.id, "Camera", id));
        }
        self.set_camera_transform(id, transform);
        Ok(())
    }

    /// Updates the orthographic scale of an existing camera.
    pub fn set_camera_ortho_scale(
        &mut self,
        id: u32,
        ortho_scale: f32,
    ) -> galfus_realm_core::RealmResult<()> {
        self.cameras
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Camera", id))?
            .0
            .ortho_scale = ortho_scale;
        self.dirty = true;
        Ok(())
    }

    /// Updates the base color of an existing material without invalidating its texture bindings.
    pub fn set_material_base_color(
        &mut self,
        id: u32,
        color: Vec4,
    ) -> galfus_realm_core::RealmResult<()> {
        self.materials
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Material", id))?
            .base_color = color;
        self.dirty = true;
        Ok(())
    }

    /// Updates only the position of an existing shape.
    pub fn set_shape_position(
        &mut self,
        id: u32,
        position: Vec2,
    ) -> galfus_realm_core::RealmResult<()> {
        self.shapes
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Shape", id))?
            .1
            .position = position;
        self.shadow_manager.mark_dirty();
        self.dirty = true;
        Ok(())
    }

    /// Updates the transform of an existing shape, returning an error when it is absent.
    pub fn set_shape_transform_checked(
        &mut self,
        id: u32,
        transform: galfus_realm_2d_resources::transform::Transform2D,
    ) -> galfus_realm_core::RealmResult<()> {
        if !self.shapes.contains_key(&id) {
            return Err(not_found(self.id, "Shape", id));
        }
        self.set_shape_transform(id, transform);
        Ok(())
    }

    /// Updates the base color of the material assigned to an existing shape.
    pub fn set_shape_fill_color(
        &mut self,
        id: u32,
        color: Vec4,
    ) -> galfus_realm_core::RealmResult<()> {
        let material_id = self
            .shapes
            .get(&id)
            .ok_or_else(|| not_found(self.id, "Shape", id))?
            .0
            .material_id;
        if let Some(material_id) = material_id {
            self.set_material_base_color(material_id, color)?;
        }
        Ok(())
    }

    /// Updates the radius of a circle shape. Other shape kinds are left unchanged.
    pub fn set_shape_radius(&mut self, id: u32, radius: f32) -> galfus_realm_core::RealmResult<()> {
        let shape = self
            .shapes
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Shape", id))?;
        if let ShapeKind2D::Circle {
            radius: current, ..
        } = &mut shape.0.kind
        {
            *current = radius;
            self.shadow_manager.mark_dirty();
            self.dirty = true;
        }
        Ok(())
    }

    /// Updates the dimensions of a rectangle shape. Other shape kinds are left unchanged.
    pub fn set_shape_dimensions(
        &mut self,
        id: u32,
        dimensions: Vec2,
    ) -> galfus_realm_core::RealmResult<()> {
        let shape = self
            .shapes
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Shape", id))?;
        if let ShapeKind2D::Rectangle { size } = &mut shape.0.kind {
            *size = dimensions;
            self.shadow_manager.mark_dirty();
            self.dirty = true;
        }
        Ok(())
    }

    /// Updates only the position of an existing light.
    pub fn set_light_position(
        &mut self,
        id: u32,
        position: Vec2,
    ) -> galfus_realm_core::RealmResult<()> {
        self.lights
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Light", id))?
            .position = position;
        self.shadow_manager.mark_dirty();
        self.dirty = true;
        Ok(())
    }

    /// Updates the color of an existing light.
    pub fn set_light_color(&mut self, id: u32, color: Vec3) -> galfus_realm_core::RealmResult<()> {
        self.lights
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Light", id))?
            .color = color;
        self.shadow_manager.mark_dirty();
        self.dirty = true;
        Ok(())
    }

    /// Updates the intensity of an existing light.
    pub fn set_light_intensity(
        &mut self,
        id: u32,
        intensity: f32,
    ) -> galfus_realm_core::RealmResult<()> {
        self.lights
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Light", id))?
            .intensity = intensity;
        self.shadow_manager.mark_dirty();
        self.dirty = true;
        Ok(())
    }

    /// Updates the radius of an existing light.
    pub fn set_light_radius(&mut self, id: u32, radius: f32) -> galfus_realm_core::RealmResult<()> {
        self.lights
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Light", id))?
            .light_radius = radius;
        self.shadow_manager.mark_dirty();
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

    /// Updates the transform of an existing particle emitter, returning an error when absent.
    pub fn set_particle_emitter_transform_checked(
        &mut self,
        id: u32,
        transform: galfus_realm_2d_resources::transform::Transform2D,
    ) -> galfus_realm_core::RealmResult<()> {
        if !self.emitters.contains_key(&id) {
            return Err(not_found(self.id, "ParticleEmitter", id));
        }
        self.set_particle_emitter_transform(id, transform);
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
