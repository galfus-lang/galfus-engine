//! Post-processing and overlay passes orchestration for Realm 3D:
//! outlines, SSAO, multi-scale Bloom HDR, and debug gizmos.

use glam::{Mat4, UVec2};
use std::collections::BTreeMap;

use galfus_realm_3d_resources::environment::EnvironmentRealm3D;
use galfus_realm_3d_resources::frustum::Frustum;
use galfus_realm_3d_resources::geometry::Geometry3D;

use crate::bloom::BloomPipeline3D;
use crate::gizmo::{GizmoPipeline3D, GizmoSystem3D};
use crate::outline::OutlinePipeline3D;
use crate::pipeline::Pipeline3D;
use crate::ssao::SsaoPipeline3D;
use crate::types::{GpuMeshBuffers, GpuModelEntry, SceneGpuBuffers};

pub struct PostProcessDesc<'a> {
    pub device: &'a wgpu::Device,
    pub queue: &'a wgpu::Queue,
    pub encoder: &'a mut wgpu::CommandEncoder,
    pub target_view: &'a wgpu::TextureView,
    pub target_format: wgpu::TextureFormat,
    pub depth_view: &'a wgpu::TextureView,
    pub size: UVec2,
    pub scene_buffers: &'a SceneGpuBuffers,
    pub pipeline: &'a Pipeline3D,
    pub environment: &'a EnvironmentRealm3D,
    pub cam_frustum: &'a Frustum,
    pub projection: &'a Mat4,
    pub models: &'a BTreeMap<u32, GpuModelEntry>,
    pub geometries: &'a BTreeMap<u32, (Geometry3D, Option<GpuMeshBuffers>)>,
}

#[derive(Default)]
pub struct PostProcessPipelines {
    pub outline: Option<OutlinePipeline3D>,
    pub ssao: Option<SsaoPipeline3D>,
    pub bloom: Option<BloomPipeline3D>,
    pub gizmo: Option<GizmoPipeline3D>,
}

impl PostProcessPipelines {
    pub fn new() -> Self {
        Self {
            outline: None,
            ssao: None,
            bloom: None,
            gizmo: None,
        }
    }

    /// Renders screen-space outline, SSAO, Bloom HDR glow, and Debug Gizmos in sequence.
    pub fn execute(&mut self, desc: PostProcessDesc<'_>, gizmos: &mut GizmoSystem3D) {
        // 1. Screen-space model outline dilation pass
        if desc.environment.outline.enabled
            && desc
                .models
                .values()
                .any(|(m, _, _, _)| m.active && m.cast_outline)
        {
            let outline_pipe = self.outline.get_or_insert_with(|| {
                OutlinePipeline3D::new(
                    desc.device,
                    &desc.pipeline.scene_layout,
                    &desc.pipeline.model_layout,
                    desc.target_format,
                )
            });
            let outline_items = desc.models.values().filter_map(|(m, trans, _, bg_opt)| {
                if !m.active || !m.cast_outline {
                    return None;
                }
                let (geom, gpu_mesh) = desc.geometries.get(&m.geometry_id)?;
                if !geom.topology.is_triangle() {
                    return None;
                }
                let (v, i, count) = gpu_mesh.as_ref()?;
                let world_aabb = geom.aabb.transform(&trans.matrix());
                if !desc
                    .cam_frustum
                    .intersects_aabb(world_aabb.min, world_aabb.max)
                {
                    return None;
                }
                Some((bg_opt.as_ref()?, v, i, *count, geom.topology))
            });
            outline_pipe.render(
                crate::outline::OutlineRenderDesc {
                    device: desc.device,
                    queue: desc.queue,
                    encoder: desc.encoder,
                    size: desc.size,
                    scene_bind_group: &desc.scene_buffers.bind_group,
                    depth_view: desc.depth_view,
                    target_view: desc.target_view,
                    config: &desc.environment.outline,
                },
                outline_items,
            );
        }

        // 2. Screen-Space Ambient Occlusion (SSAO) pass
        if desc.environment.ssao.enabled {
            let ssao_pipe = self.ssao.get_or_insert_with(|| {
                SsaoPipeline3D::new(desc.device, desc.target_format, desc.size.x, desc.size.y)
            });
            ssao_pipe.resize(desc.device, desc.size.x, desc.size.y);
            ssao_pipe.render(
                desc.device,
                desc.queue,
                desc.encoder,
                desc.depth_view,
                desc.target_view,
                desc.projection,
                &desc.projection.inverse(),
                &desc.environment.ssao,
            );
        }

        // 3. Screen-Space Multi-Scale Bloom HDR Glow
        if desc.environment.bloom.enabled {
            let bloom_pipe = self.bloom.get_or_insert_with(|| {
                BloomPipeline3D::new(desc.device, desc.target_format, desc.size.x, desc.size.y)
            });
            bloom_pipe.resize(desc.device, desc.size.x, desc.size.y);
            bloom_pipe.render(
                desc.device,
                desc.queue,
                desc.encoder,
                desc.target_view,
                desc.target_view,
                &desc.environment.bloom,
            );
        }

        // 4. Debug Gizmos wireframe & line pass
        if !gizmos.vertices().is_empty() {
            let gizmo_pipe = self.gizmo.get_or_insert_with(|| {
                GizmoPipeline3D::new(desc.device, &desc.pipeline.scene_layout, desc.target_format)
            });
            gizmo_pipe.render(
                desc.device,
                desc.queue,
                desc.encoder,
                desc.target_view,
                desc.depth_view,
                &desc.scene_buffers.bind_group,
                gizmos.vertices(),
            );
            gizmos.clear();
        }
    }
}
