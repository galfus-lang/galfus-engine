//! Core Realm3DContext managing 3D entities, GPU buffers, and rendering with Reverse-Z.

use std::collections::BTreeMap;

use galfus_realm_3d_resources::camera::Camera3D;
use galfus_realm_3d_resources::environment::EnvironmentRealm3D;
use galfus_realm_3d_resources::frustum::Frustum;
use galfus_realm_3d_resources::geometry::Geometry3D;
use galfus_realm_3d_resources::light::Light3D;
use galfus_realm_3d_resources::material::Material3D;
use galfus_realm_3d_resources::model::Model3D;
use galfus_realm_3d_resources::particle::{ParticleEmitter3D, ParticleEmitterState3D};
use galfus_realm_3d_resources::transform::Transform3D;
use galfus_realm_core::error::{RealmError, RealmResult};
use galfus_realm_core::realm::Realm;
use galfus_realm_core::types::{RealmInvocationContext, RealmKind, RealmPrepareContext};
use glam::UVec2;

use crate::collector::{DrawCollector, render_draw_items};
use crate::pipeline::Pipeline3D;
use crate::shadow::{ShadowMap3D, ShadowPipeline3D};
use crate::types::{GpuMeshBuffers, GpuModelEntry, SceneGpuBuffers, validate_id};

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
    post_pipelines: crate::postprocess::PostProcessPipelines,
    light_cull_pipeline: Option<crate::light_cull::LightCullingPipeline3D>,
    gizmos: crate::gizmo::GizmoSystem3D,
    emitters: BTreeMap<u32, (ParticleEmitter3D, Transform3D, ParticleEmitterState3D)>,
    particle_renderer: Option<crate::particle::ParticleRenderer3D>,
    refraction_pipeline: Option<crate::refraction::RefractionPipeline3D>,
    scene_buffers: Option<SceneGpuBuffers>,
    depth_texture: Option<(wgpu::Texture, wgpu::TextureView, UVec2)>,
    bones: Vec<glam::Mat4>,
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
            post_pipelines: crate::postprocess::PostProcessPipelines::new(),
            light_cull_pipeline: None,
            gizmos: crate::gizmo::GizmoSystem3D::new(),
            emitters: BTreeMap::new(),
            particle_renderer: None,
            refraction_pipeline: None,
            scene_buffers: None,
            depth_texture: None,
            bones: Vec::new(),
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
        self.cameras
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Camera", id))?
            .1 = transform;
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
        let entry = self
            .models
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Model", id))?;
        entry.1 = transform;
        entry.2 = None;
        entry.3 = None;
        self.dirty = true;
        Ok(())
    }

    /// Sets or updates the skeletal bone matrix palette for a specific model.
    pub fn update_model_bones(
        &mut self,
        model_id: u32,
        matrices: &[glam::Mat4],
    ) -> RealmResult<()> {
        let realm_id = self.id;
        let entry = self
            .models
            .get_mut(&model_id)
            .ok_or_else(|| not_found(realm_id, "Model", model_id))?;
        let bone_offset = self.bones.len() as u32;
        let bone_count = matrices.len() as u32;
        self.bones.extend_from_slice(matrices);
        entry.0.bone_offset = bone_offset;
        entry.0.bone_count = bone_count;
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
        self.lights
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "Light", id))?
            .1 = transform;
        self.dirty = true;
        Ok(())
    }

    /// Updates the global `EnvironmentRealm3D` atmospheric configuration.
    pub fn set_environment(&mut self, environment: EnvironmentRealm3D) {
        self.environment = environment;
        self.dirty = true;
    }

    /// Creates or updates a 3D particle emitter.
    pub fn create_particle_emitter(
        &mut self,
        id: u32,
        emitter: ParticleEmitter3D,
        transform: Transform3D,
    ) -> RealmResult<()> {
        validate_id(id)?;
        self.emitters
            .insert(id, (emitter, transform, ParticleEmitterState3D::new()));
        Ok(())
    }

    /// Sets the transform of an existing 3D particle emitter.
    pub fn set_particle_emitter_transform(
        &mut self,
        id: u32,
        transform: Transform3D,
    ) -> RealmResult<()> {
        let entry = self
            .emitters
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "ParticleEmitter", id))?;
        entry.1 = transform;
        Ok(())
    }

    /// Triggers an immediate burst of particles on an emitter.
    pub fn particle_emitter_burst(&mut self, id: u32, count: u32) -> RealmResult<()> {
        let (emitter, transform, state) = self
            .emitters
            .get_mut(&id)
            .ok_or_else(|| not_found(self.id, "ParticleEmitter", id))?;
        state.burst(emitter, count, transform.position, transform.rotation);
        Ok(())
    }

    /// Destroys an existing 3D particle emitter.
    pub fn destroy_particle_emitter(&mut self, id: u32) -> RealmResult<()> {
        self.emitters
            .remove(&id)
            .map(|_| ())
            .ok_or_else(|| not_found(self.id, "ParticleEmitter", id))
    }

    /// Queues debug gizmo drawing primitives.
    pub fn draw_line(&mut self, start: glam::Vec3, end: glam::Vec3, color: glam::Vec4) {
        self.gizmos.draw_line(start, end, color);
    }
    pub fn draw_aabb(&mut self, min: glam::Vec3, max: glam::Vec3, color: glam::Vec4) {
        self.gizmos.draw_aabb(min, max, color);
    }
    pub fn draw_polyline(&mut self, points: &[glam::Vec3], color: glam::Vec4, closed: bool) {
        self.gizmos.draw_polyline(points, color, closed);
    }
    pub fn clear_gizmos(&mut self) {
        self.gizmos.clear();
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

        for (emitter, transform, state) in self.emitters.values_mut() {
            state.update(
                emitter,
                ctx.delta_time,
                transform.position,
                transform.rotation,
            );
        }

        if self.pipeline.is_none() {
            self.pipeline = Some(Pipeline3D::new(device, wgpu::TextureFormat::Rgba8Unorm));
        }
        let pipeline = self.pipeline.as_mut().unwrap();

        // 1-3. Sync Geometries, Materials, and Models
        crate::types::sync_realm_resources(
            device,
            pipeline,
            &mut self.geometries,
            &mut self.materials,
            &mut self.models,
        );

        // 4. Sync Scene Buffers (Environment, Lights, Shadows)
        let shadow_pipe = self
            .shadow_pipeline
            .get_or_insert_with(|| ShadowPipeline3D::new(device, &pipeline.model_layout));

        crate::types::sync_scene_buffers(
            device,
            queue,
            pipeline,
            shadow_pipe,
            &mut self.shadow_map,
            &mut self.scene_buffers,
            &self.environment,
            &self.lights,
            &self.bones,
            &mut self.dirty,
        );

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
        let size = UVec2::new(width, height);
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
        let depth_view =
            crate::types::ensure_depth_texture(device, &mut self.depth_texture, width, height);

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

        let cam_frustum = Frustum::from_view_projection(camera_uniform.view_projection);

        // Optional parallel GPU light culling against camera frustum
        if !self.lights.is_empty() {
            let cull_pipe = self
                .light_cull_pipeline
                .get_or_insert_with(|| crate::light_cull::LightCullingPipeline3D::new(device, 256));
            cull_pipe.dispatch(
                device,
                queue,
                &mut encoder,
                &scene_buffers.lights_buf,
                self.lights.len() as u32,
                &cam_frustum.planes,
            );
        }

        let collector = DrawCollector::collect(
            &self.models,
            &self.geometries,
            &self.materials,
            Some(&cam_frustum),
            camera_transform.position,
        );

        // Shadow Depth Pass for each shadow-casting light (Directional & Spot, Reverse-Z)
        if let (Some(shadow_pipe), Some(shadow_map)) = (&self.shadow_pipeline, &self.shadow_map) {
            crate::shadow::render_shadow_depth_pass(
                &mut encoder,
                queue,
                shadow_pipe,
                shadow_map,
                &self.lights,
                &self.models,
                &self.geometries,
            );
        }

        let (mut alpha_instances, mut additive_instances) =
            crate::particle::collect_emitter_instances(&self.emitters, &self.materials);

        let alpha_count = alpha_instances.len() as u32;
        let additive_count = additive_instances.len() as u32;

        let has_refr = !collector.refractive.is_empty();
        let (behind_alpha, behind_additive) = if has_refr && (alpha_count > 0 || additive_count > 0)
        {
            let min_refr = collector
                .refractive
                .iter()
                .map(|i| i.depth)
                .fold(f32::INFINITY, f32::min);
            let threshold = (min_refr.sqrt() - 0.6).max(0.0).powi(2);
            let cam_pos = camera_transform.position;
            (
                crate::particle::partition_by_depth(&mut alpha_instances, cam_pos, threshold),
                crate::particle::partition_by_depth(&mut additive_instances, cam_pos, threshold),
            )
        } else {
            (0, 0)
        };

        if alpha_count > 0 || additive_count > 0 {
            let particle_renderer = self.particle_renderer.get_or_insert_with(|| {
                crate::particle::ParticleRenderer3D::new(
                    device,
                    ctx.target_format,
                    &pipeline.scene_layout,
                )
            });
            particle_renderer.upload(device, queue, &alpha_instances, &additive_instances);
        }

        // 1. Opaque & Masked forward geometry pass
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Realm3D Opaque Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: ctx.target_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Load,
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

            // Draw Skybox at Reverse-Z far plane (0.0) before geometry if enabled
            if self.environment.skybox.mode
                != galfus_realm_3d_resources::environment::SkyboxMode3D::None
                && let Some(sky_pipe) = &self.skybox_pipeline
            {
                pass.set_pipeline(&sky_pipe.pipeline);
                pass.set_bind_group(0, &sky_pipe.bind_group, &[]);
                pass.draw(0..3, 0..1);
            }

            pass.set_bind_group(0, &scene_buffers.bind_group, &[]);
            let opaque_draws = collector
                .opaque
                .iter()
                .chain(collector.masked.iter())
                .map(|i| (i, false));
            render_draw_items(
                &mut pass,
                pipeline,
                opaque_draws,
                &pipeline.dummy_refraction_bg,
            );

            // Draw background particles before capturing opaque texture so they distort through refractive surfaces
            if behind_alpha > 0 || behind_additive > 0 {
                pass.set_bind_group(0, &scene_buffers.bind_group, &[]);
                if let Some(particle_renderer) = &self.particle_renderer {
                    particle_renderer.render(&mut pass, 0..behind_alpha, 0..behind_additive);
                }
            }
        }

        // 2. Capture opaque frame for optical refraction if refractive models exist
        if has_refr {
            let refr = self.refraction_pipeline.get_or_insert_with(|| {
                crate::refraction::RefractionPipeline3D::new(
                    device,
                    ctx.target_format,
                    width,
                    height,
                )
            });
            refr.resize(device, ctx.target_format, width, height);
            refr.capture_opaque(device, &mut encoder, ctx.target_view);
        }

        // 3. Translucent, Refractive, and Foreground Particle pass
        let has_trans = !collector.transparent.is_empty();
        let has_front_particles = alpha_count > behind_alpha || additive_count > behind_additive;
        if has_refr || has_trans || has_front_particles {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Realm3D Refractive & Transparent Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: ctx.target_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Load,
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Load,
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });

            pass.set_bind_group(0, &scene_buffers.bind_group, &[]);

            if has_refr {
                let refr_bg = self
                    .refraction_pipeline
                    .as_ref()
                    .map(|r| r.bind_group())
                    .unwrap_or(&pipeline.dummy_refraction_bg);
                render_draw_items(
                    &mut pass,
                    pipeline,
                    collector.refractive.iter().map(|i| (i, true)),
                    refr_bg,
                );
            }
            if has_trans {
                render_draw_items(
                    &mut pass,
                    pipeline,
                    collector.transparent.iter().map(|i| (i, true)),
                    &pipeline.dummy_refraction_bg,
                );
            }

            if has_front_particles && let Some(particle_renderer) = &self.particle_renderer {
                pass.set_bind_group(0, &scene_buffers.bind_group, &[]);
                particle_renderer.render(
                    &mut pass,
                    behind_alpha..alpha_count,
                    behind_additive..additive_count,
                );
            }
        }

        // 3-6. Screen-space post-processing: Outlines, SSAO, Bloom HDR glow, and Debug Gizmos
        self.post_pipelines.execute(
            crate::postprocess::PostProcessDesc {
                device,
                queue,
                encoder: &mut encoder,
                target_view: ctx.target_view,
                target_format: ctx.target_format,
                depth_view,
                size,
                scene_buffers,
                pipeline,
                environment: &self.environment,
                cam_frustum: &cam_frustum,
                projection: &camera_uniform.projection,
                models: &self.models,
                geometries: &self.geometries,
            },
            &mut self.gizmos,
        );

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
