//! Shadow depth-pass execution and per-light frustum culling.

use galfus_core::{CullingMode, distance_sq_in_range};
use galfus_realm_3d_resources::material::{Material3D, MaterialSide3D, SurfaceType3D};
use glam::{Mat4, Vec3};

use super::{MAX_SHADOW_LIGHTS, ShadowMap3D, ShadowPipeline3D, ShadowSurfaceMode};
use crate::collector::CollectedDrawItem;

/// Executes an unbiased Reverse-Z depth pre-pass for collected opaque and masked occluders.
/// Returns `true` if the pass ran and cleared/populated `depth_view`.
#[allow(clippy::too_many_arguments)]
pub(crate) fn render_depth_prepass<'a>(
    encoder: &mut wgpu::CommandEncoder,
    queue: &wgpu::Queue,
    shadow_pipe: &ShadowPipeline3D,
    shadow_map: &ShadowMap3D,
    depth_view: &wgpu::TextureView,
    camera_view_proj: &Mat4,
    time: f32,
    opaque: &[CollectedDrawItem<'a>],
    masked: &[CollectedDrawItem<'a>],
) -> bool {
    let has_occluders = opaque.iter().chain(masked.iter()).any(|i| i.is_occluder);
    if !has_occluders {
        return false;
    }

    shadow_map.update_prepass_vp(queue, camera_view_proj, time);
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("Realm3D Depth Pre-Pass"),
        color_attachments: &[],
        depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
            view: depth_view,
            depth_ops: Some(wgpu::Operations {
                load: wgpu::LoadOp::Clear(0.0),
                store: wgpu::StoreOp::Store,
            }),
            stencil_ops: None,
        }),
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    pass.set_bind_group(0, &shadow_map.prepass_vp_bind_group, &[]);

    for item in opaque.iter().chain(masked.iter()) {
        if !item.is_occluder {
            continue;
        }
        let surface_mode = if item.surface_type == SurfaceType3D::Masked {
            ShadowSurfaceMode::AlphaMask
        } else {
            ShadowSurfaceMode::Solid
        };
        let instanced = item.instance_buffer.is_some();
        pass.set_pipeline(shadow_pipe.prepass_pipeline(
            item.topology,
            item.side,
            instanced,
            surface_mode,
        ));
        pass.set_bind_group(1, item.material_bg, &[]);
        pass.set_bind_group(2, item.model_bg, &[]);
        pass.set_vertex_buffer(0, item.vertex_buffer.slice(..));
        pass.set_index_buffer(item.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
        pass.draw_indexed(0..item.index_count, 0, 0..item.instance_count);
    }
    true
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn render_depth_layer_target(
    encoder: &mut wgpu::CommandEncoder,
    shadow_pipe: &ShadowPipeline3D,
    layer_view: &wgpu::TextureView,
    vp_bg: &wgpu::BindGroup,
    layer_mask: u32,
    view_proj: &Mat4,
    main_camera_pos: Option<Vec3>,
    models: &std::collections::BTreeMap<u32, crate::types::GpuModelEntry>,
    instanced_models: &std::collections::BTreeMap<u32, crate::types::GpuInstancedModelEntry>,
    materials: &std::collections::BTreeMap<
        u32,
        (Material3D, Option<wgpu::Buffer>, Option<wgpu::BindGroup>),
    >,
    geometries: &std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::geometry::Geometry3D,
            Option<crate::types::GpuMeshBuffers>,
        ),
    >,
) {
    let mut s_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("Realm3D Depth Layer Pass"),
        color_attachments: &[],
        depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
            view: layer_view,
            depth_ops: Some(wgpu::Operations {
                load: wgpu::LoadOp::Clear(0.0),
                store: wgpu::StoreOp::Store,
            }),
            stencil_ops: None,
        }),
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });

    s_pass.set_bind_group(0, vp_bg, &[]);

    let frustum = galfus_realm_3d_resources::frustum::Frustum::from_view_projection(*view_proj);
    for (model, model_trans, local_aabb, _, _, model_bg_opt) in models.values() {
        if !model.active || !model.cast_shadow || (model.layer_mask & layer_mask) == 0 {
            continue;
        }
        let Some(model_bg) = model_bg_opt else {
            continue;
        };
        let Some((geom, Some(mesh))) = geometries.get(&model.geometry_id) else {
            continue;
        };
        if model.culling_mode != CullingMode::AlwaysRender {
            if let Some(cam_pos) = main_camera_pos {
                let world_center = model_trans.matrix().transform_point3(geom.aabb.center());
                if !distance_sq_in_range(
                    (world_center - cam_pos).length_squared(),
                    model.distance_range,
                ) {
                    continue;
                }
            }
            let world_aabb = local_aabb.transform(&model_trans.matrix());
            let pad = Vec3::splat(model.cull_margin.max(0.0));
            if !frustum.intersects_aabb(world_aabb.min - pad, world_aabb.max + pad) {
                continue;
            }
        }
        let (side, surface_mode, material_bg) = match materials.get(&model.material_id) {
            Some((material, _, material_bg)) => {
                let Some(surface_mode) =
                    ShadowSurfaceMode::from_surface_type(material.surface_type)
                else {
                    continue;
                };
                (material.side, surface_mode, material_bg.as_ref())
            }
            None => (MaterialSide3D::default(), ShadowSurfaceMode::Solid, None),
        };
        let material_bg = if matches!(surface_mode, ShadowSurfaceMode::AlphaMask) {
            let Some(material_bg) = material_bg else {
                continue;
            };
            material_bg
        } else {
            material_bg.unwrap_or(&shadow_pipe.fallback_material_bg)
        };
        s_pass.set_pipeline(shadow_pipe.pipeline(geom.topology, side, false, surface_mode));
        s_pass.set_bind_group(1, material_bg, &[]);
        s_pass.set_bind_group(2, model_bg, &[]);
        s_pass.set_vertex_buffer(0, mesh.vertices.slice(..));
        s_pass.set_index_buffer(mesh.indices.slice(..), wgpu::IndexFormat::Uint32);
        s_pass.draw_indexed(0..mesh.index_count, 0, 0..1);
    }

    // Instanced models depth pass
    for (inst_model, instances, inst_buf_opt, _, _, model_bg_opt) in instanced_models.values() {
        if !inst_model.active
            || !inst_model.cast_shadow
            || instances.is_empty()
            || (inst_model.layer_mask & layer_mask) == 0
        {
            continue;
        }
        if inst_buf_opt.is_none() {
            continue;
        }
        let Some(model_bg) = model_bg_opt else {
            continue;
        };
        let Some((geom, Some(mesh))) = geometries.get(&inst_model.geometry_id) else {
            continue;
        };
        if inst_model.culling_mode != CullingMode::AlwaysRender {
            let (batch_min, batch_max) =
                crate::collector::compute_instanced_batch_aabb(&geom.aabb, instances);
            if let Some(cam_pos) = main_camera_pos {
                let batch_center = (batch_min + batch_max) * 0.5;
                if !distance_sq_in_range(
                    (batch_center - cam_pos).length_squared(),
                    inst_model.distance_range,
                ) {
                    continue;
                }
            }
            let pad = Vec3::splat(inst_model.cull_margin.max(0.0));
            if !frustum.intersects_aabb(batch_min - pad, batch_max + pad) {
                continue;
            }
        }
        let (side, surface_mode, material_bg) = match materials.get(&inst_model.material_id) {
            Some((material, _, material_bg)) => {
                let Some(surface_mode) =
                    ShadowSurfaceMode::from_surface_type(material.surface_type)
                else {
                    continue;
                };
                (material.side, surface_mode, material_bg.as_ref())
            }
            None => (MaterialSide3D::default(), ShadowSurfaceMode::Solid, None),
        };
        let material_bg = if matches!(surface_mode, ShadowSurfaceMode::AlphaMask) {
            let Some(material_bg) = material_bg else {
                continue;
            };
            material_bg
        } else {
            material_bg.unwrap_or(&shadow_pipe.fallback_material_bg)
        };
        s_pass.set_pipeline(shadow_pipe.pipeline(geom.topology, side, true, surface_mode));
        s_pass.set_bind_group(1, material_bg, &[]);
        s_pass.set_bind_group(2, model_bg, &[]);
        s_pass.set_vertex_buffer(0, mesh.vertices.slice(..));
        s_pass.set_index_buffer(mesh.indices.slice(..), wgpu::IndexFormat::Uint32);
        s_pass.draw_indexed(0..mesh.index_count, 0, 0..instances.len() as u32);
    }
}

