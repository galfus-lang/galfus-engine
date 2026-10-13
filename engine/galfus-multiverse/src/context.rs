use std::collections::HashMap;
use std::sync::Arc;

use galfus_core::id::validate_host_logical_id;
use galfus_gpu_manager::handle::{GpuTextureHandle, GpuTextureViewHandle};
use galfus_gpu_manager::types::{
    GpuPresentMode, GpuTextureDesc, NormalizedTextureFormat, TextureDimension, TextureUsageFlags,
};
use galfus_gpu_manager::{GpuManager, GpuSurface};
use galfus_realm_core::{Realm, RealmInvocationContext, RealmPrepareContext};
use glam::UVec2;

use crate::error::{MultiverseError, MultiverseResult};
use crate::postprocess::{FilterPassDesc, PostProcessor};
use crate::resolver::resolve_schedule;
use crate::schedule::MultiverseSchedule;
use crate::types::{
    InvocationDesc, InvocationFilter, TargetDesc, TargetKind, TargetTextureBinding, ViewportRect,
};

/// Central Multiverse Context coordinating targets, realms, and invocation scheduling.
pub struct MultiverseContext {
    targets: HashMap<u32, TargetDesc>,
    realms: HashMap<u32, Box<dyn Realm>>,
    invocations: HashMap<u32, InvocationDesc>,
    bindings: Vec<TargetTextureBinding>,
    window_sizes: HashMap<u32, UVec2>,

    // Internal GPU state (encapsulated, not exposed to host)
    gpu_manager: Option<GpuManager>,
    surfaces: HashMap<u32, GpuSurface>,
    target_textures: HashMap<u32, (GpuTextureHandle, GpuTextureViewHandle, wgpu::TextureFormat)>,
    scratch_texture: Option<(GpuTextureHandle, GpuTextureViewHandle, UVec2)>,
    post_processor: Option<PostProcessor>,

    /// Cached resolved schedule.
    cached_schedule: Option<MultiverseSchedule>,
    /// Dirty flag indicating graph mutations requiring recalculation.
    dirty: bool,
}

impl Default for MultiverseContext {
    fn default() -> Self {
        Self::new()
    }
}

impl MultiverseContext {
    /// Creates a new empty `MultiverseContext`.
    pub fn new() -> Self {
        Self {
            targets: HashMap::new(),
            realms: HashMap::new(),
            invocations: HashMap::new(),
            bindings: Vec::new(),
            window_sizes: HashMap::new(),
            gpu_manager: None,
            surfaces: HashMap::new(),
            target_textures: HashMap::new(),
            scratch_texture: None,
            post_processor: None,
            cached_schedule: None,
            dirty: true,
        }
    }

    /// Internal helper ensuring GpuManager is initialized.
    fn ensure_gpu_manager(&mut self) -> MultiverseResult<&mut GpuManager> {
        if self.gpu_manager.is_none() {
            let gpu = GpuManager::new_headless()
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            self.post_processor = Some(PostProcessor::new(gpu.device()));
            self.gpu_manager = Some(gpu);
        }
        Ok(self.gpu_manager.as_mut().unwrap())
    }

    /// Attaches a platform window to this Multiverse context, configuring a swapchain GPU surface.
    pub fn attach_window<W>(
        &mut self,
        window_id: u32,
        window: Arc<W>,
        width: u32,
        height: u32,
    ) -> MultiverseResult<()>
    where
        W: wgpu::rwh::HasWindowHandle + wgpu::rwh::HasDisplayHandle + Send + Sync + 'static,
    {
        validate_host_logical_id(window_id)?;

        let (gpu, surface) = if let Some(gpu) = &self.gpu_manager {
            let surface = gpu
                .context
                .instance()
                .create_surface(Arc::clone(&window))
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            (gpu, surface)
        } else {
            let instance = Arc::new(wgpu::Instance::new(&wgpu::InstanceDescriptor::default()));
            let surface = instance
                .create_surface(Arc::clone(&window))
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            let gpu = GpuManager::with_instance(Arc::clone(&instance), Some(&surface))
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            self.post_processor = Some(PostProcessor::new(gpu.device()));
            self.gpu_manager = Some(gpu);
            (self.gpu_manager.as_ref().unwrap(), surface)
        };

        let gpu_surface = GpuSurface::new(
            surface,
            gpu.context.adapter(),
            gpu.device(),
            width,
            height,
            GpuPresentMode::AutoVsync,
        )
        .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;

        self.surfaces.insert(window_id, gpu_surface);
        self.window_sizes
            .insert(window_id, UVec2::new(width, height));
        self.dirty = true;
        Ok(())
    }

