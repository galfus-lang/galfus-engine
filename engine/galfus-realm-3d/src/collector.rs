use std::collections::BTreeMap;

use galfus_realm_3d_resources::frustum::Frustum;
use galfus_realm_3d_resources::geometry::Geometry3D;
use galfus_realm_3d_resources::material::{Material3D, SurfaceType3D};
use glam::Vec3;

use crate::types::{GpuMeshBuffers, GpuModelEntry};

/// A collected and culled draw item ready for pass submission.
#[derive(Clone, Copy)]
pub struct CollectedDrawItem<'a> {
    pub model_id: u32,
    pub geometry_id: u32,
    pub material_id: u32,
    pub depth: f32,
    pub surface_type: SurfaceType3D,
    pub model_bg: &'a wgpu::BindGroup,
    pub material_bg: &'a wgpu::BindGroup,
    pub vertex_buffer: &'a wgpu::Buffer,
    pub index_buffer: &'a wgpu::Buffer,
    pub index_count: u32,
    pub shader_effect: Option<&'a str>,
}

/// Collector holding draw calls segregated by surface pass type and sorted by camera depth.
#[derive(Default)]
pub struct DrawCollector<'a> {
    /// Opaque solid geometry sorted front-to-back for early-Z depth rejection.
    pub opaque: Vec<CollectedDrawItem<'a>>,
    /// Alpha-tested masked geometry sorted front-to-back.
    pub masked: Vec<CollectedDrawItem<'a>>,
    /// Alpha-blended semi-transparent geometry sorted back-to-front for correct alpha blending.
    pub transparent: Vec<CollectedDrawItem<'a>>,
    /// Number of models discarded during camera frustum culling.
    pub culled_count: usize,
}

impl<'a> DrawCollector<'a> {
    /// Collects visible models, tests against the camera Frustum, and segregates into sorted pass buckets.
    pub fn collect(
        models: &'a BTreeMap<u32, GpuModelEntry>,
        geometries: &'a BTreeMap<u32, (Geometry3D, Option<GpuMeshBuffers>)>,
        materials: &'a BTreeMap<u32, (Material3D, Option<wgpu::Buffer>, Option<wgpu::BindGroup>)>,
        frustum: Option<&Frustum>,
        camera_pos: Vec3,
    ) -> Self {
        let mut collector = Self::default();

        for (&model_id, (model, model_transform, _, model_bg_opt)) in models {
            if !model.active {
                continue;
            }

            let Some(model_bg) = model_bg_opt.as_ref() else {
                continue;
            };

            let Some((geom, Some((v_buf, i_buf, index_count)))) =
                geometries.get(&model.geometry_id)
            else {
                continue;
            };

            // Frustum Culling
            let world_aabb = geom.aabb.transform(&model_transform.matrix());
            if let Some(f) = frustum
                && !f.intersects_aabb(world_aabb.min, world_aabb.max)
            {
                collector.culled_count += 1;
                continue;
            }

            let mat_entry = materials.get(&model.material_id);
            let Some(material_bg) = mat_entry.and_then(|m| m.2.as_ref()) else {
                continue;
            };

            let surface_type = mat_entry
                .map(|m| m.0.surface_type)
                .unwrap_or(SurfaceType3D::Opaque);

            let shader_effect = mat_entry.and_then(|m| m.0.shader_effect.as_deref());

            // Euclidean distance squared from camera to model center
            let depth = (model_transform.position - camera_pos).length_squared();

            let item = CollectedDrawItem {
                model_id,
                geometry_id: model.geometry_id,
                material_id: model.material_id,
                depth,
                surface_type,
                model_bg,
                material_bg,
                vertex_buffer: v_buf,
                index_buffer: i_buf,
                index_count: *index_count,
                shader_effect,
            };

            match surface_type {
                SurfaceType3D::Opaque => collector.opaque.push(item),
                SurfaceType3D::Masked => collector.masked.push(item),
                SurfaceType3D::Transparent => collector.transparent.push(item),
            }
        }

        // Group opaque & masked by material and geometry to maximize GPU cache & state reuse
        collector.opaque.sort_by(|a, b| {
            (a.material_id, a.geometry_id)
                .cmp(&(b.material_id, b.geometry_id))
                .then_with(|| {
                    a.depth
                        .partial_cmp(&b.depth)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
        });
        collector.masked.sort_by(|a, b| {
            (a.material_id, a.geometry_id)
                .cmp(&(b.material_id, b.geometry_id))
                .then_with(|| {
                    a.depth
                        .partial_cmp(&b.depth)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
        });

        // Sort transparent strictly back-to-front (decreasing depth) for correct alpha blending
        collector.transparent.sort_by(|a, b| {
            b.depth
                .partial_cmp(&a.depth)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        collector
    }
}
