use std::collections::BTreeMap;

use galfus_core::{CullingMode, distance_sq_in_range};
use galfus_realm_3d_resources::frustum::Frustum;
use galfus_realm_3d_resources::geometry::{Geometry3D, PrimitiveTopology3D};
use galfus_realm_3d_resources::material::{Material3D, MaterialSide3D, SurfaceType3D};
use glam::Vec3;

use crate::pipeline::SurfacePipelineState;
use crate::types::{GpuInstancedModelEntry, GpuMeshBuffers, GpuModelEntry};

/// A collected and culled draw item ready for pass submission.
#[derive(Clone, Copy)]
pub struct CollectedDrawItem<'a> {
    pub model_id: u32,
    pub geometry_id: u32,
    pub topology: PrimitiveTopology3D,
    pub material_id: u32,
    pub depth: f32,
    pub surface_type: SurfaceType3D,
    pub side: MaterialSide3D,
    pub is_occluder: bool,
    pub culling_mode: CullingMode,
    pub cull_margin: f32,
    pub world_aabb_min: Vec3,
    pub world_aabb_max: Vec3,
    pub model_bg: &'a wgpu::BindGroup,
    pub material_bg: &'a wgpu::BindGroup,
    pub vertex_buffer: &'a wgpu::Buffer,
    pub index_buffer: &'a wgpu::Buffer,
    pub index_count: u32,
    pub shader_effect: Option<&'a str>,
    pub instance_buffer: Option<&'a wgpu::Buffer>,
    pub instance_count: u32,
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
    /// Additive geometry sorted back-to-front and rendered after alpha blending.
    pub additive: Vec<CollectedDrawItem<'a>>,
    /// Screen-space refractive geometry sorted back-to-front.
    pub refractive: Vec<CollectedDrawItem<'a>>,
    /// Planar reflection mirrors and optical portals sorted front-to-back.
    pub mirrors: Vec<CollectedDrawItem<'a>>,
    /// Number of models discarded during camera frustum culling.
    pub culled_count: usize,
}

