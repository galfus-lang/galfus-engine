// SPDX-License-Identifier: Apache-2.0 OR MIT

/// A text chunk anchor property.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum TextAnchor {
    Start,
    Middle,
    End,
}

impl Default for TextAnchor {
    fn default() -> Self {
        Self::Start
    }
}

/// A path used by text-on-path.
#[derive(Debug)]
pub struct TextPath {
    pub(crate) id: NonEmptyString,
    pub(crate) start_offset: f32,
    pub(crate) path: Arc<tiny_skia_path::Path>,
}

impl TextPath {
    /// Element's ID.
    ///
    /// Taken from the SVG itself.
    pub fn id(&self) -> &str {
        self.id.get()
    }

    /// A text offset in SVG coordinates.
    ///
    /// Percentage values already resolved.
    pub fn start_offset(&self) -> f32 {
        self.start_offset
    }

    /// A path.
    pub fn path(&self) -> &tiny_skia_path::Path {
        &self.path
    }
}

/// A text chunk flow property.
#[derive(Clone, Debug)]
pub enum TextFlow {
    /// A linear layout.
    ///
    /// Includes left-to-right, right-to-left and top-to-bottom.
    Linear,
    /// A text-on-path layout.
    Path(Arc<TextPath>),
}

/// A text chunk.
///
/// Text alignment and BIDI reordering can only be done inside a text chunk.
#[derive(Clone, Debug)]
pub struct TextChunk {
    pub(crate) x: Option<f32>,
    pub(crate) y: Option<f32>,
    pub(crate) anchor: TextAnchor,
    pub(crate) spans: Vec<TextSpan>,
    pub(crate) text_flow: TextFlow,
    pub(crate) text: String,
}

impl TextChunk {
    /// An absolute X axis offset.
    pub fn x(&self) -> Option<f32> {
        self.x
    }

    /// An absolute Y axis offset.
    pub fn y(&self) -> Option<f32> {
        self.y
    }

    /// A text anchor.
    pub fn anchor(&self) -> TextAnchor {
        self.anchor
    }

    /// A list of text chunk style spans.
    pub fn spans(&self) -> &[TextSpan] {
        &self.spans
    }

    /// A text chunk flow.
    pub fn text_flow(&self) -> TextFlow {
        self.text_flow.clone()
    }

    /// A text chunk actual text.
    pub fn text(&self) -> &str {
        &self.text
    }
}

/// A writing mode.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum WritingMode {
    LeftToRight,
    TopToBottom,
}

/// A text element.
///
/// `text` element in SVG.
#[derive(Clone, Debug)]
pub struct Text {
    pub(crate) id: String,
    pub(crate) rendering_mode: TextRendering,
    pub(crate) dx: Vec<f32>,
    pub(crate) dy: Vec<f32>,
    pub(crate) rotate: Vec<f32>,
    pub(crate) writing_mode: WritingMode,
    pub(crate) chunks: Vec<TextChunk>,
    pub(crate) abs_transform: Transform,
    pub(crate) bounding_box: Rect,
    pub(crate) abs_bounding_box: Rect,
    pub(crate) stroke_bounding_box: Rect,
    pub(crate) abs_stroke_bounding_box: Rect,
    pub(crate) flattened: Box<Group>,
    #[cfg(feature = "text")]
    pub(crate) layouted: Vec<Span>,
}

impl Text {
    /// Element's ID.
    ///
    /// Taken from the SVG itself.
    /// Isn't automatically generated.
    /// Can be empty.
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Rendering mode.
    ///
    /// `text-rendering` in SVG.
    pub fn rendering_mode(&self) -> TextRendering {
        self.rendering_mode
    }

    /// A relative X axis offsets.
    ///
    /// One offset for each Unicode codepoint. Aka `char` in Rust.
    pub fn dx(&self) -> &[f32] {
        &self.dx
    }

    /// A relative Y axis offsets.
    ///
    /// One offset for each Unicode codepoint. Aka `char` in Rust.
    pub fn dy(&self) -> &[f32] {
        &self.dy
    }

    /// A list of rotation angles.
    ///
    /// One angle for each Unicode codepoint. Aka `char` in Rust.
    pub fn rotate(&self) -> &[f32] {
        &self.rotate
    }

    /// A writing mode.
    pub fn writing_mode(&self) -> WritingMode {
        self.writing_mode
    }

    /// A list of text chunks.
    pub fn chunks(&self) -> &[TextChunk] {
        &self.chunks
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

    /// Element's text bounding box.
    ///
    /// Text bounding box is special in SVG and doesn't represent
    /// tight bounds of the element's content.
    /// You can find more about it
    /// [here](https://razrfalcon.github.io/notes-on-svg-parsing/text/bbox.html).
    ///
    /// `objectBoundingBox` in SVG terms. Meaning it isn't affected by parent transforms.
    ///
    /// Returns `None` when the `text` build feature was disabled.
    /// This is because we have to perform a text layout before calculating a bounding box.
    pub fn bounding_box(&self) -> Rect {
        self.bounding_box
    }

    /// Element's text bounding box in canvas coordinates.
    ///
    /// `userSpaceOnUse` in SVG terms.
    pub fn abs_bounding_box(&self) -> Rect {
        self.abs_bounding_box
    }

    /// Element's object bounding box including stroke.
    ///
    /// Similar to `bounding_box`, but includes stroke.
    ///
    /// Will have the same value as `bounding_box` when path has no stroke.
    pub fn stroke_bounding_box(&self) -> Rect {
        self.stroke_bounding_box
    }

    /// Element's bounding box including stroke in canvas coordinates.
    pub fn abs_stroke_bounding_box(&self) -> Rect {
        self.abs_stroke_bounding_box
    }

    /// Text converted into paths, ready to render.
    ///
    /// Note that this is only a
    /// "best-effort" attempt: The text will be converted into group/paths/image
    /// primitives, so that they can be rendered with the existing infrastructure.
    /// This process is in general lossless and should lead to correct output, with
    /// two notable exceptions:
    /// 1. For glyphs based on the `SVG` table, only glyphs that are pure SVG 1.1/2.0
    ///    are supported. Glyphs that make use of features in the OpenType specification
    ///    that are not part of the original SVG specification are not supported.
    /// 2. For glyphs based on the `COLR` table, there are a certain number of features
    ///    that are not (correctly) supported, such as conical
    ///    gradients, certain gradient transforms and some blend modes. But this shouldn't
    ///    cause any issues in 95% of the cases, as most of those are edge cases.
    ///    If the two above are not acceptable, then you will need to implement your own
    ///    glyph rendering logic based on the layouted glyphs (see the `layouted` method).
    pub fn flattened(&self) -> &Group {
        &self.flattened
    }

    /// The positioned glyphs and decoration spans of the text.
    ///
    /// This should only be used if you need more low-level access
    /// to the glyphs that make up the text. If you just need the
    /// outlines of the text, you should use `flattened` instead.
    #[cfg(feature = "text")]
    pub fn layouted(&self) -> &[Span] {
        &self.layouted
    }

    pub(crate) fn subroots(&self, f: &mut dyn FnMut(&Group)) {
        f(&self.flattened);
    }
}
