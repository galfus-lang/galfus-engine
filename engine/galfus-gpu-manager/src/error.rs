use thiserror::Error;

/// Result alias for operations in `galfus-gpu-manager`.
pub type GpuResult<T> = Result<T, GpuError>;

/// Errors that can occur within the GPU manager.
#[derive(Debug, Error)]
pub enum GpuError {
    #[error("Failed to request GPU adapter: {0}")]
    AdapterRequestFailed(String),

    #[error("Failed to request GPU device: {0}")]
    DeviceRequestFailed(String),

    #[error("Surface creation failed: {0}")]
    SurfaceCreationFailed(String),

    #[error("Surface configuration failed: {0}")]
    SurfaceConfigurationFailed(String),

    #[error("Failed to acquire swapchain texture: {0}")]
    SurfaceTextureAcquisitionFailed(String),

    #[error("Buffer not found or handle stale: slot={slot}, gen={generation}")]
    BufferNotFound { slot: u32, generation: u32 },

    #[error("Texture not found or handle stale: slot={slot}, gen={generation}")]
    TextureNotFound { slot: u32, generation: u32 },

    #[error("Texture view not found or handle stale: slot={slot}, gen={generation}")]
    TextureViewNotFound { slot: u32, generation: u32 },

    #[error("Sampler not found or handle stale: slot={slot}, gen={generation}")]
    SamplerNotFound { slot: u32, generation: u32 },

    #[error("Shader module compilation failed: {0}")]
    ShaderCompilationFailed(String),

    #[error("Pipeline creation failed: {0}")]
    PipelineCreationFailed(String),

    #[error("Out of GPU memory or capacity exhausted: {0}")]
    OutOfMemory(String),

    #[error("Invalid resource descriptor or parameter: {0}")]
    InvalidArgument(String),

    #[error("Atlas allocation failed: required {width}x{height} tiles, available {available}")]
    AtlasAllocationFailed {
        width: u32,
        height: u32,
        available: u32,
    },

    #[error("Core error: {0}")]
    Core(#[from] galfus_core::CoreError),
}
