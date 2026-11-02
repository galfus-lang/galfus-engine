// SPDX-License-Identifier: Apache-2.0 OR MIT

/// A clip-path element.
///
/// `clipPath` element in SVG.
#[derive(Debug)]
pub struct ClipPath {
    pub(crate) id: NonEmptyString,
    pub(crate) transform: Transform,
    pub(crate) clip_path: Option<Arc<ClipPath>>,
    pub(crate) root: Group,
}

impl ClipPath {
    pub(crate) fn empty(id: NonEmptyString) -> Self {
        ClipPath {
            id,
            transform: Transform::default(),
            clip_path: None,
            root: Group::empty(),
        }
    }

    /// Element's ID.
    ///
    /// Taken from the SVG itself.
    /// Used only during SVG writing. `resvg` doesn't rely on this property.
    pub fn id(&self) -> &str {
        self.id.get()
    }

    /// Clip path transform.
    ///
    /// `transform` in SVG.
    pub fn transform(&self) -> Transform {
        self.transform
    }

    /// Additional clip path.
    ///
    /// `clip-path` in SVG.
    pub fn clip_path(&self) -> Option<&ClipPath> {
        self.clip_path.as_deref()
    }

    /// Clip path children.
    pub fn root(&self) -> &Group {
        &self.root
    }
}

/// A mask type.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum MaskType {
    /// Indicates that the luminance values of the mask should be used.
    Luminance,
    /// Indicates that the alpha values of the mask should be used.
    Alpha,
}

impl Default for MaskType {
    fn default() -> Self {
        Self::Luminance
    }
}

/// A mask element.
///
/// `mask` element in SVG.
#[derive(Debug)]
pub struct Mask {
    pub(crate) id: NonEmptyString,
    pub(crate) rect: NonZeroRect,
    pub(crate) kind: MaskType,
    pub(crate) mask: Option<Arc<Mask>>,
    pub(crate) root: Group,
}

impl Mask {
    /// Element's ID.
    ///
    /// Taken from the SVG itself.
    /// Used only during SVG writing. `resvg` doesn't rely on this property.
    pub fn id(&self) -> &str {
        self.id.get()
    }

    /// Mask rectangle.
    ///
    /// `x`, `y`, `width` and `height` in SVG.
    pub fn rect(&self) -> NonZeroRect {
        self.rect
    }

    /// Mask type.
    ///
    /// `mask-type` in SVG.
    pub fn kind(&self) -> MaskType {
        self.kind
    }

    /// Additional mask.
    ///
    /// `mask` in SVG.
    pub fn mask(&self) -> Option<&Mask> {
        self.mask.as_deref()
    }

    /// Mask children.
    ///
    /// A mask can have no children, in which case the whole element should be masked out.
    pub fn root(&self) -> &Group {
        &self.root
    }
}

/// Node's kind.
#[allow(missing_docs)]
#[derive(Clone, Debug)]
pub enum Node {
    Group(Box<Group>),
    Path(Box<Path>),
    Image(Box<Image>),
    Text(Box<Text>),
}

impl Node {
    /// Returns node's ID.
    pub fn id(&self) -> &str {
        match self {
            Node::Group(e) => e.id.as_str(),
            Node::Path(e) => e.id.as_str(),
            Node::Image(e) => e.id.as_str(),
            Node::Text(e) => e.id.as_str(),
        }
    }

    /// Returns node's absolute transform.
    ///
    /// This method is cheap since absolute transforms are already resolved.
    pub fn abs_transform(&self) -> Transform {
        match self {
            Node::Group(group) => group.abs_transform(),
            Node::Path(path) => path.abs_transform(),
            Node::Image(image) => image.abs_transform(),
            Node::Text(text) => text.abs_transform(),
        }
    }

    /// Returns node's bounding box in object coordinates, if any.
    pub fn bounding_box(&self) -> Rect {
        match self {
            Node::Group(group) => group.bounding_box(),
            Node::Path(path) => path.bounding_box(),
            Node::Image(image) => image.bounding_box(),
            Node::Text(text) => text.bounding_box(),
        }
    }

    /// Returns node's bounding box in canvas coordinates, if any.
    pub fn abs_bounding_box(&self) -> Rect {
        match self {
            Node::Group(group) => group.abs_bounding_box(),
            Node::Path(path) => path.abs_bounding_box(),
            Node::Image(image) => image.abs_bounding_box(),
            Node::Text(text) => text.abs_bounding_box(),
        }
    }

    /// Returns node's bounding box, including stroke, in object coordinates, if any.
    pub fn stroke_bounding_box(&self) -> Rect {
        match self {
            Node::Group(group) => group.stroke_bounding_box(),
            Node::Path(path) => path.stroke_bounding_box(),
            // Image cannot be stroked.
            Node::Image(image) => image.bounding_box(),
            Node::Text(text) => text.stroke_bounding_box(),
        }
    }

