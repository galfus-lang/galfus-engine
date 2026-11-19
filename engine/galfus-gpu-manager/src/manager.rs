use crate::GpuShared;
use crate::bind_group::{BindGroupManager, BindGroupManagerStats, BindResourceHandle};
use crate::buffer::{BufferManager, BufferManagerStats};
use crate::context::GpuContext;
use crate::error::GpuResult;
use crate::layout::{LayoutManager, LayoutManagerStats};
use crate::pipeline::{PipelineManager, PipelineManagerStats};
use crate::sampler::{SamplerManager, SamplerManagerStats};
use crate::texture::{TextureManager, TextureManagerStats};
use galfus_core::diagnostics::MemoryCategoryStats;
use serde::Serialize;

/// Aggregated diagnostic statistics for [`GpuManager`].
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuManagerDiagnostics {
    pub buffers: BufferManagerStats,
    pub textures: TextureManagerStats,
    pub samplers: SamplerManagerStats,
    pub layouts: LayoutManagerStats,
    pub bind_groups: BindGroupManagerStats,
    pub pipelines: PipelineManagerStats,
}

/// Unified coordinator aggregating GPU context, resource registries, and pipeline managers.
pub struct GpuManager {
    pub buffers: BufferManager,
    pub textures: TextureManager,
    pub samplers: SamplerManager,
    pub layouts: LayoutManager,
    pub bind_groups: BindGroupManager,
    pub pipelines: PipelineManager,
    pub context: GpuContext,
}

impl GpuManager {
    /// Initializes a new `GpuManager` with a headless GPU context.
    pub fn new_headless() -> GpuResult<Self> {
        let context = GpuContext::new_headless()?;
        Ok(Self {
            context,
            buffers: BufferManager::new(),
            textures: TextureManager::new(),
            samplers: SamplerManager::new(),
            layouts: LayoutManager::new(),
            bind_groups: BindGroupManager::new(),
            pipelines: PipelineManager::new(),
        })
    }

    /// Asynchronously initializes a `GpuManager` reusing an existing `wgpu::Instance`.
    pub async fn with_instance_async(
        instance: GpuShared<wgpu::Instance>,
        compatible_surface: Option<&wgpu::Surface<'_>>,
    ) -> GpuResult<Self> {
        let context = GpuContext::with_instance_async(instance, compatible_surface).await?;
        Ok(Self {
            context,
            buffers: BufferManager::new(),
            textures: TextureManager::new(),
            samplers: SamplerManager::new(),
            layouts: LayoutManager::new(),
            bind_groups: BindGroupManager::new(),
            pipelines: PipelineManager::new(),
        })
    }

    /// Initializes a new `GpuManager` reusing an existing `wgpu::Instance`.
    pub fn with_instance(
        instance: GpuShared<wgpu::Instance>,
        compatible_surface: Option<&wgpu::Surface>,
    ) -> GpuResult<Self> {
        let context = GpuContext::with_instance(instance, compatible_surface)?;
        Ok(Self {
            context,
            buffers: BufferManager::new(),
            textures: TextureManager::new(),
            samplers: SamplerManager::new(),
            layouts: LayoutManager::new(),
            bind_groups: BindGroupManager::new(),
            pipelines: PipelineManager::new(),
        })
    }

    /// Initializes a new `GpuManager` compatible with a platform window surface.
    pub fn new(compatible_surface: Option<&wgpu::Surface>) -> GpuResult<Self> {
        let context = GpuContext::new(compatible_surface)?;
        Ok(Self {
            context,
            buffers: BufferManager::new(),
            textures: TextureManager::new(),
            samplers: SamplerManager::new(),
            layouts: LayoutManager::new(),
            bind_groups: BindGroupManager::new(),
            pipelines: PipelineManager::new(),
        })
    }

    /// Direct reference to the inner `wgpu::Device`.
    pub fn device(&self) -> &wgpu::Device {
        self.context.device()
    }

    /// Direct reference to the inner `wgpu::Queue`.
    pub fn queue(&self) -> &wgpu::Queue {
        self.context.queue()
    }

    /// Allocates and initializes a texture mapped to a host logical ID.
    pub fn create_logical_texture(
        &mut self,
        logical_id: u32,
        desc: &crate::types::GpuTextureDesc,
        data: &[u8],
    ) -> GpuResult<crate::handle::GpuTextureHandle> {
        let device = self.context.device_arc();
        let queue = self.context.queue_arc();
        self.textures
            .create_logical_texture_with_data(&device, &queue, logical_id, desc, data)
    }

    /// Writes pixel data into a logical texture.
    pub fn write_logical_texture(
        &self,
        logical_id: u32,
        x: u32,
        y: u32,
        width: u32,
        height: u32,
        data: &[u8],
    ) -> GpuResult<()> {
        self.textures
            .write_logical_texture(self.queue(), logical_id, x, y, width, height, data)
    }

    /// Disposes a logical texture.
    pub fn dispose_logical_texture(&mut self, logical_id: u32) -> GpuResult<()> {
        let handle = self.textures.get_logical_handle(logical_id)?;
        self.destroy_texture(handle)
    }

    /// Allocates and initializes a buffer mapped to a host logical ID.
    pub fn create_logical_buffer(
        &mut self,
        logical_id: u32,
        label: Option<&str>,
        contents: &[u8],
        usages: crate::types::BufferUsageFlags,
    ) -> GpuResult<crate::handle::GpuBufferHandle> {
        let device = self.context.device_arc();
        let queue = self.context.queue_arc();
        self.buffers
            .create_logical_buffer(&device, &queue, logical_id, label, contents, usages)
    }

