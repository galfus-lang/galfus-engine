// SPDX-License-Identifier: Apache-2.0 OR MIT

/// Representation of the [`paint-order`] property.
///
/// `usvg` will handle `markers` automatically,
/// therefore we provide only `fill` and `stroke` variants.
///
/// [`paint-order`]: https://www.w3.org/TR/SVG2/painting.html#PaintOrder
#[derive(Clone, Copy, PartialEq, Debug)]
#[allow(missing_docs)]
pub enum PaintOrder {
    FillAndStroke,
    StrokeAndFill,
}

impl Default for PaintOrder {
    fn default() -> Self {
        Self::FillAndStroke
    }
}

/// A path element.
#[derive(Clone, Debug)]
pub struct Path {
    pub(crate) id: String,
    pub(crate) visible: bool,
    pub(crate) fill: Option<Fill>,
    pub(crate) stroke: Option<Stroke>,
    pub(crate) paint_order: PaintOrder,
    pub(crate) rendering_mode: ShapeRendering,
    pub(crate) data: Arc<tiny_skia_path::Path>,
    pub(crate) abs_transform: Transform,
    pub(crate) bounding_box: Rect,
    pub(crate) abs_bounding_box: Rect,
    pub(crate) stroke_bounding_box: Rect,
    pub(crate) abs_stroke_bounding_box: Rect,
}

impl Path {
    pub(crate) fn new_simple(data: Arc<tiny_skia_path::Path>) -> Option<Self> {
        Self::new(
            String::new(),
            true,
            None,
            None,
            PaintOrder::default(),
            ShapeRendering::default(),
            data,
            Transform::default(),
        )
    }

    pub(crate) fn new(
        id: String,
        visible: bool,
        fill: Option<Fill>,
        stroke: Option<Stroke>,
        paint_order: PaintOrder,
        rendering_mode: ShapeRendering,
        data: Arc<tiny_skia_path::Path>,
        abs_transform: Transform,
    ) -> Option<Self> {
        let bounding_box = data.compute_tight_bounds()?;
        let stroke_bounding_box =
            Path::calculate_stroke_bbox(stroke.as_ref(), &data).unwrap_or(bounding_box);

        let abs_bounding_box: Rect;
        let abs_stroke_bounding_box: Rect;
        if abs_transform.has_skew() {
            // TODO: avoid re-alloc
            let path2 = data.as_ref().clone();
            let path2 = path2.transform(abs_transform)?;
            abs_bounding_box = path2.compute_tight_bounds()?;
            abs_stroke_bounding_box =
                Path::calculate_stroke_bbox(stroke.as_ref(), &path2).unwrap_or(abs_bounding_box);
        } else {
            // A transform without a skew can be performed just on a bbox.
            abs_bounding_box = bounding_box.transform(abs_transform)?;
            abs_stroke_bounding_box = stroke_bounding_box.transform(abs_transform)?;
        }

        Some(Path {
            id,
            visible,
            fill,
            stroke,
            paint_order,
            rendering_mode,
            data,
            abs_transform,
            bounding_box,
            abs_bounding_box,
            stroke_bounding_box,
            abs_stroke_bounding_box,
        })
    }

    /// Element's ID.
    ///
    /// Taken from the SVG itself.
    /// Isn't automatically generated.
    /// Can be empty.
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Element visibility.
    pub fn is_visible(&self) -> bool {
        self.visible
    }

    /// Fill style.
    pub fn fill(&self) -> Option<&Fill> {
        self.fill.as_ref()
    }

    /// Stroke style.
    pub fn stroke(&self) -> Option<&Stroke> {
        self.stroke.as_ref()
    }

    /// Fill and stroke paint order.
    ///
    /// Since markers will be replaced with regular nodes automatically,
    /// `usvg` doesn't provide the `markers` order type. It's was already done.
    ///
    /// `paint-order` in SVG.
    pub fn paint_order(&self) -> PaintOrder {
        self.paint_order
    }

    /// Rendering mode.
    ///
    /// `shape-rendering` in SVG.
    pub fn rendering_mode(&self) -> ShapeRendering {
        self.rendering_mode
    }

    // TODO: find a better name
    /// Segments list.
    ///
    /// All segments are in absolute coordinates.
    pub fn data(&self) -> &tiny_skia_path::Path {
        self.data.as_ref()
    }

    /// Element's absolute transform.
    ///
    /// Contains all ancestors transforms including elements's transform.
    ///
    /// Note that this is not the relative transform present in SVG.
    /// The SVG one would be set only on groups.
    pub fn abs_transform(&self) -> Transform {
        self.abs_transform
    }

    /// Element's object bounding box.
    ///
    /// `objectBoundingBox` in SVG terms. Meaning it doesn't affected by parent transforms.
    pub fn bounding_box(&self) -> Rect {
        self.bounding_box
    }

