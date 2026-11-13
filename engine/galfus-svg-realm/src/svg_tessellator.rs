//! GPU-accelerated vector tessellation for SVG documents using lyon and usvg.
//!
//! Converts SVG paths, basic shapes, `<image textureId="...">`, `<clipPath>`, and text
//! into 2D indexed triangle meshes compatible with the Galfus Realm 2D render pipeline.
//! Strictly operates on in-memory buffers with zero filesystem access.

use glam::Vec2;
use lyon_tessellation::math::point;
use lyon_tessellation::path::Path as LyonPath;
use lyon_tessellation::{
    BuffersBuilder, FillOptions, FillRule, FillTessellator, FillVertex, LineCap, LineJoin,
    StrokeOptions, StrokeTessellator, StrokeVertex, VertexBuffers,
};
use resvg::tiny_skia;
use resvg::usvg::{self, Tree, fontdb};
use std::sync::Arc;

use crate::svg_clip::{
    ClipLayer, append_sub_mesh, apply_clip_stack, compute_text_cache_key, get_cached_text, map_pt,
    push_clip_path_layers, resolve_clipped_element_bounds, store_cached_text,
    tessellate_image_node,
};

/// 9-float vertex format matching Galfus 2D pipeline: Pos(3) + UV(2) + Col(4).
pub type SvgVertex = crate::vector_geometry::VectorVertex;

/// Bounds in the rendered SVG's viewport coordinates, before the entity transform.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SvgElementRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub viewport_width: f32,
    pub viewport_height: f32,
}

/// A contiguous sub-mesh within a tessellated SVG document, either untextured vector
/// geometry (`texture_id: None`) or a textured `<image textureId="...">` quad (`texture_id: Some`).
#[derive(Debug, Clone)]
pub struct SvgSubMesh {
    pub vertices: Vec<SvgVertex>,
    pub indices: Vec<u32>,
    pub texture_id: Option<u32>,
    pub pixelated: bool,
}

/// Tessellated SVG geometry ready for GPU buffer upload.
pub struct TessellatedSvgMesh {
    pub vertices: Vec<SvgVertex>,
    pub indices: Vec<u32>,
    pub dimensions: Vec2,
    pub sub_meshes: Vec<SvgSubMesh>,
}

pub(crate) fn parse_svg(
    xml: &str,
    font_db: Arc<fontdb::Database>,
    default_font_family: &str,
) -> Result<Tree, String> {
    parse_svg_with_clusters(xml, font_db, default_font_family, false)
}

pub(crate) fn parse_svg_with_clusters(
    xml: &str,
    font_db: Arc<fontdb::Database>,
    default_font_family: &str,
    collect_text_clusters: bool,
) -> Result<Tree, String> {
    let opt = usvg::Options {
        resources_dir: None,
        fontdb: font_db,
        font_family: default_font_family.to_string(),
        collect_text_clusters,
        ..Default::default()
    };
    Tree::from_str(xml, &opt).map_err(|e| format!("SVG parsing failed: {e}"))
}

/// Resolves the geometric bounds of `element_id` from an already-parsed `usvg::Tree`,
/// clipped against any active ancestor `<clipPath>` elements.
pub fn svg_element_rect_from_tree(tree: &Tree, element_id: &str) -> Option<SvgElementRect> {
    let bounds = resolve_clipped_element_bounds(tree.root(), element_id)?;
    if bounds.width() <= 0.0 || bounds.height() <= 0.0 {
        return None;
    }
    Some(SvgElementRect {
        x: bounds.x(),
        y: bounds.y(),
        width: bounds.width(),
        height: bounds.height(),
        viewport_width: tree.size().width(),
        viewport_height: tree.size().height(),
    })
}

/// Resolves the geometric bounds using the same SVG parser and font database as rendering,
/// clipped against any active ancestor `<clipPath>` elements.
pub fn svg_element_rect(
    xml: &str,
    element_id: &str,
    font_db: Arc<fontdb::Database>,
    default_font_family: &str,
) -> Result<Option<SvgElementRect>, String> {
    let tree = parse_svg(xml, font_db, default_font_family)?;
    Ok(svg_element_rect_from_tree(&tree, element_id))
}

