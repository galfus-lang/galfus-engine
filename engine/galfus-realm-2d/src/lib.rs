//! Galfus Realm 2D
//!
//! Complete 2D rendering realm providing high-performance batched sprite rendering,
//! vector shapes, dynamic 2D point lighting, polar soft shadows, and custom surface effects.

pub mod api;
mod api_animation;
pub mod batch;
pub mod collision_geometry;
pub mod context;
mod context_collision;
pub mod context_hierarchy;
pub mod context_physics;
mod context_shadows;
pub mod context_ui;
mod context_ui_resources;
pub mod gpu;
pub mod pipeline;
pub mod shader;
pub mod shadow;
pub mod surface_effect;
pub mod types;
mod ui_borders;
mod ui_clip;
mod ui_flex;
mod ui_fonts;
mod ui_grid;
pub mod ui_layout;
mod ui_scroll;
pub mod ui_text;
pub mod vector_geometry;

pub use batch::{BatchBuilder2D, PreparedItem2D};
pub use context::Realm2DContext;
pub use pipeline::{PipelineKey2D, PipelineManager2D};
pub use shader::compile_2d_shader;
pub use shadow::ShadowManager2D;
pub use surface_effect::compose_surface_shader_2d;
pub use types::*;

#[cfg(test)]
mod transparency_tests;
#[cfg(test)]
mod ui_tests;

#[cfg(test)]
mod ui_layout_tests;

#[cfg(test)]
mod ui_interaction_tests;

#[cfg(test)]
mod ui_render_tests;

#[cfg(test)]
mod ui_batch_tests;
