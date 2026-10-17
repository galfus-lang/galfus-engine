use crate::batch::{BatchBuilder2D, PreparedItem2D};
use crate::gpu::GpuResources2D;
use crate::pipeline::{PipelineKey2D, PipelineManager2D};
use crate::shadow::{ShadowManager2D, rasterize_shadow_samples_for_light};
use crate::types::{
    BatchKey2D, Camera2D, Item2DInstanceRaw, Light2D, Material2D, Material2DUniform, Occluder2D,
    OccluderSilhouette2D, ParticleEmitter2D, ParticleEmitterState2D, Shape2D, Sprite2D,
    Transform2D,
};
use bytemuck::cast_slice;
use galfus_realm_core::{
    Realm, RealmInvocationContext, RealmKind, RealmPrepareContext, RealmResult,
};
use glam::{Vec2, Vec4};
use std::collections::HashMap;

/// Runtime 2D rendering context managing GPU buffers, pipelines, materials, and batch execution.
pub struct Realm2DContext {
    pub id: u32,
    pub cameras: HashMap<u32, (Camera2D, Transform2D)>,
    pub sprites: HashMap<u32, (Sprite2D, Transform2D)>,
    pub shapes: HashMap<u32, (Shape2D, Transform2D)>,
    pub materials: HashMap<u32, Material2D>,
    pub lights: HashMap<u32, Light2D>,
    pub emitters: HashMap<u32, (ParticleEmitter2D, Transform2D, ParticleEmitterState2D)>,
    pub dirty: bool,

    pub pipeline_manager: Option<PipelineManager2D>,
    pub batch_builder: BatchBuilder2D,
    pub shadow_manager: ShadowManager2D,
    pub gpu_res: Option<GpuResources2D>,

    pub(crate) total_time: f32,
    pub(crate) material_bind_groups: HashMap<u32, wgpu::BindGroup>,
    pub(crate) material_uniform_buffers: HashMap<u32, wgpu::Buffer>,
}

impl Realm2DContext {
    pub fn new(id: u32) -> Self {
        Self {
            id,
            cameras: HashMap::new(),
            sprites: HashMap::new(),
            shapes: HashMap::new(),
            materials: HashMap::new(),
            lights: HashMap::new(),
            emitters: HashMap::new(),
            dirty: true,
            pipeline_manager: None,
            batch_builder: BatchBuilder2D::new(),
            shadow_manager: ShadowManager2D::default(),
            gpu_res: None,
            total_time: 0.0,
            material_bind_groups: HashMap::new(),
            material_uniform_buffers: HashMap::new(),
        }
    }

    fn ensure_gpu_resources(&mut self, device: &wgpu::Device, queue: &wgpu::Queue) {
        if self.pipeline_manager.is_some() {
            return;
        }

        let pipeline_manager = PipelineManager2D::new(device);
        let gpu_res = GpuResources2D::new(
            device,
            queue,
            &pipeline_manager,
            self.shadow_manager.config.angular_resolution,
        );

        self.pipeline_manager = Some(pipeline_manager);
        self.gpu_res = Some(gpu_res);
    }
}

impl Realm for Realm2DContext {
    fn id(&self) -> u32 {
        self.id
    }

    fn kind(&self) -> RealmKind {
        RealmKind::TwoD
    }