/// Converts a usvg Path into a lyon Path.
pub fn usvg_path_to_lyon(path: &usvg::Path) -> LyonPath {
    let mut builder = LyonPath::builder();
    let mut in_subpath = false;

    for seg in path.data().segments() {
        match seg {
            tiny_skia::PathSegment::MoveTo(p) => {
                if in_subpath {
                    builder.end(false);
                }
                builder.begin(point(p.x, p.y));
                in_subpath = true;
            }
            tiny_skia::PathSegment::LineTo(p) => {
                if in_subpath {
                    builder.line_to(point(p.x, p.y));
                }
            }
            tiny_skia::PathSegment::QuadTo(p1, p2) => {
                if in_subpath {
                    builder.quadratic_bezier_to(point(p1.x, p1.y), point(p2.x, p2.y));
                }
            }
            tiny_skia::PathSegment::CubicTo(p1, p2, p3) => {
                if in_subpath {
                    builder.cubic_bezier_to(
                        point(p1.x, p1.y),
                        point(p2.x, p2.y),
                        point(p3.x, p3.y),
                    );
                }
            }
            tiny_skia::PathSegment::Close => {
                if in_subpath {
                    builder.end(true);
                    in_subpath = false;
                }
            }
        }
    }

    if in_subpath {
        builder.end(false);
    }

    builder.build()
}

fn sample_stops(stops: &[usvg::Stop], t: f32, base_opacity: f32) -> [f32; 4] {
    if stops.is_empty() {
        return [1.0, 1.0, 1.0, base_opacity];
    }
    if stops.len() == 1 || t <= stops[0].offset().get() {
        let c = stops[0].color();
        let a = base_opacity * stops[0].opacity().get();
        return [
            c.red as f32 / 255.0,
            c.green as f32 / 255.0,
            c.blue as f32 / 255.0,
            a,
        ];
    }
    let last = &stops[stops.len() - 1];
    if t >= last.offset().get() {
        let c = last.color();
        let a = base_opacity * last.opacity().get();
        return [
            c.red as f32 / 255.0,
            c.green as f32 / 255.0,
            c.blue as f32 / 255.0,
            a,
        ];
    }
    for i in 0..stops.len() - 1 {
        let o0 = stops[i].offset().get();
        let o1 = stops[i + 1].offset().get();
        if t >= o0 && t <= o1 {
            let span = (o1 - o0).max(1e-5);
            let factor = ((t - o0) / span).clamp(0.0, 1.0);
            let c0 = stops[i].color();
            let c1 = stops[i + 1].color();
            let a0 = base_opacity * stops[i].opacity().get();
            let a1 = base_opacity * stops[i + 1].opacity().get();
            let r = (c0.red as f32 * (1.0 - factor) + c1.red as f32 * factor) / 255.0;
            let g = (c0.green as f32 * (1.0 - factor) + c1.green as f32 * factor) / 255.0;
            let b = (c0.blue as f32 * (1.0 - factor) + c1.blue as f32 * factor) / 255.0;
            let a = a0 * (1.0 - factor) + a1 * factor;
            return [r, g, b, a];
        }
    }
    [1.0, 1.0, 1.0, base_opacity]
}

fn resolve_paint_at(paint: &usvg::Paint, opacity: f32, mx: f32, my: f32) -> [f32; 4] {
    match paint {
        usvg::Paint::Color(c) => [
            c.red as f32 / 255.0,
            c.green as f32 / 255.0,
            c.blue as f32 / 255.0,
            opacity,
        ],
        usvg::Paint::LinearGradient(lg) => {
            let x1 = lg.x1();
            let y1 = lg.y1();
            let x2 = lg.x2();
            let y2 = lg.y2();
            let dx = x2 - x1;
            let dy = y2 - y1;
            let len_sq = dx * dx + dy * dy;
            let t = if len_sq > 1e-6 {
                ((mx - x1) * dx + (my - y1) * dy) / len_sq
            } else {
                0.0
            };
            sample_stops(lg.stops(), t.clamp(0.0, 1.0), opacity)
        }
        usvg::Paint::RadialGradient(rg) => {
            let cx = rg.cx();
            let cy = rg.cy();
            let r = rg.r().get();
            let dx = mx - cx;
            let dy = my - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            let t = if r > 1e-6 { dist / r } else { 0.0 };
            sample_stops(rg.stops(), t.clamp(0.0, 1.0), opacity)
        }
        _ => [1.0, 1.0, 1.0, opacity],
    }
}

/// Tessellates an entire SVG XML string in-memory into 2D vertices and indices.
///
/// Ensures zero filesystem access by forcing `resources_dir = None`.
pub fn tessellate_svg(
    xml: &str,
    font_db: Arc<fontdb::Database>,
    default_font_family: &str,
) -> Result<TessellatedSvgMesh, String> {
    let tree = parse_svg(xml, font_db, default_font_family)?;
    tessellate_svg_tree(&tree)
}

struct SvgTessState {
    scratch_buf: VertexBuffers<SvgVertex, u32>,
    fill_tess: FillTessellator,
    stroke_tess: StrokeTessellator,
    clip_stack: Vec<ClipLayer>,
    half_w: f32,
    half_h: f32,
    vw: f32,
    vh: f32,
}

