//! Entity management and scene configuration API for `Realm2DContext`.

use galfus_realm_2d_resources::camera::Camera2D;
use galfus_realm_2d_resources::light::Light2D;
use galfus_realm_2d_resources::material::Material2D;
use galfus_realm_2d_resources::particle::{ParticleEmitter2D, ParticleEmitterState2D};
use galfus_realm_2d_resources::shadow::Shadow2DConfig;
use galfus_realm_2d_resources::shape::Shape2D;
use galfus_realm_2d_resources::sprite::Sprite2D;
use galfus_realm_2d_resources::transform::Transform2D;
use galfus_realm_2d_resources::ui::Model2DUI;
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
        self.material_texture_slots.remove(&material_id);
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
        if let Some(spatial) = self.model_transforms.get_mut(&sprite_id) {
            *spatial = transform;
        }
        self.shadow_manager.mark_dirty();
        self.dirty = true;
        Ok(())
    }

    pub fn set_sprite_transform(&mut self, sprite_id: u32, transform: Transform2D) {
        if let Some((_, t)) = self.sprites.get_mut(&sprite_id) {
            *t = transform;
            if let Some(spatial) = self.model_transforms.get_mut(&sprite_id) {
                *spatial = transform;
            }
            self.sync_physics_transform_2d(sprite_id, transform);
            self.shadow_manager.mark_dirty();
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
        if let Some(spatial) = self.model_transforms.get_mut(&shape_id) {
            *spatial = transform;
        }
        self.shadow_manager.mark_dirty();
        self.dirty = true;
        Ok(())
    }

    pub fn set_shape_transform(&mut self, shape_id: u32, transform: Transform2D) {
        if let Some((_, t)) = self.shapes.get_mut(&shape_id) {
            *t = transform;
            if let Some(spatial) = self.model_transforms.get_mut(&shape_id) {
                *spatial = transform;
            }
            self.sync_physics_transform_2d(shape_id, transform);
            self.shadow_manager.mark_dirty();
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

    /// Destroys a 2D particle emitter entity by its host logical ID.
    pub fn destroy_particle_emitter(&mut self, emitter_id: u32) -> RealmResult<()> {
        self.emitters
            .remove(&emitter_id)
            .map(|_| {
                self.dirty = true;
            })
            .ok_or_else(|| {
                galfus_realm_core::RealmError::ResourceNotFound(
                    self.id,
                    format!("ParticleEmitter {emitter_id}"),
                )
            })
    }

    /// Backwards-compatible alias for `destroy_particle_emitter`.
    #[inline]
    pub fn remove_particle_emitter(&mut self, emitter_id: u32) {
        let _ = self.destroy_particle_emitter(emitter_id);
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
        self.material_texture_slots.remove(&material_id);
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
        self.sprites.remove(&sprite_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("Sprite {sprite_id}"))
        })?;
        self.remove_orphaned_model_colliders_2d(sprite_id);
        self.shadow_manager.mark_dirty();
        self.dirty = true;
        Ok(())
    }

    /// Destroys a shape entity by its host logical ID.
    pub fn destroy_shape(&mut self, shape_id: u32) -> RealmResult<()> {
        self.shapes.remove(&shape_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("Shape {shape_id}"))
        })?;
        self.remove_orphaned_model_colliders_2d(shape_id);
        self.shadow_manager.mark_dirty();
        self.dirty = true;
        Ok(())
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

    /// Registers raw TTF/OTF font binary data from memory (zero filesystem access).
    ///
    /// Returns the detected font family name on success.
    pub fn load_font_data(&mut self, data: &[u8]) -> RealmResult<String> {
        let family = self.ui_fonts.load(data).map_err(|e| {
            galfus_realm_core::RealmError::Internal(format!("Font loading failed: {e}"))
        })?;
        self.invalidate_ui_fonts();
        Ok(family)
    }

    /// Atomically registers the faces in a named font group.
    pub fn register_font_group(&mut self, name: &str, files: &[&[u8]]) -> RealmResult<()> {
        self.ui_fonts.register_group(name, files).map_err(|error| {
            galfus_realm_core::RealmError::Internal(format!(
                "Font group registration failed: {error}"
            ))
        })?;
        self.invalidate_ui_fonts();
        Ok(())
    }

    /// Replaces an ordered font family configuration for this realm.
    pub fn set_font_family(&mut self, name: &str, family: crate::UiFontFamily) -> RealmResult<()> {
        self.ui_fonts.set_family(name, family).map_err(|error| {
            galfus_realm_core::RealmError::Internal(format!("Invalid font family: {error}"))
        })?;
        self.invalidate_ui_fonts();
        Ok(())
    }

    /// Looks up a configured font family by its realm-local label.
    pub fn font_family(&self, name: &str) -> Option<&crate::UiFontFamily> {
        self.ui_fonts.family(name)
    }

    /// Removes a family only when no UI node refers to it.
    pub fn remove_font_family(&mut self, name: &str) -> RealmResult<()> {
        use galfus_realm_2d_resources::ui::UiNodeKind;
        let in_use = self.uis.values().any(|(ui, _)| {
            ui.nodes.values().any(|node| match &node.kind {
                UiNodeKind::Text(text) => text.font_family.as_deref() == Some(name),
                UiNodeKind::RichText(text) => text.font_family.as_deref() == Some(name),
                _ => false,
            })
        });
        if in_use {
            return Err(galfus_realm_core::RealmError::Internal(format!(
                "Font family is used by a UI node: {name}"
            )));
        }
        self.ui_fonts
            .remove_family(name)
            .map_err(galfus_realm_core::RealmError::Internal)?;
        self.invalidate_ui_fonts();
        Ok(())
    }

    /// Removes an unreferenced group and releases its font faces.
    pub fn remove_font_group(&mut self, name: &str) -> RealmResult<()> {
        self.ui_fonts
            .remove_group(name)
            .map_err(galfus_realm_core::RealmError::Internal)?;
        self.invalidate_ui_fonts();
        Ok(())
    }

    /// Resolves one matching face from each group in the configured order.
    pub fn font_family_faces(
        &self,
        name: &str,
        weight: u16,
        italic: bool,
    ) -> RealmResult<Vec<fontdb::ID>> {
        self.ui_fonts
            .family_faces(name, weight, italic)
            .map_err(|error| {
                galfus_realm_core::RealmError::Internal(format!("Font selection failed: {error}"))
            })
    }

    /// Resolves family and element variation settings for a face in the family.
    pub fn font_face_variations(
        &self,
        family: &str,
        face: fontdb::ID,
        element_axes: &std::collections::BTreeMap<String, f32>,
        weight: u16,
        italic: bool,
    ) -> RealmResult<Vec<crate::UiFontAxis>> {
        self.ui_fonts
            .face_variations(family, face, element_axes, weight, italic)
            .map_err(|error| {
                galfus_realm_core::RealmError::Internal(format!(
                    "Font variation resolution failed: {error}"
                ))
            })
    }

    fn invalidate_ui_fonts(&mut self) {
        // Font selection can change intrinsic text sizes even when no UI node changed.
        for (ui, _) in self.uis.values_mut() {
            for (&id, node) in &ui.nodes {
                if matches!(
                    node.kind,
                    galfus_realm_2d_resources::ui::UiNodeKind::Text(_)
                        | galfus_realm_2d_resources::ui::UiNodeKind::RichText(_)
                ) {
                    ui.dirty_flags.entry(id).or_default().insert(
                        galfus_realm_2d_resources::ui::UiDirtyFlags::TEXT_MEASURE
                            | galfus_realm_2d_resources::ui::UiDirtyFlags::LAYOUT,
                    );
                }
            }
        }
        self.shadow_manager.mark_dirty();
        self.dirty = true;
    }

    fn validate_ui_font_families(&self, ui: &Model2DUI) -> RealmResult<()> {
        use galfus_realm_2d_resources::ui::UiNodeKind;
        for node in ui.nodes.values() {
            let (family, axes) = match &node.kind {
                UiNodeKind::Text(text) => (text.font_family.as_deref(), &text.font_axes),
                UiNodeKind::RichText(text) => (text.font_family.as_deref(), &text.font_axes),
                _ => continue,
            };
            crate::ui_variations::validate_axes(axes).map_err(|error| {
                galfus_realm_core::RealmError::Internal(format!("Invalid font axes: {error}"))
            })?;
            if let Some(name) = family
                && self.ui_fonts.family(name).is_none()
            {
                return Err(galfus_realm_core::RealmError::Internal(format!(
                    "Unknown font family: {name}"
                )));
            }
        }
        Ok(())
    }

    /// Creates or updates a 2D UI model with initial quads, text batches, and world transform.
    pub fn create_ui(
        &mut self,
        ui_id: u32,
        ui: Model2DUI,
        transform: Transform2D,
    ) -> RealmResult<()> {
        self.validate_id(ui_id)?;
        ui.validate_tree().map_err(|error| {
            galfus_realm_core::RealmError::Internal(format!("Invalid Model2DUI {ui_id}: {error}"))
        })?;
        self.validate_ui_font_families(&ui)?;
        self.uis.insert(ui_id, (ui, transform));
        if let Some(spatial) = self.model_transforms.get_mut(&ui_id) {
            *spatial = transform;
        }
        self.dirty = true;
        Ok(())
    }

    /// Updates the visual content (quads and text batches) of an existing 2D UI model.
    pub fn set_ui_content(&mut self, ui_id: u32, ui: Model2DUI) -> RealmResult<()> {
        self.validate_id(ui_id)?;
        ui.validate_tree().map_err(|error| {
            galfus_realm_core::RealmError::Internal(format!("Invalid Model2DUI {ui_id}: {error}"))
        })?;
        self.validate_ui_font_families(&ui)?;
        let entry = self.uis.get_mut(&ui_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("Model2DUI {ui_id}"))
        })?;
        entry.0 = ui;
        self.dirty = true;
        Ok(())
    }

    /// Applies a validated batch of UI tree mutations without replacing the model.
    pub fn apply_ui_commands(
        &mut self,
        ui_id: u32,
        commands: &[galfus_realm_2d_resources::ui::UiCommand],
    ) -> RealmResult<()> {
        self.validate_id(ui_id)?;
        let (ui, _) = self.uis.get(&ui_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("Model2DUI {ui_id}"))
        })?;
        let mut candidate = ui.clone();
        candidate.apply_commands(commands).map_err(|error| {
            galfus_realm_core::RealmError::Internal(format!("Invalid Model2DUI {ui_id}: {error}"))
        })?;
        self.validate_ui_font_families(&candidate)?;
        self.uis.get_mut(&ui_id).expect("validated UI exists").0 = candidate;
        self.dirty = true;
        Ok(())
    }

    /// Updates the spatial transform of an existing 2D UI model.
    pub fn set_ui_transform(&mut self, ui_id: u32, transform: Transform2D) -> RealmResult<()> {
        self.validate_id(ui_id)?;
        let entry = self.uis.get_mut(&ui_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("Model2DUI {ui_id}"))
        })?;
        entry.1 = transform;
        if let Some(spatial) = self.model_transforms.get_mut(&ui_id) {
            *spatial = transform;
        }
        self.dirty = true;
        Ok(())
    }

    /// Reads the spatial transform of an existing 2D UI model.
    pub fn get_ui_transform(&self, ui_id: u32) -> Option<Transform2D> {
        self.uis.get(&ui_id).map(|(_, tf)| *tf)
    }

    /// Destroys an existing 2D UI model and cleans up any attached colliders.
    pub fn destroy_ui(&mut self, ui_id: u32) -> RealmResult<()> {
        self.validate_id(ui_id)?;
        self.uis.remove(&ui_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("Model2DUI {ui_id}"))
        })?;
        self.ui_manager.on_ui_removed(ui_id);
        self.remove_orphaned_model_colliders_2d(ui_id);
        self.dirty = true;
        Ok(())
    }
}
