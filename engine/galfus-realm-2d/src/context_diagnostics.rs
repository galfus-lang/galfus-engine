//! Diagnostic report builder for [`Realm2DContext`].

use galfus_core::diagnostics::{DriftWarning, MemoryCategoryStats, RealmDiagnosticReport};
use serde_json::json;

use crate::context::Realm2DContext;

pub(crate) fn solve_dirty_ui_layouts(
    uis: &mut std::collections::HashMap<
        u32,
        (
            galfus_realm_2d_resources::ui::Model2DUI,
            galfus_realm_2d_resources::transform::Transform2D,
        ),
    >,
    ui_fonts: &crate::ui_fonts::UiFontLibrary,
) {
    for (ui, _) in uis.values_mut() {
        let layout_flags = galfus_realm_2d_resources::ui::UiDirtyFlags::LAYOUT
            | galfus_realm_2d_resources::ui::UiDirtyFlags::TEXT_MEASURE
            | galfus_realm_2d_resources::ui::UiDirtyFlags::HIERARCHY
            | galfus_realm_2d_resources::ui::UiDirtyFlags::CLIP_TRANSFORM;
        if ui.root_id.is_some()
            && (ui.computed.is_empty() || ui.dirty_flags.values().any(|f| f.0 & layout_flags != 0))
        {
            let (w, h) = crate::context_ui::compute_ui_dimensions(ui);
            crate::ui_layout::solve_ui_layout(ui, ui_fonts, &ui_fonts.default_family, w, h);
        }
    }
}

