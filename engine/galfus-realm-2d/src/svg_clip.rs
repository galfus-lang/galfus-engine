//! 2D geometric clipping for SVG `<clipPath>` elements and element bounding boxes.
//!
//! Evaluates `usvg::ClipPath` hierarchies in normalized SVG local coordinates
//! and clips tessellated triangle meshes (`SvgVertex`) against active clip masks
//! using Sutherland-Hodgman triangle clipping with attribute interpolation.

use lyon_tessellation::{
    BuffersBuilder, FillOptions, FillRule, FillTessellator, FillVertex, VertexBuffers,
};
use resvg::tiny_skia;
use resvg::usvg;

use crate::svg_tessellator::{SvgSubMesh, SvgVertex, usvg_path_to_lyon};

/// Clip layer representing the union of filled triangles from a single `<clipPath>`.
#[derive(Clone, Debug)]
pub struct ClipLayer {
    /// Triangles in SVG normalized local coordinates (`local_x`, `local_y`).
    pub triangles: Vec<[[f32; 2]; 3]>,
    /// Axis-aligned bounding box `[min_x, min_y, max_x, max_y]`.
    pub bounds: [f32; 4],
    /// Whether this layer is a pure axis-aligned rectangle matching `bounds`.
    pub is_rect: bool,
}

impl ClipLayer {
    pub fn new(triangles: Vec<[[f32; 2]; 3]>) -> Self {
        if triangles.is_empty() {
            return Self {
                triangles,
                bounds: [0.0; 4],
                is_rect: false,
            };
        }
        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        let mut area = 0.0f32;
        for t in &triangles {
            for p in t {
                min_x = min_x.min(p[0]);
                min_y = min_y.min(p[1]);
                max_x = max_x.max(p[0]);
                max_y = max_y.max(p[1]);
            }
            let (ax, ay) = (t[1][0] - t[0][0], t[1][1] - t[0][1]);
            let (bx, by) = (t[2][0] - t[0][0], t[2][1] - t[0][1]);
            area += 0.5 * (ax * by - ay * bx).abs();
        }
        let rect_area = ((max_x - min_x) * (max_y - min_y)).max(0.0);
        let is_rect = triangles.len() == 2 && (area - rect_area).abs() < 1e-4;
        Self {
            triangles,
            bounds: [min_x, min_y, max_x, max_y],
            is_rect,
        }
    }
}

/// Maps an (x, y) point through a tiny_skia transform.
#[inline]
pub(crate) fn map_pt(ts: &tiny_skia::Transform, x: f32, y: f32) -> (f32, f32) {
    let mut pt = tiny_skia::Point::from_xy(x, y);
    ts.map_point(&mut pt);
    (pt.x, pt.y)
}

/// Linearly interpolates two 9-float SVG vertices.
#[inline]
fn lerp_vertex(a: &SvgVertex, b: &SvgVertex, t: f32) -> SvgVertex {
    let mut out = [0.0f32; 9];
    for i in 0..9 {
        out[i] = a[i] + (b[i] - a[i]) * t;
    }
    out
}

/// Clips a convex polygon of `SvgVertex` against a directed half-plane edge `e0 -> e1`.
///
/// Keeps the side where `(e1 - e0) x (p - e0) * winding_sign >= -1e-6`.
fn clip_polygon_against_edge(
    poly: &[SvgVertex],
    e0: [f32; 2],
    e1: [f32; 2],
    winding_sign: f32,
) -> Vec<SvgVertex> {
    if poly.is_empty() {
        return Vec::new();
    }
    let edx = e1[0] - e0[0];
    let edy = e1[1] - e0[1];
    let dist = |v: &SvgVertex| (edx * (v[1] - e0[1]) - edy * (v[0] - e0[0])) * winding_sign;

    let mut out = Vec::with_capacity(poly.len() + 1);
    let mut prev = poly[poly.len() - 1];
    let mut prev_d = dist(&prev);
    let mut prev_in = prev_d >= -1e-6;

    for &curr in poly {
        let curr_d = dist(&curr);
        let curr_in = curr_d >= -1e-6;

        if curr_in {
            if !prev_in {
                let denom = prev_d - curr_d;
                let t = if denom.abs() > 1e-8 {
                    (prev_d / denom).clamp(0.0, 1.0)
                } else {
                    0.5
                };
                out.push(lerp_vertex(&prev, &curr, t));
            }
            out.push(curr);
        } else if prev_in {
            let denom = prev_d - curr_d;
            let t = if denom.abs() > 1e-8 {
                (prev_d / denom).clamp(0.0, 1.0)
            } else {
                0.5
            };
            out.push(lerp_vertex(&prev, &curr, t));
        }

        prev = curr;
        prev_d = curr_d;
        prev_in = curr_in;
    }

    out
}

