//! Texture enumeration and presented interaction snapshots for 2D models.

use crate::context::Realm2DContext;
use galfus_realm_core::Realm;

impl Realm2DContext {
    pub(crate) fn collect_referenced_texture_ids(&self) -> Vec<u32> {
        let mut ids = Vec::new();
        for mat in self.materials.values() {
            for slot in mat.resolved_texture_slots() {
                if let Some(id) = slot
                    && id != 0
                {
                    ids.push(id);
                }
            }
        }
        for (ui, _) in self.uis.values() {
            for q in &ui.quads {
                if let Some(id) = q.texture_id
                    && !ids.contains(&id)
                {
                    ids.push(id);
                }
            }
            for n in ui.nodes.values() {
                if let galfus_realm_2d_resources::ui::UiNodeKind::SpritePanel(ref s) = n.kind
                    && let Some(id) = s.texture_id
                    && !ids.contains(&id)
                {
                    ids.push(id);
                }
            }
        }
        ids
    }

    pub(crate) fn new_interaction_snapshot(id: u32) -> Self {
        Self {
            id,
            cameras: std::collections::BTreeMap::new(),
            sprites: std::collections::HashMap::new(),
            shapes: std::collections::HashMap::new(),
            materials: std::collections::HashMap::new(),
            lights: std::collections::HashMap::new(),
            emitters: std::collections::HashMap::new(),
            ui_manager: crate::context_ui::UiManager2D::new(),
            ui_fonts: crate::ui_fonts::UiFontLibrary::empty(),
            uis: std::collections::HashMap::new(),
            colliders: std::collections::HashMap::new(),
            model_transforms: std::collections::HashMap::new(),
            hierarchy: galfus_realm_core::hierarchy::HierarchyGraph2D::new(),
            physics: None,
            dirty: false,
            pipeline_manager: None,
            batch_builder: crate::batch::BatchBuilder2D::new(),
            shadow_manager: crate::shadow::ShadowManager2D::default(),
            shadow_data: crate::context_shadows::ShadowFrameData::default(),
            gpu_res: None,
            total_time: 0.0,
            material_bind_groups: std::collections::HashMap::new(),
            material_uniform_buffers: std::collections::HashMap::new(),
            material_texture_slots: std::collections::HashMap::new(),
            material_effect_ids: std::collections::HashMap::new(),
        }
    }

    pub(crate) fn build_interaction_snapshot(&self) -> Option<Box<dyn Realm>> {
        let mut snapshot = Self::new_interaction_snapshot(self.id);
        snapshot.cameras = self.cameras.clone();
        snapshot.colliders = self.colliders.clone();
        for collider in self.colliders.values() {
            if let Some((ui, tf)) = self.uis.get(&collider.model_id) {
                let mut ui_copy = ui.clone();
                ui_copy.damage_regions.clear();
                snapshot.uis.insert(collider.model_id, (ui_copy, *tf));
            }
        }
        for collider in self.colliders.values() {
            let model_id = collider.model_id;
            if let Some(mut transform) = self.model_transform_for_collider(model_id) {
                transform.draw_order = self
                    .sprites
                    .get(&model_id)
                    .and_then(|(sprite, _)| sprite.draw_order)
                    .or_else(|| {
                        self.shapes
                            .get(&model_id)
                            .and_then(|(shape, _)| shape.draw_order)
                    })
                    .unwrap_or(transform.draw_order);
                snapshot.model_transforms.insert(model_id, transform);
            }
        }
        Some(Box::new(snapshot))
    }
}