impl Realm2DContext {
    pub(crate) fn build_diagnostic_report(&self) -> RealmDiagnosticReport {
        let mut categories = Vec::new();
        let mut drift_warnings = Vec::new();

        // 1. GPU buffers owned directly by Realm2DContext
        let (instance_buf_bytes, light_buf_bytes, shadow_buf_bytes, core_gpu_buf_bytes) =
            if let Some(gpu) = &self.gpu_res {
                let ib = gpu.instance_buffer.size();
                let lb = gpu.light_buffer.size();
                let sb = gpu.shadow_sample_buffer.size();
                let other = gpu.quad_vertex_buffer.size()
                    + gpu.quad_index_buffer.size()
                    + gpu.camera_buffer.size()
                    + gpu.fallback_material_buffer.size();
                (ib, lb, sb, ib + lb + sb + other)
            } else {
                (0, 0, 0, 0)
            };
        let material_uniform_bytes: u64 = self
            .material_uniform_buffers
            .values()
            .map(wgpu::Buffer::size)
            .sum();
        let total_2d_gpu_buffers = core_gpu_buf_bytes.saturating_add(material_uniform_bytes);
        categories.push(MemoryCategoryStats::new(
            format!("realm2d.{}.gpu_buffers", self.id),
            "realm2d",
            0,
            total_2d_gpu_buffers,
            total_2d_gpu_buffers,
            self.material_uniform_buffers.len() + usize::from(self.gpu_res.is_some()),
        ));

        // 2. UI geometry & textured materials
        let (
            ui_node_geometries,
            ui_text_geometries,
            ui_textured_materials,
            ui_next_mat_id,
            ui_geom_gpu_bytes,
            ui_geom_pool_active,
        ) = self.ui_manager.diagnostic_counts();
        let ui_cpu_est = ((ui_node_geometries + ui_text_geometries) * 128) as u64;
        categories.push(MemoryCategoryStats::new(
            format!("realm2d.{}.ui_geometry", self.id),
            "realm2d.ui",
            ui_cpu_est,
            ui_geom_gpu_bytes,
            ui_cpu_est.saturating_add(ui_geom_gpu_bytes),
            ui_geom_pool_active,
        ));

        // 3. UI font library & color glyph cache
        let (
            font_groups,
            font_families,
            font_db_faces,
            color_glyph_entries,
            color_glyph_bytes,
            color_glyph_hits,
        ) = self.ui_fonts.diagnostic_counts();
        categories.push(MemoryCategoryStats::new(
            format!("realm2d.{}.fonts_cache", self.id),
            "realm2d.ui",
            color_glyph_bytes as u64,
            0,
            color_glyph_bytes as u64,
            color_glyph_entries,
        ));

        // 4. Scene CPU tables
        let active_particles: usize = self
            .emitters
            .values()
            .map(|(_, _, state)| state.particles.len())
            .sum();
        let ui_total_nodes: usize = self.uis.values().map(|(ui, _)| ui.nodes.len()).sum();
        let scene_cpu_bytes = (self.sprites.capacity() * 192
            + self.shapes.capacity() * 192
            + self.materials.capacity() * 160
            + self.lights.capacity() * 96
            + self.emitters.capacity() * 256
            + active_particles * 64
            + self.uis.capacity() * 256
            + ui_total_nodes * 256
            + self.colliders.capacity() * 96
            + self.model_transforms.capacity() * 48) as u64;
        let scene_items = self.sprites.len()
            + self.shapes.len()
            + self.materials.len()
            + self.lights.len()
            + self.emitters.len()
            + self.uis.len()
            + self.colliders.len();
        categories.push(MemoryCategoryStats::new(
            format!("realm2d.{}.scene_cpu", self.id),
            "realm2d",
            scene_cpu_bytes,
            0,
            scene_cpu_bytes,
            scene_items,
        ));

        // 5. Hierarchy & Physics
        let hierarchy_stats = self.hierarchy.diagnostic_stats();
        categories.push(hierarchy_stats.memory_category(&format!("realm2d.{}.hierarchy", self.id)));

        let physics_stats = self.physics.as_ref().map(|p| p.diagnostic_stats());
        if let Some(ref ps) = physics_stats {
            let cat = format!("realm2d.{}.physics", self.id);
            categories.push(ps.memory_category(&cat));
            drift_warnings.extend(ps.drift_warnings(&cat));
        }

        // 6. Drift warnings specific to Realm2D
        let max_expected_transforms = self.sprites.len() + self.shapes.len() + self.uis.len();
        if self.model_transforms.len() > max_expected_transforms {
            let delta = self.model_transforms.len() as i64 - max_expected_transforms as i64;
            drift_warnings.push(DriftWarning {
                category: format!("realm2d.{}", self.id),
                metric: "modelTransformsLen".to_string(),
                expected: max_expected_transforms as u64,
                actual: self.model_transforms.len() as u64,
                delta,
                message: format!(
                    "model_transforms has {delta} orphaned entries beyond active sprites/shapes/uis"
                ),
            });
        }
        let expected_bgs = self.materials.len() + ui_textured_materials;
        if self.material_bind_groups.len() > expected_bgs {
            let delta = self.material_bind_groups.len() as i64 - expected_bgs as i64;
            drift_warnings.push(DriftWarning {
                category: format!("realm2d.{}", self.id),
                metric: "materialBindGroupsLen".to_string(),
                expected: expected_bgs as u64,
                actual: self.material_bind_groups.len() as u64,
                delta,
                message: format!(
                    "material_bind_groups has {delta} extra entries beyond active materials + UI textured materials"
                ),
            });
        }

        let (pipelines_len, custom_shaders_len) = self
            .pipeline_manager
            .as_ref()
            .map(|pm| pm.diagnostic_counts())
            .unwrap_or((0, 0));

        RealmDiagnosticReport {
            realm_kind: "realm2d",
            memory_categories: categories,
            drift_warnings,
            details: json!({
                "id": self.id,
                "cameras": self.cameras.len(),
                "sprites": self.sprites.len(),
                "shapes": self.shapes.len(),
                "materials": self.materials.len(),
                "lights": self.lights.len(),
                "emitters": self.emitters.len(),
                "activeParticles": active_particles,
                "uis": self.uis.len(),
                "uiTotalNodes": ui_total_nodes,
                "colliders": self.colliders.len(),
                "modelTransforms": self.model_transforms.len(),
                "materialBindGroups": self.material_bind_groups.len(),
                "materialUniformBuffers": self.material_uniform_buffers.len(),
                "pipelines": pipelines_len,
                "customShaders": custom_shaders_len,
                "gpuBuffers": {
                    "instanceBytes": instance_buf_bytes,
                    "lightBytes": light_buf_bytes,
                    "shadowBytes": shadow_buf_bytes,
                    "materialUniformBytes": material_uniform_bytes,
                },
                "ui": {
                    "nodeGeometries": ui_node_geometries,
                    "textGeometries": ui_text_geometries,
                    "texturedMaterials": ui_textured_materials,
                    "nextMatId": ui_next_mat_id,
                    "geometryPoolActive": ui_geom_pool_active,
                    "geometryGpuBytes": ui_geom_gpu_bytes,
                },
                "fonts": {
                    "groups": font_groups,
                    "families": font_families,
                    "databaseFaces": font_db_faces,
                    "colorGlyphEntries": color_glyph_entries,
                    "colorGlyphBytes": color_glyph_bytes,
                    "colorGlyphHits": color_glyph_hits,
                },
                "hierarchy": hierarchy_stats,
                "physics": physics_stats,
            }),
        }
    }
}