    /// Registers a custom WGSL post-processing shader with an ID.
    pub fn register_shader(&mut self, shader_id: u32, source: &str) -> MultiverseResult<()> {
        validate_host_logical_id(shader_id)?;
        self.ensure_gpu_manager()?;
        if let (Some(gpu), Some(post)) = (&self.gpu_manager, &mut self.post_processor) {
            post.register_custom_shader(gpu.device(), shader_id, source)?;
        }
        Ok(())
    }

    /// Registers a new Target (Window or Texture) under a host logical ID.
    pub fn create_target(&mut self, target_id: u32, desc: TargetDesc) -> MultiverseResult<()> {
        validate_host_logical_id(target_id)?;
        if self.targets.contains_key(&target_id) {
            return Err(MultiverseError::TargetAlreadyExists(target_id));
        }

        if let TargetKind::Texture { width, height, .. } = &desc.kind {
            let gpu = self.ensure_gpu_manager()?;
            let tex_desc = GpuTextureDesc {
                label: Some(format!("Multiverse Target {target_id}")),
                width: *width,
                height: *height,
                depth_or_layers: 1,
                mip_levels: 1,
                sample_count: 1,
                dimension: TextureDimension::D2,
                format: NormalizedTextureFormat::Rgba8Unorm,
                usages: TextureUsageFlags::default(),
            };
            let device = gpu.context.device_arc();
            let tex_handle = gpu
                .textures
                .create_texture(&device, &tex_desc)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            let view_handle = gpu
                .textures
                .get_texture(tex_handle)
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                .default_view();
            self.target_textures.insert(
                target_id,
                (tex_handle, view_handle, wgpu::TextureFormat::Rgba8Unorm),
            );
        }

        self.targets.insert(target_id, desc);
        self.dirty = true;
        Ok(())
    }

    /// Destroys a Target and removes associated invocations, connectors, bindings, and GPU resources.
    pub fn destroy_target(&mut self, target_id: u32) -> MultiverseResult<()> {
        if self.targets.remove(&target_id).is_none() {
            return Err(MultiverseError::TargetNotFound(target_id));
        }
        if let (Some((tex_handle, _, _)), Some(gpu)) = (
            self.target_textures.remove(&target_id),
            &mut self.gpu_manager,
        ) {
            let _ = gpu.textures.destroy_texture(tex_handle);
        }
        self.invocations.retain(|_, inv| inv.target_id != target_id);
        self.bindings.retain(|b| b.source_target_id != target_id);
        self.dirty = true;
        Ok(())
    }

    /// Registers a Realm implementation under its logical ID.
    pub fn register_realm(&mut self, realm: Box<dyn Realm>) -> MultiverseResult<()> {
        let realm_id = realm.id();
        validate_host_logical_id(realm_id)?;
        if self.realms.contains_key(&realm_id) {
            return Err(MultiverseError::RealmAlreadyRegistered(realm_id));
        }
        self.realms.insert(realm_id, realm);
        self.dirty = true;
        Ok(())
    }

    /// Registers a builtin ColorRealm for solid clear/tinting under its logical ID.
    pub fn register_color_realm(&mut self, realm_id: u32, color: [f32; 4]) -> MultiverseResult<()> {
        let realm = galfus_realm_core::ColorRealm::new(realm_id, color);
        self.register_realm(Box::new(realm))
    }

    /// Unregisters a Realm and clears associated invocations.
    pub fn unregister_realm(&mut self, realm_id: u32) -> MultiverseResult<()> {
        if self.realms.remove(&realm_id).is_none() {
            return Err(MultiverseError::RealmNotFound(realm_id));
        }
        self.invocations.retain(|_, inv| inv.realm_id != realm_id);
        self.bindings.retain(|b| b.realm_id != realm_id);
        self.dirty = true;
        Ok(())
    }

