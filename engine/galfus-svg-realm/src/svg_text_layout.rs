//! Shaped SVG text measurements.

use crate::svg_tessellator::parse_svg_with_clusters;
use resvg::usvg::{self, fontdb};
use std::sync::Arc;

/// A shaped cluster in SVG viewport coordinates. Byte offsets refer to a normalized chunk.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SvgTextCluster {
    pub chunk_index: usize,
    pub byte_start: usize,
    pub byte_end: usize,
    /// Affine transform in SVG matrix order: a, b, c, d, e, f.
    pub transform: [f32; 6],
    pub advance: f32,
    pub ascent: f32,
    pub descent: f32,
    pub right_to_left: bool,
}

/// Text layout directly retained from the renderer's shaping pass.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SvgTextLayout {
    pub chunks: Vec<String>,
    pub clusters: Vec<SvgTextCluster>,
    pub viewport_width: f32,
    pub viewport_height: f32,
}

/// Reads shaped cluster metrics without performing a separate shaping calculation.
pub fn svg_text_layout(
    xml: &str,
    element_id: &str,
    font_db: Arc<fontdb::Database>,
    default_font_family: &str,
) -> Result<Option<SvgTextLayout>, String> {
    let tree = parse_svg_with_clusters(xml, font_db, default_font_family, true)?;
    let Some(usvg::Node::Text(text)) = tree.node_by_id(element_id) else {
        return Ok(None);
    };
    let chunks = text
        .chunks()
        .iter()
        .map(|chunk| chunk.text().to_owned())
        .collect();
    let mut clusters = Vec::new();
    for span in text.layouted() {
        for cluster in &span.clusters {
            let t = text.abs_transform().pre_concat(cluster.transform);
            clusters.push(SvgTextCluster {
                chunk_index: cluster.chunk_index,
                byte_start: cluster.byte_range.start,
                byte_end: cluster.byte_range.end,
                transform: [t.sx, t.ky, t.kx, t.sy, t.tx, t.ty],
                advance: cluster.advance,
                ascent: cluster.ascent,
                descent: cluster.descent,
                right_to_left: cluster.right_to_left,
            });
        }
    }
    Ok(Some(SvgTextLayout {
        chunks,
        clusters,
        viewport_width: tree.size().width(),
        viewport_height: tree.size().height(),
    }))
}
