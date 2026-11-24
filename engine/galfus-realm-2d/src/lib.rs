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
mod context_diagnostics;
pub mod context_hierarchy;
pub mod context_physics;
mod context_shadows;
pub mod context_ui;
mod context_ui_resources;
mod culling;
pub mod gpu;
mod occlusion_2d;
pub mod pipeline;
pub mod shader;
pub mod shadow;
mod spatial_grid;
pub mod surface_effect;
pub mod types;
mod ui_borders;
mod ui_clip;
mod ui_color_glyph;
mod ui_color_glyph_cache;
mod ui_flex;
mod ui_font_source;
mod ui_fonts;
mod ui_grid;
pub mod ui_layout;
mod ui_rich_bidi;
mod ui_rich_text;
mod ui_scroll;
pub mod ui_text;
mod ui_text_caret;
mod ui_text_fallback;
mod ui_text_font;
pub mod ui_text_geometry;
mod ui_text_lines;
pub mod ui_text_shape;
mod ui_variations;
pub mod vector_geometry;

pub use batch::{BatchBuilder2D, PreparedItem2D};
pub use context::Realm2DContext;
pub use pipeline::{PipelineKey2D, PipelineManager2D};
pub use shader::compile_2d_shader;
pub use shadow::ShadowManager2D;
pub use surface_effect::compose_surface_shader_2d;
pub use types::*;
pub use ui_color_glyph::UiColorGlyph;
pub use ui_font_source::UiFontSource;
pub use ui_fonts::UiFontFamily;
pub use ui_variations::UiFontAxis;

#[cfg(test)]
pub(crate) static GPU_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(test)]
mod transparency_tests;
#[cfg(test)]
mod ui_tests;

#[cfg(test)]
mod sprite_uv_tests;
#[cfg(test)]
mod ui_emoji_gpu_tests;

#[cfg(test)]
mod ui_layout_tests;

#[cfg(test)]
mod ui_interaction_tests;

#[cfg(test)]
mod ui_render_tests;

#[cfg(test)]
mod ui_batch_tests;

#[cfg(test)]
mod ui_surface_tests;

mod context_ui_surface;
