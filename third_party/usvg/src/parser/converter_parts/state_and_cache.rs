// SPDX-License-Identifier: Apache-2.0 OR MIT

use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::str::FromStr;
use std::sync::Arc;

#[cfg(feature = "text")]
use crate::{FontVariation, GlyphId};
#[cfg(feature = "text")]
use fontdb::Database;
#[cfg(feature = "text")]
use fontdb::ID;
use svgtypes::{Length, LengthUnit as Unit, PaintOrderKind, TransformOrigin};
use tiny_skia_path::PathBuilder;

use super::svgtree::{self, AId, EId, FromValue, SvgNode};
use super::units::{self, convert_length};
use super::{Error, Options, marker};
#[cfg(feature = "text")]
use crate::flatten::BitmapImage;
use crate::parser::paint_server::process_paint;
#[cfg(feature = "text")]
use crate::text::flatten::DatabaseExt;
use crate::*;

#[derive(Clone)]
pub struct State<'a> {
    pub(crate) parent_clip_path: Option<SvgNode<'a, 'a>>,
    pub(crate) parent_markers: Vec<SvgNode<'a, 'a>>,
    /// Stores the resolved fill and stroke of a use node
    /// or a path element (for markers)
    pub(crate) context_element: Option<(Option<Fill>, Option<Stroke>)>,
    pub(crate) fe_image_link: bool,
    /// A viewBox of the parent SVG element.
    pub(crate) view_box: NonZeroRect,
    /// A size of the parent `use` element.
    /// Used only during nested `svg` size resolving.
    /// Width and height can be set independently.
    pub(crate) use_size: (Option<f32>, Option<f32>),
    pub(crate) opt: &'a Options<'a>,
}

#[derive(Clone)]
pub struct Cache {
    /// This fontdb is initialized from [`Options::fontdb`] and then populated
    /// over the course of conversion.
    #[cfg(feature = "text")]
    pub fontdb: Arc<Database>,

    #[cfg(feature = "text")]
    cache_outline: HashMap<(ID, GlyphId, Vec<FontVariation>), Option<tiny_skia_path::Path>>,
    #[cfg(feature = "text")]
    cache_colr: HashMap<(ID, GlyphId, Vec<FontVariation>), Option<Tree>>,
    #[cfg(feature = "text")]
    cache_svg: HashMap<(ID, GlyphId), Option<Node>>,
    #[cfg(feature = "text")]
    cache_raster: HashMap<(ID, GlyphId), Option<BitmapImage>>,
    #[cfg(feature = "text")]
    cache_has_opsz: HashMap<ID, bool>,

    pub clip_paths: HashMap<String, Arc<ClipPath>>,
    pub masks: HashMap<String, Arc<Mask>>,
    pub filters: HashMap<String, Arc<filter::Filter>>,
    pub paint: HashMap<String, Paint>,

    // used for ID generation
    all_ids: HashSet<u64>,
    linear_gradient_index: usize,
    radial_gradient_index: usize,
    pattern_index: usize,
    clip_path_index: usize,
    mask_index: usize,
    filter_index: usize,
    image_index: usize,
}

macro_rules! font_lookup {
    ($method_name:ident, $cache_map:ident, $font_variant:ident, $return_type:ty) => {
        #[cfg(feature = "text")]
        pub(crate) fn $method_name(&mut self, font: ID, glyph: GlyphId) -> Option<$return_type> {
            let key = (font, glyph);
            match self.$cache_map.get(&key) {
                Some(cache_hit) => cache_hit.clone(),
                None => {
                    let lookup = self.fontdb.$font_variant(font, glyph);
                    self.$cache_map.insert(key, lookup.clone());
                    lookup
                }
            }
        }
    };
}

