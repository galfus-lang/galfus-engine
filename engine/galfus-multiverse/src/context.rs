use std::collections::HashMap;
use std::sync::Arc;

use galfus_core::id::validate_host_logical_id;
use galfus_gpu_manager::handle::{GpuTextureHandle, GpuTextureViewHandle};
use galfus_gpu_manager::types::{
    GpuPresentMode, GpuTextureDesc, NormalizedTextureFormat, TextureDimension, TextureUsageFlags,
};
use galfus_gpu_manager::{GpuManager, GpuShared, GpuSurface};
use galfus_realm_core::Realm;
use glam::UVec2;

use crate::error::{MultiverseError, MultiverseResult};
use crate::postprocess::PostProcessor;
use crate::resolver::resolve_schedule;
use crate::schedule::MultiverseSchedule;
use crate::types::{
    AntiAliasingMode, InvocationDesc, InvocationFilter, TargetDesc, TargetKind,
    TargetTextureBinding, ViewportRect,
};

#[derive(Debug)]
pub(crate) struct TaaHistoryEntry {
    pub tex_a: GpuTextureHandle,
    pub view_a: GpuTextureViewHandle,
    pub tex_b: GpuTextureHandle,
    pub view_b: GpuTextureViewHandle,
    pub size: UVec2,
    pub flip: bool,
    pub has_history: bool,
}

/// Central Multiverse Context coordinating targets, realms, and invocation scheduling.
pub struct MultiverseContext {
    pub anti_aliasing: AntiAliasingMode,
    pub(crate) targets: HashMap<u32, TargetDesc>,
    pub(crate) realms: HashMap<u32, Box<dyn Realm>>,
    pub(crate) invocations: HashMap<u32, InvocationDesc>,
    pub(crate) bindings: Vec<TargetTextureBinding>,
    pub(crate) window_sizes: HashMap<u32, UVec2>,

    // Internal GPU state (encapsulated, not exposed to host)
    pub(crate) surfaces: HashMap<u32, GpuSurface>,
    pub(crate) target_textures:
        HashMap<u32, (GpuTextureHandle, GpuTextureViewHandle, wgpu::TextureFormat)>,
    pub(crate) target_history_textures:
        HashMap<u32, (GpuTextureHandle, GpuTextureViewHandle, wgpu::TextureFormat)>,
    pub(crate) scratch_textures: HashMap<u32, (GpuTextureHandle, GpuTextureViewHandle, UVec2)>,
    pub(crate) ping_pong_texture: Option<(GpuTextureHandle, GpuTextureViewHandle, UVec2)>,
    pub(crate) smaa_intermediates: Option<(
        GpuTextureHandle,
        GpuTextureViewHandle,
        GpuTextureHandle,
        GpuTextureViewHandle,
        UVec2,
    )>,
    pub(crate) taa_history: HashMap<u32, TaaHistoryEntry>,
    pub(crate) post_processor: Option<PostProcessor>,
    pub(crate) gpu_manager: Option<GpuManager>,

