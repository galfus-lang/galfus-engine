use crate::batch::{BatchBuilder2D, PreparedItem2D};
use crate::gpu::GpuResources2D;
use crate::pipeline::{PipelineKey2D, PipelineManager2D};
use crate::shadow::ShadowManager2D;
use crate::types::{
    BatchKey2D, Camera2D, Item2DInstanceRaw, Light2D, Material2D, Material2DUniform, Model2DUI,
    ParticleEmitter2D, ParticleEmitterState2D, Shape2D, Sprite2D, Transform2D,
};
use bytemuck::cast_slice;
use galfus_realm_core::{
    Realm, RealmInvocationContext, RealmKind, RealmPrepareContext, RealmResult,
};
use glam::{Vec2, Vec4};
use std::collections::{BTreeMap, HashMap};

/// Runtime 2D rendering context managing GPU buffers, pipelines, materials, and batch execution.
pub struct Realm2DContext {
    pub id: u32,
    pub cameras: BTreeMap<u32, (Camera2D, Transform2D)>,
    pub sprites: HashMap<u32, (Sprite2D, Transform2D)>,
    pub shapes: HashMap<u32, (Shape2D, Transform2D)>,
    pub materials: HashMap<u32, Material2D>,
    pub lights: HashMap<u32, Light2D>,
    pub emitters: HashMap<u32, (ParticleEmitter2D, Transform2D, ParticleEmitterState2D)>,
    pub ui_manager: crate::context_ui::UiManager2D,
    pub(crate) ui_fonts: crate::ui_fonts::UiFontLibrary,
    pub uis: HashMap<u32, (Model2DUI, Transform2D)>,
    pub colliders: HashMap<u32, galfus_realm_core::Collider2D>,
    pub model_transforms: HashMap<u32, Transform2D>,
    pub dirty: bool,

    pub pipeline_manager: Option<PipelineManager2D>,
    pub batch_builder: BatchBuilder2D,
    pub shadow_manager: ShadowManager2D,
    pub(crate) shadow_data: crate::context_shadows::ShadowFrameData,
    pub gpu_res: Option<GpuResources2D>,

    pub(crate) total_time: f32,
    pub(crate) material_bind_groups: HashMap<u32, wgpu::BindGroup>,
    pub(crate) material_uniform_buffers: HashMap<u32, wgpu::Buffer>,
    pub(crate) material_texture_slots: HashMap<u32, [Option<u32>; 8]>,
}

impl Realm2DContext {
    pub fn new(id: u32) -> Self {
        Self {
            id,
            cameras: BTreeMap::new(),
            sprites: HashMap::new(),
            shapes: HashMap::new(),
            materials: HashMap::new(),
            lights: HashMap::new(),
            emitters: HashMap::new(),
            ui_manager: crate::context_ui::UiManager2D::new(),
            ui_fonts: crate::ui_fonts::UiFontLibrary::default(),
            uis: HashMap::new(),
            colliders: HashMap::new(),
            model_transforms: HashMap::new(),
            dirty: true,
            pipeline_manager: None,
            batch_builder: BatchBuilder2D::new(),
            shadow_manager: ShadowManager2D::default(),
            shadow_data: crate::context_shadows::ShadowFrameData::default(),
            gpu_res: None,
            total_time: 0.0,
            material_bind_groups: HashMap::new(),
            material_uniform_buffers: HashMap::new(),
            material_texture_slots: HashMap::new(),
        }
    }

    pub fn font_db(&self) -> &fontdb::Database {
        &self.ui_fonts.database
    }

    pub fn default_font_family(&self) -> &str {
        &self.ui_fonts.default_family
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

    /// Returns the number of active sprites currently registered in this realm.
    #[inline]
    pub fn sprite_count(&self) -> usize {
        self.sprites.len()
    }

    /// Returns the number of active shapes currently registered in this realm.
    #[inline]
    pub fn shape_count(&self) -> usize {
        self.shapes.len()
    }
}

impl Realm for Realm2DContext {
    fn id(&self) -> u32 {
        self.id
    }

    fn kind(&self) -> RealmKind {
        RealmKind::TwoD
    }

    fn clear(&mut self) -> RealmResult<()> {
        self.cameras.clear();
        self.sprites.clear();
        self.shapes.clear();
        self.colliders.clear();
        self.model_transforms.clear();
        self.uis.clear();
        self.ui_manager.clear();
        self.materials.clear();
        self.lights.clear();
        self.emitters.clear();
        self.material_bind_groups.clear();
        self.material_uniform_buffers.clear();
        self.material_texture_slots.clear();
        self.shadow_data = crate::context_shadows::ShadowFrameData::default();
        self.shadow_manager.mark_dirty();
        self.dirty = true;
        Ok(())
    }

