use crate::batch::{BatchBuilder2D, PreparedItem2D};
use crate::pipeline::{PipelineKey2D, PipelineManager2D};
use crate::shader::compile_2d_shader;
use crate::shadow::{
    SHADOW_SAMPLES_PER_DIRECTION, ShadowManager2D, rasterize_shadow_samples_for_light,
};
use crate::types::{
    BatchKey2D, Camera2D, Camera2DUniform, Item2DInstanceRaw, Light2D, Light2DUniform, Material2D,
    Material2DUniform, Occluder2D, OccluderSilhouette2D, Shadow2DConfig, ShadowSample2DRaw,
    Shape2D, Sprite2D, Transform2D,
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
    pub dirty: bool,

    pub pipeline_manager: Option<PipelineManager2D>,
    pub batch_builder: BatchBuilder2D,
    pub shadow_manager: ShadowManager2D,

    quad_vertex_buffer: Option<wgpu::Buffer>,
    quad_index_buffer: Option<wgpu::Buffer>,
    camera_buffer: Option<wgpu::Buffer>,
    instance_buffer: Option<wgpu::Buffer>,
    light_buffer: Option<wgpu::Buffer>,
    shadow_sample_buffer: Option<wgpu::Buffer>,

    _point_sampler: Option<wgpu::Sampler>,
    linear_sampler: Option<wgpu::Sampler>,
    fallback_texture_view: Option<wgpu::TextureView>,
    fallback_material_buffer: Option<wgpu::Buffer>,
    fallback_material_bind_group: Option<wgpu::BindGroup>,
    global_bind_group: Option<wgpu::BindGroup>,

    shader_module: Option<wgpu::ShaderModule>,
    material_bind_groups: HashMap<u32, wgpu::BindGroup>,
    material_uniform_buffers: HashMap<u32, wgpu::Buffer>,
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
            dirty: true,
            pipeline_manager: None,
            batch_builder: BatchBuilder2D::new(),
            shadow_manager: ShadowManager2D::default(),
            quad_vertex_buffer: None,
            quad_index_buffer: None,
            camera_buffer: None,
            instance_buffer: None,
            light_buffer: None,
            shadow_sample_buffer: None,
            _point_sampler: None,
            linear_sampler: None,
            fallback_texture_view: None,
            fallback_material_buffer: None,
            fallback_material_bind_group: None,
            global_bind_group: None,
            shader_module: None,
            material_bind_groups: HashMap::new(),
            material_uniform_buffers: HashMap::new(),
        }
    }

    /// Sets or updates a camera in the realm.
    pub fn set_camera(&mut self, camera_id: u32, camera: Camera2D, transform: Transform2D) {
        self.cameras.insert(camera_id, (camera, transform));
        self.dirty = true;
    }
    pub fn set_camera_transform(&mut self, camera_id: u32, transform: Transform2D) {
        if let Some((_, t)) = self.cameras.get_mut(&camera_id) {
            *t = transform;
            self.dirty = true;
        }
    }
    pub fn set_material(&mut self, material_id: u32, material: Material2D) {
        self.materials.insert(material_id, material);
        self.material_bind_groups.remove(&material_id);
        self.dirty = true;
    }
    pub fn set_sprite(&mut self, sprite_id: u32, sprite: Sprite2D, transform: Transform2D) {
        self.sprites.insert(sprite_id, (sprite, transform));
        self.dirty = true;
    }
    pub fn set_sprite_transform(&mut self, sprite_id: u32, transform: Transform2D) {
        if let Some((_, t)) = self.sprites.get_mut(&sprite_id) {
            *t = transform;
            self.dirty = true;
        }
    }
    pub fn set_shape(&mut self, shape_id: u32, shape: Shape2D, transform: Transform2D) {
        self.shapes.insert(shape_id, (shape, transform));
        self.dirty = true;
    }
    pub fn set_shape_transform(&mut self, shape_id: u32, transform: Transform2D) {
        if let Some((_, t)) = self.shapes.get_mut(&shape_id) {
            *t = transform;
            self.dirty = true;
        }
    }
    pub fn set_light(&mut self, light_id: u32, light: Light2D) {
        self.lights.insert(light_id, light);
        self.shadow_manager.mark_dirty();
        self.dirty = true;
    }
    pub fn set_light_transform(&mut self, light_id: u32, transform: Transform2D) {
        if let Some(light) = self.lights.get_mut(&light_id) {
            light.position = transform.position;
            light.z = transform.z_layer as f32;
            self.shadow_manager.mark_dirty();
            self.dirty = true;
        }
    }
    pub fn set_shadow_config(&mut self, config: Shadow2DConfig) {
        self.shadow_manager = ShadowManager2D::new(config);
        self.dirty = true;
    }

    fn ensure_gpu_resources(&mut self, device: &wgpu::Device, queue: &wgpu::Queue) {
        if self.pipeline_manager.is_some() {
            return;
        }

        let pipeline_manager = PipelineManager2D::new(device);

        #[rustfmt::skip]
        let quad_vertices: [f32; 36] = [
            -0.5, -0.5, 0.0,   0.0, 1.0,   1.0, 1.0, 1.0, 1.0,
             0.5, -0.5, 0.0,   1.0, 1.0,   1.0, 1.0, 1.0, 1.0,
             0.5,  0.5, 0.0,   1.0, 0.0,   1.0, 1.0, 1.0, 1.0,
            -0.5,  0.5, 0.0,   0.0, 0.0,   1.0, 1.0, 1.0, 1.0,
        ];
        let quad_indices: [u16; 6] = [0, 1, 2, 2, 3, 0];

        let quad_vertex_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("galfus_2d_quad_vbo"),
            size: std::mem::size_of_val(&quad_vertices) as u64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        queue.write_buffer(&quad_vertex_buffer, 0, cast_slice(&quad_vertices));

        let quad_index_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("galfus_2d_quad_ibo"),
            size: std::mem::size_of_val(&quad_indices) as u64,
            usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        queue.write_buffer(&quad_index_buffer, 0, cast_slice(&quad_indices));

        let camera_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("galfus_2d_camera_buffer"),
            size: std::mem::size_of::<Camera2DUniform>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let initial_instance_capacity = 1024;
        let instance_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("galfus_2d_instance_buffer"),
            size: (std::mem::size_of::<Item2DInstanceRaw>() * initial_instance_capacity) as u64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let initial_light_capacity = 64;
        let light_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("galfus_2d_light_buffer"),
            size: (std::mem::size_of::<Light2DUniform>() * initial_light_capacity) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let angular_res = self.shadow_manager.config.angular_resolution as usize;
        let shadow_sample_capacity =
            angular_res * initial_light_capacity * SHADOW_SAMPLES_PER_DIRECTION;
        let shadow_sample_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("galfus_2d_shadow_sample_buffer"),
            size: (std::mem::size_of::<ShadowSample2DRaw>() * shadow_sample_capacity) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let point_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("galfus_2d_point_sampler"),
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });

        let linear_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("galfus_2d_linear_sampler"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let fallback_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("galfus_2d_white_fallback_tex"),
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let fallback_texture_view =
            fallback_tex.create_view(&wgpu::TextureViewDescriptor::default());

        let fallback_material_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("galfus_2d_fallback_material_buf"),
            size: std::mem::size_of::<Material2DUniform>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let default_mat = Material2D::default().build_uniform();
        queue.write_buffer(
            &fallback_material_buffer,
            0,
            bytemuck::bytes_of(&default_mat),
        );

        let fallback_material_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("galfus_2d_fallback_mat_bg"),
            layout: &pipeline_manager.material_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: fallback_material_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&fallback_texture_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&linear_sampler),
                },
            ],
        });

        let global_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("galfus_2d_global_bg"),
            layout: &pipeline_manager.global_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: camera_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&point_sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&linear_sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: light_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: shadow_sample_buffer.as_entire_binding(),
                },
            ],
        });

        let default_shader_source = compile_2d_shader(None);
        let shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("galfus_2d_standard_shader"),
            source: wgpu::ShaderSource::Wgsl(default_shader_source.into()),
        });

        self.pipeline_manager = Some(pipeline_manager);
        self.quad_vertex_buffer = Some(quad_vertex_buffer);
        self.quad_index_buffer = Some(quad_index_buffer);
        self.camera_buffer = Some(camera_buffer);
        self.instance_buffer = Some(instance_buffer);
        self.light_buffer = Some(light_buffer);
        self.shadow_sample_buffer = Some(shadow_sample_buffer);
        self._point_sampler = Some(point_sampler);
        self.linear_sampler = Some(linear_sampler);
        self.fallback_texture_view = Some(fallback_texture_view);
        self.fallback_material_buffer = Some(fallback_material_buffer);
        self.fallback_material_bind_group = Some(fallback_material_bind_group);
        self.global_bind_group = Some(global_bind_group);
        self.shader_module = Some(shader_module);
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
        let device = ctx.device;
        let queue = ctx.queue;
        self.ensure_gpu_resources(device, queue);

        // Sync materials
        let pipeline_manager = self.pipeline_manager.as_ref().unwrap();
        let linear_sampler = self.linear_sampler.as_ref().unwrap();
        let fallback_view = self.fallback_texture_view.as_ref().unwrap();

        for (&mat_id, mat) in &self.materials {
            if !self.material_bind_groups.contains_key(&mat_id) {
                let uniform = mat.build_uniform();
                let buf = device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some(&format!("galfus_2d_mat_buf_{mat_id}")),
                    size: std::mem::size_of::<Material2DUniform>() as u64,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });
                queue.write_buffer(&buf, 0, bytemuck::bytes_of(&uniform));

                let bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some(&format!("galfus_2d_mat_bg_{mat_id}")),
                    layout: &pipeline_manager.material_bind_group_layout,
                    entries: &[
                        wgpu::BindGroupEntry {
                            binding: 0,
                            resource: buf.as_entire_binding(),
                        },
                        wgpu::BindGroupEntry {
                            binding: 1,
                            resource: wgpu::BindingResource::TextureView(fallback_view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 2,
                            resource: wgpu::BindingResource::Sampler(linear_sampler),
                        },
                    ],
                });

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
                let boundary = shape.compute_world_boundary(transform);
                if boundary.len() >= 4 {
                    let quad = [boundary[0], boundary[1], boundary[2], boundary[3]];
                    occluders.push(Occluder2D {
                        entity_id: id,
                        silhouette: OccluderSilhouette2D::from_quad(quad),
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
                let s = shadow_idx;
                shadow_idx += 1;
                s
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

        if !light_uniforms.is_empty() {
            let buf = self.light_buffer.as_ref().unwrap();
            queue.write_buffer(buf, 0, cast_slice(&light_uniforms));
        }

        if !all_shadow_samples.is_empty() {
            let buf = self.shadow_sample_buffer.as_ref().unwrap();
            queue.write_buffer(buf, 0, cast_slice(&all_shadow_samples));
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
        );
        if let Some(buf) = &self.camera_buffer {
            queue.write_buffer(buf, 0, bytemuck::bytes_of(&camera_uniform));
        }

        let instances = self.batch_builder.instances();
        let ranges = self.batch_builder.ranges();
        if instances.is_empty() {
            return Ok(());
        }

        // Upload instance buffer
        let required_bytes = std::mem::size_of_val(instances) as u64;
        if let Some(buf) = &self.instance_buffer
            && buf.size() < required_bytes
        {
            self.instance_buffer = Some(device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("galfus_2d_instance_buf_resized"),
                size: required_bytes.max(1024),
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }));
        }
        let instance_buf = self.instance_buffer.as_ref().unwrap();
        queue.write_buffer(instance_buf, 0, cast_slice(instances));

        let quad_vbo = self.quad_vertex_buffer.as_ref().unwrap();
        let quad_ibo = self.quad_index_buffer.as_ref().unwrap();
        let global_bg = self.global_bind_group.as_ref().unwrap();
        let shader_module = self.shader_module.as_ref().unwrap();
        let fallback_mat_bg = self.fallback_material_bind_group.as_ref().unwrap();

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

            rpass.set_viewport(
                ctx.viewport.x as f32,
                ctx.viewport.y as f32,
                ctx.viewport.z as f32,
                ctx.viewport.w as f32,
                0.0,
                1.0,
            );
            rpass.set_vertex_buffer(0, quad_vbo.slice(..));
            rpass.set_vertex_buffer(1, instance_buf.slice(..));
            rpass.set_index_buffer(quad_ibo.slice(..), wgpu::IndexFormat::Uint16);
            rpass.set_bind_group(0, global_bg, &[]);

            let pipeline_mgr = self.pipeline_manager.as_mut().unwrap();
            for range in ranges {
                let key = PipelineKey2D {
                    surface_type: range.key.surface_type,
                    target_format: ctx.target_format,
                    sample_count: 1,
                };
                let pipe = pipeline_mgr.get_or_create_pipeline(device, shader_module, key);
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
