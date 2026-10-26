//! # Galfus GPU Manager
//!
//! Shared `wgpu` context, resource registries, pipelines, and suballocation.
//!
//! This crate provides:
//! - **Unified Coordinator**: Complete entry point for GPU resources and execution ([`GpuManager`]).
//! - **GPU Context**: Shared `Device`, `Queue`, `Adapter`, and `Instance` ([`GpuContext`]).
//! - **Surface Management**: Window and canvas swapchain configuration ([`GpuSurface`]).
//! - **Resource Management**: Generational handle-indexed buffers, textures, views, and samplers ([`BufferManager`], [`TextureManager`], [`SamplerManager`]).
//! - **Layouts & Bindings**: Bind group layouts, pipeline layouts, and verified bind group assembly ([`LayoutManager`], [`BindGroupManager`]).
//! - **Shaders & Pipelines**: WGSL compilation, derived target-specialized pipeline caching ([`PipelineManager`]).
//! - **Spatial Suballocator**: 2D Array Tile-based Atlas with guard pixels, repacking, and relocations ([`atlas::TileAtlas2DArray`]).
//! - **Buffer Arena**: Linear growable GPU buffer suballocator with deferred retirement ([`alloc::BufferArena`]).

pub mod alloc;
pub mod atlas;
pub mod bind_group;
pub mod buffer;
pub mod context;
pub mod error;
pub mod handle;
pub mod layout;
pub mod manager;
pub mod pipeline;
pub mod sampler;
pub mod surface;
pub mod texture;
pub mod types;

/// Reference-counted GPU resource storage.
///
/// Browser WebGPU handles are single-threaded, so WASM uses `Rc`; native targets retain `Arc`.
#[cfg(target_arch = "wasm32")]
pub type GpuShared<T> = std::rc::Rc<T>;
/// Reference-counted GPU resource storage.
#[cfg(not(target_arch = "wasm32"))]
pub type GpuShared<T> = std::sync::Arc<T>;

pub use alloc::{ArenaAllocHandle, ArenaSlice, BufferArena, BufferArenaDesc};
pub use atlas::{AtlasRelocation, AtlasTileHandle, TileAtlas2DArray, TileAtlasDesc, TileAtlasInfo};
pub use bind_group::{
    BindGroupEntryDesc, BindGroupManager, BindResourceDesc, GpuResourceRegistries,
};
pub use buffer::{BufferManager, GpuBuffer};
pub use context::GpuContext;
pub use error::{GpuError, GpuResult};
pub use handle::{
    GpuBindGroupHandle, GpuBufferHandle, GpuComputePipelineHandle, GpuRenderPipelineHandle,
    GpuSamplerHandle, GpuShaderHandle, GpuTextureHandle, GpuTextureViewHandle,
};
pub use layout::{
    BindGroupLayoutDesc, BindGroupLayoutEntryDesc, BindingType, LayoutManager, ShaderVisibility,
};
pub use manager::GpuManager;
pub use pipeline::{
    DerivedPipelineCacheKey, DerivedPipelineDesc, PipelineManager, RenderPipelineTargetConfig,
};
pub use sampler::{GpuSampler, SamplerManager, StandardSamplers};
pub use surface::GpuSurface;
pub use texture::{GpuTexture, GpuTextureView, TextureManager};
pub use types::{
    AddressMode, BufferUsageFlags, CompareFunction, FilterMode, GpuBufferDesc, GpuPresentMode,
    GpuSamplerDesc, GpuTextureDesc, NormalizedTextureFormat, TextureColorSpace, TextureDimension,
    TextureUsageFlags,
};
