//! Core Realm3DContext managing 3D entities, GPU buffers, and rendering with Reverse-Z.

use std::collections::BTreeMap;

use galfus_realm_3d_resources::camera::{Camera3D, Camera3DUniform};
use galfus_realm_3d_resources::environment::EnvironmentRealm3D;
use galfus_realm_3d_resources::geometry::Geometry3D;
use galfus_realm_3d_resources::light::{Light3D, Light3DUniform};
use galfus_realm_3d_resources::material::Material3D;
use galfus_realm_3d_resources::model::Model3D;
use galfus_realm_3d_resources::transform::Transform3D;
use galfus_realm_core::error::{RealmError, RealmResult};
use galfus_realm_core::realm::Realm;
use galfus_realm_core::types::{RealmInvocationContext, RealmKind, RealmPrepareContext};
use glam::UVec2;
use wgpu::util::DeviceExt;

use crate::pipeline::Pipeline3D;
use crate::shadow::{ShadowMap3D, ShadowPipeline3D};
use crate::types::{
    GpuMeshBuffers, GpuModelEntry, SceneGpuBuffers, create_uniform_bg, validate_id,
};

#[inline]
fn not_found(realm_id: u32, kind: &str, id: u32) -> RealmError {
    RealmError::ResourceNotFound(realm_id, format!("{kind} {id} not found"))
}

/// Autonomous 3D Realm managing 3D scenes, entities, Reverse-Z rendering, and lighting.
pub struct Realm3DContext {
    id: u32,
    cameras: BTreeMap<u32, (Camera3D, Transform3D)>,
    materials: BTreeMap<u32, (Material3D, Option<wgpu::Buffer>, Option<wgpu::BindGroup>)>,
    geometries: BTreeMap<u32, (Geometry3D, Option<GpuMeshBuffers>)>,
    models: BTreeMap<u32, GpuModelEntry>,
    lights: BTreeMap<u32, (Light3D, Transform3D)>,
    environment: EnvironmentRealm3D,

    pipeline: Option<Pipeline3D>,
    shadow_pipeline: Option<ShadowPipeline3D>,
    shadow_map: Option<ShadowMap3D>,
    skybox_pipeline: Option<crate::skybox::SkyboxPipeline3D>,
    outline_pipeline: Option<crate::outline::OutlinePipeline3D>,
    scene_buffers: Option<SceneGpuBuffers>,
    depth_texture: Option<(wgpu::Texture, wgpu::TextureView, UVec2)>,
    total_time: f32,
    dirty: bool,
}

impl Realm3DContext {
    /// Creates a new `Realm3DContext` with a logical host ID.
    pub fn new(id: u32) -> Self {
        Self {
            id,
            cameras: BTreeMap::new(),
            materials: BTreeMap::new(),
            geometries: BTreeMap::new(),
            models: BTreeMap::new(),
            lights: BTreeMap::new(),
            environment: EnvironmentRealm3D::default(),
            pipeline: None,
            shadow_pipeline: None,
            shadow_map: None,
            skybox_pipeline: None,
            outline_pipeline: None,
            scene_buffers: None,
            depth_texture: None,
            total_time: 0.0,
            dirty: true,
        }
    }

    /// Registers or updates a `Camera3D` with its `Transform3D`.
    pub fn create_camera(
        &mut self,
        id: u32,
        camera: Camera3D,
        transform: Transform3D,
    ) -> RealmResult<()> {
        validate_id(id)?;
        self.cameras.insert(id, (camera, transform));
        self.dirty = true;
        Ok(())
    }

    /// Updates the transform of an existing `Camera3D`.
    pub fn set_camera_transform(&mut self, id: u32, transform: Transform3D) -> RealmResult<()> {
        let realm_id = self.id;
        let entry = self
            .cameras
            .get_mut(&id)
            .ok_or_else(|| not_found(realm_id, "Camera", id))?;
        entry.1 = transform;
        self.dirty = true;
        Ok(())
    }

    /// Registers or updates a `Material3D`.
    pub fn create_material(&mut self, id: u32, material: Material3D) -> RealmResult<()> {
        validate_id(id)?;
        self.materials.insert(id, (material, None, None));
        self.dirty = true;
        Ok(())
    }

    /// Registers or updates a `Geometry3D`.
    pub fn create_geometry(&mut self, id: u32, geometry: Geometry3D) -> RealmResult<()> {
        validate_id(id)?;
        self.geometries.insert(id, (geometry, None));
        self.dirty = true;
        Ok(())
    }

