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
    pub context: GpuContext,
    pub buffers: BufferManager,
    pub textures: TextureManager,
    pub samplers: SamplerManager,
    pub layouts: LayoutManager,
    pub bind_groups: BindGroupManager,
    pub pipelines: PipelineManager,
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
}