#[allow(clippy::too_many_arguments)]
fn render_single_shadow_layer(
    encoder: &mut wgpu::CommandEncoder,
    queue: &wgpu::Queue,
    shadow_pipe: &ShadowPipeline3D,
    shadow_map: &ShadowMap3D,
    layer_idx: u32,
    light_layer_mask: u32,
    shadow_view_proj: &Mat4,
    main_camera_pos: Option<Vec3>,
    time: f32,
    models: &std::collections::BTreeMap<u32, crate::types::GpuModelEntry>,
    instanced_models: &std::collections::BTreeMap<u32, crate::types::GpuInstancedModelEntry>,
    materials: &std::collections::BTreeMap<
        u32,
        (Material3D, Option<wgpu::Buffer>, Option<wgpu::BindGroup>),
    >,
    geometries: &std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::geometry::Geometry3D,
            Option<crate::types::GpuMeshBuffers>,
        ),
    >,
) {
    shadow_map.update_vp(queue, layer_idx, shadow_view_proj, time);
    render_depth_layer_target(
        encoder,
        shadow_pipe,
        &shadow_map.layer_views[layer_idx as usize],
        &shadow_map.vp_bind_groups[layer_idx as usize],
        light_layer_mask,
        shadow_view_proj,
        main_camera_pos,
        models,
        instanced_models,
        materials,
        geometries,
    );
}

