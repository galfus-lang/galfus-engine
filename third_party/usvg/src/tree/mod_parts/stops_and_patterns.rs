// SPDX-License-Identifier: Apache-2.0 OR MIT

impl std::ops::Deref for RadialGradient {
    type Target = BaseGradient;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

/// An alias to `NormalizedF32`.
pub type StopOffset = NormalizedF32;

/// Gradient's stop element.
///
/// `stop` element in SVG.
#[derive(Clone, Copy, Debug)]
pub struct Stop {
    pub(crate) offset: StopOffset,
    pub(crate) color: Color,
    pub(crate) opacity: Opacity,
}

impl Stop {
    /// Gradient stop offset.
    ///
    /// `offset` in SVG.
    pub fn offset(&self) -> StopOffset {
        self.offset
    }

    /// Gradient stop color.
    ///
    /// `stop-color` in SVG.
    pub fn color(&self) -> Color {
        self.color
    }

    /// Gradient stop opacity.
    ///
    /// `stop-opacity` in SVG.
    pub fn opacity(&self) -> Opacity {
        self.opacity
    }
}

/// A pattern element.
///
/// `pattern` element in SVG.
#[derive(Debug)]
pub struct Pattern {
    pub(crate) id: NonEmptyString,
    pub(crate) units: Units,         // used only during parsing
    pub(crate) content_units: Units, // used only during parsing
    pub(crate) transform: Transform,
    pub(crate) rect: NonZeroRect,
    pub(crate) view_box: Option<ViewBox>,
    pub(crate) root: Group,
}

impl Pattern {
    /// Element's ID.
    ///
    /// Taken from the SVG itself.
    /// Used only during SVG writing. `resvg` doesn't rely on this property.
    pub fn id(&self) -> &str {
        self.id.get()
    }

    /// Pattern transform.
    ///
    /// `patternTransform` in SVG.
    pub fn transform(&self) -> Transform {
        self.transform
    }

    /// Pattern rectangle.
    ///
    /// `x`, `y`, `width` and `height` in SVG.
    pub fn rect(&self) -> NonZeroRect {
        self.rect
    }

    /// Pattern children.
    pub fn root(&self) -> &Group {
        &self.root
    }
}

/// An alias to `NonZeroPositiveF32`.
pub type StrokeWidth = NonZeroPositiveF32;

/// A `stroke-miterlimit` value.
///
/// Just like `f32` but immutable and guarantee to be >=1.0.
#[derive(Clone, Copy, Debug)]
pub struct StrokeMiterlimit(f32);

impl StrokeMiterlimit {
    /// Creates a new `StrokeMiterlimit` value.
    #[inline]
    pub fn new(n: f32) -> Self {
        debug_assert!(n.is_finite());
        debug_assert!(n >= 1.0);

        let n = if !(n >= 1.0) { 1.0 } else { n };

        StrokeMiterlimit(n)
    }

    /// Returns an underlying value.
    #[inline]
    pub fn get(&self) -> f32 {
        self.0
    }
}

impl Default for StrokeMiterlimit {
    #[inline]
    fn default() -> Self {
        StrokeMiterlimit::new(4.0)
    }
}

impl From<f32> for StrokeMiterlimit {
    #[inline]
    fn from(n: f32) -> Self {
        Self::new(n)
    }
}

impl PartialEq for StrokeMiterlimit {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.0.approx_eq_ulps(&other.0, 4)
    }
}

/// A line cap.
///
/// `stroke-linecap` attribute in the SVG.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum LineCap {
    Butt,
    Round,
    Square,
}

impl Default for LineCap {
    fn default() -> Self {
        Self::Butt
    }
}

/// A line join.
///
/// `stroke-linejoin` attribute in the SVG.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum LineJoin {
    Miter,
    MiterClip,
    Round,
    Bevel,
}

impl Default for LineJoin {
    fn default() -> Self {
        Self::Miter
    }
}

/// A stroke style.
#[derive(Clone, Debug)]
pub struct Stroke {
    pub(crate) paint: Paint,
    pub(crate) dasharray: Option<Vec<f32>>,
    pub(crate) dashoffset: f32,
    pub(crate) miterlimit: StrokeMiterlimit,
    pub(crate) opacity: Opacity,
    pub(crate) width: StrokeWidth,
    pub(crate) linecap: LineCap,
    pub(crate) linejoin: LineJoin,
    // Whether the current stroke needs to be resolved relative
    // to a context element.
    pub(crate) context_element: Option<ContextElement>,
}

impl Stroke {
    /// Stroke paint.
    pub fn paint(&self) -> &Paint {
        &self.paint
    }

    /// Stroke dash array.
    pub fn dasharray(&self) -> Option<&[f32]> {
        self.dasharray.as_deref()
    }

    /// Stroke dash offset.
    pub fn dashoffset(&self) -> f32 {
        self.dashoffset
    }

