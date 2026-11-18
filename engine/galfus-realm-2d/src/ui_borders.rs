//! Geometry for rounded panel borders with independent side widths and colors.

use lyon_tessellation::VertexBuffers;
use lyon_tessellation::{
    BuffersBuilder, LineCap, LineJoin, StrokeOptions, StrokeTessellator, StrokeVertex,
};

use crate::ui_text::build_rounded_rectangle_path;
use crate::vector_geometry::VectorVertex;

#[derive(Clone, Copy)]
struct Corner {
    outer: [f32; 2],
    inner: [f32; 2],
    outer_radius: f32,
    inner_radius: [f32; 2],
}

fn tessellate_stroke_path(
    buffers: &mut VertexBuffers<VectorVertex, u32>,
    path: &lyon_tessellation::path::Path,
    width: f32,
    color: [f32; 4],
    z: f32,
    cap: LineCap,
    join: LineJoin,
) {
    let mut stroke_tess = StrokeTessellator::new();
    let feather = 1.0f32;
    let eff_width = width.max(1.0);
    let eff_alpha_scale = if width < 1.0 {
        (width / 1.0).clamp(0.25, 1.0)
    } else {
        1.0
    };

    let fringe_opt = StrokeOptions::default()
        .with_tolerance(0.05)
        .with_line_width(eff_width + feather)
        .with_line_cap(cap)
        .with_line_join(join);

    let _ = stroke_tess.tessellate_path(
        path,
        &fringe_opt,
        &mut BuffersBuilder::new(buffers, |v: StrokeVertex| {
            let p = v.position();
            [
                p.x,
                p.y,
                z,
                0.0,
                0.0,
                color[0],
                color[1],
                color[2],
                color[3] * eff_alpha_scale * 0.45,
            ]
        }),
    );

    let core_width = (eff_width - feather * 0.5).max(0.2);
    let core_opt = StrokeOptions::default()
        .with_tolerance(0.05)
        .with_line_width(core_width)
        .with_line_cap(cap)
        .with_line_join(join);

    let _ = stroke_tess.tessellate_path(
        path,
        &core_opt,
        &mut BuffersBuilder::new(buffers, |v: StrokeVertex| {
            let p = v.position();
            [
                p.x,
                p.y,
                z + 0.00001,
                0.0,
                0.0,
                color[0],
                color[1],
                color[2],
                color[3] * eff_alpha_scale,
            ]
        }),
    );
}

