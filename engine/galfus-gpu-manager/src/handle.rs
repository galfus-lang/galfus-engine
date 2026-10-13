use galfus_core::Handle;

// Phantom marker types for strongly typed GPU handles.
pub struct BufferResource;
pub struct TextureResource;
pub struct TextureViewResource;
pub struct SamplerResource;
pub struct ShaderResource;
pub struct RenderPipelineResource;
pub struct ComputePipelineResource;
pub struct BindGroupResource;

/// Strongly typed handle to a GPU Buffer.
pub type GpuBufferHandle = Handle<BufferResource>;

/// Strongly typed handle to a GPU Texture.
pub type GpuTextureHandle = Handle<TextureResource>;

/// Strongly typed handle to a GPU Texture View.
pub type GpuTextureViewHandle = Handle<TextureViewResource>;

/// Strongly typed handle to a GPU Sampler.
pub type GpuSamplerHandle = Handle<SamplerResource>;

/// Strongly typed handle to a compiled GPU Shader Module.
pub type GpuShaderHandle = Handle<ShaderResource>;

/// Strongly typed handle to a GPU Render Pipeline.
pub type GpuRenderPipelineHandle = Handle<RenderPipelineResource>;

/// Strongly typed handle to a GPU Compute Pipeline.
pub type GpuComputePipelineHandle = Handle<ComputePipelineResource>;

/// Strongly typed handle to a GPU Bind Group.
pub type GpuBindGroupHandle = Handle<BindGroupResource>;

pub const NAMESPACE_BUFFER: u16 = 0x01;
pub const NAMESPACE_TEXTURE: u16 = 0x02;
pub const NAMESPACE_TEXTURE_VIEW: u16 = 0x03;
pub const NAMESPACE_SAMPLER: u16 = 0x04;
pub const NAMESPACE_SHADER: u16 = 0x05;
pub const NAMESPACE_RENDER_PIPELINE: u16 = 0x06;
pub const NAMESPACE_COMPUTE_PIPELINE: u16 = 0x07;
pub const NAMESPACE_BIND_GROUP: u16 = 0x08;
