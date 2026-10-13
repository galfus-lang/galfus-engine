use crate::error::{GpuError, GpuResult};
use crate::handle::{
    ComputePipelineResource, GpuComputePipelineHandle, GpuRenderPipelineHandle, GpuShaderHandle,
    NAMESPACE_COMPUTE_PIPELINE, NAMESPACE_RENDER_PIPELINE, NAMESPACE_SHADER,
    RenderPipelineResource, ShaderResource,
};
use galfus_core::GenerationalPool;
use std::borrow::Cow;
use std::collections::HashMap;

/// Target configuration for deriving a specialized render pipeline.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RenderPipelineTargetConfig {
    pub color_format: wgpu::TextureFormat,
    pub depth_format: Option<wgpu::TextureFormat>,
    pub sample_count: u32,
    pub blend: Option<wgpu::BlendState>,
}

/// Description parameters for deriving or fetching a cached specialized render pipeline.
pub struct DerivedPipelineDesc<'a> {
    pub shader: GpuShaderHandle,
    pub layout: &'a wgpu::PipelineLayout,
    pub target: RenderPipelineTargetConfig,
    pub entry_point_vs: &'a str,
    pub entry_point_fs: &'a str,
    pub vertex_buffers: &'a [wgpu::VertexBufferLayout<'a>],
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct DerivedPipelineKey {
    shader: GpuShaderHandle,
    target: RenderPipelineTargetConfig,
    entry_point_vs: String,
    entry_point_fs: String,
}

/// Registry and compiler for Shaders and GPU Pipelines.
pub struct PipelineManager {
    shaders: GenerationalPool<wgpu::ShaderModule>,
    render_pipelines: GenerationalPool<wgpu::RenderPipeline>,
    compute_pipelines: GenerationalPool<wgpu::ComputePipeline>,
    derived_render_cache: HashMap<DerivedPipelineKey, GpuRenderPipelineHandle>,
}

impl Default for PipelineManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PipelineManager {
    pub fn new() -> Self {
        Self {
            shaders: GenerationalPool::new(NAMESPACE_SHADER),
            render_pipelines: GenerationalPool::new(NAMESPACE_RENDER_PIPELINE),
            compute_pipelines: GenerationalPool::new(NAMESPACE_COMPUTE_PIPELINE),
            derived_render_cache: HashMap::new(),
        }
    }