    /// Registers or updates a `Model3D` with its `Transform3D`.
    pub fn create_model(
        &mut self,
        id: u32,
        model: Model3D,
        transform: Transform3D,
    ) -> RealmResult<()> {
        validate_id(id)?;
        self.models.insert(id, (model, transform, None, None));
        self.dirty = true;
        Ok(())
    }

    /// Updates the transform of an existing `Model3D`.
    pub fn set_model_transform(&mut self, id: u32, transform: Transform3D) -> RealmResult<()> {
        let realm_id = self.id;
        let entry = self
            .models
            .get_mut(&id)
            .ok_or_else(|| not_found(realm_id, "Model", id))?;
        entry.1 = transform;
        entry.2 = None;
        entry.3 = None;
        self.dirty = true;
        Ok(())
    }

    /// Registers or updates a `Light3D` with its `Transform3D`.
    pub fn create_light(
        &mut self,
        id: u32,
        light: Light3D,
        transform: Transform3D,
    ) -> RealmResult<()> {
        validate_id(id)?;
        self.lights.insert(id, (light, transform));
        self.dirty = true;
        Ok(())
    }

    /// Updates the transform of an existing `Light3D`.
    pub fn set_light_transform(&mut self, id: u32, transform: Transform3D) -> RealmResult<()> {
        let realm_id = self.id;
        let entry = self
            .lights
            .get_mut(&id)
            .ok_or_else(|| not_found(realm_id, "Light", id))?;
        entry.1 = transform;
        self.dirty = true;
        Ok(())
    }

    /// Updates the global `EnvironmentRealm3D` atmospheric configuration.
    pub fn set_environment(&mut self, environment: EnvironmentRealm3D) {
        self.environment = environment;
        self.dirty = true;
    }
}

impl Realm for Realm3DContext {
    fn id(&self) -> u32 {
        self.id
    }

    fn kind(&self) -> RealmKind {
        RealmKind::ThreeD
    }