    fn destroy(&mut self) -> RealmResult<()> {
        self.clear()?;
        self.pipeline_manager = None;
        self.gpu_res = None;
        Ok(())
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
            let uniform = mat.build_uniform();
            let buf = self
                .material_uniform_buffers
                .entry(mat_id)
                .or_insert_with(|| {
                    crate::gpu::create_gpu_buffer(
                        device,
                        &format!("galfus_2d_mat_buf_{mat_id}"),
                        std::mem::size_of::<Material2DUniform>() as u64,
                        wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    )
                });
            queue.write_buffer(buf, 0, bytemuck::bytes_of(&uniform));

            let resolved_slots = mat.resolved_texture_slots();
            let slots_changed = self.material_texture_slots.get(&mat_id) != Some(&resolved_slots);
            if slots_changed || !self.material_bind_groups.contains_key(&mat_id) {
                let bg = crate::gpu::create_material_bind_group_2d(
                    device,
                    &pipeline_manager.material_bind_group_layout,
                    &gpu_res.samplers,
                    &gpu_res.fallback_texture_view,
                    &gpu_res.fallback_normal_view,
                    &gpu_res.fallback_black_view,
                    buf,
                    &resolved_slots,
                    ctx.textures,
                );
                self.material_bind_groups.insert(mat_id, bg);
                self.material_texture_slots.insert(mat_id, resolved_slots);
            }
        }

        // Pre-solve UI layout before syncing GPU vector geometry
        for (ui, _) in self.uis.values_mut() {
            let layout_flags = galfus_realm_2d_resources::ui::UiDirtyFlags::LAYOUT
                | galfus_realm_2d_resources::ui::UiDirtyFlags::TEXT_MEASURE
                | galfus_realm_2d_resources::ui::UiDirtyFlags::HIERARCHY
                | galfus_realm_2d_resources::ui::UiDirtyFlags::CLIP_TRANSFORM;
            if ui.root_id.is_some()
                && (ui.computed.is_empty()
                    || ui.dirty_flags.values().any(|f| f.0 & layout_flags != 0))
            {
                let (w, h) = crate::context_ui::compute_ui_dimensions(ui);
                crate::ui_layout::solve_ui_layout(
                    ui,
                    &self.ui_fonts.database,
                    &self.ui_fonts.default_family,
                    w,
                    h,
                );
            }
        }

        // Sync UIs
        self.ui_manager.sync_gpu(
            device,
            queue,
            &pipeline_manager.material_bind_group_layout,
            &gpu_res.samplers,
            &gpu_res.fallback_texture_view,
            &gpu_res.fallback_normal_view,
            &gpu_res.fallback_black_view,
            ctx.textures,
            &self.uis,
            &mut self.material_bind_groups,
            &self.ui_fonts,
        );
        for (ui, _) in self.uis.values_mut() {
            for flags in ui.dirty_flags.values_mut() {
                flags.remove(galfus_realm_2d_resources::ui::UiDirtyFlags::PAINT);
            }
        }

        self.prepare_shadows(device, queue);

        // Build item batches
        self.batch_builder.clear();
        for (&id, (sprite, transform)) in &self.sprites {
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

            let draw_order = sprite.draw_order.unwrap_or(transform.draw_order);
            self.batch_builder.push(PreparedItem2D {
                order: (id, 0, 0),
                key: BatchKey2D {
                    z_layer: transform.z_layer,
                    draw_order,
                    surface_type: self
                        .materials
                        .get(&sprite.material_id.unwrap_or(0))
                        .map_or(1, Material2D::surface_type_id),
                    material_id: sprite.material_id.unwrap_or(0),
                    geometry_id: 0,
                },
                instance,
                occluder_only: sprite.occluder_only,
            });
        }

        for (&id, (shape, transform)) in &self.shapes {
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

            let draw_order = shape.draw_order.unwrap_or(transform.draw_order);
            self.batch_builder.push(PreparedItem2D {
                order: (id, 1, 0),
                key: BatchKey2D {
                    z_layer: transform.z_layer,
                    draw_order,
                    surface_type: self
                        .materials
                        .get(&shape.material_id.unwrap_or(0))
                        .map_or(1, Material2D::surface_type_id),
                    material_id: shape.material_id.unwrap_or(0),
                    geometry_id: 0,
                },
                instance,
                occluder_only: shape.occluder_only,
            });
        }