    /// Creates an invocation linking a Realm to a Target.
    pub fn create_invocation(
        &mut self,
        invocation_id: u32,
        desc: InvocationDesc,
    ) -> MultiverseResult<()> {
        validate_host_logical_id(invocation_id)?;
        if self.invocations.contains_key(&invocation_id) {
            return Err(MultiverseError::InvocationAlreadyExists(invocation_id));
        }
        if !self.realms.contains_key(&desc.realm_id) {
            return Err(MultiverseError::RealmNotFound(desc.realm_id));
        }
        if !self.targets.contains_key(&desc.target_id) {
            return Err(MultiverseError::TargetNotFound(desc.target_id));
        }
        self.invocations.insert(invocation_id, desc);
        self.dirty = true;
        Ok(())
    }

    /// Destroys an invocation.
    pub fn destroy_invocation(&mut self, invocation_id: u32) -> MultiverseResult<()> {
        if self.invocations.remove(&invocation_id).is_none() {
            return Err(MultiverseError::InvocationNotFound(invocation_id));
        }
        self.dirty = true;
        Ok(())
    }

    /// Enables or disables an invocation without removing it.
    pub fn set_invocation_enabled(
        &mut self,
        invocation_id: u32,
        enabled: bool,
    ) -> MultiverseResult<()> {
        let inv = self
            .invocations
            .get_mut(&invocation_id)
            .ok_or(MultiverseError::InvocationNotFound(invocation_id))?;
        if inv.enabled != enabled {
            inv.enabled = enabled;
            self.dirty = true;
        }
        Ok(())
    }

    /// Updates the post-processing filter chain for an existing invocation.
    pub fn set_invocation_filters(
        &mut self,
        invocation_id: u32,
        filters: Vec<InvocationFilter>,
    ) -> MultiverseResult<()> {
        let inv = self
            .invocations
            .get_mut(&invocation_id)
            .ok_or(MultiverseError::InvocationNotFound(invocation_id))?;
        inv.filters = filters;
        self.dirty = true;
        Ok(())
    }

    /// Updates the viewport for an existing invocation.
    pub fn set_invocation_viewport(
        &mut self,
        invocation_id: u32,
        viewport: ViewportRect,
    ) -> MultiverseResult<()> {
        let inv = self
            .invocations
            .get_mut(&invocation_id)
            .ok_or(MultiverseError::InvocationNotFound(invocation_id))?;
        inv.viewport = viewport;
        self.dirty = true;
        Ok(())
    }

    /// Updates the camera slot bound to an existing invocation.
    pub fn set_invocation_camera_slot(
        &mut self,
        invocation_id: u32,
        camera_slot: Option<u32>,
    ) -> MultiverseResult<()> {
        let inv = self
            .invocations
            .get_mut(&invocation_id)
            .ok_or(MultiverseError::InvocationNotFound(invocation_id))?;
        if inv.camera_slot != camera_slot {
            inv.camera_slot = camera_slot;
            self.dirty = true;
        }
        Ok(())
    }

    /// Binds a Target's output texture to a Realm slot (e.g. portal surface material).
    pub fn bind_target_texture(&mut self, binding: TargetTextureBinding) -> MultiverseResult<()> {
        if !self.targets.contains_key(&binding.source_target_id) {
            return Err(MultiverseError::TargetNotFound(binding.source_target_id));
        }
        if !self.realms.contains_key(&binding.realm_id) {
            return Err(MultiverseError::RealmNotFound(binding.realm_id));
        }
        self.bindings
            .retain(|b| !(b.realm_id == binding.realm_id && b.slot == binding.slot));
        self.bindings.push(binding);
        self.dirty = true;
        Ok(())
    }

    /// Unbinds a Target texture from a Realm slot.
    pub fn unbind_target_texture(&mut self, realm_id: u32, slot: &str) -> MultiverseResult<()> {
        self.bindings
            .retain(|b| !(b.realm_id == realm_id && b.slot == slot));
        self.dirty = true;
        Ok(())
    }

    /// Updates the clear color for an invocation dynamically.
    pub fn set_invocation_clear_color(
        &mut self,
        invocation_id: u32,
        clear_color: Option<[f32; 4]>,
    ) -> MultiverseResult<()> {
        let inv = self
            .invocations
            .get_mut(&invocation_id)
            .ok_or(MultiverseError::InvocationNotFound(invocation_id))?;
        if inv.clear_color != clear_color {
            inv.clear_color = clear_color;
            self.dirty = true;
        }
        Ok(())
    }

