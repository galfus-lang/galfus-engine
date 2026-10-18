//! Entity management and scene configuration API for `Realm2DContext`.

use galfus_realm_2d_resources::camera::Camera2D;
use galfus_realm_2d_resources::light::Light2D;
use galfus_realm_2d_resources::material::Material2D;
use galfus_realm_2d_resources::particle::{ParticleEmitter2D, ParticleEmitterState2D};
use galfus_realm_2d_resources::shadow::Shadow2DConfig;
use galfus_realm_2d_resources::shape::Shape2D;
use galfus_realm_2d_resources::sprite::Sprite2D;
use galfus_realm_2d_resources::svg::Svg2D;
use galfus_realm_2d_resources::transform::Transform2D;
use galfus_realm_core::error::RealmResult;

use crate::context::Realm2DContext;
use crate::shadow::ShadowManager2D;

impl Realm2DContext {
    pub(crate) fn validate_id(&self, id: u32) -> RealmResult<()> {
        galfus_core::id::validate_host_logical_id(id)
            .map(|_| ())
            .map_err(|e| galfus_realm_core::RealmError::Internal(e.to_string()))
    }

    /// Sets or updates a camera in the realm.
    pub fn set_camera(
        &mut self,
        camera_id: u32,
        camera: Camera2D,
        transform: Transform2D,
    ) -> RealmResult<()> {
        self.validate_id(camera_id)?;
        self.cameras.insert(camera_id, (camera, transform));
        self.dirty = true;
        Ok(())
    }

    pub fn set_camera_transform(&mut self, camera_id: u32, transform: Transform2D) {
        if let Some((_, t)) = self.cameras.get_mut(&camera_id) {
            *t = transform;
            self.dirty = true;
        }
    }

    /// Returns the transform of an existing Camera2D.
    pub fn get_camera_transform(&self, camera_id: u32) -> Option<Transform2D> {
        self.cameras.get(&camera_id).map(|(_, t)| *t)
    }

    pub fn set_material(&mut self, material_id: u32, material: Material2D) -> RealmResult<()> {
        self.validate_id(material_id)?;
        self.materials.insert(material_id, material);
        self.material_bind_groups.remove(&material_id);
        self.material_uniform_buffers.remove(&material_id);
        self.dirty = true;
        Ok(())
    }

    pub fn set_sprite(
        &mut self,
        sprite_id: u32,
        sprite: Sprite2D,
        transform: Transform2D,
    ) -> RealmResult<()> {
        self.validate_id(sprite_id)?;
        self.sprites.insert(sprite_id, (sprite, transform));
        self.dirty = true;
        Ok(())
    }

    pub fn set_sprite_transform(&mut self, sprite_id: u32, transform: Transform2D) {
        if let Some((_, t)) = self.sprites.get_mut(&sprite_id) {
            *t = transform;
            self.dirty = true;
        }
    }

    /// Returns the transform of an existing Sprite2D.
    pub fn get_sprite_transform(&self, sprite_id: u32) -> Option<Transform2D> {
        self.sprites.get(&sprite_id).map(|(_, t)| *t)
    }

    pub fn set_shape(
        &mut self,
        shape_id: u32,
        shape: Shape2D,
        transform: Transform2D,
    ) -> RealmResult<()> {
        self.validate_id(shape_id)?;
        self.shapes.insert(shape_id, (shape, transform));
        self.dirty = true;
        Ok(())
    }

    pub fn set_shape_transform(&mut self, shape_id: u32, transform: Transform2D) {
        if let Some((_, t)) = self.shapes.get_mut(&shape_id) {
            *t = transform;
            self.dirty = true;
        }
    }

    pub fn set_light(&mut self, light_id: u32, light: Light2D) -> RealmResult<()> {
        self.validate_id(light_id)?;
        self.lights.insert(light_id, light);
        self.shadow_manager.mark_dirty();
        self.dirty = true;
        Ok(())
    }

    pub fn set_light_transform(&mut self, light_id: u32, transform: Transform2D) {
        if let Some(light) = self.lights.get_mut(&light_id) {
            light.position = transform.position;
            light.z = transform.z_layer as f32;
            self.shadow_manager.mark_dirty();
            self.dirty = true;
        }
    }

    pub fn set_shadow_config(&mut self, config: Shadow2DConfig) {
        self.shadow_manager = ShadowManager2D::new(config);
        self.dirty = true;
    }

    pub fn set_particle_emitter(
        &mut self,
        emitter_id: u32,
        emitter: ParticleEmitter2D,
        transform: Transform2D,
    ) -> RealmResult<()> {
        self.validate_id(emitter_id)?;
        let max_particles = emitter.max_particles as usize;
        let state = ParticleEmitterState2D::new(max_particles);
        self.emitters
            .insert(emitter_id, (emitter, transform, state));
        self.dirty = true;
        Ok(())
    }

    pub fn set_particle_emitter_transform(&mut self, emitter_id: u32, transform: Transform2D) {
        if let Some((_, t, _)) = self.emitters.get_mut(&emitter_id) {
            *t = transform;
            self.dirty = true;
        }
    }

    pub fn particle_emitter_burst(&mut self, emitter_id: u32, count: u32) {
        if let Some((cfg, transform, state)) = self.emitters.get_mut(&emitter_id) {
            state.burst(count, transform.position, cfg);
            self.dirty = true;
        }
    }

    pub fn remove_particle_emitter(&mut self, emitter_id: u32) {
        self.emitters.remove(&emitter_id);
        self.dirty = true;
    }