        for (&id, (cfg, transform, state)) in &self.emitters {
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
                    order: (id, 2, 0),
                    key: BatchKey2D {
                        z_layer: transform.z_layer,
                        draw_order: transform.draw_order,
                        surface_type,
                        material_id,
                        geometry_id: 0,
                    },
                    instance,
                    occluder_only: false,
                });
            }
        }

        self.ui_manager
            .push_batches(&self.uis, &mut self.batch_builder);

        self.batch_builder.build();
        self.dirty = false;
        Ok(())
    }

    fn render(&mut self, ctx: &RealmInvocationContext<'_>) -> RealmResult<()> {
        let device = ctx.device;
        let queue = ctx.queue;

        // Resolve camera strictly by requested slot, or default slot 0 if none specified (no arbitrary fallback)
        let selected_camera = if let Some(slot) = ctx.camera_slot {
            self.cameras
                .iter()
                .find(|(id, (c, _))| c.active && (c.camera_slot == slot || **id == slot))
                .map(|(_, pair)| pair)
        } else {
            self.cameras
                .values()
                .find(|(c, _)| c.active && c.camera_slot == 0)
        };

        let Some((camera, camera_transform)) = selected_camera else {
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

            let mut current_geo_id = 0u64;
            let pipeline_mgr = self.pipeline_manager.as_mut().unwrap();
            for range in ranges {
                if range.key.geometry_id != current_geo_id {
                    current_geo_id = range.key.geometry_id;
                    if current_geo_id == 0 {
                        rpass.set_vertex_buffer(0, quad_vbo.slice(..));
                        rpass.set_index_buffer(quad_ibo.slice(..), wgpu::IndexFormat::Uint16);
                    } else if let Some(mesh) = self.ui_manager.get_geometry_by_u64(current_geo_id) {
                        rpass.set_vertex_buffer(0, mesh.vertex_buffer.slice(..));
                        rpass.set_index_buffer(
                            mesh.index_buffer.slice(..),
                            wgpu::IndexFormat::Uint32,
                        );
                    }
                }

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

                if current_geo_id == 0 {
                    rpass.draw_indexed(0..6, 0, range.start..(range.start + range.count));
                } else if let Some(mesh) = self.ui_manager.get_geometry_by_u64(current_geo_id) {
                    rpass.draw_indexed(
                        0..mesh.index_count,
                        0,
                        range.start..(range.start + range.count),
                    );
                }
            }
        }

        queue.submit(Some(encoder.finish()));
        Ok(())
    }

    fn referenced_texture_ids(&self) -> Vec<u32> {
        self.collect_referenced_texture_ids()
    }

    fn pick_2d(
        &self,
        camera_slot: Option<u32>,
        world_pos: glam::Vec2,
    ) -> Option<galfus_realm_core::HitResult2D> {
        self.perform_pick_2d(camera_slot, world_pos)
    }

    fn viewport_point_2d(
        &self,
        camera_slot: Option<u32>,
        position: Vec2,
        size: Vec2,
    ) -> Option<Vec2> {
        if size.x <= 0.0 || size.y <= 0.0 {
            return None;
        }
        let (ortho_scale, cam_pos, cam_rot) = if let Some(slot) = camera_slot {
            self.cameras
                .iter()
                .find(|(id, (c, _))| c.active && (c.camera_slot == slot || **id == slot))
                .map(|(_, (c, tf))| (c.ortho_scale, tf.position, tf.rotation))?
        } else {
            self.cameras
                .values()
                .find(|(c, _)| c.active && c.camera_slot == 0)
                .map(|(c, tf)| (c.ortho_scale, tf.position, tf.rotation))
                .unwrap_or((size.y, Vec2::ZERO, 0.0))
        };

        let local = Vec2::new(
            (position.x / size.x - 0.5) * ortho_scale * size.x / size.y,
            (0.5 - position.y / size.y) * ortho_scale,
        );
        Some(cam_pos + glam::Mat2::from_angle(cam_rot) * local)
    }

    fn has_interactive_collider(&self, model_id: u32, collider_id: u32) -> bool {
        self.colliders
            .get(&collider_id)
            .is_some_and(|c| c.model_id == model_id && c.active)
    }

    fn has_interactive_element(&self, model_id: u32, element_id: u32) -> bool {
        self.uis
            .get(&model_id)
            .is_some_and(|(ui, _)| ui.is_interactive_panel(element_id))
    }

    fn scroll_ui_element(&mut self, model_id: u32, element_id: u32, delta: [f32; 2]) {
        if let Some((ui, _)) = self.uis.get_mut(&model_id)
            && crate::ui_scroll::scroll_element(ui, element_id, delta)
        {
            self.dirty = true;
        }
    }

    fn has_collider(&self, model_id: u32, collider_id: u32) -> bool {
        self.colliders
            .get(&collider_id)
            .is_some_and(|c| c.model_id == model_id)
    }

    fn supports_interaction_surface(&self, model_id: u32, collider_id: u32) -> bool {
        self.has_collider(model_id, collider_id)
    }

    fn snapshot_interaction(&self) -> Option<Box<dyn Realm>> {
        self.build_interaction_snapshot()
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }
}

#[cfg(test)]
#[path = "context_tests.rs"]
mod tests;
