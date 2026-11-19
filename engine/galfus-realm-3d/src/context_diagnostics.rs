//! Diagnostic report builder for [`Realm3DContext`].

use galfus_core::diagnostics::{DriftWarning, MemoryCategoryStats, RealmDiagnosticReport};
use serde_json::json;

use crate::context::Realm3DContext;
use crate::shadow::MAX_SHADOW_LIGHTS;

impl Realm3DContext {
    pub(crate) fn build_diagnostic_report(&self) -> RealmDiagnosticReport {
        let mut categories = Vec::new();
        let mut drift_warnings = Vec::new();

        // 1. Geometries: CPU RAM vs GPU VRAM
        let mut geom_cpu_bytes = 0u64;
        let mut geom_gpu_bytes = 0u64;
        for (geom, gpu_opt) in self.geometries.values() {
            let verts_bytes = (geom.vertices.capacity()
                * std::mem::size_of::<galfus_realm_3d_resources::vertex::Vertex3D>())
                as u64;
            let idx_bytes = (geom.indices.capacity() * std::mem::size_of::<u32>()) as u64;
            let morph_bytes: u64 = geom
                .morph_targets
                .iter()
                .map(|t| {
                    (t.deltas.capacity()
                        * std::mem::size_of::<galfus_realm_3d_resources::geometry::MorphVertex3D>())
                        as u64
                })
                .sum();
            geom_cpu_bytes = geom_cpu_bytes
                .saturating_add(verts_bytes)
                .saturating_add(idx_bytes)
                .saturating_add(morph_bytes);

            if let Some(gpu) = gpu_opt {
                geom_gpu_bytes = geom_gpu_bytes
                    .saturating_add(gpu.vertices.size())
                    .saturating_add(gpu.indices.size())
                    .saturating_add(gpu.morph_targets.as_ref().map_or(0, wgpu::Buffer::size));
            }
        }
        categories.push(MemoryCategoryStats::new(
            format!("realm3d.{}.geometries_cpu", self.id),
            "realm3d",
            geom_cpu_bytes,
            0,
            geom_cpu_bytes,
            self.geometries.len(),
        ));
        categories.push(MemoryCategoryStats::new(
            format!("realm3d.{}.geometries_gpu", self.id),
            "realm3d",
            0,
            geom_gpu_bytes,
            geom_gpu_bytes,
            self.geometries.len(),
        ));

        // 2. Shadow map (2048x2048x16 Depth32Float = 256 MiB when allocated)
        let shadow_map_bytes: u64 = if self.shadow_map.is_some() {
            2048u64 * 2048u64 * u64::from(MAX_SHADOW_LIGHTS) * 4
        } else {
            0
        };
        categories.push(MemoryCategoryStats::new(
            format!("realm3d.{}.shadow_map", self.id),
            "realm3d",
            0,
            shadow_map_bytes,
            shadow_map_bytes,
            usize::from(self.shadow_map.is_some()),
        ));

        // 3. Offscreen targets (depth, portals, refraction, outline, ssao, bloom)
        let depth_bytes = self
            .depth_texture
            .as_ref()
            .map_or(0, |(_, _, sz)| u64::from(sz.x) * u64::from(sz.y) * 4);
        let portals_bytes: u64 = self
            .portal_pipelines
            .values()
            .map(|p| u64::from(p.width) * u64::from(p.height) * 8) // color + depth
            .sum();
        let refraction_bytes = self
            .refraction_pipeline
            .as_ref()
            .map_or(0, |r| r.estimated_vram_bytes());
        let outline_bytes = self
            .post_pipelines
            .outline
            .as_ref()
            .map_or(0, |o| o.estimated_vram_bytes());
        let ssao_bytes = self
            .post_pipelines
            .ssao
            .as_ref()
            .map_or(0, |s| u64::from(s.size.0) * u64::from(s.size.1) * 8); // 2 full-res Rgba8
        let bloom_bytes = self
            .post_pipelines
            .bloom
            .as_ref()
            .map_or(0, |b| b.estimated_vram_bytes());
        let total_offscreen_bytes = depth_bytes
            .saturating_add(portals_bytes)
            .saturating_add(refraction_bytes)
            .saturating_add(outline_bytes)
            .saturating_add(ssao_bytes)
            .saturating_add(bloom_bytes);
        let offscreen_count = usize::from(self.depth_texture.is_some())
            + self.portal_pipelines.len()
            + usize::from(self.refraction_pipeline.is_some())
            + usize::from(self.post_pipelines.outline.is_some())
            + usize::from(self.post_pipelines.ssao.is_some())
            + usize::from(self.post_pipelines.bloom.is_some());
        categories.push(MemoryCategoryStats::new(
            format!("realm3d.{}.offscreen_targets", self.id),
            "realm3d",
            0,
            total_offscreen_bytes,
            total_offscreen_bytes,
            offscreen_count,
        ));

        // 4. Scene, material & model GPU uniform/storage buffers
        let scene_gpu_bytes = self.scene_buffers.as_ref().map_or(0, |sb| {
            sb.camera_buf.size()
                + sb.env_buf.size()
                + sb.lights_buf.size()
                + sb._lights_header_buf.size()
                + sb._bones_buf.size()
        });
        let material_gpu_bytes: u64 = self
            .materials
            .values()
            .filter_map(|(_, buf, _)| buf.as_ref())
            .map(wgpu::Buffer::size)
            .sum();
        let model_gpu_bytes: u64 = self
            .models
            .values()
            .map(|(_, _, _, u, m, _)| {
                u.as_ref().map_or(0, wgpu::Buffer::size) + m.as_ref().map_or(0, wgpu::Buffer::size)
            })
            .sum();
        let instanced_gpu_bytes: u64 = self
            .instanced_models
            .values()
            .map(|(_, _, inst, u, m, _)| {
                inst.as_ref().map_or(0, wgpu::Buffer::size)
                    + u.as_ref().map_or(0, wgpu::Buffer::size)
                    + m.as_ref().map_or(0, wgpu::Buffer::size)
            })
            .sum();
        let total_buffers_gpu = scene_gpu_bytes
            .saturating_add(material_gpu_bytes)
            .saturating_add(model_gpu_bytes)
            .saturating_add(instanced_gpu_bytes);
        categories.push(MemoryCategoryStats::new(
            format!("realm3d.{}.scene_buffers", self.id),
            "realm3d",
            0,
            total_buffers_gpu,
            total_buffers_gpu,
            self.materials.len() + self.models.len() + self.instanced_models.len(),
        ));

        // 5. Scene CPU tables (models, instances, bones, particles, colliders)
        let total_instances: usize = self
            .instanced_models
            .values()
            .map(|(_, v, _, _, _, _)| v.len())
            .sum();
        let active_particles: usize = self
            .emitters
            .values()
            .map(|(_, _, st)| st.particles.len())
            .sum();
        let scene_cpu_bytes = (self.models.len() * 256
            + total_instances
                * std::mem::size_of::<galfus_realm_3d_resources::model::InstanceData3D>()
            + self.bones.capacity() * std::mem::size_of::<glam::Mat4>()
            + self.particle_alpha_instances.capacity() * 64
            + self.particle_additive_instances.capacity() * 64
            + self.colliders.len() * 128
            + self.model_transforms.len() * 64) as u64;
        categories.push(MemoryCategoryStats::new(
            format!("realm3d.{}.scene_cpu", self.id),
            "realm3d",
            scene_cpu_bytes,
            0,
            scene_cpu_bytes,
            self.models.len()
                + self.instanced_models.len()
                + self.lights.len()
                + self.colliders.len(),
        ));

        // 6. Hierarchy & Physics
        let hierarchy_stats = self.hierarchy.diagnostic_stats();
        categories.push(hierarchy_stats.memory_category(&format!("realm3d.{}.hierarchy", self.id)));

        let physics_stats = self.physics.as_ref().map(|p| p.diagnostic_stats());
        if let Some(ref ps) = physics_stats {
            let cat = format!("realm3d.{}.physics", self.id);
            categories.push(ps.memory_category(&cat));
            drift_warnings.extend(ps.drift_warnings(&cat));
        }

        // 7. Drift warnings
        let max_expected_transforms = self.models.len()
            + self.instanced_models.len()
            + self.cameras.len()
            + self.lights.len()
            + self.emitters.len();
        if self.model_transforms.len() > max_expected_transforms {
            let delta = self.model_transforms.len() as i64 - max_expected_transforms as i64;
            drift_warnings.push(DriftWarning {
                category: format!("realm3d.{}", self.id),
                metric: "modelTransformsLen".to_string(),
                expected: max_expected_transforms as u64,
                actual: self.model_transforms.len() as u64,
                delta,
                message: format!(
                    "model_transforms has {delta} orphaned entries beyond active models/instanced_models"
                ),
            });
        }

        let (standard_pipelines, custom_pipelines) = self
            .pipeline
            .as_ref()
            .map(|p| p.diagnostic_counts())
            .unwrap_or((0, 0));

        RealmDiagnosticReport {
            realm_kind: "realm3d",
            memory_categories: categories,
            drift_warnings,
            details: json!({
                "id": self.id,
                "cameras": self.cameras.len(),
                "materials": self.materials.len(),
                "geometries": self.geometries.len(),
                "geometriesCpuBytes": geom_cpu_bytes,
                "geometriesGpuBytes": geom_gpu_bytes,
                "models": self.models.len(),
                "instancedModels": self.instanced_models.len(),
                "totalInstances": total_instances,
                "lights": self.lights.len(),
                "emitters": self.emitters.len(),
                "activeParticles": active_particles,
                "portals": self.portals.len(),
                "portalPipelines": self.portal_pipelines.len(),
                "colliders": self.colliders.len(),
                "modelTransforms": self.model_transforms.len(),
                "bones": self.bones.len(),
                "pipelines": {
                    "standard": standard_pipelines,
                    "custom": custom_pipelines,
                },
                "offscreenBytes": {
                    "shadowMap": shadow_map_bytes,
                    "depth": depth_bytes,
                    "portals": portals_bytes,
                    "refraction": refraction_bytes,
                    "outline": outline_bytes,
                    "ssao": ssao_bytes,
                    "bloom": bloom_bytes,
                },
                "hierarchy": hierarchy_stats,
                "physics": physics_stats,
            }),
        }
    }
}