/// Executes depth passes for all shadow-casting lights applying frustum culling per light.
#[allow(clippy::too_many_arguments)]
pub fn render_shadow_depth_pass(
    encoder: &mut wgpu::CommandEncoder,
    queue: &wgpu::Queue,
    shadow_pipe: &ShadowPipeline3D,
    shadow_map: &ShadowMap3D,
    lights: &std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::light::Light3D,
            galfus_realm_3d_resources::transform::Transform3D,
        ),
    >,
    models: &std::collections::BTreeMap<u32, crate::types::GpuModelEntry>,
    instanced_models: &std::collections::BTreeMap<u32, crate::types::GpuInstancedModelEntry>,
    materials: &std::collections::BTreeMap<
        u32,
        (Material3D, Option<wgpu::Buffer>, Option<wgpu::BindGroup>),
    >,
    geometries: &std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::geometry::Geometry3D,
            Option<crate::types::GpuMeshBuffers>,
        ),
    >,
    main_camera_pos: Option<Vec3>,
    time: f32,
) {
    let mut layer_idx = 0u32;
    for (light, light_trans) in lights.values() {
        if !light.active || !light.cast_shadow {
            continue;
        }
        if light.kind == galfus_realm_3d_resources::light::LightKind3D::Point {
            if layer_idx + 6 > MAX_SHADOW_LIGHTS {
                continue;
            }
            let pos = light_trans.position;
            let range = light.range.max(0.25);
            let fov = 90.5f32.to_radians();
            let proj = glam::camera::rh::proj::directx::perspective(fov, 1.0, range, 0.2);
            let targets = [
                (pos + glam::Vec3::X, glam::Vec3::NEG_Y),     // +X: 0
                (pos + glam::Vec3::NEG_X, glam::Vec3::NEG_Y), // -X: 1
                (pos + glam::Vec3::Y, glam::Vec3::Z),         // +Y: 2
                (pos + glam::Vec3::NEG_Y, glam::Vec3::NEG_Z), // -Y: 3
                (pos + glam::Vec3::Z, glam::Vec3::NEG_Y),     // +Z: 4
                (pos + glam::Vec3::NEG_Z, glam::Vec3::NEG_Y), // -Z: 5
            ];
            for (face_i, (target, up)) in targets.iter().enumerate() {
                let view = glam::camera::rh::view::look_at_mat4(pos, *target, *up);
                let vp = proj * view;
                render_single_shadow_layer(
                    encoder,
                    queue,
                    shadow_pipe,
                    shadow_map,
                    layer_idx + face_i as u32,
                    light.layer_mask,
                    &vp,
                    main_camera_pos,
                    time,
                    models,
                    instanced_models,
                    materials,
                    geometries,
                );
            }
            layer_idx += 6;
        } else {
            if layer_idx >= MAX_SHADOW_LIGHTS {
                continue;
            }
            let light_uniform = light.build_uniform_with_layer(light_trans, layer_idx);
            render_single_shadow_layer(
                encoder,
                queue,
                shadow_pipe,
                shadow_map,
                layer_idx,
                light.layer_mask,
                &light_uniform.shadow_view_proj,
                main_camera_pos,
                time,
                models,
                instanced_models,
                materials,
                geometries,
            );
            layer_idx += 1;
        }
    }
}