/// Clips a single triangle `[SvgVertex; 3]` against a clip triangle `[[f32; 2]; 3]`.
fn clip_triangle_against_clip_tri(
    tri: &[SvgVertex; 3],
    clip_tri: &[[f32; 2]; 3],
    out_tris: &mut Vec<[SvgVertex; 3]>,
) {
    let c0 = clip_tri[0];
    let c1 = clip_tri[1];
    let c2 = clip_tri[2];
    let area2 = (c1[0] - c0[0]) * (c2[1] - c0[1]) - (c1[1] - c0[1]) * (c2[0] - c0[0]);
    if area2.abs() < 1e-8 {
        return;
    }
    let winding_sign = if area2 > 0.0 { 1.0 } else { -1.0 };

    let poly = clip_polygon_against_edge(tri, c0, c1, winding_sign);
    if poly.len() < 3 {
        return;
    }
    let poly = clip_polygon_against_edge(&poly, c1, c2, winding_sign);
    if poly.len() < 3 {
        return;
    }
    let poly = clip_polygon_against_edge(&poly, c2, c0, winding_sign);
    if poly.len() < 3 {
        return;
    }

    let v0 = poly[0];
    for i in 1..(poly.len() - 1) {
        let v1 = poly[i];
        let v2 = poly[i + 1];
        let tri_area = (v1[0] - v0[0]) * (v2[1] - v0[1]) - (v1[1] - v0[1]) * (v2[0] - v0[0]);
        if tri_area.abs() > 1e-9 {
            out_tris.push([v0, v1, v2]);
        }
    }
}

/// Clips an indexed triangle buffer in-place against a stack of active `ClipLayer`s.
pub fn apply_clip_stack(buffers: &mut VertexBuffers<SvgVertex, u32>, clip_stack: &[ClipLayer]) {
    if clip_stack.is_empty() || buffers.indices.is_empty() {
        return;
    }

    let mut b_min_x = f32::INFINITY;
    let mut b_min_y = f32::INFINITY;
    let mut b_max_x = f32::NEG_INFINITY;
    let mut b_max_y = f32::NEG_INFINITY;
    for v in &buffers.vertices {
        b_min_x = b_min_x.min(v[0]);
        b_min_y = b_min_y.min(v[1]);
        b_max_x = b_max_x.max(v[0]);
        b_max_y = b_max_y.max(v[1]);
    }

    let mut active_layers: Vec<&ClipLayer> = Vec::new();
    for layer in clip_stack {
        if layer.triangles.is_empty() {
            buffers.vertices.clear();
            buffers.indices.clear();
            return;
        }
        if b_max_x < layer.bounds[0] - 1e-5
            || b_min_x > layer.bounds[2] + 1e-5
            || b_max_y < layer.bounds[1] - 1e-5
            || b_min_y > layer.bounds[3] + 1e-5
        {
            buffers.vertices.clear();
            buffers.indices.clear();
            return;
        }
        if layer.is_rect
            && b_min_x >= layer.bounds[0] - 1e-5
            && b_max_x <= layer.bounds[2] + 1e-5
            && b_min_y >= layer.bounds[1] - 1e-5
            && b_max_y <= layer.bounds[3] + 1e-5
        {
            continue;
        }
        active_layers.push(layer);
    }

    if active_layers.is_empty() {
        return;
    }

    let mut current_tris: Vec<[SvgVertex; 3]> = Vec::with_capacity(buffers.indices.len() / 3);
    for &[i0, i1, i2] in buffers.indices.as_chunks::<3>().0 {
        let v0 = buffers.vertices[i0 as usize];
        let v1 = buffers.vertices[i1 as usize];
        let v2 = buffers.vertices[i2 as usize];
        current_tris.push([v0, v1, v2]);
    }

    for layer in active_layers {
        let mut next_tris = Vec::new();
        for tri in &current_tris {
            for clip_tri in &layer.triangles {
                clip_triangle_against_clip_tri(tri, clip_tri, &mut next_tris);
            }
        }
        current_tris = next_tris;
        if current_tris.is_empty() {
            break;
        }
    }

    buffers.vertices.clear();
    buffers.indices.clear();
    buffers.vertices.reserve(current_tris.len() * 3);
    buffers.indices.reserve(current_tris.len() * 3);

    for tri in current_tris {
        let base = buffers.vertices.len() as u32;
        buffers.vertices.extend_from_slice(&tri);
        buffers
            .indices
            .extend_from_slice(&[base, base + 1, base + 2]);
    }
}