    fn prepare(&mut self, ctx: &RealmPrepareContext<'_>) -> RealmResult<()> {
        let device = ctx.device;
        let queue = ctx.queue;
        self.total_time += ctx.delta_time;

        if self.pipeline.is_none() {
            self.pipeline = Some(Pipeline3D::new(device, wgpu::TextureFormat::Rgba8Unorm));
        }
        let pipeline = self.pipeline.as_mut().unwrap();

        // 1. Sync Geometries
        for (geom, gpu_buffers) in self.geometries.values_mut() {
            if gpu_buffers.is_none() && !geom.vertices.is_empty() {
                let v = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("Vertex Buffer"),
                    contents: bytemuck::cast_slice(&geom.vertices),
                    usage: wgpu::BufferUsages::VERTEX,
                });
                let i = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("Index Buffer"),
                    contents: bytemuck::cast_slice(&geom.indices),
                    usage: wgpu::BufferUsages::INDEX,
                });
                *gpu_buffers = Some((v, i, geom.indices.len() as u32));
            }
        }

        // 2. Sync Materials and pre-compile any custom surface effect pipelines
        for (mat, buf_opt, bg_opt) in self.materials.values_mut() {
            if buf_opt.is_none() {
                let (buf, bg) = create_uniform_bg(
                    device,
                    "Mat",
                    &pipeline.material_layout,
                    bytemuck::bytes_of(&mat.build_uniform()),
                );
                *buf_opt = Some(buf);
                *bg_opt = Some(bg);
            }
            pipeline.ensure_pipeline(device, mat.shader_effect.as_deref());
        }

        // 3. Sync Models
        for (model, transform, buf_opt, bg_opt) in self.models.values_mut() {
            if buf_opt.is_none() {
                let (buf, bg) = create_uniform_bg(
                    device,
                    "Model",
                    &pipeline.model_layout,
                    bytemuck::bytes_of(&model.build_uniform(transform)),
                );
                *buf_opt = Some(buf);
                *bg_opt = Some(bg);
            }
        }

        // 4. Sync Scene Buffers (Environment, Lights, Shadows)
        let shadow_pipe = self
            .shadow_pipeline
            .get_or_insert_with(|| ShadowPipeline3D::new(device, &pipeline.model_layout));
        let shadow_map = self
            .shadow_map
            .get_or_insert_with(|| ShadowMap3D::new(device, shadow_pipe));

        if self.scene_buffers.is_none() || self.dirty {
            let camera_buf = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Camera Uniform Buffer"),
                size: std::mem::size_of::<Camera3DUniform>() as u64,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });

            let env_uniform = self.environment.build_uniform(0.0);
            let env_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Environment Uniform Buffer"),
                contents: bytemuck::bytes_of(&env_uniform),
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            });

            let mut shadow_counter = 0u32;
            let mut lights_data: Vec<Light3DUniform> = self
                .lights
                .values()
                .map(|(l, t)| {
                    if l.cast_shadow && shadow_counter < crate::shadow::MAX_SHADOW_LIGHTS {
                        let layer = shadow_counter;
                        shadow_counter += 1;
                        l.build_uniform_with_layer(t, layer)
                    } else {
                        l.build_uniform(t)
                    }
                })
                .collect();
            if lights_data.is_empty() {
                lights_data.push(bytemuck::Zeroable::zeroed());
            }

            let lights_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Lights Storage Buffer"),
                contents: bytemuck::cast_slice(&lights_data),
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            });

            let header = [self.lights.len() as u32, 0, 0, 0];
            let lights_header_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Lights Header Buffer"),
                contents: bytemuck::cast_slice(&header),
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            });

            let b_entry = |binding, resource| wgpu::BindGroupEntry { binding, resource };
            let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Scene Bind Group"),
                layout: &pipeline.scene_layout,
                entries: &[
                    b_entry(0, camera_buf.as_entire_binding()),
                    b_entry(1, env_buf.as_entire_binding()),
                    b_entry(2, lights_buf.as_entire_binding()),
                    b_entry(3, lights_header_buf.as_entire_binding()),
                    b_entry(
                        4,
                        wgpu::BindingResource::TextureView(&shadow_map.array_view),
                    ),
                    b_entry(5, wgpu::BindingResource::Sampler(&shadow_map.sampler)),
                ],
            });

            self.scene_buffers = Some(SceneGpuBuffers {
                camera_buf,
                env_buf,
                _lights_buf: lights_buf,
                _lights_header_buf: lights_header_buf,
                bind_group,
            });
            self.dirty = false;
        } else if let Some(scene) = &self.scene_buffers {
            let env_uniform = self.environment.build_uniform(0.0);
            queue.write_buffer(&scene.env_buf, 0, bytemuck::bytes_of(&env_uniform));
        }

        Ok(())
    }

    fn render(&mut self, ctx: &RealmInvocationContext<'_>) -> RealmResult<()> {
        let device = ctx.device;
        let queue = ctx.queue;

        // Resolve camera
        let Some((camera, camera_transform)) = ctx
            .camera_slot
            .and_then(|s| {
                self.cameras
                    .values()
                    .find(|(c, _)| c.camera_slot == s)
                    .or_else(|| self.cameras.get(&s))
            })
            .or_else(|| self.cameras.values().next())
        else {
            return Ok(());
        };

        let width = ctx.viewport.z.max(1);
        let height = ctx.viewport.w.max(1);
        let aspect = width as f32 / height as f32;

        let camera_uniform = camera.build_uniform(camera_transform, aspect);
        let scene_buffers = match &self.scene_buffers {
            Some(sb) => sb,
            None => return Ok(()),
        };
        queue.write_buffer(
            &scene_buffers.camera_buf,
            0,
            bytemuck::bytes_of(&camera_uniform),
        );
        let env_uniform = self.environment.build_uniform(self.total_time);
        queue.write_buffer(&scene_buffers.env_buf, 0, bytemuck::bytes_of(&env_uniform));

        // Ensure Reverse-Z depth texture matches invocation viewport size
        let size = UVec2::new(width, height);
        if let Some((_, _, d_size)) = &self.depth_texture
            && *d_size != size
        {
            self.depth_texture = None;
        }
        if self.depth_texture.is_none() {
            let tex = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("Realm3D Depth Texture"),
                size: wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Depth32Float,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            });
            let view = tex.create_view(&wgpu::TextureViewDescriptor::default());
            self.depth_texture = Some((tex, view, size));
        }
        let (_, depth_view, _) = self.depth_texture.as_ref().unwrap();

        // Initialize and update Skybox if configured
        let sky_pipe = self
            .skybox_pipeline
            .get_or_insert_with(|| crate::skybox::SkyboxPipeline3D::new(device, ctx.target_format));
        sky_pipe.update(
            queue,
            &camera_uniform.view_projection,
            camera_uniform.position,
            &self.environment.skybox,
        );

        let pipeline = match &self.pipeline {
            Some(p) => p,
            None => return Ok(()),
        };

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Realm3D Render Encoder"),
        });

        // Shadow Depth Pass for each shadow-casting light (Directional & Spot, Reverse-Z)
        if let (Some(shadow_pipe), Some(shadow_map)) = (&self.shadow_pipeline, &self.shadow_map) {
            let mut layer_idx = 0u32;
            for (light, light_trans) in self.lights.values() {
                if !light.active
                    || !light.cast_shadow
                    || layer_idx >= crate::shadow::MAX_SHADOW_LIGHTS
                {
                    continue;
                }
                let light_uniform = light.build_uniform_with_layer(light_trans, layer_idx);
                shadow_map.update_vp(queue, layer_idx, &light_uniform.shadow_view_proj);

                let layer_view = &shadow_map.layer_views[layer_idx as usize];
                let vp_bg = &shadow_map.vp_bind_groups[layer_idx as usize];

                let mut s_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("Realm3D Shadow Pass"),
                    color_attachments: &[],
                    depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                        view: layer_view,
                        // Reverse-Z: Clear depth buffer to 0.0 (Far plane)
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

                s_pass.set_pipeline(&shadow_pipe.render_pipeline);
                s_pass.set_bind_group(0, vp_bg, &[]);

                for (model, _, _, model_bg_opt) in self.models.values() {
                    if !model.active || !model.cast_shadow {
                        continue;
                    }
                    let Some(model_bg) = model_bg_opt else {
                        continue;
                    };
                    let Some((_, Some((v, i, count)))) = self.geometries.get(&model.geometry_id)
                    else {
                        continue;
                    };
                    s_pass.set_bind_group(1, model_bg, &[]);
                    s_pass.set_vertex_buffer(0, v.slice(..));
                    s_pass.set_index_buffer(i.slice(..), wgpu::IndexFormat::Uint32);
                    s_pass.draw_indexed(0..*count, 0, 0..1);
                }

                layer_idx += 1;
            }
        }

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Realm3D Forward Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: ctx.target_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Load, // Render into existing cleared target
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: depth_view,
                    // Reverse-Z: Clear depth buffer to 0.0 (Far plane)
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

            // 1. Draw Skybox at Reverse-Z far plane (0.0) before geometry if enabled
            if self.environment.skybox.mode
                != galfus_realm_3d_resources::environment::SkyboxMode3D::None
                && let Some(sky_pipe) = &self.skybox_pipeline
            {
                pass.set_pipeline(&sky_pipe.pipeline);
                pass.set_bind_group(0, &sky_pipe.bind_group, &[]);
                pass.draw(0..3, 0..1);
            }

            // 2. Render forward geometry models
            pass.set_bind_group(0, &scene_buffers.bind_group, &[]);

            // Render all active visible models
            for (model, _, _, model_bg_opt) in self.models.values() {
                if !model.active {
                    continue;
                }
                let Some(model_bg) = model_bg_opt else {
                    continue;
                };
                let mat_entry = self.materials.get(&model.material_id);
                let Some(material_bg) = mat_entry.and_then(|m| m.2.as_ref()) else {
                    continue;
                };
                let Some((v_buf, i_buf, index_count)) = self
                    .geometries
                    .get(&model.geometry_id)
                    .and_then(|g| g.1.as_ref())
                else {
                    continue;
                };

                let snippet = mat_entry.and_then(|m| m.0.shader_effect.as_deref());
                pass.set_pipeline(pipeline.get_pipeline(snippet));
                pass.set_bind_group(1, material_bg, &[]);
                pass.set_bind_group(2, model_bg, &[]);
                pass.set_vertex_buffer(0, v_buf.slice(..));
                pass.set_index_buffer(i_buf.slice(..), wgpu::IndexFormat::Uint32);
                pass.draw_indexed(0..*index_count, 0, 0..1);
            }
        }

        // 3. Screen-space model outline dilation pass (matching .old post-process)
        if self.environment.outline.enabled
            && self
                .models
                .values()
                .any(|(m, _, _, _)| m.active && m.cast_outline)
        {
            let outline_pipe = self.outline_pipeline.get_or_insert_with(|| {
                crate::outline::OutlinePipeline3D::new(
                    device,
                    &pipeline.scene_layout,
                    &pipeline.model_layout,
                    ctx.target_format,
                )
            });
            let outline_items = self.models.values().filter_map(|(m, _, _, bg_opt)| {
                if !m.active || !m.cast_outline {
                    return None;
                }
                let (v, i, count) = self.geometries.get(&m.geometry_id)?.1.as_ref()?;
                Some((bg_opt.as_ref()?, v, i, *count))
            });
            outline_pipe.render(
                crate::outline::OutlineRenderDesc {
                    device,
                    queue,
                    encoder: &mut encoder,
                    size,
                    scene_bind_group: &scene_buffers.bind_group,
                    depth_view,
                    target_view: ctx.target_view,
                    config: &self.environment.outline,
                },
                outline_items,
            );
        }

        queue.submit(Some(encoder.finish()));
        Ok(())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }
}