impl Cache {
    pub(crate) fn new(#[cfg(feature = "text")] fontdb: Arc<Database>) -> Self {
        Self {
            #[cfg(feature = "text")]
            fontdb,

            #[cfg(feature = "text")]
            cache_outline: HashMap::new(),
            #[cfg(feature = "text")]
            cache_colr: HashMap::new(),
            #[cfg(feature = "text")]
            cache_svg: HashMap::new(),
            #[cfg(feature = "text")]
            cache_raster: HashMap::new(),
            #[cfg(feature = "text")]
            cache_has_opsz: HashMap::new(),

            clip_paths: HashMap::new(),
            masks: HashMap::new(),
            filters: HashMap::new(),
            paint: HashMap::new(),

            all_ids: HashSet::new(),
            linear_gradient_index: 0,
            radial_gradient_index: 0,
            pattern_index: 0,
            clip_path_index: 0,
            mask_index: 0,
            filter_index: 0,
            image_index: 0,
        }
    }

    // TODO: macros?
    pub(crate) fn gen_linear_gradient_id(&mut self) -> NonEmptyString {
        loop {
            self.linear_gradient_index += 1;
            let new_id = format!("linearGradient{}", self.linear_gradient_index);
            let new_hash = string_hash(&new_id);
            if !self.all_ids.contains(&new_hash) {
                return NonEmptyString::new(new_id).unwrap();
            }
        }
    }

    pub(crate) fn gen_radial_gradient_id(&mut self) -> NonEmptyString {
        loop {
            self.radial_gradient_index += 1;
            let new_id = format!("radialGradient{}", self.radial_gradient_index);
            let new_hash = string_hash(&new_id);
            if !self.all_ids.contains(&new_hash) {
                return NonEmptyString::new(new_id).unwrap();
            }
        }
    }

    pub(crate) fn gen_pattern_id(&mut self) -> NonEmptyString {
        loop {
            self.pattern_index += 1;
            let new_id = format!("pattern{}", self.pattern_index);
            let new_hash = string_hash(&new_id);
            if !self.all_ids.contains(&new_hash) {
                return NonEmptyString::new(new_id).unwrap();
            }
        }
    }

    pub(crate) fn gen_clip_path_id(&mut self) -> NonEmptyString {
        loop {
            self.clip_path_index += 1;
            let new_id = format!("clipPath{}", self.clip_path_index);
            let new_hash = string_hash(&new_id);
            if !self.all_ids.contains(&new_hash) {
                return NonEmptyString::new(new_id).unwrap();
            }
        }
    }

    pub(crate) fn gen_mask_id(&mut self) -> NonEmptyString {
        loop {
            self.mask_index += 1;
            let new_id = format!("mask{}", self.mask_index);
            let new_hash = string_hash(&new_id);
            if !self.all_ids.contains(&new_hash) {
                return NonEmptyString::new(new_id).unwrap();
            }
        }
    }

    pub(crate) fn gen_filter_id(&mut self) -> NonEmptyString {
        loop {
            self.filter_index += 1;
            let new_id = format!("filter{}", self.filter_index);
            let new_hash = string_hash(&new_id);
            if !self.all_ids.contains(&new_hash) {
                return NonEmptyString::new(new_id).unwrap();
            }
        }
    }

    pub(crate) fn gen_image_id(&mut self) -> NonEmptyString {
        loop {
            self.image_index += 1;
            let new_id = format!("image{}", self.image_index);
            let new_hash = string_hash(&new_id);
            if !self.all_ids.contains(&new_hash) {
                return NonEmptyString::new(new_id).unwrap();
            }
        }
    }

    font_lookup!(fontdb_svg, cache_svg, svg, Node);
    font_lookup!(fontdb_raster, cache_raster, raster, BitmapImage);

    #[cfg(feature = "text")]
    pub(crate) fn fontdb_outline(
        &mut self,
        font: ID,
        glyph: GlyphId,
        variations: &[FontVariation],
    ) -> Option<tiny_skia_path::Path> {
        let key = (font, glyph, variations.to_vec());
        match self.cache_outline.get(&key) {
            Some(cache_hit) => cache_hit.clone(),
            None => {
                let lookup = self.fontdb.outline(font, glyph, variations);
                self.cache_outline.insert(key, lookup.clone());
                lookup
            }
        }
    }

