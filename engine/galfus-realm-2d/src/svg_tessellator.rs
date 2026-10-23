//! GPU-accelerated vector tessellation for SVG documents using lyon and usvg.
//!
//! Converts SVG paths, basic shapes, and text into 2D indexed triangle meshes
//! compatible with the Galfus Realm 2D render pipeline. Strictly operates on
//! in-memory buffers with zero filesystem access.

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

/// 9-float vertex format matching Galfus 2D pipeline: Pos(3) + UV(2) + Col(4).
pub type SvgVertex = [f32; 9];

/// Decoded embedded image asset extracted from SVG data URI.
pub struct SvgEmbeddedImage {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub start_index: u32,
    pub index_count: u32,
}

/// Tessellated SVG geometry ready for GPU buffer upload.
pub struct TessellatedSvgMesh {
    pub vertices: Vec<SvgVertex>,
    pub indices: Vec<u32>,
    pub dimensions: Vec2,
    pub embedded_images: Vec<SvgEmbeddedImage>,
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

/// Maps an (x, y) point through a tiny_skia transform.
#[inline]
fn map_pt(ts: &tiny_skia::Transform, x: f32, y: f32) -> (f32, f32) {
    let mut pt = tiny_skia::Point::from_xy(x, y);
    ts.map_point(&mut pt);
    (pt.x, pt.y)
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
    let opt = usvg::Options {
        resources_dir: None,
        fontdb: font_db,
        font_family: default_font_family.to_string(),
        ..Default::default()
    };

    let tree = Tree::from_str(xml, &opt).map_err(|e| format!("SVG parsing failed: {e}"))?;
    let size = tree.size();
    let (vw, vh) = (size.width(), size.height());
    let half_w = vw / 2.0;
    let half_h = vh / 2.0;

    let mut buffers: VertexBuffers<SvgVertex, u32> = VertexBuffers::new();
    let mut fill_tess = FillTessellator::new();
    let mut stroke_tess = StrokeTessellator::new();
    let mut embedded_images = Vec::new();

    tessellate_group(
        tree.root(),
        &mut buffers,
        &mut fill_tess,
        &mut stroke_tess,
        &mut embedded_images,
        half_w,
        half_h,
        vw,
        vh,
    )?;

    Ok(TessellatedSvgMesh {
        vertices: buffers.vertices,
        indices: buffers.indices,
        dimensions: Vec2::new(vw, vh),
        embedded_images,
    })
}

#[allow(clippy::too_many_arguments)]
fn tessellate_group(
    group: &usvg::Group,
    buffers: &mut VertexBuffers<SvgVertex, u32>,
    fill_tess: &mut FillTessellator,
    stroke_tess: &mut StrokeTessellator,
    embedded_images: &mut Vec<SvgEmbeddedImage>,
    half_w: f32,
    half_h: f32,
    vw: f32,
    vh: f32,
) -> Result<(), String> {
    for node in group.children() {
        match node {
            usvg::Node::Group(child_group) => {
                tessellate_group(
                    child_group,
                    buffers,
                    fill_tess,
                    stroke_tess,
                    embedded_images,
                    half_w,
                    half_h,
                    vw,
                    vh,
                )?;
            }
            usvg::Node::Path(path) => {
                tessellate_path_node(
                    path,
                    buffers,
                    fill_tess,
                    stroke_tess,
                    half_w,
                    half_h,
                    vw,
                    vh,
                )?;
            }
            usvg::Node::Image(img) => {
                tessellate_image_node(img, buffers, embedded_images, half_w, half_h, vw, vh)?;
            }
            usvg::Node::Text(text) => {
                tessellate_group(
                    text.flattened(),
                    buffers,
                    fill_tess,
                    stroke_tess,
                    embedded_images,
                    half_w,
                    half_h,
                    vw,
                    vh,
                )?;
            }
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn tessellate_path_node(
    path: &usvg::Path,
    buffers: &mut VertexBuffers<SvgVertex, u32>,
    fill_tess: &mut FillTessellator,
    stroke_tess: &mut StrokeTessellator,
    half_w: f32,
    half_h: f32,
    vw: f32,
    vh: f32,
) -> Result<(), String> {
    let lyon_path = usvg_path_to_lyon(path);
    let transform = path.abs_transform();
    let inv_w = if vw > 0.0 { 1.0 / vw } else { 1.0 };
    let inv_h = if vh > 0.0 { 1.0 / vh } else { 1.0 };

    // Fill Pass
    if let Some(fill) = path.fill() {
        let rule = match fill.rule() {
            usvg::FillRule::NonZero => FillRule::NonZero,
            usvg::FillRule::EvenOdd => FillRule::EvenOdd,
        };
        let options = FillOptions::default().with_fill_rule(rule);

        fill_tess
            .tessellate_path(
                &lyon_path,
                &options,
                &mut BuffersBuilder::new(buffers, |v: FillVertex| {
                    let p = v.position();
                    let (mx, my) = map_pt(&transform, p.x, p.y);
                    let local_x = (mx - half_w) * inv_w;
                    let local_y = (half_h - my) * inv_h;
                    let u = mx * inv_w;
                    let v_uv = my * inv_h;
                    let color = resolve_paint_at(fill.paint(), fill.opacity().get(), mx, my);
                    [
                        local_x, local_y, 0.0, u, v_uv, color[0], color[1], color[2], color[3],
                    ]
                }),
            )
            .map_err(|e| format!("Path fill tessellation failed: {e:?}"))?;

        // Fill Fringe: 1px analytic feathering band along boundary when no stroke exists
        if path.stroke().is_none() {
            let fringe_opt = StrokeOptions::default()
                .with_line_width(1.0)
                .with_line_cap(LineCap::Round)
                .with_line_join(LineJoin::Round);

            let _ = stroke_tess.tessellate_path(
                &lyon_path,
                &fringe_opt,
                &mut BuffersBuilder::new(buffers, |v: StrokeVertex| {
                    let p = v.position();
                    let (mx, my) = map_pt(&transform, p.x, p.y);
                    let local_x = (mx - half_w) * inv_w;
                    let local_y = (half_h - my) * inv_h;
                    let u = mx * inv_w;
                    let v_uv = my * inv_h;
                    let mut color = resolve_paint_at(fill.paint(), fill.opacity().get(), mx, my);
                    color[3] *= 0.45;
                    [
                        local_x, local_y, 0.0, u, v_uv, color[0], color[1], color[2], color[3],
                    ]
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

        if width <= 1.2 {
            // Adaptive subpixel coverage for thin lines
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
                        let (mx, my) = map_pt(&transform, p.x, p.y);
                        let local_x = (mx - half_w) * inv_w;
                        let local_y = (half_h - my) * inv_h;
                        let u = mx * inv_w;
                        let v_uv = my * inv_h;
                        let mut color =
                            resolve_paint_at(stroke.paint(), stroke.opacity().get(), mx, my);
                        color[3] *= eff_alpha_scale;
                        [
                            local_x, local_y, 0.0, u, v_uv, color[0], color[1], color[2], color[3],
                        ]
                    }),
                )
                .map_err(|e| format!("Path stroke tessellation failed: {e:?}"))?;
        } else {
            // Dual-layer Feathering:
            // 1. Soft fringe penumbra
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
                    let (mx, my) = map_pt(&transform, p.x, p.y);
                    let local_x = (mx - half_w) * inv_w;
                    let local_y = (half_h - my) * inv_h;
                    let u = mx * inv_w;
                    let v_uv = my * inv_h;
                    let mut color =
                        resolve_paint_at(stroke.paint(), stroke.opacity().get(), mx, my);
                    color[3] *= 0.45;
                    [
                        local_x, local_y, 0.0, u, v_uv, color[0], color[1], color[2], color[3],
                    ]
                }),
            );

            // 2. Solid core umbra
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
                        let (mx, my) = map_pt(&transform, p.x, p.y);
                        let local_x = (mx - half_w) * inv_w;
                        let local_y = (half_h - my) * inv_h;
                        let u = mx * inv_w;
                        let v_uv = my * inv_h;
                        let color =
                            resolve_paint_at(stroke.paint(), stroke.opacity().get(), mx, my);
                        [
                            local_x, local_y, 0.0, u, v_uv, color[0], color[1], color[2], color[3],
                        ]
                    }),
                )
                .map_err(|e| format!("Path stroke tessellation failed: {e:?}"))?;
        }
    }

    Ok(())
}

