//! In-memory thread-local mesh cache for shaped and tessellated SVG `<text>` elements.

use lyon_tessellation::VertexBuffers;
use resvg::usvg;

use crate::svg_clip::append_sub_mesh;
use crate::svg_tessellator::{SvgSubMesh, SvgVertex};

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

/// Computes a 64-bit cache key for an SVG `<text>` element.
pub fn compute_text_cache_key(text: &usvg::Text, group_opacity: f32, vw: f32, vh: f32) -> u64 {
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
    hasher.finish()
}

/// Retrieves a clone of the cached tessellated text mesh if present.
pub fn get_cached_text(key: u64, out: &mut VertexBuffers<SvgVertex, u32>) -> bool {
    TEXT_MESH_CACHE.with(|cache| {
        if let Some(buf) = cache.borrow().get(&key) {
            *out = buf.clone();
            true
        } else {
            false
        }
    })
}

/// Stores a newly tessellated text mesh into the cache.
pub fn store_cached_text(key: u64, buf: VertexBuffers<SvgVertex, u32>) {
    TEXT_MESH_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if cache.len() >= 512 {
            cache.clear();
        }
        cache.insert(key, buf);
    });
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
    let key = compute_text_cache_key(text, group_opacity, vw, vh);
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
    store_cached_text(key, text_buf);
}