    /// Compiles a WGSL shader source into a GPU shader module.
    pub fn create_shader_module(
        &mut self,
        device: &wgpu::Device,
        label: Option<&str>,
        source: &str,
    ) -> GpuResult<GpuShaderHandle> {
        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label,
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(source)),
        });

        let handle = self.shaders.insert(module)?.cast::<ShaderResource>();
        Ok(handle)
    }

    /// Creates a new GPU render pipeline.
    pub fn create_render_pipeline(
        &mut self,
        device: &wgpu::Device,
        desc: &wgpu::RenderPipelineDescriptor,
    ) -> GpuResult<GpuRenderPipelineHandle> {
        let pipeline = device.create_render_pipeline(desc);
        let handle = self
            .render_pipelines
            .insert(pipeline)?
            .cast::<RenderPipelineResource>();
        Ok(handle)
    }

    /// Obtains an existing render pipeline specialized for the given target format, or compiles and caches one.
    pub fn get_or_create_render_pipeline_derived(
        &mut self,
        device: &wgpu::Device,
        desc: &DerivedPipelineDesc<'_>,
    ) -> GpuResult<GpuRenderPipelineHandle> {
        let key = DerivedPipelineKey {
            shader: desc.shader,
            target: desc.target.clone(),
            entry_point_vs: desc.entry_point_vs.to_string(),
            entry_point_fs: desc.entry_point_fs.to_string(),
        };

        if let Some(&handle) = self
            .derived_render_cache
            .get(&key)
            .filter(|h| self.render_pipelines.get(h.cast()).is_ok())
        {
            return Ok(handle);
        }

        let pipeline = {
            let shader_module = self.get_shader(desc.shader)?;

            let depth_stencil = desc
                .target
                .depth_format
                .map(|format| wgpu::DepthStencilState {
                    format,
                    depth_write_enabled: true,
                    depth_compare: wgpu::CompareFunction::LessEqual,
                    stencil: wgpu::StencilState::default(),
                    bias: wgpu::DepthBiasState::default(),
                });

            let targets = [Some(wgpu::ColorTargetState {
                format: desc.target.color_format,
                blend: desc.target.blend,
                write_mask: wgpu::ColorWrites::ALL,
            })];

            let pipe_desc = wgpu::RenderPipelineDescriptor {
                label: Some("Galfus Derived Render Pipeline"),
                layout: Some(desc.layout),
                vertex: wgpu::VertexState {
                    module: shader_module,
                    entry_point: Some(desc.entry_point_vs),
                    buffers: desc.vertex_buffers,
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: shader_module,
                    entry_point: Some(desc.entry_point_fs),
                    targets: &targets,
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                }),
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::TriangleList,
                    strip_index_format: None,
                    front_face: wgpu::FrontFace::Ccw,
                    cull_mode: Some(wgpu::Face::Back),
                    polygon_mode: wgpu::PolygonMode::Fill,
                    unclipped_depth: false,
                    conservative: false,
                },
                depth_stencil,
                multisample: wgpu::MultisampleState {
                    count: desc.target.sample_count.max(1),
                    mask: !0,
                    alpha_to_coverage_enabled: false,
                },
                multiview_mask: None,
                cache: None,
            };

            device.create_render_pipeline(&pipe_desc)
        };

        let handle = self
            .render_pipelines
            .insert(pipeline)?
            .cast::<RenderPipelineResource>();
        self.derived_render_cache.insert(key, handle);
        Ok(handle)
    }

    /// Creates a new GPU compute pipeline.
    pub fn create_compute_pipeline(
        &mut self,
        device: &wgpu::Device,
        desc: &wgpu::ComputePipelineDescriptor,
    ) -> GpuResult<GpuComputePipelineHandle> {
        let pipeline = device.create_compute_pipeline(desc);
        let handle = self
            .compute_pipelines
            .insert(pipeline)?
            .cast::<ComputePipelineResource>();
        Ok(handle)
    }

    /// Retrieves a shader module by handle.
    pub fn get_shader(&self, handle: GpuShaderHandle) -> GpuResult<&wgpu::ShaderModule> {
        self.shaders.get(handle.cast()).map_err(|_| {
            GpuError::ShaderCompilationFailed(format!(
                "Shader handle stale or invalid: {:?}",
                handle.slot()
            ))
        })
    }

    /// Retrieves a render pipeline by handle.
    pub fn get_render_pipeline(
        &self,
        handle: GpuRenderPipelineHandle,
    ) -> GpuResult<&wgpu::RenderPipeline> {
        self.render_pipelines.get(handle.cast()).map_err(|_| {
            GpuError::PipelineCreationFailed(format!(
                "Render pipeline handle stale or invalid: {:?}",
                handle.slot()
            ))
        })
    }

    /// Retrieves a compute pipeline by handle.
    pub fn get_compute_pipeline(
        &self,
        handle: GpuComputePipelineHandle,
    ) -> GpuResult<&wgpu::ComputePipeline> {
        self.compute_pipelines.get(handle.cast()).map_err(|_| {
            GpuError::PipelineCreationFailed(format!(
                "Compute pipeline handle stale or invalid: {:?}",
                handle.slot()
            ))
        })
    }

    /// Destroys a shader module.
    pub fn destroy_shader(&mut self, handle: GpuShaderHandle) -> GpuResult<()> {
        self.shaders
            .remove(handle.cast())
            .map(|_| ())
            .map_err(|_| GpuError::ShaderCompilationFailed("Shader handle not found".into()))
    }

    /// Destroys a render pipeline.
    pub fn destroy_render_pipeline(&mut self, handle: GpuRenderPipelineHandle) -> GpuResult<()> {
        self.render_pipelines
            .remove(handle.cast())
            .map(|_| ())
            .map_err(|_| GpuError::PipelineCreationFailed("Render pipeline not found".into()))
    }

    /// Destroys a compute pipeline.
    pub fn destroy_compute_pipeline(&mut self, handle: GpuComputePipelineHandle) -> GpuResult<()> {
        self.compute_pipelines
            .remove(handle.cast())
            .map(|_| ())
            .map_err(|_| GpuError::PipelineCreationFailed("Compute pipeline not found".into()))
    }
}