fn tessellate_image_node(
    img: &usvg::Image,
    buffers: &mut VertexBuffers<SvgVertex, u32>,
    embedded_images: &mut Vec<SvgEmbeddedImage>,
    half_w: f32,
    half_h: f32,
    vw: f32,
    vh: f32,
) -> Result<(), String> {
    let (width, height, rgba) = match img.kind() {
        usvg::ImageKind::PNG(data) => {
            let pix = tiny_skia::Pixmap::decode_png(data)
                .map_err(|e| format!("Failed to decode PNG in SVG: {e:?}"))?;
            (pix.width(), pix.height(), pix.take())
        }
        _ => return Ok(()),
    };

    let bbox = img.bounding_box();
    let transform = img.abs_transform();
    let inv_w = if vw > 0.0 { 1.0 / vw } else { 1.0 };
    let inv_h = if vh > 0.0 { 1.0 / vh } else { 1.0 };

    let corners = [
        (bbox.left(), bbox.top()),
        (bbox.right(), bbox.top()),
        (bbox.right(), bbox.bottom()),
        (bbox.left(), bbox.bottom()),
    ];

    let start_v = buffers.vertices.len() as u32;
    let start_i = buffers.indices.len() as u32;

    for (i, (cx, cy)) in corners.iter().enumerate() {
        let (mx, my) = map_pt(&transform, *cx, *cy);
        let local_x = (mx - half_w) * inv_w;
        let local_y = (half_h - my) * inv_h;
        let u = mx * inv_w;
        let v = my * inv_h;
        let (u_tex, v_tex) = match i {
            0 => (0.0, 0.0),
            1 => (1.0, 0.0),
            2 => (1.0, 1.0),
            _ => (0.0, 1.0),
        };
        buffers
            .vertices
            .push([local_x, local_y, 0.0, u, v, u_tex, v_tex, 1.0, 1.0]);
    }

    buffers.indices.extend_from_slice(&[
        start_v,
        start_v + 1,
        start_v + 2,
        start_v + 2,
        start_v + 3,
        start_v,
    ]);

    embedded_images.push(SvgEmbeddedImage {
        width,
        height,
        rgba,
        start_index: start_i,
        index_count: 6,
    });

    Ok(())
}

#[cfg(test)]
#[path = "svg_tessellator_tests.rs"]
mod tests;