/// Builds and pushes the `ClipLayer`(s) for a `usvg::ClipPath` onto `clip_stack`, returning
/// the number of layers pushed.
#[allow(clippy::too_many_arguments)]
pub fn push_clip_path_layers(
    clip: &usvg::ClipPath,
    base_ts: tiny_skia::Transform,
    fill_tess: &mut FillTessellator,
    half_w: f32,
    half_h: f32,
    inv_w: f32,
    inv_h: f32,
    clip_stack: &mut Vec<ClipLayer>,
) -> usize {
    let clip_ts = base_ts.pre_concat(clip.transform());
    let mut pushed = 0;

    if let Some(sub_clip) = clip.clip_path() {
        pushed += push_clip_path_layers(
            sub_clip, clip_ts, fill_tess, half_w, half_h, inv_w, inv_h, clip_stack,
        );
    }

    let mut triangles = Vec::new();
    collect_clip_group_triangles(
        clip.root(),
        clip_ts,
        fill_tess,
        half_w,
        half_h,
        inv_w,
        inv_h,
        &mut triangles,
    );

    clip_stack.push(ClipLayer::new(triangles));
    pushed + 1
}

#[allow(clippy::too_many_arguments)]
fn collect_clip_group_triangles(
    group: &usvg::Group,
    clip_ts: tiny_skia::Transform,
    fill_tess: &mut FillTessellator,
    half_w: f32,
    half_h: f32,
    inv_w: f32,
    inv_h: f32,
    out_triangles: &mut Vec<[[f32; 2]; 3]>,
) {
    let mut local_clip_stack = Vec::new();
    if let Some(group_clip) = group.clip_path() {
        let group_abs_ts = clip_ts.pre_concat(group.abs_transform());
        push_clip_path_layers(
            group_clip,
            group_abs_ts,
            fill_tess,
            half_w,
            half_h,
            inv_w,
            inv_h,
            &mut local_clip_stack,
        );
    }

    let mut group_tris = Vec::new();
    for node in group.children() {
        match node {
            usvg::Node::Group(child_group) => {
                collect_clip_group_triangles(
                    child_group,
                    clip_ts,
                    fill_tess,
                    half_w,
                    half_h,
                    inv_w,
                    inv_h,
                    &mut group_tris,
                );
            }
            usvg::Node::Path(path) => {
                if !path.is_visible() {
                    continue;
                }
                let lyon_path = usvg_path_to_lyon(path);
                let full_ts = clip_ts.pre_concat(path.abs_transform());
                let rule = path
                    .fill()
                    .map(|f| match f.rule() {
                        usvg::FillRule::NonZero => FillRule::NonZero,
                        usvg::FillRule::EvenOdd => FillRule::EvenOdd,
                    })
                    .unwrap_or(FillRule::NonZero);
                let options = FillOptions::default().with_fill_rule(rule);
                let mut temp: VertexBuffers<[f32; 2], u32> = VertexBuffers::new();
                if fill_tess
                    .tessellate_path(
                        &lyon_path,
                        &options,
                        &mut BuffersBuilder::new(&mut temp, |v: FillVertex| {
                            let p = v.position();
                            let (mx, my) = map_pt(&full_ts, p.x, p.y);
                            [(mx - half_w) * inv_w, (half_h - my) * inv_h]
                        }),
                    )
                    .is_ok()
                {
                    for &[i0, i1, i2] in temp.indices.as_chunks::<3>().0 {
                        group_tris.push([
                            temp.vertices[i0 as usize],
                            temp.vertices[i1 as usize],
                            temp.vertices[i2 as usize],
                        ]);
                    }
                }
            }
            usvg::Node::Text(text) => {
                collect_clip_group_triangles(
                    text.flattened(),
                    clip_ts,
                    fill_tess,
                    half_w,
                    half_h,
                    inv_w,
                    inv_h,
                    &mut group_tris,
                );
            }
            usvg::Node::Image(_) => {}
        }
    }

    if !local_clip_stack.is_empty() && !group_tris.is_empty() {
        let mut temp_buf: VertexBuffers<SvgVertex, u32> = VertexBuffers::new();
        for tri in group_tris {
            let base = temp_buf.vertices.len() as u32;
            for pt in tri {
                temp_buf
                    .vertices
                    .push([pt[0], pt[1], 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0]);
            }
            temp_buf
                .indices
                .extend_from_slice(&[base, base + 1, base + 2]);
        }
        apply_clip_stack(&mut temp_buf, &local_clip_stack);
        for &[i0, i1, i2] in temp_buf.indices.as_chunks::<3>().0 {
            let v0 = temp_buf.vertices[i0 as usize];
            let v1 = temp_buf.vertices[i1 as usize];
            let v2 = temp_buf.vertices[i2 as usize];
            out_triangles.push([[v0[0], v0[1]], [v1[0], v1[1]], [v2[0], v2[1]]]);
        }
    } else {
        out_triangles.extend(group_tris);
    }
}