    #[cfg(feature = "text")]
    pub(crate) fn fontdb_colr(
        &mut self,
        font: ID,
        glyph: GlyphId,
        variations: &[FontVariation],
    ) -> Option<Tree> {
        let key = (font, glyph, variations.to_vec());
        match self.cache_colr.get(&key) {
            Some(cache_hit) => cache_hit.clone(),
            None => {
                let lookup = self.fontdb.colr(font, glyph, variations);
                self.cache_colr.insert(key, lookup.clone());
                lookup
            }
        }
    }

    #[cfg(feature = "text")]
    pub(crate) fn has_opsz_axis(&mut self, font: ID) -> bool {
        if let Some(&cached) = self.cache_has_opsz.get(&font) {
            return cached;
        }
        let has_opsz = self.fontdb.has_opsz_axis(font);
        self.cache_has_opsz.insert(font, has_opsz);
        has_opsz
    }
}

// TODO: is there a simpler way?
fn string_hash(s: &str) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut h);
    h.finish()
}

impl<'a, 'input: 'a> SvgNode<'a, 'input> {
    pub(crate) fn convert_length(
        &self,
        aid: AId,
        object_units: Units,
        state: &State,
        def: Length,
    ) -> f32 {
        units::convert_length(
            self.attribute(aid).unwrap_or(def),
            *self,
            aid,
            object_units,
            state,
        )
    }

    pub fn convert_user_length(&self, aid: AId, state: &State, def: Length) -> f32 {
        self.convert_length(aid, Units::UserSpaceOnUse, state, def)
    }

    pub fn parse_viewbox(&self) -> Option<NonZeroRect> {
        let vb: svgtypes::ViewBox = self.attribute(AId::ViewBox)?;
        NonZeroRect::from_xywh(vb.x as f32, vb.y as f32, vb.w as f32, vb.h as f32)
    }

    pub fn resolve_length(&self, aid: AId, state: &State, def: f32) -> f32 {
        debug_assert!(
            !matches!(aid, AId::BaselineShift | AId::FontSize),
            "{} cannot be resolved via this function",
            aid
        );

        if let Some(n) = self.ancestors().find(|n| n.has_attribute(aid)) {
            if let Some(length) = n.attribute(aid) {
                return units::convert_user_length(length, n, aid, state);
            }
        }

        def
    }

    pub fn resolve_valid_length(
        &self,
        aid: AId,
        state: &State,
        def: f32,
    ) -> Option<NonZeroPositiveF32> {
        let n = self.resolve_length(aid, state, def);
        NonZeroPositiveF32::new(n)
    }

    pub(crate) fn try_convert_length(
        &self,
        aid: AId,
        object_units: Units,
        state: &State,
    ) -> Option<f32> {
        Some(units::convert_length(
            self.attribute(aid)?,
            *self,
            aid,
            object_units,
            state,
        ))
    }

    pub fn has_valid_transform(&self, aid: AId) -> bool {
        // Do not use Node::attribute::<Transform>, because it will always
        // return a valid transform.

        let attr = match self.attribute(aid) {
            Some(attr) => attr,
            None => return true,
        };

        let ts = match svgtypes::Transform::from_str(attr) {
            Ok(v) => v,
            Err(_) => return true,
        };

        let ts = Transform::from_row(
            ts.a as f32,
            ts.b as f32,
            ts.c as f32,
            ts.d as f32,
            ts.e as f32,
            ts.f as f32,
        );
        ts.is_valid()
    }

    pub fn is_visible_element(&self, opt: &crate::Options) -> bool {
        self.attribute(AId::Display) != Some("none")
            && self.has_valid_transform(AId::Transform)
            && super::switch::is_condition_passed(*self, opt)
    }
}

pub trait SvgColorExt {
    fn split_alpha(self) -> (Color, Opacity);
}

impl SvgColorExt for svgtypes::Color {
    fn split_alpha(self) -> (Color, Opacity) {
        (
            Color::new_rgb(self.red, self.green, self.blue),
            Opacity::new_u8(self.alpha),
        )
    }
}