    /// Element's bounding box in canvas coordinates.
    ///
    /// `userSpaceOnUse` in SVG terms.
    pub fn abs_bounding_box(&self) -> Rect {
        self.abs_bounding_box
    }

    /// Element's object bounding box including stroke.
    ///
    /// Will have the same value as `bounding_box` when path has no stroke.
    pub fn stroke_bounding_box(&self) -> Rect {
        self.stroke_bounding_box
    }

    /// Element's bounding box including stroke in canvas coordinates.
    ///
    /// Will have the same value as `abs_bounding_box` when path has no stroke.
    pub fn abs_stroke_bounding_box(&self) -> Rect {
        self.abs_stroke_bounding_box
    }

    fn calculate_stroke_bbox(stroke: Option<&Stroke>, path: &tiny_skia_path::Path) -> Option<Rect> {
        let mut stroke = stroke?.to_tiny_skia();
        // According to the spec, dash should not be accounted during bbox calculation.
        stroke.dash = None;

        // TODO: avoid for round and bevel caps

        // Expensive, but there is not much we can do about it.
        if let Some(stroked_path) = path.stroke(&stroke, 1.0) {
            return stroked_path.compute_tight_bounds();
        }

        None
    }

    fn subroots(&self, f: &mut dyn FnMut(&Group)) {
        if let Some(Paint::Pattern(patt)) = self.fill.as_ref().map(|f| &f.paint) {
            f(patt.root());
        }
        if let Some(Paint::Pattern(patt)) = self.stroke.as_ref().map(|f| &f.paint) {
            f(patt.root());
        }
    }
}

/// An embedded image kind.
#[derive(Clone)]
pub enum ImageKind {
    /// A reference to raw JPEG data. Should be decoded by the caller.
    JPEG(Arc<Vec<u8>>),
    /// A reference to raw PNG data. Should be decoded by the caller.
    PNG(Arc<Vec<u8>>),
    /// A reference to raw GIF data. Should be decoded by the caller.
    GIF(Arc<Vec<u8>>),
    /// A reference to raw WebP data. Should be decoded by the caller.
    WEBP(Arc<Vec<u8>>),
    /// A preprocessed SVG tree. Can be rendered as is.
    SVG(Tree),
}

impl ImageKind {
    pub(crate) fn actual_size(&self) -> Option<Size> {
        match self {
            ImageKind::JPEG(data)
            | ImageKind::PNG(data)
            | ImageKind::GIF(data)
            | ImageKind::WEBP(data) => imagesize::blob_size(data)
                .ok()
                .and_then(|size| Size::from_wh(size.width as f32, size.height as f32))
                .log_none(|| log::warn!("Image has an invalid size. Skipped.")),
            ImageKind::SVG(svg) => Some(svg.size),
        }
    }
}

impl std::fmt::Debug for ImageKind {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            ImageKind::JPEG(_) => f.write_str("ImageKind::JPEG(..)"),
            ImageKind::PNG(_) => f.write_str("ImageKind::PNG(..)"),
            ImageKind::GIF(_) => f.write_str("ImageKind::GIF(..)"),
            ImageKind::WEBP(_) => f.write_str("ImageKind::WEBP(..)"),
            ImageKind::SVG(_) => f.write_str("ImageKind::SVG(..)"),
        }
    }
}

/// A raster image element.
///
/// `image` element in SVG.
#[derive(Clone, Debug)]
pub struct Image {
    pub(crate) id: String,
    pub(crate) visible: bool,
    pub(crate) size: Size,
    pub(crate) rendering_mode: ImageRendering,
    pub(crate) kind: ImageKind,
    pub(crate) abs_transform: Transform,
    pub(crate) abs_bounding_box: NonZeroRect,
}

impl Image {
    /// Element's ID.
    ///
    /// Taken from the SVG itself.
    /// Isn't automatically generated.
    /// Can be empty.
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Element visibility.
    pub fn is_visible(&self) -> bool {
        self.visible
    }

    /// The actual image size.
    ///
    /// This is not `width` and `height` attributes,
    /// but rather the actual PNG/JPEG/GIF/SVG image size.
    pub fn size(&self) -> Size {
        self.size
    }

    /// Rendering mode.
    ///
    /// `image-rendering` in SVG.
    pub fn rendering_mode(&self) -> ImageRendering {
        self.rendering_mode
    }

    /// Image data.
    pub fn kind(&self) -> &ImageKind {
        &self.kind
    }

    /// Element's absolute transform.
    ///
    /// Contains all ancestors transforms including elements's transform.
    ///
    /// Note that this is not the relative transform present in SVG.
    /// The SVG one would be set only on groups.
    pub fn abs_transform(&self) -> Transform {
        self.abs_transform
    }