/// Computes the axis-aligned bounding box of a node in SVG viewport coordinates,
/// intersected with all ancestor `<clipPath>` bounding boxes.
pub fn resolve_clipped_element_bounds(root: &usvg::Group, element_id: &str) -> Option<usvg::Rect> {
    if element_id.is_empty() {
        return None;
    }
    find_node_clipped_bounds(root, element_id)
}

fn find_node_clipped_bounds(group: &usvg::Group, element_id: &str) -> Option<usvg::Rect> {
    for child in group.children() {
        let found = if child.id() == element_id {
            let mut b = child.abs_bounding_box();
            if let usvg::Node::Group(g) = child
                && let Some(clip) = g.clip_path()
            {
                let clip_b = clip_path_abs_bounds(clip, g.abs_transform())?;
                b = intersect_rect(b, clip_b)?;
            }
            Some(b)
        } else if let usvg::Node::Group(g) = child {
            find_node_clipped_bounds(g, element_id)
        } else {
            None
        };

        if let Some(mut bounds) = found {
            if let Some(clip) = group.clip_path() {
                let clip_b = clip_path_abs_bounds(clip, group.abs_transform())?;
                bounds = intersect_rect(bounds, clip_b)?;
            }
            return Some(bounds);
        }
    }
    None
}

fn clip_path_abs_bounds(
    clip: &usvg::ClipPath,
    base_ts: tiny_skia::Transform,
) -> Option<usvg::Rect> {
    let clip_ts = base_ts.pre_concat(clip.transform());
    let root_bbox = clip.root().abs_bounding_box();
    if root_bbox.width() <= 0.0 || root_bbox.height() <= 0.0 {
        return None;
    }
    let mut bounds = root_bbox.transform(clip_ts)?;
    if let Some(sub_clip) = clip.clip_path() {
        let sub_bounds = clip_path_abs_bounds(sub_clip, clip_ts)?;
        bounds = intersect_rect(bounds, sub_bounds)?;
    }
    Some(bounds)
}