    /// Destroys a camera entity by its host logical ID.
    pub fn destroy_camera(&mut self, camera_id: u32) -> RealmResult<()> {
        self.cameras
            .remove(&camera_id)
            .map(|_| {
                self.dirty = true;
            })
            .ok_or_else(|| {
                galfus_realm_core::RealmError::ResourceNotFound(
                    self.id,
                    format!("Camera {camera_id}"),
                )
            })
    }

    /// Destroys a material entity and frees GPU resources by its host logical ID.
    pub fn destroy_material(&mut self, material_id: u32) -> RealmResult<()> {
        self.material_bind_groups.remove(&material_id);
        self.material_uniform_buffers.remove(&material_id);
        self.materials
            .remove(&material_id)
            .map(|_| {
                self.dirty = true;
            })
            .ok_or_else(|| {
                galfus_realm_core::RealmError::ResourceNotFound(
                    self.id,
                    format!("Material {material_id}"),
                )
            })
    }

    /// Destroys a sprite entity by its host logical ID.
    pub fn destroy_sprite(&mut self, sprite_id: u32) -> RealmResult<()> {
        self.sprites
            .remove(&sprite_id)
            .map(|_| {
                self.dirty = true;
            })
            .ok_or_else(|| {
                galfus_realm_core::RealmError::ResourceNotFound(
                    self.id,
                    format!("Sprite {sprite_id}"),
                )
            })
    }

    /// Destroys a shape entity by its host logical ID.
    pub fn destroy_shape(&mut self, shape_id: u32) -> RealmResult<()> {
        self.shapes
            .remove(&shape_id)
            .map(|_| {
                self.dirty = true;
            })
            .ok_or_else(|| {
                galfus_realm_core::RealmError::ResourceNotFound(
                    self.id,
                    format!("Shape {shape_id}"),
                )
            })
    }

    /// Destroys a light entity by its host logical ID.
    pub fn destroy_light(&mut self, light_id: u32) -> RealmResult<()> {
        self.lights
            .remove(&light_id)
            .map(|_| {
                self.shadow_manager.mark_dirty();
                self.dirty = true;
            })
            .ok_or_else(|| {
                galfus_realm_core::RealmError::ResourceNotFound(
                    self.id,
                    format!("Light {light_id}"),
                )
            })
    }

    /// Creates or updates a 2D SVG vector entity with an initial transform.
    pub fn set_svg(&mut self, svg_id: u32, svg: Svg2D, transform: Transform2D) -> RealmResult<()> {
        self.validate_id(svg_id)?;
        self.svg_manager.insert(svg_id, svg, transform);
        self.dirty = true;
        Ok(())
    }

    /// Replaces the source XML of an existing SVG entity.
    pub fn set_svg_source(&mut self, svg_id: u32, source: String) -> RealmResult<()> {
        let instance = self.svg_manager.get_mut(svg_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("SVG {svg_id}"))
        })?;
        instance.svg.set_source(source);
        self.dirty = true;
        Ok(())
    }

    /// Sets or overwrites an XML attribute on the element with matching ID in the SVG.
    pub fn set_svg_attribute(
        &mut self,
        svg_id: u32,
        element_id: &str,
        name: &str,
        value: &str,
    ) -> RealmResult<()> {
        let instance = self.svg_manager.get_mut(svg_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("SVG {svg_id}"))
        })?;
        if instance.svg.set_attribute(element_id, name, value) {
            self.dirty = true;
            Ok(())
        } else {
            Err(galfus_realm_core::RealmError::Internal(format!(
                "Element #{element_id} not found in SVG {svg_id}"
            )))
        }
    }

    /// Removes an XML attribute from the element with matching ID in the SVG.
    pub fn remove_svg_attribute(
        &mut self,
        svg_id: u32,
        element_id: &str,
        name: &str,
    ) -> RealmResult<()> {
        let instance = self.svg_manager.get_mut(svg_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("SVG {svg_id}"))
        })?;
        if instance.svg.remove_attribute(element_id, name) {
            self.dirty = true;
            Ok(())
        } else {
            Err(galfus_realm_core::RealmError::Internal(format!(
                "Element #{element_id} or attribute {name} not found in SVG {svg_id}"
            )))
        }
    }

    /// Updates the text content of the element with matching ID in the SVG.
    pub fn set_svg_text(&mut self, svg_id: u32, element_id: &str, text: &str) -> RealmResult<()> {
        let instance = self.svg_manager.get_mut(svg_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("SVG {svg_id}"))
        })?;
        if instance.svg.set_text(element_id, text) {
            self.dirty = true;
            Ok(())
        } else {
            Err(galfus_realm_core::RealmError::Internal(format!(
                "Element #{element_id} not found in SVG {svg_id}"
            )))
        }
    }

    /// Updates the spatial transform of an existing SVG entity.
    pub fn set_svg_transform(&mut self, svg_id: u32, transform: Transform2D) -> RealmResult<()> {
        let instance = self.svg_manager.get_mut(svg_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("SVG {svg_id}"))
        })?;
        instance.transform = transform;
        self.dirty = true;
        Ok(())
    }

    /// Reads the spatial transform of an existing SVG entity.
    pub fn get_svg_transform(&self, svg_id: u32) -> Option<Transform2D> {
        self.svg_manager.get(svg_id).map(|inst| inst.transform)
    }

    /// Destroys an existing SVG entity.
    pub fn destroy_svg(&mut self, svg_id: u32) -> RealmResult<()> {
        let _ = self.svg_manager.remove(svg_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("SVG {svg_id}"))
        })?;
        let mat_id = crate::svg_manager::svg_material_id(svg_id);
        self.material_bind_groups.remove(&mat_id);
        self.dirty = true;
        Ok(())
    }
}