    /// Writes data into a logical buffer at byte offset.
    pub fn write_logical_buffer(&self, logical_id: u32, offset: u64, data: &[u8]) -> GpuResult<()> {
        self.buffers
            .write_logical_buffer(self.queue(), logical_id, offset, data)
    }

    /// Disposes a logical buffer.
    pub fn dispose_logical_buffer(&mut self, logical_id: u32) -> GpuResult<()> {
        let handle = self.buffers.get_logical_handle(logical_id)?;
        self.destroy_buffer(handle)
    }

    /// Destroys a texture after invalidating bind groups that reference any of its views.
    pub fn destroy_texture(&mut self, handle: crate::handle::GpuTextureHandle) -> GpuResult<()> {
        for view_handle in self.textures.view_handles_for_texture(handle)? {
            self.bind_groups
                .destroy_referencing(BindResourceHandle::TextureView(view_handle));
        }
        self.textures.destroy_texture(handle)
    }

    /// Destroys an explicit texture view after invalidating bind groups that reference it.
    pub fn destroy_texture_view(
        &mut self,
        handle: crate::handle::GpuTextureViewHandle,
    ) -> GpuResult<()> {
        self.bind_groups
            .destroy_referencing(BindResourceHandle::TextureView(handle));
        self.textures.destroy_view(handle)
    }

    /// Destroys a buffer after invalidating bind groups that reference it.
    pub fn destroy_buffer(&mut self, handle: crate::handle::GpuBufferHandle) -> GpuResult<()> {
        self.bind_groups
            .destroy_referencing(BindResourceHandle::Buffer(handle));
        self.buffers.destroy(handle)
    }

    /// Destroys a sampler after invalidating bind groups that reference it.
    pub fn destroy_sampler(&mut self, handle: crate::handle::GpuSamplerHandle) -> GpuResult<()> {
        self.bind_groups
            .destroy_referencing(BindResourceHandle::Sampler(handle));
        self.samplers.destroy(handle)
    }

    /// Returns diagnostic statistics across all GPU resource registries.
    pub fn diagnostic_stats(&self) -> GpuManagerDiagnostics {
        GpuManagerDiagnostics {
            buffers: self.buffers.diagnostic_stats(),
            textures: self.textures.diagnostic_stats(),
            samplers: self.samplers.diagnostic_stats(),
            layouts: self.layouts.diagnostic_stats(),
            bind_groups: self.bind_groups.diagnostic_stats(),
            pipelines: self.pipelines.diagnostic_stats(),
        }
    }

    /// Returns per-category memory reservations owned by this GPU manager.
    pub fn memory_categories(&self) -> Vec<MemoryCategoryStats> {
        let stats = self.diagnostic_stats();
        vec![
            MemoryCategoryStats::new(
                "gpu.buffers",
                "gpu.buffers",
                stats.buffers.pool.estimated_cpu_bytes,
                stats.buffers.total_gpu_bytes,
                stats
                    .buffers
                    .pool
                    .estimated_cpu_bytes
                    .saturating_add(stats.buffers.total_gpu_bytes),
                stats.buffers.pool.active_count,
            ),
            MemoryCategoryStats::new(
                "gpu.textures",
                "gpu.textures",
                stats
                    .textures
                    .textures_pool
                    .estimated_cpu_bytes
                    .saturating_add(stats.textures.views_pool.estimated_cpu_bytes),
                stats.textures.estimated_vram_bytes,
                stats
                    .textures
                    .textures_pool
                    .estimated_cpu_bytes
                    .saturating_add(stats.textures.views_pool.estimated_cpu_bytes)
                    .saturating_add(stats.textures.estimated_vram_bytes),
                stats.textures.textures_pool.active_count,
            ),
            MemoryCategoryStats::new(
                "gpu.bind_groups",
                "gpu.bind_groups",
                stats.bind_groups.pool.estimated_cpu_bytes,
                0,
                stats.bind_groups.pool.estimated_cpu_bytes,
                stats.bind_groups.pool.active_count,
            ),
            MemoryCategoryStats::new(
                "gpu.samplers",
                "gpu",
                stats.samplers.pool.estimated_cpu_bytes,
                0,
                stats.samplers.pool.estimated_cpu_bytes,
                stats.samplers.pool.active_count,
            ),
            MemoryCategoryStats::new(
                "gpu.pipelines",
                "gpu.pipelines",
                stats
                    .pipelines
                    .shaders_pool
                    .estimated_cpu_bytes
                    .saturating_add(stats.pipelines.render_pipelines_pool.estimated_cpu_bytes)
                    .saturating_add(stats.pipelines.compute_pipelines_pool.estimated_cpu_bytes),
                0,
                stats
                    .pipelines
                    .shaders_pool
                    .estimated_cpu_bytes
                    .saturating_add(stats.pipelines.render_pipelines_pool.estimated_cpu_bytes)
                    .saturating_add(stats.pipelines.compute_pipelines_pool.estimated_cpu_bytes),
                stats.pipelines.render_pipelines_pool.active_count
                    + stats.pipelines.compute_pipelines_pool.active_count
                    + stats.pipelines.shaders_pool.active_count,
            ),
        ]
    }
}
