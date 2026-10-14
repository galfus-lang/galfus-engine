use crate::bind_group::BindGroupManager;
use crate::buffer::BufferManager;
use crate::context::GpuContext;
use crate::error::GpuResult;
use crate::layout::LayoutManager;
use crate::pipeline::PipelineManager;
use crate::sampler::SamplerManager;
use crate::texture::TextureManager;

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

    /// Initializes a new `GpuManager` reusing an existing `wgpu::Instance`.
    pub fn with_instance(
        instance: std::sync::Arc<wgpu::Instance>,
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
        self.textures.dispose_logical_texture(logical_id)
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
        self.buffers.dispose_logical_buffer(logical_id)
    }
}
