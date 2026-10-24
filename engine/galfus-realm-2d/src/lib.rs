//! Galfus Realm 2D
//!
//! Complete 2D rendering realm providing high-performance batched sprite rendering,
//! vector shapes, dynamic 2D point lighting, polar soft shadows, and custom surface effects.

pub mod api;
pub mod batch;
pub mod context;
mod context_shadows;
pub mod gpu;
pub mod pipeline;
pub mod shader;
pub mod shadow;
pub mod surface_effect;
pub mod svg_manager;
pub mod svg_tessellator;
pub mod types;

pub use batch::{BatchBuilder2D, PreparedItem2D};
pub use context::Realm2DContext;
pub use pipeline::{PipelineKey2D, PipelineManager2D};
pub use shader::compile_2d_shader;
pub use shadow::ShadowManager2D;
pub use surface_effect::compose_surface_shader_2d;
pub use types::*;