/// Tessellates an already-parsed `usvg::Tree` into 2D vertices and indices.
pub fn tessellate_svg_tree(tree: &Tree) -> Result<TessellatedSvgMesh, String> {
    let size = tree.size();
    let (vw, vh) = (size.width(), size.height());
    let mut all_buffers: VertexBuffers<SvgVertex, u32> = VertexBuffers::new();
    let mut sub_meshes = Vec::new();
    let mut state = SvgTessState {
        scratch_buf: VertexBuffers::new(),
        fill_tess: FillTessellator::new(),
        stroke_tess: StrokeTessellator::new(),
        clip_stack: Vec::new(),
        half_w: vw / 2.0,
        half_h: vh / 2.0,
        vw,
        vh,
    };

    tessellate_group(
        tree.root(),
        &mut state,
        &mut all_buffers,
        &mut sub_meshes,
        1.0,
    )?;

    Ok(TessellatedSvgMesh {
        vertices: all_buffers.vertices,
        indices: all_buffers.indices,
        dimensions: Vec2::new(vw, vh),
        sub_meshes,
    })
}

fn tessellate_group(
    group: &usvg::Group,
    state: &mut SvgTessState,
    all_buffers: &mut VertexBuffers<SvgVertex, u32>,
    sub_meshes: &mut Vec<SvgSubMesh>,
    parent_opacity: f32,
) -> Result<(), String> {
    let group_opacity = parent_opacity * group.opacity().get();
    if group_opacity <= 0.0 {
        return Ok(());
    }

    let inv_w = if state.vw > 0.0 { 1.0 / state.vw } else { 1.0 };
    let inv_h = if state.vh > 0.0 { 1.0 / state.vh } else { 1.0 };

    let pushed_clips = if let Some(clip) = group.clip_path() {
        push_clip_path_layers(
            clip,
            group.abs_transform(),
            &mut state.fill_tess,
            state.half_w,
            state.half_h,
            inv_w,
            inv_h,
            &mut state.clip_stack,
        )
    } else {
        0
    };

    for node in group.children() {
        match node {
            usvg::Node::Group(child_group) => {
                tessellate_group(child_group, state, all_buffers, sub_meshes, group_opacity)?;
            }
            usvg::Node::Path(path) => {
                if !path.is_visible() {
                    continue;
                }
                state.scratch_buf.vertices.clear();
                state.scratch_buf.indices.clear();
                tessellate_path_node(
                    path,
                    &mut state.scratch_buf,
                    &mut state.fill_tess,
                    &mut state.stroke_tess,
                    group_opacity,
                    state.half_w,
                    state.half_h,
                    state.vw,
                    state.vh,
                )?;
                apply_clip_stack(&mut state.scratch_buf, &state.clip_stack);
                append_sub_mesh(&state.scratch_buf, None, false, all_buffers, sub_meshes);
            }
            usvg::Node::Image(img) => {
                tessellate_image_node(
                    img,
                    all_buffers,
                    sub_meshes,
                    &state.clip_stack,
                    group_opacity,
                    state.half_w,
                    state.half_h,
                    state.vw,
                    state.vh,
                )?;
            }
            usvg::Node::Text(text) => {
                if text.flattened().clip_path().is_none() {
                    let key = compute_text_cache_key(text, group_opacity, state.vw, state.vh);
                    let mut text_buf: VertexBuffers<SvgVertex, u32> = VertexBuffers::new();
                    if !get_cached_text(key, &mut text_buf) {
                        let mut text_subs: Vec<SvgSubMesh> = Vec::new();
                        let saved_clips = std::mem::take(&mut state.clip_stack);
                        tessellate_group(
                            text.flattened(),
                            state,
                            &mut text_buf,
                            &mut text_subs,
                            group_opacity,
                        )?;
                        state.clip_stack = saved_clips;
                        store_cached_text(key, text_buf.clone());
                    }
                    apply_clip_stack(&mut text_buf, &state.clip_stack);
                    append_sub_mesh(&text_buf, None, false, all_buffers, sub_meshes);
                } else {
                    tessellate_group(
                        text.flattened(),
                        state,
                        all_buffers,
                        sub_meshes,
                        group_opacity,
                    )?;
                }
            }
        }
    }

    for _ in 0..pushed_clips {
        state.clip_stack.pop();
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn tessellate_path_node(
    path: &usvg::Path,
    buffers: &mut VertexBuffers<SvgVertex, u32>,
    fill_tess: &mut FillTessellator,
    stroke_tess: &mut StrokeTessellator,
    group_opacity: f32,
    half_w: f32,
    half_h: f32,
    vw: f32,
    vh: f32,
) -> Result<(), String> {
    let lyon_path = usvg_path_to_lyon(path);
    let transform = path.abs_transform();
    let inv_w = if vw > 0.0 { 1.0 / vw } else { 1.0 };
    let inv_h = if vh > 0.0 { 1.0 / vh } else { 1.0 };
    let make_vertex = |px: f32, py: f32, paint: &usvg::Paint, opacity: f32, alpha_scale: f32| {
        let (mx, my) = map_pt(&transform, px, py);
        let mut color = resolve_paint_at(paint, opacity, mx, my);
        color[3] *= alpha_scale;
        [
            (mx - half_w) * inv_w,
            (half_h - my) * inv_h,
            0.0,
            mx * inv_w,
            my * inv_h,
            color[0],
            color[1],
            color[2],
            color[3],
        ]
    };

    // Fill Pass
    if let Some(fill) = path.fill() {
        let rule = match fill.rule() {
            usvg::FillRule::NonZero => FillRule::NonZero,
            usvg::FillRule::EvenOdd => FillRule::EvenOdd,
        };
        let options = FillOptions::default()
            .with_tolerance(0.25)
            .with_fill_rule(rule);
        let fill_opacity = fill.opacity().get() * group_opacity;

        fill_tess
            .tessellate_path(
                &lyon_path,
                &options,
                &mut BuffersBuilder::new(buffers, |v: FillVertex| {
                    let p = v.position();
                    make_vertex(p.x, p.y, fill.paint(), fill_opacity, 1.0)
                }),
            )
            .map_err(|e| format!("Path fill tessellation failed: {e:?}"))?;

        // Fill Fringe: 1px analytic feathering band along boundary when no stroke exists
        if path.stroke().is_none() {
            let fringe_opt = StrokeOptions::default()
                .with_tolerance(0.35)
                .with_line_width(1.0)
                .with_line_cap(LineCap::Butt)
                .with_line_join(LineJoin::Bevel);

            let _ = stroke_tess.tessellate_path(
                &lyon_path,
                &fringe_opt,
                &mut BuffersBuilder::new(buffers, |v: StrokeVertex| {
                    let p = v.position();
                    make_vertex(p.x, p.y, fill.paint(), fill_opacity, 0.45)
                }),
            );
        }
    }

    // Stroke Pass with Analytic Edge Feathering
    if let Some(stroke) = path.stroke() {
        let cap = match stroke.linecap() {
            usvg::LineCap::Butt => LineCap::Butt,
            usvg::LineCap::Round => LineCap::Round,
            usvg::LineCap::Square => LineCap::Square,
        };

        let join = match stroke.linejoin() {
            usvg::LineJoin::Miter | usvg::LineJoin::MiterClip => LineJoin::Miter,
            usvg::LineJoin::Round => LineJoin::Round,
            usvg::LineJoin::Bevel => LineJoin::Bevel,
        };

        let width = stroke.width().get();
        let miter_limit = stroke.miterlimit().get();
        let feather = 1.0f32;
        let stroke_opacity = stroke.opacity().get() * group_opacity;

        if width <= 1.2 {
            let eff_width = 1.2f32;
            let eff_alpha_scale = (width / eff_width).clamp(0.25, 1.0);
            let options = StrokeOptions::default()
                .with_line_width(eff_width)
                .with_line_cap(cap)
                .with_line_join(join)
                .with_miter_limit(miter_limit);

            stroke_tess
                .tessellate_path(
                    &lyon_path,
                    &options,
                    &mut BuffersBuilder::new(buffers, |v: StrokeVertex| {
                        let p = v.position();
                        make_vertex(p.x, p.y, stroke.paint(), stroke_opacity, eff_alpha_scale)
                    }),
                )
                .map_err(|e| format!("Path stroke tessellation failed: {e:?}"))?;
        } else {
            let fringe_opt = StrokeOptions::default()
                .with_line_width(width + feather)
                .with_line_cap(cap)
                .with_line_join(join)
                .with_miter_limit(miter_limit);

            let _ = stroke_tess.tessellate_path(
                &lyon_path,
                &fringe_opt,
                &mut BuffersBuilder::new(buffers, |v: StrokeVertex| {
                    let p = v.position();
                    make_vertex(p.x, p.y, stroke.paint(), stroke_opacity, 0.45)
                }),
            );

            let core_width = (width - feather * 0.5).max(0.2);
            let core_opt = StrokeOptions::default()
                .with_line_width(core_width)
                .with_line_cap(cap)
                .with_line_join(join)
                .with_miter_limit(miter_limit);

            stroke_tess
                .tessellate_path(
                    &lyon_path,
                    &core_opt,
                    &mut BuffersBuilder::new(buffers, |v: StrokeVertex| {
                        let p = v.position();
                        make_vertex(p.x, p.y, stroke.paint(), stroke_opacity, 1.0)
                    }),
                )
                .map_err(|e| format!("Path stroke tessellation failed: {e:?}"))?;
        }
    }

    Ok(())
}

#[cfg(test)]
#[path = "svg_tessellator_tests.rs"]
mod tests;
