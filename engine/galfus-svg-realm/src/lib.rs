//! Galfus SVG Realm
//!
//! Preserved SVG vector rendering architecture extracted from Realm2D.

pub mod svg_clip;
pub mod svg_manager;
pub mod svg_tessellator;
pub mod svg_text_cache;
pub mod svg_text_layout;
pub mod vector_geometry;

pub use svg_manager::{SvgGeometry2D, SvgInstance2D, SvgManager2D, SvgSubMeshBinding};
pub use svg_tessellator::{
    SvgElementRect, SvgSubMesh, SvgVertex, TessellatedSvgMesh, svg_element_rect,
    svg_element_rect_from_tree, tessellate_svg,
};
pub use svg_text_layout::{SvgTextCluster, SvgTextLayout, svg_text_layout};
pub use vector_geometry::{GpuVectorGeometry, VectorVertex};