impl<'a> DrawCollector<'a> {
    /// Collects visible models, tests against the camera Frustum, and segregates into sorted pass buckets.
    pub fn collect(
        models: &'a BTreeMap<u32, GpuModelEntry>,
        instanced_models: &'a BTreeMap<u32, GpuInstancedModelEntry>,
        geometries: &'a BTreeMap<u32, (Geometry3D, Option<GpuMeshBuffers>)>,
        materials: &'a BTreeMap<u32, (Material3D, Option<wgpu::Buffer>, Option<wgpu::BindGroup>)>,
        frustum: Option<&Frustum>,
        camera_pos: Vec3,
        camera_layer_mask: u32,
    ) -> Self {
        let mut collector = Self::default();

        for (&model_id, (model, model_transform, local_aabb, _, _, model_bg_opt)) in models {
            if !model.active || (model.layer_mask & camera_layer_mask) == 0 {
                continue;
            }

            let Some(model_bg) = model_bg_opt.as_ref() else {
                continue;
            };

            let Some((geom, Some(mesh))) = geometries.get(&model.geometry_id) else {
                continue;
            };

            // Euclidean distance squared from camera to geometry AABB world center
            let world_center = model_transform
                .matrix()
                .transform_point3(geom.aabb.center());
            let depth = (world_center - camera_pos).length_squared();

            let world_aabb = local_aabb.transform(&model_transform.matrix());

            if model.culling_mode != CullingMode::AlwaysRender {
                // Distance / LOD band culling [start, end)
                if !distance_sq_in_range(depth, model.distance_range) {
                    collector.culled_count += 1;
                    continue;
                }
                // Frustum Culling with optional world-space margin
                if let Some(f) = frustum {
                    let pad = Vec3::splat(model.cull_margin.max(0.0));
                    if !f.intersects_aabb(world_aabb.min - pad, world_aabb.max + pad) {
                        collector.culled_count += 1;
                        continue;
                    }
                }
            }

            let mat_entry = materials.get(&model.material_id);
            let Some(material_bg) = mat_entry.and_then(|m| m.2.as_ref()) else {
                continue;
            };

            let surface_type = mat_entry
                .map(|m| m.0.surface_type)
                .unwrap_or(SurfaceType3D::Opaque);

            let shader_effect = mat_entry.and_then(|m| m.0.shader_effect.as_deref());
            let side = mat_entry.map_or_default(|m| m.0.side);

            let item = CollectedDrawItem {
                model_id,
                geometry_id: model.geometry_id,
                topology: geom.topology,
                material_id: model.material_id,
                depth,
                surface_type,
                side,
                is_occluder: model.is_occluder,
                culling_mode: model.culling_mode,
                cull_margin: model.cull_margin,
                world_aabb_min: world_aabb.min,
                world_aabb_max: world_aabb.max,
                model_bg,
                material_bg,
                vertex_buffer: &mesh.vertices,
                index_buffer: &mesh.indices,
                index_count: mesh.index_count,
                shader_effect,
                instance_buffer: None,
                instance_count: 1,
            };

            match surface_type {
                SurfaceType3D::Opaque => collector.opaque.push(item),
                SurfaceType3D::Masked => collector.masked.push(item),
                SurfaceType3D::Refractive => collector.refractive.push(item),
                SurfaceType3D::Mirror | SurfaceType3D::Portal => collector.mirrors.push(item),
                SurfaceType3D::Transparent => collector.transparent.push(item),
                SurfaceType3D::Additive => collector.additive.push(item),
            }
        }

        // Collect instanced models
        for (&inst_id, (inst_model, instances, inst_buf_opt, _, _, model_bg_opt)) in
            instanced_models
        {
            if !inst_model.active
                || instances.is_empty()
                || (inst_model.layer_mask & camera_layer_mask) == 0
            {
                continue;
            }

            let Some(model_bg) = model_bg_opt.as_ref() else {
                continue;
            };

            let Some(inst_buf) = inst_buf_opt.as_ref() else {
                continue;
            };

            let Some((geom, Some(mesh))) = geometries.get(&inst_model.geometry_id) else {
                continue;
            };

            let (batch_min, batch_max) = compute_instanced_batch_aabb(&geom.aabb, instances);
            let batch_center = (batch_min + batch_max) * 0.5;
            let depth = (batch_center - camera_pos).length_squared();

            if inst_model.culling_mode != CullingMode::AlwaysRender {
                if !distance_sq_in_range(depth, inst_model.distance_range) {
                    collector.culled_count += 1;
                    continue;
                }
                if let Some(f) = frustum {
                    let pad = Vec3::splat(inst_model.cull_margin.max(0.0));
                    if !f.intersects_aabb(batch_min - pad, batch_max + pad) {
                        collector.culled_count += 1;
                        continue;
                    }
                }
            }

            let mat_entry = materials.get(&inst_model.material_id);
            let Some(material_bg) = mat_entry.and_then(|m| m.2.as_ref()) else {
                continue;
            };

            let surface_type = mat_entry
                .map(|m| m.0.surface_type)
                .unwrap_or(SurfaceType3D::Opaque);

            let shader_effect = mat_entry.and_then(|m| m.0.shader_effect.as_deref());
            let side = mat_entry.map_or_default(|m| m.0.side);

            let item = CollectedDrawItem {
                model_id: inst_id,
                geometry_id: inst_model.geometry_id,
                topology: geom.topology,
                material_id: inst_model.material_id,
                depth,
                surface_type,
                side,
                is_occluder: inst_model.is_occluder,
                culling_mode: inst_model.culling_mode,
                cull_margin: inst_model.cull_margin,
                world_aabb_min: batch_min,
                world_aabb_max: batch_max,
                model_bg,
                material_bg,
                vertex_buffer: &mesh.vertices,
                index_buffer: &mesh.indices,
                index_count: mesh.index_count,
                shader_effect,
                instance_buffer: Some(inst_buf),
                instance_count: instances.len() as u32,
            };

            match surface_type {
                SurfaceType3D::Opaque => collector.opaque.push(item),
                SurfaceType3D::Masked => collector.masked.push(item),
                SurfaceType3D::Refractive => collector.refractive.push(item),
                SurfaceType3D::Mirror | SurfaceType3D::Portal => collector.mirrors.push(item),
                SurfaceType3D::Transparent => collector.transparent.push(item),
                SurfaceType3D::Additive => collector.additive.push(item),
            }
        }

        // Sort opaque front-to-back by coarse depth bucket first for Early-Z, then by material/geometry
        collector.opaque.sort_by(|a, b| {
            let bucket_a = (a.depth.max(0.0).sqrt() * 0.125) as u32;
            let bucket_b = (b.depth.max(0.0).sqrt() * 0.125) as u32;
            (bucket_a, a.material_id, a.geometry_id)
                .cmp(&(bucket_b, b.material_id, b.geometry_id))
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

        // Sort refractive and transparent strictly back-to-front for correct physical transmission & blending
        collector.refractive.sort_by(|a, b| {
            b.depth
                .partial_cmp(&a.depth)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        collector.transparent.sort_by(|a, b| {
            b.depth
                .partial_cmp(&a.depth)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        collector.additive.sort_by(|a, b| {
            b.depth
                .partial_cmp(&a.depth)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        collector.mirrors.sort_by(|a, b| {
            a.depth
                .partial_cmp(&b.depth)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        collector
    }
}

/// Computes a conservative world-space AABB enclosing all instances of an instanced batch.
pub(crate) fn compute_instanced_batch_aabb(
    local_aabb: &galfus_realm_3d_resources::aabb::Aabb,
    instances: &[galfus_realm_3d_resources::model::InstanceData3D],
) -> (Vec3, Vec3) {
    let geom_center = local_aabb.center();
    let geom_radius = local_aabb.max.distance(local_aabb.min) * 0.5;
    let mut batch_min = Vec3::splat(f32::INFINITY);
    let mut batch_max = Vec3::splat(f32::NEG_INFINITY);
    for inst in instances {
        let p = inst.transform.transform_point3(geom_center);
        let sx = inst.transform.x_axis.truncate().length();
        let sy = inst.transform.y_axis.truncate().length();
        let sz = inst.transform.z_axis.truncate().length();
        let r = geom_radius * sx.max(sy).max(sz);
        let ext = Vec3::splat(r);
        batch_min = batch_min.min(p - ext);
        batch_max = batch_max.max(p + ext);
    }
    (batch_min, batch_max)
}

/// Renders an iterator of collected draw items into a forward render pass.
pub fn render_draw_items<'a>(
    pass: &mut wgpu::RenderPass<'a>,
    pipeline: &'a crate::pipeline::Pipeline3D,
    items: impl IntoIterator<Item = &'a CollectedDrawItem<'a>>,
    refraction_bg: &'a wgpu::BindGroup,
) {
    render_draw_items_with_state(pass, pipeline, items, refraction_bg, None, None);
}

/// Renders collected draw items using GPU-culled `DrawIndexedIndirectArgs` when available.
pub(crate) fn render_draw_items_indirect<'a>(
    pass: &mut wgpu::RenderPass<'a>,
    pipeline: &'a crate::pipeline::Pipeline3D,
    items: impl IntoIterator<Item = &'a CollectedDrawItem<'a>>,
    refraction_bg: &'a wgpu::BindGroup,
    indirect_buffer: Option<&'a wgpu::Buffer>,
) {
    render_draw_items_with_state(pass, pipeline, items, refraction_bg, None, indirect_buffer);
}

pub(crate) fn render_transparent_opaque<'a>(
    pass: &mut wgpu::RenderPass<'a>,
    pipeline: &'a crate::pipeline::Pipeline3D,
    items: impl IntoIterator<Item = &'a CollectedDrawItem<'a>>,
    refraction_bg: &'a wgpu::BindGroup,
) {
    render_draw_items_with_state(
        pass,
        pipeline,
        items,
        refraction_bg,
        Some(SurfacePipelineState::OpaqueTransparent),
        None,
    );
}

pub(crate) fn render_transparent_partial<'a>(
    pass: &mut wgpu::RenderPass<'a>,
    pipeline: &'a crate::pipeline::Pipeline3D,
    items: impl IntoIterator<Item = &'a CollectedDrawItem<'a>>,
    refraction_bg: &'a wgpu::BindGroup,
) {
    render_draw_items_with_state(
        pass,
        pipeline,
        items,
        refraction_bg,
        Some(SurfacePipelineState::AlphaBlendAfterOpaque),
        None,
    );
}

fn render_draw_items_with_state<'a>(
    pass: &mut wgpu::RenderPass<'a>,
    pipeline: &'a crate::pipeline::Pipeline3D,
    items: impl IntoIterator<Item = &'a CollectedDrawItem<'a>>,
    refraction_bg: &'a wgpu::BindGroup,
    override_state: Option<SurfacePipelineState>,
    indirect_buffer: Option<&'a wgpu::Buffer>,
) {
    pass.set_bind_group(3, refraction_bg, &[]);
    let mut curr_pipe = None;
    let mut curr_mat = None;
    let mut curr_geom = None;

    for (item_idx, item) in items.into_iter().enumerate() {
        let is_instanced = item.instance_buffer.is_some() && item.instance_count > 0;
        let surface_state = override_state
            .unwrap_or_else(|| SurfacePipelineState::from_surface_type(item.surface_type));
        let key = (
            item.shader_effect,
            item.topology,
            surface_state,
            item.side,
            is_instanced,
        );
        if curr_pipe != Some(key) {
            pass.set_pipeline(pipeline.get_pipeline(
                item.shader_effect,
                item.topology,
                surface_state,
                item.side,
                is_instanced,
            ));
            curr_pipe = Some(key);
        }
        if curr_mat != Some(item.material_id) {
            pass.set_bind_group(1, item.material_bg, &[]);
            curr_mat = Some(item.material_id);
        }
        if curr_geom != Some(item.geometry_id) {
            pass.set_vertex_buffer(0, item.vertex_buffer.slice(..));
            pass.set_index_buffer(item.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
            curr_geom = Some(item.geometry_id);
        }
        pass.set_bind_group(2, item.model_bg, &[]);
        if let Some(ind_buf) = indirect_buffer {
            let offset = (item_idx as u64) * crate::occlusion_hiz::INDIRECT_ARGS_STRIDE;
            pass.draw_indexed_indirect(ind_buf, offset);
        } else if item.instance_buffer.is_some() {
            pass.draw_indexed(0..item.index_count, 0, 0..item.instance_count);
        } else {
            pass.draw_indexed(0..item.index_count, 0, 0..1);
        }
    }
}