    fn prepare(&mut self, ctx: &RealmPrepareContext<'_>) -> RealmResult<()> {
        self.total_time += ctx.delta_time;
        for (cfg, transform, state) in self.emitters.values_mut() {
            state.update(ctx.delta_time, transform.position, cfg);
        }
        let device = ctx.device;
        let queue = ctx.queue;
        self.ensure_gpu_resources(device, queue);

        // Sync materials
        let pipeline_manager = self.pipeline_manager.as_ref().unwrap();
        let gpu_res = self.gpu_res.as_ref().unwrap();

        for (&mat_id, mat) in &self.materials {
            if !self.material_bind_groups.contains_key(&mat_id) {
                let uniform = mat.build_uniform();
                let buf = crate::gpu::create_gpu_buffer(
                    device,
                    &format!("galfus_2d_mat_buf_{mat_id}"),
                    std::mem::size_of::<Material2DUniform>() as u64,
                    wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                );
                queue.write_buffer(&buf, 0, bytemuck::bytes_of(&uniform));

                let resolved_slots = mat.resolved_texture_slots();
                let bg = crate::gpu::create_material_bind_group_2d(
                    device,
                    &pipeline_manager.material_bind_group_layout,
                    &gpu_res.samplers,
                    &gpu_res.fallback_texture_view,
                    &gpu_res.fallback_normal_view,
                    &gpu_res.fallback_black_view,
                    &buf,
                    &resolved_slots,
                    ctx.textures,
                );

                self.material_uniform_buffers.insert(mat_id, buf);
                self.material_bind_groups.insert(mat_id, bg);
            }
        }

        // Collect occluders from sprites and shapes
        let mut occluders = Vec::new();
        for (&id, (sprite, transform)) in &self.sprites {
            if sprite.cast_shadow {
                let corners = sprite.compute_world_corners(transform);
                occluders.push(Occluder2D {
                    entity_id: id,
                    silhouette: OccluderSilhouette2D::from_quad(corners),
                    shadow_layer_mask: sprite.shadow_layer_mask,
                    shadow_height: sprite.shadow_height,
                    height_range: sprite.height_range,
                });
            }
        }

        for (&id, (shape, transform)) in &self.shapes {
            if shape.cast_shadow {
                for silhouette in shape.compute_world_silhouettes(transform) {
                    occluders.push(Occluder2D {
                        entity_id: id,
                        silhouette,
                        shadow_layer_mask: shape.shadow_layer_mask,
                        shadow_height: shape.shadow_height,
                        height_range: shape.height_range,
                    });
                }
            }
        }

        // Update lights & polar shadow samples
        let occluder_refs: Vec<&Occluder2D> = occluders.iter().collect();
        let mut light_uniforms = Vec::with_capacity(self.lights.len());
        let mut all_shadow_samples = Vec::new();
        let angular_res = self.shadow_manager.config.angular_resolution;

        let mut shadow_idx = 0_u32;
        for light in self.lights.values() {
            let current_shadow_idx = if light.cast_shadow {
                shadow_idx += 1;
                shadow_idx - 1
            } else {
                0
            };
            light_uniforms.push(light.build_uniform(current_shadow_idx));
            if light.cast_shadow {
                let samples =
                    rasterize_shadow_samples_for_light(angular_res, light, &occluder_refs);
                all_shadow_samples.extend(samples);
            }
        }

        let gpu = self.gpu_res.as_ref().unwrap();
        if !light_uniforms.is_empty() {
            queue.write_buffer(&gpu.light_buffer, 0, cast_slice(&light_uniforms));
        }
        if !all_shadow_samples.is_empty() {
            queue.write_buffer(
                &gpu.shadow_sample_buffer,
                0,
                cast_slice(&all_shadow_samples),
            );
        }

        // Build item batches
        self.batch_builder.clear();
        for (&_, (sprite, transform)) in &self.sprites {
            let [min_z, max_z] = sprite.height_range.unwrap_or([-10000.0, 10000.0]);
            let instance = Item2DInstanceRaw {
                model_matrix: sprite.compute_model_matrix(transform),
                tint: Vec4::ONE,
                uv_rect: sprite.uv_rect,
                shadow_params: Vec4::new(
                    if sprite.receive_shadow { 1.0 } else { 0.0 },
                    if sprite.cast_shadow { 1.0 } else { 0.0 },
                    min_z,
                    max_z,
                ),
            };

            self.batch_builder.push(PreparedItem2D {
                key: BatchKey2D {
                    z_layer: transform.z_layer,
                    material_id: sprite.material_id.unwrap_or(0),
                    geometry_id: 0,
                    surface_type: 1,
                },
                instance,
                occluder_only: sprite.occluder_only,
            });
        }

        for (&_, (shape, transform)) in &self.shapes {
            let [min_z, max_z] = shape.height_range.unwrap_or([-10000.0, 10000.0]);
            let instance = Item2DInstanceRaw {
                model_matrix: shape.compute_model_matrix(transform),
                tint: Vec4::ONE,
                uv_rect: Vec4::new(0.0, 0.0, 1.0, 1.0),
                shadow_params: Vec4::new(
                    if shape.receive_shadow { 1.0 } else { 0.0 },
                    if shape.cast_shadow { 1.0 } else { 0.0 },
                    min_z,
                    max_z,
                ),
            };

            self.batch_builder.push(PreparedItem2D {
                key: BatchKey2D {
                    z_layer: transform.z_layer,
                    material_id: shape.material_id.unwrap_or(0),
                    geometry_id: 0,
                    surface_type: 1,
                },
                instance,
                occluder_only: shape.occluder_only,
            });
        }

        for (&_, (cfg, transform, state)) in &self.emitters {
            let material_id = cfg.material_id.unwrap_or(0);
            let surface_type = self
                .materials
                .get(&material_id)
                .map(|m| m.surface_type_id())
                .unwrap_or(1);

            for p in &state.particles {
                let life_pct = (p.age / p.lifetime).clamp(0.0, 1.0);
                let current_size = p.start_size + (p.end_size - p.start_size) * life_pct;
                let current_color = p.start_color.lerp(p.end_color, life_pct);

                let model_matrix = crate::types::compute_particle_matrix(
                    p.position,
                    p.rotation,
                    current_size,
                    transform.z_layer,
                );

                let instance = Item2DInstanceRaw {
                    model_matrix,
                    tint: current_color,
                    uv_rect: cfg.uv_rect,
                    shadow_params: Vec4::new(
                        if cfg.receive_shadow { 1.0 } else { 0.0 },
                        if cfg.cast_shadow { 1.0 } else { 0.0 },
                        -10000.0,
                        10000.0,
                    ),
                };

                self.batch_builder.push(PreparedItem2D {
                    key: BatchKey2D {
                        z_layer: transform.z_layer,
                        material_id,
                        geometry_id: 0,
                        surface_type,
                    },
                    instance,
                    occluder_only: false,
                });
            }
        }

        self.batch_builder.build();
        self.dirty = false;
        Ok(())
    }