    /// Returns node's bounding box, including stroke, in canvas coordinates, if any.
    pub fn abs_stroke_bounding_box(&self) -> Rect {
        match self {
            Node::Group(group) => group.abs_stroke_bounding_box(),
            Node::Path(path) => path.abs_stroke_bounding_box(),
            // Image cannot be stroked.
            Node::Image(image) => image.abs_bounding_box(),
            Node::Text(text) => text.abs_stroke_bounding_box(),
        }
    }

    /// Element's "layer" bounding box in canvas units, if any.
    ///
    /// For most nodes this is just `abs_bounding_box`,
    /// but for groups this is `abs_layer_bounding_box`.
    ///
    /// See [`Group::layer_bounding_box`] for details.
    pub fn abs_layer_bounding_box(&self) -> Option<NonZeroRect> {
        match self {
            Node::Group(group) => Some(group.abs_layer_bounding_box()),
            // Hor/ver path without stroke can return None. This is expected.
            Node::Path(path) => path.abs_bounding_box().to_non_zero_rect(),
            Node::Image(image) => image.abs_bounding_box().to_non_zero_rect(),
            Node::Text(text) => text.abs_bounding_box().to_non_zero_rect(),
        }
    }

    /// Calls a closure for each subroot this `Node` has.
    ///
    /// The [`Tree::root`](Tree::root) field contain only render-able SVG elements.
    /// But some elements, specifically clip paths, masks, patterns and feImage
    /// can store their own SVG subtrees.
    /// And while one can access them manually, it's pretty verbose.
    /// This methods allows looping over _all_ SVG elements present in the `Tree`.
    ///
    /// # Example
    ///
    /// ```no_run
    /// fn all_nodes(parent: &usvg::Group) {
    ///     for node in parent.children() {
    ///         // do stuff...
    ///
    ///         if let usvg::Node::Group(g) = node {
    ///             all_nodes(g);
    ///         }
    ///
    ///         // handle subroots as well
    ///         node.subroots(|subroot| all_nodes(subroot));
    ///     }
    /// }
    /// ```
    pub fn subroots<F: FnMut(&Group)>(&self, mut f: F) {
        match self {
            Node::Group(group) => group.subroots(&mut f),
            Node::Path(path) => path.subroots(&mut f),
            Node::Image(image) => image.subroots(&mut f),
            Node::Text(text) => text.subroots(&mut f),
        }
    }
}

/// A group container.
///
/// The preprocessor will remove all groups that don't impact rendering.
/// Those that left is just an indicator that a new canvas should be created.
///
/// `g` element in SVG.
#[derive(Clone, Debug)]
pub struct Group {
    pub(crate) id: String,
    pub(crate) transform: Transform,
    pub(crate) abs_transform: Transform,
    pub(crate) opacity: Opacity,
    pub(crate) blend_mode: BlendMode,
    pub(crate) isolate: bool,
    pub(crate) clip_path: Option<Arc<ClipPath>>,
    /// Whether the group is a context element (i.e. a use node)
    pub(crate) is_context_element: bool,
    pub(crate) mask: Option<Arc<Mask>>,
    pub(crate) filters: Vec<Arc<filter::Filter>>,
    pub(crate) bounding_box: Rect,
    pub(crate) abs_bounding_box: Rect,
    pub(crate) stroke_bounding_box: Rect,
    pub(crate) abs_stroke_bounding_box: Rect,
    pub(crate) layer_bounding_box: NonZeroRect,
    pub(crate) abs_layer_bounding_box: NonZeroRect,
    pub(crate) children: Vec<Node>,
}

impl Group {
    pub(crate) fn empty() -> Self {
        let dummy = Rect::from_xywh(0.0, 0.0, 0.0, 0.0).unwrap();
        Group {
            id: String::new(),
            transform: Transform::default(),
            abs_transform: Transform::default(),
            opacity: Opacity::ONE,
            blend_mode: BlendMode::Normal,
            isolate: false,
            clip_path: None,
            mask: None,
            filters: Vec::new(),
            is_context_element: false,
            bounding_box: dummy,
            abs_bounding_box: dummy,
            stroke_bounding_box: dummy,
            abs_stroke_bounding_box: dummy,
            layer_bounding_box: NonZeroRect::from_xywh(0.0, 0.0, 1.0, 1.0).unwrap(),
            abs_layer_bounding_box: NonZeroRect::from_xywh(0.0, 0.0, 1.0, 1.0).unwrap(),
            children: Vec::new(),
        }
    }