/// Converts an input `Document` into a `Tree`.
///
/// # Errors
///
/// - If `Document` doesn't have an SVG node - returns an empty tree.
/// - If `Document` doesn't have a valid size - returns `Error::InvalidSize`.
pub(crate) fn convert_doc(svg_doc: &svgtree::Document, opt: &Options) -> Result<Tree, Error> {
    let svg = svg_doc.root_element();
    let (size, restore_viewbox) = resolve_svg_size(&svg, opt);
    let size = size?;
    let view_box = ViewBox {
        rect: svg
            .parse_viewbox()
            .unwrap_or_else(|| size.to_non_zero_rect(0.0, 0.0)),
        aspect: svg.attribute(AId::PreserveAspectRatio).unwrap_or_default(),
    };

    let background_color = svg
        .attribute::<&str>(AId::BackgroundColor)
        .and_then(|s| svgtypes::Paint::from_str(s).ok())
        .and_then(|paint| match paint {
            svgtypes::Paint::Color(c) => Some(c),
            _ => None,
        });

    let mut tree = Tree {
        size,
        root: Group::empty(),
        linear_gradients: Vec::new(),
        radial_gradients: Vec::new(),
        patterns: Vec::new(),
        clip_paths: Vec::new(),
        masks: Vec::new(),
        filters: Vec::new(),
        #[cfg(feature = "text")]
        fontdb: opt.fontdb.clone(),
    };

    if !svg.is_visible_element(opt) {
        return Ok(tree);
    }

    let state = State {
        parent_clip_path: None,
        context_element: None,
        parent_markers: Vec::new(),
        fe_image_link: false,
        view_box: view_box.rect,
        use_size: (None, None),
        opt,
    };

    let mut cache = Cache::new(
        #[cfg(feature = "text")]
        opt.fontdb.clone(),
    );

    for node in svg_doc.descendants() {
        if let Some(tag) = node.tag_name() {
            if matches!(
                tag,
                EId::ClipPath
                    | EId::Filter
                    | EId::LinearGradient
                    | EId::Mask
                    | EId::Pattern
                    | EId::RadialGradient
                    | EId::Image
            ) {
                if !node.element_id().is_empty() {
                    cache.all_ids.insert(string_hash(node.element_id()));
                }
            }
        }
    }

    let root_ts = view_box.to_transform(tree.size());
    if root_ts.is_identity() && background_color.is_none() {
        convert_children(svg_doc.root(), &state, &mut cache, &mut tree.root);
    } else {
        let mut g = Group::empty();

        if let Some(background_color) = background_color {
            if let Some(path) = background_path(background_color, view_box.rect.to_rect()) {
                g.children.push(Node::Path(Box::new(path)));
            }
        }

        g.transform = root_ts;
        g.abs_transform = root_ts;
        convert_children(svg_doc.root(), &state, &mut cache, &mut g);
        g.calculate_bounding_boxes();
        tree.root.children.push(Node::Group(Box::new(g)));
    }

    // Clear cache to make sure that all `Arc<T>` objects have a single strong reference.
    cache.clip_paths.clear();
    cache.masks.clear();
    cache.filters.clear();
    cache.paint.clear();

    super::paint_server::update_paint_servers(
        &mut tree.root,
        Transform::default(),
        None,
        None,
        &mut cache,
    );
    tree.collect_paint_servers();
    tree.root.collect_clip_paths(&mut tree.clip_paths);
    tree.root.collect_masks(&mut tree.masks);
    tree.root.collect_filters(&mut tree.filters);
    tree.root.calculate_bounding_boxes();

    // The fontdb might have been mutated and we want to apply these changes to
    // the tree's fontdb.
    #[cfg(feature = "text")]
    {
        tree.fontdb = cache.fontdb;
    }

    if restore_viewbox {
        calculate_svg_bbox(&mut tree);
    }

    Ok(tree)
}