    fn render(&mut self, ctx: &RealmInvocationContext<'_>) -> RealmResult<()> {
        let device = ctx.device;
        let queue = ctx.queue;

        let Some((camera, camera_transform)) = ctx
            .camera_slot
            .and_then(|s| self.cameras.values().find(|(c, _)| c.camera_slot == s))
            .or_else(|| self.cameras.values().next())
        else {
            return Ok(());
        };

        let width = ctx.viewport.z.max(1);
        let height = ctx.viewport.w.max(1);
        let viewport_size = Vec2::new(width as f32, height as f32);

        let camera_uniform = camera.build_uniform(
            camera_transform,
            viewport_size,
            self.shadow_manager.config.ambient,
            self.shadow_manager.config.angular_resolution as f32,
            self.shadow_manager.config.shadow_contact_offset,
            self.total_time,
        );

        let instances = self.batch_builder.instances();
        let ranges = self.batch_builder.ranges();
        if instances.is_empty() {
            return Ok(());
        }

        let gpu = self.gpu_res.as_mut().unwrap();
        queue.write_buffer(&gpu.camera_buffer, 0, bytemuck::bytes_of(&camera_uniform));

        // Upload instance buffer
        let required_bytes = std::mem::size_of_val(instances) as u64;
        if gpu.instance_buffer.size() < required_bytes {
            gpu.instance_buffer = crate::gpu::create_gpu_buffer(
                device,
                "galfus_2d_instance_buf_resized",
                required_bytes.max(1024),
                wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            );
        }
        queue.write_buffer(&gpu.instance_buffer, 0, cast_slice(instances));

        let quad_vbo = &gpu.quad_vertex_buffer;
        let quad_ibo = &gpu.quad_index_buffer;
        let instance_buf = &gpu.instance_buffer;
        let global_bg = &gpu.global_bind_group;
        let fallback_mat_bg = &gpu.fallback_material_bind_group;

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("galfus_2d_invocation_encoder"),
        });

        {
            let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("galfus_2d_invocation_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: ctx.target_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Load,
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });

            rpass.set_viewport(0.0, 0.0, width as f32, height as f32, 0.0, 1.0);
            rpass.set_vertex_buffer(0, quad_vbo.slice(..));
            rpass.set_vertex_buffer(1, instance_buf.slice(..));
            rpass.set_index_buffer(quad_ibo.slice(..), wgpu::IndexFormat::Uint16);
            rpass.set_bind_group(0, global_bg, &[]);

            let pipeline_mgr = self.pipeline_manager.as_mut().unwrap();
            for range in ranges {
                let mat = self.materials.get(&range.key.material_id);
                let snippet = mat.and_then(|m| m.shader_effect.as_deref());
                let effect_id = crate::pipeline::PipelineManager2D::compute_effect_id(snippet);
                let key = PipelineKey2D {
                    effect_id,
                    surface_type: range.key.surface_type,
                    target_format: ctx.target_format,
                    sample_count: 1,
                };
                let pipe = pipeline_mgr.get_or_create_pipeline(device, key, snippet);
                rpass.set_pipeline(pipe);
                let mat_bg = self
                    .material_bind_groups
                    .get(&range.key.material_id)
                    .unwrap_or(fallback_mat_bg);
                rpass.set_bind_group(1, mat_bg, &[]);
                rpass.draw_indexed(0..6, 0, range.start..(range.start + range.count));
            }
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