    /// Element's ID.
    ///
    /// Taken from the SVG itself.
    /// Isn't automatically generated.
    /// Can be empty.
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Element's transform.
    ///
    /// This is a relative transform. The one that is set via the `transform` attribute in SVG.
    pub fn transform(&self) -> Transform {
        self.transform
    }

    /// Element's absolute transform.
    ///
    /// Contains all ancestors transforms including group's transform.
    ///
    /// Note that subroots, like clipPaths, masks and patterns, have their own root transform,
    /// which isn't affected by the node that references this subroot.
    pub fn abs_transform(&self) -> Transform {
        self.abs_transform
    }

    /// Group opacity.
    ///
    /// After the group is rendered we should combine
    /// it with a parent group using the specified opacity.
    pub fn opacity(&self) -> Opacity {
        self.opacity
    }

    /// Group blend mode.
    ///
    /// `mix-blend-mode` in SVG.
    pub fn blend_mode(&self) -> BlendMode {
        self.blend_mode
    }

    /// Group isolation.
    ///
    /// `isolation` in SVG.
    pub fn isolate(&self) -> bool {
        self.isolate
    }

    /// Element's clip path.
    pub fn clip_path(&self) -> Option<&ClipPath> {
        self.clip_path.as_deref()
    }

    /// Element's mask.
    pub fn mask(&self) -> Option<&Mask> {
        self.mask.as_deref()
    }

    /// Element's filters.
    pub fn filters(&self) -> &[Arc<filter::Filter>] {
        &self.filters
    }

    /// Element's object bounding box.
    ///
    /// `objectBoundingBox` in SVG terms. Meaning it doesn't affected by parent transforms.
    ///
    /// Can be set to `None` in case of an empty group.
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
    /// Similar to `bounding_box`, but includes stroke.
    pub fn stroke_bounding_box(&self) -> Rect {
        self.stroke_bounding_box
    }

    /// Element's bounding box including stroke in user coordinates.
    ///
    /// Similar to `abs_bounding_box`, but includes stroke.
    pub fn abs_stroke_bounding_box(&self) -> Rect {
        self.abs_stroke_bounding_box
    }

    /// Element's "layer" bounding box in object units.
    ///
    /// Conceptually, this is `stroke_bounding_box` expanded and/or clipped
    /// by `filters_bounding_box`, but also including all the children.
    /// This is the bounding box `resvg` will later use to allocate layers/pixmaps
    /// during isolated groups rendering.
    ///
    /// Only groups have it, because only groups can have filters.
    /// For other nodes layer bounding box is the same as stroke bounding box.
    ///
    /// Unlike other bounding boxes, cannot have zero size.
    ///
    /// Returns 0x0x1x1 for empty groups.
    pub fn layer_bounding_box(&self) -> NonZeroRect {
        self.layer_bounding_box
    }

    /// Element's "layer" bounding box in canvas units.
    pub fn abs_layer_bounding_box(&self) -> NonZeroRect {
        self.abs_layer_bounding_box
    }

    /// Group's children.
    pub fn children(&self) -> &[Node] {
        &self.children
    }

    /// Checks if this group should be isolated during rendering.
    pub fn should_isolate(&self) -> bool {
        self.isolate
            || self.opacity != Opacity::ONE
            || self.clip_path.is_some()
            || self.mask.is_some()
            || !self.filters.is_empty()
            || self.blend_mode != BlendMode::Normal // TODO: probably not needed?
    }

    /// Returns `true` if the group has any children.
    pub fn has_children(&self) -> bool {
        !self.children.is_empty()
    }

    /// Calculates a node's filter bounding box.
    ///
    /// Filters with `objectBoundingBox` and missing or zero `bounding_box` would be ignored.
    ///
    /// Note that a filter region can act like a clipping rectangle,
    /// therefore this function can produce a bounding box smaller than `bounding_box`.
    ///
    /// Returns `None` when then group has no filters.
    ///
    /// This function is very fast, that's why we do not store this bbox as a `Group` field.
    pub fn filters_bounding_box(&self) -> Option<NonZeroRect> {
        let mut full_region = BBox::default();
        for filter in &self.filters {
            full_region = full_region.expand(filter.rect);
        }

        full_region.to_non_zero_rect()
    }

    fn subroots(&self, f: &mut dyn FnMut(&Group)) {
        if let Some(ref clip) = self.clip_path {
            f(&clip.root);

            if let Some(ref sub_clip) = clip.clip_path {
                f(&sub_clip.root);
            }
        }

        if let Some(ref mask) = self.mask {
            f(&mask.root);

            if let Some(ref sub_mask) = mask.mask {
                f(&sub_mask.root);
            }
        }

        for filter in &self.filters {
            for primitive in &filter.primitives {
                if let filter::Kind::Image(ref image) = primitive.kind {
                    f(image.root());
                }
            }
        }
    }
}