    /// Cached resolved schedule.
    pub(crate) cached_schedule: Option<MultiverseSchedule>,
    /// Dirty flag indicating graph mutations requiring recalculation.
    pub(crate) dirty: bool,
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
            anti_aliasing: AntiAliasingMode::None,
            targets: HashMap::new(),
            realms: HashMap::new(),
            invocations: HashMap::new(),
            bindings: Vec::new(),
            window_sizes: HashMap::new(),
            gpu_manager: None,
            surfaces: HashMap::new(),
            target_textures: HashMap::new(),
            target_history_textures: HashMap::new(),
            scratch_textures: HashMap::new(),
            ping_pong_texture: None,
            smaa_intermediates: None,
            taa_history: HashMap::new(),
            post_processor: None,
            cached_schedule: None,
            dirty: true,
        }
    }

    /// Internal helper ensuring GpuManager is initialized.
    pub(crate) fn ensure_gpu_manager(&mut self) -> MultiverseResult<&mut GpuManager> {
        if self.gpu_manager.is_none() {
            let gpu = GpuManager::new_headless()
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            self.post_processor = Some(PostProcessor::new(gpu.device(), gpu.queue()));
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
            let instance =
                GpuShared::new(wgpu::Instance::new(&wgpu::InstanceDescriptor::default()));
            let surface = instance
                .create_surface(Arc::clone(&window))
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            let gpu = GpuManager::with_instance(GpuShared::clone(&instance), Some(&surface))
                .map_err(|e| MultiverseError::InvalidConfig(e.to_string()))?;
            self.post_processor = Some(PostProcessor::new(gpu.device(), gpu.queue()));
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

    /// Installs a pre-created swapchain surface (and optionally a newly initialized GPU manager).
    ///
    /// Used by platforms that cannot block on adapter/device requests (browser/WASM): the host
    /// prepares the instance, surface, and `GpuManager` asynchronously, then hands them over here.
    pub fn attach_prepared_surface(
        &mut self,
        window_id: u32,
        gpu: Option<GpuManager>,
        surface: wgpu::Surface<'static>,
        width: u32,
        height: u32,
    ) -> MultiverseResult<()> {
        validate_host_logical_id(window_id)?;
        if let Some(gpu) = gpu {
            if self.gpu_manager.is_some() {
                return Err(MultiverseError::InvalidConfig(
                    "GpuManager is already initialized".into(),
                ));
            }
            self.post_processor = Some(PostProcessor::new(gpu.device(), gpu.queue()));
            self.gpu_manager = Some(gpu);
        }
        let gpu = self.gpu_manager.as_ref().ok_or_else(|| {
            MultiverseError::InvalidConfig("GpuManager is not initialized".into())
        })?;
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

    /// Returns a reference to the initialized GPU manager, if any.
    pub fn gpu_manager(&self) -> Option<&GpuManager> {
        self.gpu_manager.as_ref()
    }

    /// Returns a mutable reference to the GPU manager, initializing it if needed.
    pub fn gpu_manager_mut(&mut self) -> MultiverseResult<&mut GpuManager> {
        self.ensure_gpu_manager()
    }

    /// Allocates and initializes a shared GPU texture under a host logical ID.
    pub fn create_texture(
        &mut self,
        texture_id: u32,
        desc: &GpuTextureDesc,
        data: &[u8],
    ) -> MultiverseResult<()> {
        let gpu = self.ensure_gpu_manager()?;
        gpu.create_logical_texture(texture_id, desc, data)?;
        Ok(())
    }

    /// Writes pixel data into a sub-rectangle of an existing logical texture.
    pub fn write_texture(
        &self,
        texture_id: u32,
        x: u32,
        y: u32,
        width: u32,
        height: u32,
        data: &[u8],
    ) -> MultiverseResult<()> {
        let gpu = self
            .gpu_manager
            .as_ref()
            .ok_or_else(|| MultiverseError::InvalidConfig("GPU manager not initialized".into()))?;
        gpu.write_logical_texture(texture_id, x, y, width, height, data)?;
        Ok(())
    }

    /// Disposes a shared logical texture.
    pub fn dispose_texture(&mut self, texture_id: u32) -> MultiverseResult<()> {
        let gpu = self.ensure_gpu_manager()?;
        gpu.dispose_logical_texture(texture_id)?;
        Ok(())
    }

    /// Allocates and initializes a shared GPU buffer under a host logical ID.
    pub fn create_buffer(
        &mut self,
        buffer_id: u32,
        label: Option<&str>,
        contents: &[u8],
        usages: galfus_gpu_manager::BufferUsageFlags,
    ) -> MultiverseResult<()> {
        let gpu = self.ensure_gpu_manager()?;
        gpu.create_logical_buffer(buffer_id, label, contents, usages)?;
        Ok(())
    }

    /// Writes data into a logical buffer at byte offset.
    pub fn write_buffer(&self, buffer_id: u32, offset: u64, data: &[u8]) -> MultiverseResult<()> {
        let gpu = self
            .gpu_manager
            .as_ref()
            .ok_or_else(|| MultiverseError::InvalidConfig("GPU manager not initialized".into()))?;
        gpu.write_logical_buffer(buffer_id, offset, data)?;
        Ok(())
    }

    /// Disposes a shared logical buffer.
    pub fn dispose_buffer(&mut self, buffer_id: u32) -> MultiverseResult<()> {
        let gpu = self.ensure_gpu_manager()?;
        gpu.dispose_logical_buffer(buffer_id)?;
        Ok(())
    }

    /// Registers a new Target (Window or Texture) under a host logical ID.
    pub fn create_target(&mut self, target_id: u32, desc: TargetDesc) -> MultiverseResult<()> {
        validate_host_logical_id(target_id)?;
        if self.targets.contains_key(&target_id) {
            return Err(MultiverseError::TargetAlreadyExists(target_id));
        }

        if let TargetKind::Texture {
            width,
            height,
            format,
        } = &desc.kind
        {
            let gpu = self.ensure_gpu_manager()?;
            let norm_format = NormalizedTextureFormat::parse_str(format).ok_or_else(|| {
                MultiverseError::InvalidConfig(format!(
                    "Unsupported render target texture format: '{format}'"
                ))
            })?;
            let wgpu_format = norm_format.to_wgpu();
            let usages = TextureUsageFlags {
                copy_src: true,
                ..Default::default()
            };
            let tex_desc = GpuTextureDesc {
                label: Some(format!("Multiverse Target {target_id}")),
                width: *width,
                height: *height,
                depth_or_layers: 1,
                mip_levels: 1,
                sample_count: 1,
                dimension: TextureDimension::D2,
                format: norm_format,
                usages,
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
            self.target_textures
                .insert(target_id, (tex_handle, view_handle, wgpu_format));
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
        if let (Some((hist_handle, _, _)), Some(gpu)) = (
            self.target_history_textures.remove(&target_id),
            &mut self.gpu_manager,
        ) {
            let _ = gpu.textures.destroy_texture(hist_handle);
        }
        let removed_invs: Vec<u32> = self
            .invocations
            .iter()
            .filter(|(_, inv)| inv.target_id == target_id)
            .map(|(&id, _)| id)
            .collect();
        for inv_id in removed_invs {
            self.invocations.remove(&inv_id);
            if let (Some((tex_h, _, _)), Some(gpu)) =
                (self.scratch_textures.remove(&inv_id), &mut self.gpu_manager)
            {
                let _ = gpu.textures.destroy_texture(tex_h);
            }
            if let (Some(entry), Some(gpu)) =
                (self.taa_history.remove(&inv_id), &mut self.gpu_manager)
            {
                let _ = gpu.textures.destroy_texture(entry.tex_a);
                let _ = gpu.textures.destroy_texture(entry.tex_b);
            }
        }
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

    /// Returns a downcasted reference to a registered Realm.
    pub fn get_realm<T: 'static>(&self, realm_id: u32) -> Option<&T> {
        self.realms.get(&realm_id)?.as_any().downcast_ref::<T>()
    }

    /// Returns a downcasted mutable reference to a registered Realm.
    pub fn get_realm_mut<T: 'static>(&mut self, realm_id: u32) -> Option<&mut T> {
        self.realms
            .get_mut(&realm_id)?
            .as_any_mut()
            .downcast_mut::<T>()
    }

    /// Returns the resolved pixel size of a Target, if registered.
    pub fn target_size(&self, target_id: u32) -> Option<glam::UVec2> {
        let target = self.targets.get(&target_id)?;
        match &target.kind {
            crate::TargetKind::Window { window_id } => self
                .window_sizes
                .get(window_id)
                .copied()
                .or(Some(glam::UVec2::new(800, 600))),
            crate::TargetKind::Texture { width, height, .. } => {
                Some(glam::UVec2::new(*width, *height))
            }
        }
    }

    /// Clears a Realm's entities and scene resources without unregistering it.
    pub fn clear_realm(&mut self, realm_id: u32) -> MultiverseResult<()> {
        let realm = self
            .realms
            .get_mut(&realm_id)
            .ok_or(MultiverseError::RealmNotFound(realm_id))?;
        realm
            .clear()
            .map_err(|e| MultiverseError::RealmError(realm_id, e.to_string()))?;
        self.dirty = true;
        Ok(())
    }

    /// Unregisters a Realm, destroys its GPU resources, and clears associated invocations.
    pub fn unregister_realm(&mut self, realm_id: u32) -> MultiverseResult<()> {
        let mut realm = match self.realms.remove(&realm_id) {
            Some(r) => r,
            None => return Err(MultiverseError::RealmNotFound(realm_id)),
        };
        let _ = realm.destroy();
        let removed_invs: Vec<u32> = self
            .invocations
            .iter()
            .filter(|(_, inv)| inv.realm_id == realm_id)
            .map(|(&id, _)| id)
            .collect();
        for inv_id in removed_invs {
            self.invocations.remove(&inv_id);
            if let (Some((tex_h, _, _)), Some(gpu)) =
                (self.scratch_textures.remove(&inv_id), &mut self.gpu_manager)
            {
                let _ = gpu.textures.destroy_texture(tex_h);
            }
        }
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

    /// Destroys an invocation and frees its scratch GPU texture if allocated.
    pub fn destroy_invocation(&mut self, invocation_id: u32) -> MultiverseResult<()> {
        if self.invocations.remove(&invocation_id).is_none() {
            return Err(MultiverseError::InvocationNotFound(invocation_id));
        }
        if let (Some((tex_h, _, _)), Some(gpu)) = (
            self.scratch_textures.remove(&invocation_id),
            &mut self.gpu_manager,
        ) {
            let _ = gpu.textures.destroy_texture(tex_h);
        }
        if let (Some(entry), Some(gpu)) = (
            self.taa_history.remove(&invocation_id),
            &mut self.gpu_manager,
        ) {
            let _ = gpu.textures.destroy_texture(entry.tex_a);
            let _ = gpu.textures.destroy_texture(entry.tex_b);
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

    /// Returns an immutable reference to an Invocation description.
    pub fn get_invocation(&self, invocation_id: u32) -> Option<&InvocationDesc> {
        self.invocations.get(&invocation_id)
    }

    /// Returns a mutable reference to an Invocation description, marking the graph dirty.
    pub fn get_invocation_mut(&mut self, invocation_id: u32) -> Option<&mut InvocationDesc> {
        self.dirty = true;
        self.invocations.get_mut(&invocation_id)
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
            // Validate that if any realm references a Target ID as texture, a TargetTextureBinding exists
            for (&realm_id, realm) in &self.realms {
                for tex_id in realm.referenced_texture_ids() {
                    if self.targets.contains_key(&tex_id) {
                        let has_binding = self
                            .bindings
                            .iter()
                            .any(|b| b.realm_id == realm_id && b.source_target_id == tex_id);
                        if !has_binding {
                            log::warn!(
                                "[Multiverse WARNING] Realm {} material references Target ID {} as texture, but no TargetTextureBinding was declared in Multiverse!",
                                realm_id,
                                tex_id
                            );
                            eprintln!(
                                "[Multiverse WARNING] Realm {} material references Target ID {} as texture, but no TargetTextureBinding was declared in Multiverse!",
                                realm_id, tex_id
                            );
                        }
                    }
                }
            }

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
        crate::executor::execute_frame(self, frame_id, delta_time)
    }

    /// Sets the global Anti-Aliasing mode for the Multiverse.
    pub fn set_anti_aliasing(&mut self, mode: AntiAliasingMode) {
        if self.anti_aliasing != mode {
            self.anti_aliasing = mode;
            self.dirty = true;
        }
    }

    /// Gets the current global Anti-Aliasing mode of the Multiverse.
    pub fn anti_aliasing(&self) -> AntiAliasingMode {
        self.anti_aliasing
    }
}