    /// Element's object bounding box.
    ///
    /// `objectBoundingBox` in SVG terms. Meaning it doesn't affected by parent transforms.
    pub fn bounding_box(&self) -> Rect {
        self.size.to_rect(0.0, 0.0).unwrap()
    }

    /// Element's bounding box in canvas coordinates.
    ///
    /// `userSpaceOnUse` in SVG terms.
    pub fn abs_bounding_box(&self) -> Rect {
        self.abs_bounding_box.to_rect()
    }

    fn subroots(&self, f: &mut dyn FnMut(&Group)) {
        if let ImageKind::SVG(ref tree) = self.kind {
            f(&tree.root);
        }
    }
}

/// A nodes tree container.
#[allow(missing_debug_implementations)]
#[derive(Clone, Debug)]
pub struct Tree {
    pub(crate) size: Size,
    pub(crate) root: Group,
    pub(crate) linear_gradients: Vec<Arc<LinearGradient>>,
    pub(crate) radial_gradients: Vec<Arc<RadialGradient>>,
    pub(crate) patterns: Vec<Arc<Pattern>>,
    pub(crate) clip_paths: Vec<Arc<ClipPath>>,
    pub(crate) masks: Vec<Arc<Mask>>,
    pub(crate) filters: Vec<Arc<filter::Filter>>,
    #[cfg(feature = "text")]
    pub(crate) fontdb: Arc<fontdb::Database>,
}

impl Tree {
    /// Image size.
    ///
    /// Size of an image that should be created to fit the SVG.
    ///
    /// `width` and `height` in SVG.
    ///
    /// Note that this does not necessarily represent the bounding box of the
    /// rendered contents. Use
    /// [`self.root().abs_layer_bounding_box()`](Group::abs_layer_bounding_box)
    /// to retrieve it instead.
    pub fn size(&self) -> Size {
        self.size
    }

    /// The root element of the SVG tree.
    pub fn root(&self) -> &Group {
        &self.root
    }

    /// Returns a renderable node by ID.
    ///
    /// If an empty ID is provided, than this method will always return `None`.
    pub fn node_by_id(&self, id: &str) -> Option<&Node> {
        if id.is_empty() {
            return None;
        }

        node_by_id(&self.root, id)
    }

    /// Checks if the current tree has any text nodes.
    pub fn has_text_nodes(&self) -> bool {
        has_text_nodes(&self.root)
    }

    /// Checks if the current tree has any `defs` nodes.
    pub fn has_defs_nodes(&self) -> bool {
        !self.linear_gradients().is_empty()
            || !self.radial_gradients().is_empty()
            || !self.patterns().is_empty()
            || !self.filters().is_empty()
            || !self.clip_paths().is_empty()
            || !self.masks().is_empty()
    }

    /// Returns a list of all unique [`LinearGradient`]s in the tree.
    pub fn linear_gradients(&self) -> &[Arc<LinearGradient>] {
        &self.linear_gradients
    }

    /// Returns a list of all unique [`RadialGradient`]s in the tree.
    pub fn radial_gradients(&self) -> &[Arc<RadialGradient>] {
        &self.radial_gradients
    }

    /// Returns a list of all unique [`Pattern`]s in the tree.
    pub fn patterns(&self) -> &[Arc<Pattern>] {
        &self.patterns
    }

    /// Returns a list of all unique [`ClipPath`]s in the tree.
    pub fn clip_paths(&self) -> &[Arc<ClipPath>] {
        &self.clip_paths
    }

    /// Returns a list of all unique [`Mask`]s in the tree.
    pub fn masks(&self) -> &[Arc<Mask>] {
        &self.masks
    }

    /// Returns a list of all unique [`Filter`](filter::Filter)s in the tree.
    pub fn filters(&self) -> &[Arc<filter::Filter>] {
        &self.filters
    }

    /// Returns the font database that applies to all text nodes in the tree.
    #[cfg(feature = "text")]
    pub fn fontdb(&self) -> &Arc<fontdb::Database> {
        &self.fontdb
    }

    pub(crate) fn collect_paint_servers(&mut self) {
        loop_over_paint_servers(&self.root, &mut |paint| match paint {
            Paint::Color(_) => {}
            Paint::LinearGradient(lg) => {
                if !self
                    .linear_gradients
                    .iter()
                    .any(|other| Arc::ptr_eq(lg, other))
                {
                    self.linear_gradients.push(lg.clone());
                }
            }
            Paint::RadialGradient(rg) => {
                if !self
                    .radial_gradients
                    .iter()
                    .any(|other| Arc::ptr_eq(rg, other))
                {
                    self.radial_gradients.push(rg.clone());
                }
            }
            Paint::Pattern(patt) => {
                if !self.patterns.iter().any(|other| Arc::ptr_eq(patt, other)) {
                    self.patterns.push(patt.clone());
                }
            }
        });
    }
}

