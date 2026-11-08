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

    let mut current_tris: Vec<[SvgVertex; 3]> = Vec::with_capacity(buffers.indices.len() / 3);
    for &[i0, i1, i2] in buffers.indices.as_chunks::<3>().0 {
        let v0 = buffers.vertices[i0 as usize];
        let v1 = buffers.vertices[i1 as usize];
        let v2 = buffers.vertices[i2 as usize];
        current_tris.push([v0, v1, v2]);
    }

    for layer in clip_stack {
        if layer.triangles.is_empty() {
            current_tris.clear();
            break;
        }
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

    clip_stack.push(ClipLayer { triangles });
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

thread_local! {
    static TEXT_MESH_CACHE: std::cell::RefCell<std::collections::HashMap<u64, VertexBuffers<SvgVertex, u32>>> =
        std::cell::RefCell::new(std::collections::HashMap::new());
}

fn hash_paint(paint: &usvg::Paint, hasher: &mut std::collections::hash_map::DefaultHasher) {
    use std::hash::Hash;
    match paint {
        usvg::Paint::Color(c) => (1u8, c.red, c.green, c.blue).hash(hasher),
        usvg::Paint::LinearGradient(lg) => (2u8, lg.id()).hash(hasher),
        usvg::Paint::RadialGradient(rg) => (3u8, rg.id()).hash(hasher),
        usvg::Paint::Pattern(p) => (4u8, p.id()).hash(hasher),
    }
}

/// Computes a 64-bit cache key for an unclipped `<text>` node and appends its cached mesh
/// directly if already tessellated. Returns `Some(key)` on cache miss.
pub fn try_append_cached_text(
    text: &usvg::Text,
    group_opacity: f32,
    vw: f32,
    vh: f32,
    all_buffers: &mut VertexBuffers<SvgVertex, u32>,
    sub_meshes: &mut Vec<SvgSubMesh>,
) -> Option<u64> {
    use std::hash::{Hash, Hasher};

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    (group_opacity.to_bits(), vw.to_bits(), vh.to_bits()).hash(&mut hasher);
    for chunk in text.chunks() {
        chunk.text().hash(&mut hasher);
    }
    let flat = text.flattened();
    let gt = flat.abs_transform();
    [gt.sx, gt.kx, gt.ky, gt.sy, gt.tx, gt.ty]
        .map(f32::to_bits)
        .hash(&mut hasher);
    for child in flat.children() {
        if let usvg::Node::Path(p) = child {
            p.is_visible().hash(&mut hasher);
            let t = p.abs_transform();
            [t.sx, t.kx, t.ky, t.sy, t.tx, t.ty]
                .map(f32::to_bits)
                .hash(&mut hasher);
            let b = p.bounding_box();
            [b.left(), b.top(), b.right(), b.bottom()]
                .map(f32::to_bits)
                .hash(&mut hasher);
            if let Some(fill) = p.fill() {
                fill.opacity().get().to_bits().hash(&mut hasher);
                hash_paint(fill.paint(), &mut hasher);
            }
            if let Some(stroke) = p.stroke() {
                (
                    stroke.width().get().to_bits(),
                    stroke.opacity().get().to_bits(),
                )
                    .hash(&mut hasher);
                hash_paint(stroke.paint(), &mut hasher);
            }
        }
    }
    let key = hasher.finish();
    let hit = TEXT_MESH_CACHE.with(|cache| {
        cache.borrow().get(&key).map(|buf| {
            append_sub_mesh(buf, None, false, all_buffers, sub_meshes);
        })
    });
    if hit.is_some() { None } else { Some(key) }
}

/// Stores a newly tessellated `<text>` mesh in the thread-local cache and appends it.
pub fn store_and_append_cached_text(
    key: u64,
    text_buf: VertexBuffers<SvgVertex, u32>,
    all_buffers: &mut VertexBuffers<SvgVertex, u32>,
    sub_meshes: &mut Vec<SvgSubMesh>,
) {
    append_sub_mesh(&text_buf, None, false, all_buffers, sub_meshes);
    TEXT_MESH_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if cache.len() >= 512 {
            cache.clear();
        }
        cache.insert(key, text_buf);
    });
}