    /// Updates the known size for a window target (usually updated on window resize event).
    pub fn update_window_size(&mut self, window_id: u32, size: UVec2) {
        self.window_sizes.insert(window_id, size);
        if let (Some(gpu), Some(surface)) = (&self.gpu_manager, self.surfaces.get_mut(&window_id)) {
            surface.resize(gpu.device(), size.x, size.y);
        }
        self.dirty = true;
    }

    /// Resolves and returns the execution schedule, caching the result until the graph is mutated.
    pub fn resolve(&mut self) -> MultiverseResult<&MultiverseSchedule> {
        if self.dirty || self.cached_schedule.is_none() {
            let schedule = resolve_schedule(
                &self.targets,
                &self.invocations,
                &self.bindings,
                &self.window_sizes,
            )?;
            self.cached_schedule = Some(schedule);
            self.dirty = false;
        }
        Ok(self.cached_schedule.as_ref().unwrap())
    }

    /// Dispatches a frame by preparing realms and rendering active invocations and connectors in scheduled order.
    pub fn dispatch(&mut self, frame_id: u64, delta_time: f32) -> MultiverseResult<()> {
        let schedule = self.resolve()?.clone();

        // 1. Prepare all active realms once
        let prep_ctx = RealmPrepareContext {
            frame_id,
            delta_time,
        };
        for realm in self.realms.values_mut() {
            realm
                .prepare(&prep_ctx)
                .map_err(|e| MultiverseError::RealmError(realm.id(), e.to_string()))?;
        }

        // 2. GPU execution path if GpuManager is active
        if let Some(gpu) = &mut self.gpu_manager {
            let mut surface_textures: HashMap<u32, wgpu::SurfaceTexture> = HashMap::new();
            let mut scratch = self.scratch_texture.take();

            for block in &schedule.target_blocks {
                let target = self.targets.get(&block.target_id);

                let (target_view, target_format, target_size) = match target.map(|t| &t.kind) {
                    Some(TargetKind::Window { window_id }) => {
                        if let Some(surface) = self.surfaces.get(window_id) {
                            let surface_tex = surface
                                .acquire_current_texture()
                                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
                            let view = surface_tex
                                .texture
                                .create_view(&wgpu::TextureViewDescriptor::default());
                            let format = surface.format();
                            let size = surface.size();
                            surface_textures.insert(*window_id, surface_tex);
                            (Some(view), Some(format), size)
                        } else {
                            (None, None, UVec2::new(1, 1))
                        }
                    }
                    Some(TargetKind::Texture { width, height, .. }) => {
                        let size = UVec2::new(*width, *height);
                        if let Some((_, view_handle, format)) =
                            self.target_textures.get(&block.target_id)
                        {
                            if let Ok(tex_view) = gpu.textures.get_view(*view_handle) {
                                (Some(tex_view.raw().clone()), Some(*format), size)
                            } else {
                                (None, None, size)
                            }
                        } else {
                            (None, None, size)
                        }
                    }
                    None => (None, None, UVec2::new(1, 1)),
                };

                // Clear target surface once at the start of the target block
                if let Some(view) = &target_view {
                    let mut encoder =
                        gpu.device()
                            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                                label: Some("Target Initial Clear Encoder"),
                            });
                    {
                        let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                            label: Some("Target Initial Clear Pass"),
                            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                view,
                                resolve_target: None,
                                ops: wgpu::Operations {
                                    load: wgpu::LoadOp::Clear(wgpu::Color {
                                        r: 0.02,
                                        g: 0.02,
                                        b: 0.02,
                                        a: 1.0,
                                    }),
                                    store: wgpu::StoreOp::Store,
                                },
                                depth_slice: None,
                            })],
                            depth_stencil_attachment: None,
                            timestamp_writes: None,
                            occlusion_query_set: None,
                            multiview_mask: None,
                        });
                    }
                    gpu.queue().submit(Some(encoder.finish()));
                }

                // Execute Invocations
                for step in &block.invocations {
                    let vp = step.resolved_viewport;
                    let width = vp.z.max(1);
                    let height = vp.w.max(1);

                    // Ensure scratch texture matches invocation viewport size
                    if let Some((old_tex, _, size)) = scratch
                        && size != UVec2::new(width, height)
                    {
                        let _ = gpu.textures.destroy_texture(old_tex);
                        scratch = None;
                    }
                    if scratch.is_none() {
                        let tex_desc = GpuTextureDesc {
                            label: Some("Multiverse Invocation Scratch Texture".to_string()),
                            width,
                            height,
                            depth_or_layers: 1,
                            mip_levels: 1,
                            sample_count: 1,
                            dimension: TextureDimension::D2,
                            format: NormalizedTextureFormat::Rgba8Unorm,
                            usages: TextureUsageFlags::default(),
                        };
                        let device = gpu.context.device_arc();
                        let tex_h = gpu
                            .textures
                            .create_texture(&device, &tex_desc)
                            .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
                        let view_h = gpu
                            .textures
                            .get_texture(tex_h)
                            .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                            .default_view();
                        scratch = Some((tex_h, view_h, UVec2::new(width, height)));
                    }

                    let (_, scratch_view_h, _) = scratch.as_ref().unwrap();
                    let scratch_view = gpu
                        .textures
                        .get_view(*scratch_view_h)
                        .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?
                        .raw()
                        .clone();

                    // Clear scratch texture with invocation clear color
                    let clear = step.clear_color.unwrap_or([0.0, 0.0, 0.0, 1.0]);
                    let mut encoder =
                        gpu.device()
                            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                                label: Some("Invocation Clear Encoder"),
                            });
                    {
                        let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                            label: Some("Invocation Clear Pass"),
                            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                view: &scratch_view,
                                resolve_target: None,
                                ops: wgpu::Operations {
                                    load: wgpu::LoadOp::Clear(wgpu::Color {
                                        r: clear[0] as f64,
                                        g: clear[1] as f64,
                                        b: clear[2] as f64,
                                        a: clear[3] as f64,
                                    }),
                                    store: wgpu::StoreOp::Store,
                                },
                                depth_slice: None,
                            })],
                            depth_stencil_attachment: None,
                            timestamp_writes: None,
                            occlusion_query_set: None,
                            multiview_mask: None,
                        });
                    }
                    gpu.queue().submit(Some(encoder.finish()));

                    // Invoke realm render
                    if let Some(realm) = self.realms.get_mut(&step.realm_id) {
                        let inv_ctx = RealmInvocationContext {
                            frame_id,
                            invocation_id: step.invocation_id,
                            target_id: block.target_id,
                            camera_slot: step.camera_slot,
                            viewport: step.resolved_viewport,
                        };
                        realm
                            .render(&inv_ctx)
                            .map_err(|e| MultiverseError::RealmError(realm.id(), e.to_string()))?;
                    }

                    // Composite scratch texture into target_view with filter at viewport vp
                    if let (Some(target_v), Some(target_fmt), Some(post_proc)) =
                        (&target_view, target_format, &mut self.post_processor)
                    {
                        let filter = step.filters.first();
                        let pass_desc = FilterPassDesc {
                            src_view: &scratch_view,
                            dst_view: target_v,
                            dst_format: target_fmt,
                            dst_size: target_size,
                            viewport: Some(vp),
                        };
                        post_proc.render_filter(gpu.device(), gpu.queue(), filter, &pass_desc)?;
                    }
                }
            }

            self.scratch_texture = scratch;

            // Present all active window swapchains
            for (_, surface_tex) in surface_textures {
                surface_tex.present();
            }
        } else {
            // Mock headless fallback without GPU
            for block in &schedule.target_blocks {
                for step in &block.invocations {
                    if let Some(realm) = self.realms.get_mut(&step.realm_id) {
                        let inv_ctx = RealmInvocationContext {
                            frame_id,
                            invocation_id: step.invocation_id,
                            target_id: block.target_id,
                            camera_slot: step.camera_slot,
                            viewport: step.resolved_viewport,
                        };
                        realm
                            .render(&inv_ctx)
                            .map_err(|e| MultiverseError::RealmError(realm.id(), e.to_string()))?;
                    }
                }
            }
        }

        Ok(())
    }
}