    /// Stroke miter limit.
    pub fn miterlimit(&self) -> StrokeMiterlimit {
        self.miterlimit
    }

    /// Stroke opacity.
    pub fn opacity(&self) -> Opacity {
        self.opacity
    }

    /// Stroke width.
    pub fn width(&self) -> StrokeWidth {
        self.width
    }

    /// Stroke linecap.
    pub fn linecap(&self) -> LineCap {
        self.linecap
    }

    /// Stroke linejoin.
    pub fn linejoin(&self) -> LineJoin {
        self.linejoin
    }

    /// Converts into a `tiny_skia_path::Stroke` type.
    pub fn to_tiny_skia(&self) -> tiny_skia_path::Stroke {
        let mut stroke = tiny_skia_path::Stroke {
            width: self.width.get(),
            miter_limit: self.miterlimit.get(),
            line_cap: match self.linecap {
                LineCap::Butt => tiny_skia_path::LineCap::Butt,
                LineCap::Round => tiny_skia_path::LineCap::Round,
                LineCap::Square => tiny_skia_path::LineCap::Square,
            },
            line_join: match self.linejoin {
                LineJoin::Miter => tiny_skia_path::LineJoin::Miter,
                LineJoin::MiterClip => tiny_skia_path::LineJoin::MiterClip,
                LineJoin::Round => tiny_skia_path::LineJoin::Round,
                LineJoin::Bevel => tiny_skia_path::LineJoin::Bevel,
            },
            // According to the spec, dash should not be accounted during
            // bbox calculation.
            dash: None,
        };

        if let Some(ref list) = self.dasharray {
            stroke.dash = tiny_skia_path::StrokeDash::new(list.clone(), self.dashoffset);
        }

        stroke
    }
}

/// A fill rule.
///
/// `fill-rule` attribute in the SVG.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum FillRule {
    NonZero,
    EvenOdd,
}

impl Default for FillRule {
    fn default() -> Self {
        Self::NonZero
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum ContextElement {
    /// The current context element is a use node. Since we can get
    /// the bounding box of a use node only once we have converted
    /// all elements, we need to fix the transform and units of
    /// the stroke/fill after converting the whole tree.
    UseNode,
    /// The current context element is a path node (i.e. only applicable
    /// if we draw the marker of a path). Since we already know the bounding
    /// box of the path when rendering the markers, we can convert them directly,
    /// so we do it while parsing.
    PathNode(Transform, Option<NonZeroRect>),
}

/// A fill style.
#[derive(Clone, Debug)]
pub struct Fill {
    pub(crate) paint: Paint,
    pub(crate) opacity: Opacity,
    pub(crate) rule: FillRule,
    // Whether the current fill needs to be resolved relative
    // to a context element.
    pub(crate) context_element: Option<ContextElement>,
}

impl Fill {
    /// Fill paint.
    pub fn paint(&self) -> &Paint {
        &self.paint
    }

    /// Fill opacity.
    pub fn opacity(&self) -> Opacity {
        self.opacity
    }

    /// Fill rule.
    pub fn rule(&self) -> FillRule {
        self.rule
    }
}

impl Default for Fill {
    fn default() -> Self {
        Fill {
            paint: Paint::Color(Color::black()),
            opacity: Opacity::ONE,
            rule: FillRule::default(),
            context_element: None,
        }
    }
}

/// A 8-bit RGB color.
#[derive(Clone, Copy, PartialEq, Debug)]
#[allow(missing_docs)]
pub struct Color {
    pub red: u8,
    pub green: u8,
    pub blue: u8,
}

impl Color {
    /// Constructs a new `Color` from RGB values.
    #[inline]
    pub fn new_rgb(red: u8, green: u8, blue: u8) -> Color {
        Color { red, green, blue }
    }

    /// Constructs a new `Color` set to black.
    #[inline]
    pub fn black() -> Color {
        Color::new_rgb(0, 0, 0)
    }

    /// Constructs a new `Color` set to white.
    #[inline]
    pub fn white() -> Color {
        Color::new_rgb(255, 255, 255)
    }
}

/// A paint style.
///
/// `paint` value type in the SVG.
#[allow(missing_docs)]
#[derive(Clone, Debug)]
pub enum Paint {
    Color(Color),
    LinearGradient(Arc<LinearGradient>),
    RadialGradient(Arc<RadialGradient>),
    Pattern(Arc<Pattern>),
}

impl PartialEq for Paint {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Color(lc), Self::Color(rc)) => lc == rc,
            (Self::LinearGradient(lg1), Self::LinearGradient(lg2)) => Arc::ptr_eq(lg1, lg2),
            (Self::RadialGradient(rg1), Self::RadialGradient(rg2)) => Arc::ptr_eq(rg1, rg2),
            (Self::Pattern(p1), Self::Pattern(p2)) => Arc::ptr_eq(p1, p2),
            _ => false,
        }
    }
}