/// Appends border geometry for the panel's rounded rectangle.
pub(crate) fn append_borders(
    buffers: &mut VertexBuffers<VectorVertex, u32>,
    rect: [f32; 4],
    radii: [f32; 4],
    widths: [f32; 4],
    colors: [[f32; 4]; 4],
    z: f32,
) {
    let [x, y, w, h] = rect;
    if w <= 0.0 || h <= 0.0 {
        return;
    }
    if widths.iter().all(|&width| width <= 0.0) || colors.iter().all(|c| c[3] <= 0.0) {
        return;
    }

    // Check if border widths and colors are uniform on all 4 sides.
    let is_uniform_width = (widths[0] - widths[1]).abs() < 1e-4
        && (widths[1] - widths[2]).abs() < 1e-4
        && (widths[2] - widths[3]).abs() < 1e-4;

    let is_uniform_color = (colors[0][0] - colors[1][0]).abs() < 1e-4
        && (colors[0][1] - colors[1][1]).abs() < 1e-4
        && (colors[0][2] - colors[1][2]).abs() < 1e-4
        && (colors[0][3] - colors[1][3]).abs() < 1e-4
        && (colors[1][0] - colors[2][0]).abs() < 1e-4
        && (colors[1][1] - colors[2][1]).abs() < 1e-4
        && (colors[1][2] - colors[2][2]).abs() < 1e-4
        && (colors[1][3] - colors[2][3]).abs() < 1e-4
        && (colors[2][0] - colors[3][0]).abs() < 1e-4
        && (colors[2][1] - colors[3][1]).abs() < 1e-4
        && (colors[2][2] - colors[3][2]).abs() < 1e-4
        && (colors[2][3] - colors[3][3]).abs() < 1e-4;

    if is_uniform_width && is_uniform_color {
        let width = widths[0].clamp(0.0, (w * 0.5).min(h * 0.5));
        let color = colors[0];
        if width <= 0.0 || color[3] <= 0.0 {
            return;
        }

        let half_w = width * 0.5;
        let inner_w = (w - width).max(0.0);
        let inner_h = (h - width).max(0.0);
        let center_radii = radii.map(|r| (r - half_w).max(0.0));
        let path =
            build_rounded_rectangle_path(x + half_w, y + half_w, inner_w, inner_h, center_radii);
        let join = if radii.iter().any(|&r| r > 0.0) {
            LineJoin::Round
        } else {
            LineJoin::Miter
        };
        tessellate_stroke_path(buffers, &path, width, color, z, LineCap::Round, join);
        return;
    }

    // Fallback for panels with non-uniform side widths or colors
    let [mut top, mut right, mut bottom, mut left] = widths.map(|width| width.max(0.0));
    if left + right > w {
        let scale = w / (left + right);
        left *= scale;
        right *= scale;
    }
    if top + bottom > h {
        let scale = h / (top + bottom);
        top *= scale;
        bottom *= scale;
    }
    let [tl, tr, br, bl] = radii.map(|radius| radius.clamp(0.0, (w * 0.5).min(h * 0.5)));
    let corners = [
        Corner {
            outer: [x + tl, y + h - tl],
            inner: [
                x + left + (tl - left).max(0.0),
                y + h - top - (tl - top).max(0.0),
            ],
            outer_radius: tl,
            inner_radius: [(tl - left).max(0.0), (tl - top).max(0.0)],
        },
        Corner {
            outer: [x + w - tr, y + h - tr],
            inner: [
                x + w - right - (tr - right).max(0.0),
                y + h - top - (tr - top).max(0.0),
            ],
            outer_radius: tr,
            inner_radius: [(tr - right).max(0.0), (tr - top).max(0.0)],
        },
        Corner {
            outer: [x + w - br, y + br],
            inner: [
                x + w - right - (br - right).max(0.0),
                y + bottom + (br - bottom).max(0.0),
            ],
            outer_radius: br,
            inner_radius: [(br - right).max(0.0), (br - bottom).max(0.0)],
        },
        Corner {
            outer: [x + bl, y + bl],
            inner: [
                x + left + (bl - left).max(0.0),
                y + bottom + (bl - bottom).max(0.0),
            ],
            outer_radius: bl,
            inner_radius: [(bl - left).max(0.0), (bl - bottom).max(0.0)],
        },
    ];
    // Each corner is divided at 45 degrees, giving adjacent sides a shared edge.
    let sides = [
        [(0, 135.0, 90.0), (1, 90.0, 45.0)],
        [(1, 45.0, 0.0), (2, 0.0, -45.0)],
        [(2, -45.0, -90.0), (3, -90.0, -135.0)],
        [(3, -135.0, -180.0), (0, 180.0, 135.0)],
    ];
    for (side, arcs) in sides.iter().enumerate() {
        let width = widths[side];
        if width <= 0.0 || colors[side][3] <= 0.0 {
            continue;
        }
        let mut color = colors[side];
        if width <= 1.2 {
            let eff_alpha_scale = (width / 1.2).clamp(0.25, 1.0);
            color[3] *= eff_alpha_scale;
        }
        let mut pairs = Vec::with_capacity(12);
        for &(corner, start, end) in arcs {
            let c = corners[corner];
            if c.outer_radius <= 0.0 {
                pairs.push((c.outer, c.inner));
            } else {
                for step in 0..=5 {
                    let angle = (start + (end - start) * step as f32 / 5.0_f32).to_radians();
                    let (sin, cos) = angle.sin_cos();
                    pairs.push((
                        [
                            c.outer[0] + c.outer_radius * cos,
                            c.outer[1] + c.outer_radius * sin,
                        ],
                        [
                            c.inner[0] + c.inner_radius[0] * cos,
                            c.inner[1] + c.inner_radius[1] * sin,
                        ],
                    ));
                }
            }
        }
        let base = buffers.vertices.len() as u32;
        for (outer, inner) in pairs.iter() {
            for p in [outer, inner] {
                buffers.vertices.push([
                    p[0], p[1], z, 0.0, 0.0, color[0], color[1], color[2], color[3],
                ]);
            }
        }
        for index in 0..pairs.len() - 1 {
            let a = base + (index as u32) * 2;
            buffers
                .indices
                .extend_from_slice(&[a, a + 1, a + 2, a + 2, a + 1, a + 3]);
        }
    }
}