fn intersect_rect(a: usvg::Rect, b: usvg::Rect) -> Option<usvg::Rect> {
    let left = a.left().max(b.left());
    let top = a.top().max(b.top());
    let right = a.right().min(b.right());
    let bottom = a.bottom().min(b.bottom());
    if right <= left || bottom <= top {
        return None;
    }
    usvg::Rect::from_ltrb(left, top, right, bottom)
}

/// Appends a tessellated buffer into `all_buffers` and coalesces it into `sub_meshes`
/// when the trailing sub-mesh shares the same `(texture_id, pixelated)` binding.
pub fn append_sub_mesh(
    local_buf: &VertexBuffers<SvgVertex, u32>,
    texture_id: Option<u32>,
    pixelated: bool,
    all_buffers: &mut VertexBuffers<SvgVertex, u32>,
    sub_meshes: &mut Vec<SvgSubMesh>,
) {
    if local_buf.vertices.is_empty() || local_buf.indices.is_empty() {
        return;
    }

    let global_base = all_buffers.vertices.len() as u32;
    all_buffers.vertices.extend_from_slice(&local_buf.vertices);
    for &idx in &local_buf.indices {
        all_buffers.indices.push(global_base + idx);
    }

    if let Some(last) = sub_meshes.last_mut()
        && last.texture_id == texture_id
        && last.pixelated == pixelated
    {
        let sub_base = last.vertices.len() as u32;
        last.vertices.extend_from_slice(&local_buf.vertices);
        for &idx in &local_buf.indices {
            last.indices.push(sub_base + idx);
        }
    } else {
        sub_meshes.push(SvgSubMesh {
            vertices: local_buf.vertices.clone(),
            indices: local_buf.indices.clone(),
            texture_id,
            pixelated,
        });
    }
}

/// Tessellates an SVG `<image textureId="...">` node into a textured quad clipped against
/// `clip_stack` and appended to `sub_meshes`.
#[allow(clippy::too_many_arguments)]
pub fn tessellate_image_node(
    img: &usvg::Image,
    all_buffers: &mut VertexBuffers<SvgVertex, u32>,
    sub_meshes: &mut Vec<SvgSubMesh>,
    clip_stack: &[ClipLayer],
    group_opacity: f32,
    half_w: f32,
    half_h: f32,
    vw: f32,
    vh: f32,
) -> Result<(), String> {
    if !img.is_visible() {
        return Ok(());
    }
    let Some(texture_id) = img.texture_id() else {
        return Ok(());
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

    let mut local_buf: VertexBuffers<SvgVertex, u32> = VertexBuffers::new();
    let uvs = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)];
    for ((cx, cy), (u_tex, v_tex)) in corners.iter().zip(uvs) {
        let (mx, my) = map_pt(&transform, *cx, *cy);
        local_buf.vertices.push([
            (mx - half_w) * inv_w,
            (half_h - my) * inv_h,
            0.0,
            u_tex,
            v_tex,
            1.0,
            1.0,
            1.0,
            group_opacity,
        ]);
    }
    local_buf.indices.extend_from_slice(&[0, 1, 2, 2, 3, 0]);
    apply_clip_stack(&mut local_buf, clip_stack);

    let pixelated = matches!(
        img.rendering_mode(),
        usvg::ImageRendering::OptimizeSpeed
            | usvg::ImageRendering::CrispEdges
            | usvg::ImageRendering::Pixelated
    );
    append_sub_mesh(
        &local_buf,
        Some(texture_id),
        pixelated,
        all_buffers,
        sub_meshes,
    );
    Ok(())
}

pub use crate::svg_text_cache::{
    compute_text_cache_key, get_cached_text, store_and_append_cached_text, store_cached_text,
    try_append_cached_text,
};
