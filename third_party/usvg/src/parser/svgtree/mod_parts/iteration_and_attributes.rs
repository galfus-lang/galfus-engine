// SPDX-License-Identifier: Apache-2.0 OR MIT

impl std::fmt::Debug for SvgNode<'_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> Result<(), std::fmt::Error> {
        match self.d.kind {
            NodeKind::Root => write!(f, "Root"),
            NodeKind::Element { .. } => {
                write!(
                    f,
                    "Element {{ tag_name: {:?}, attributes: {:?} }}",
                    self.tag_name(),
                    self.attributes()
                )
            }
            NodeKind::Text(ref text) => write!(f, "Text({:?})", text),
        }
    }
}

/// An iterator over ancestor nodes.
#[derive(Clone, Debug)]
pub struct Ancestors<'a, 'input: 'a>(Option<SvgNode<'a, 'input>>);

impl<'a, 'input: 'a> Iterator for Ancestors<'a, 'input> {
    type Item = SvgNode<'a, 'input>;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        let node = self.0.take();
        self.0 = node.as_ref().and_then(SvgNode::parent);
        node
    }
}

/// An iterator over children nodes.
#[derive(Clone, Debug)]
pub struct Children<'a, 'input: 'a> {
    front: Option<SvgNode<'a, 'input>>,
    back: Option<SvgNode<'a, 'input>>,
}

impl<'a, 'input: 'a> Iterator for Children<'a, 'input> {
    type Item = SvgNode<'a, 'input>;

    fn next(&mut self) -> Option<Self::Item> {
        let node = self.front.take();
        if self.front == self.back {
            self.back = None;
        } else {
            self.front = node.as_ref().and_then(SvgNode::next_sibling);
        }
        node
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Edge<'a, 'input: 'a> {
    Open(SvgNode<'a, 'input>),
    Close(SvgNode<'a, 'input>),
}

#[derive(Clone, Debug)]
struct Traverse<'a, 'input: 'a> {
    root: SvgNode<'a, 'input>,
    edge: Option<Edge<'a, 'input>>,
}

impl<'a, 'input: 'a> Iterator for Traverse<'a, 'input> {
    type Item = Edge<'a, 'input>;

    fn next(&mut self) -> Option<Self::Item> {
        match self.edge {
            Some(Edge::Open(node)) => {
                self.edge = Some(match node.first_child() {
                    Some(first_child) => Edge::Open(first_child),
                    None => Edge::Close(node),
                });
            }
            Some(Edge::Close(node)) => {
                if node == self.root {
                    self.edge = None;
                } else if let Some(next_sibling) = node.next_sibling() {
                    self.edge = Some(Edge::Open(next_sibling));
                } else {
                    self.edge = node.parent().map(Edge::Close);
                }
            }
            None => {
                self.edge = Some(Edge::Open(self.root));
            }
        }

        self.edge
    }
}

/// A descendants iterator.
#[derive(Clone, Debug)]
pub struct Descendants<'a, 'input: 'a>(Traverse<'a, 'input>);

impl<'a, 'input: 'a> Iterator for Descendants<'a, 'input> {
    type Item = SvgNode<'a, 'input>;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        for edge in &mut self.0 {
            if let Edge::Open(node) = edge {
                return Some(node);
            }
        }

        None
    }
}

/// An iterator over `xlink:href` references.
#[derive(Clone, Debug)]
pub struct HrefIter<'a, 'input: 'a> {
    doc: &'a Document<'input>,
    origin: NodeId,
    curr: NodeId,
    is_first: bool,
    is_finished: bool,
}

impl<'a, 'input: 'a> Iterator for HrefIter<'a, 'input> {
    type Item = SvgNode<'a, 'input>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.is_finished {
            return None;
        }

        if self.is_first {
            self.is_first = false;
            return Some(self.doc.get(self.curr));
        }

        if let Some(link) = self.doc.get(self.curr).node_attribute(AId::Href) {
            if link.id() == self.curr || link.id() == self.origin {
                log::warn!(
                    "Element '#{}' cannot reference itself via 'xlink:href'.",
                    self.doc.get(self.origin).element_id()
                );
                self.is_finished = true;
                return None;
            }

            self.curr = link.id();
            Some(self.doc.get(self.curr))
        } else {
            None
        }
    }
}

impl EId {
    /// Checks if this is a
    /// [graphics element](https://www.w3.org/TR/SVG11/intro.html#TermGraphicsElement).
    pub fn is_graphic(&self) -> bool {
        matches!(
            self,
            EId::Circle
                | EId::Ellipse
                | EId::Image
                | EId::Line
                | EId::Path
                | EId::Polygon
                | EId::Polyline
                | EId::Rect
                | EId::Text
                | EId::Use
        )
    }

    /// Checks if this is a
    /// [gradient element](https://www.w3.org/TR/SVG11/intro.html#TermGradientElement).
    pub fn is_gradient(&self) -> bool {
        matches!(self, EId::LinearGradient | EId::RadialGradient)
    }

    /// Checks if this is a
    /// [paint server element](https://www.w3.org/TR/SVG11/intro.html#TermPaint).
    pub fn is_paint_server(&self) -> bool {
        matches!(
            self,
            EId::LinearGradient | EId::RadialGradient | EId::Pattern
        )
    }
}

impl AId {
    fn is_presentation(&self) -> bool {
        matches!(
            self,
            AId::AlignmentBaseline
                | AId::BaselineShift
                | AId::BackgroundColor // non-standard SVG attribute
                | AId::ClipPath
                | AId::ClipRule
                | AId::Color
                | AId::ColorInterpolation
                | AId::ColorInterpolationFilters
                | AId::ColorRendering
                | AId::Direction
                | AId::Display
                | AId::DominantBaseline
                | AId::Fill
                | AId::FillOpacity
                | AId::FillRule
                | AId::Filter
                | AId::FloodColor
                | AId::FloodOpacity
                | AId::FontFamily
                | AId::FontKerning // technically not presentation
                | AId::FontOpticalSizing // technically not presentation
                | AId::FontSize
                | AId::FontSizeAdjust
                | AId::FontStretch
                | AId::FontStyle
                | AId::FontVariant
                | AId::FontWeight
                | AId::FontVariationSettings
                | AId::GlyphOrientationHorizontal
                | AId::GlyphOrientationVertical
                | AId::ImageRendering
                | AId::Isolation // technically not presentation
                | AId::LetterSpacing
                | AId::LightingColor
                | AId::MarkerEnd
                | AId::MarkerMid
                | AId::MarkerStart
                | AId::Mask
                | AId::MaskType
                | AId::MixBlendMode // technically not presentation
                | AId::Opacity
                | AId::Overflow
                | AId::PaintOrder
                | AId::ShapeRendering
                | AId::StopColor
                | AId::StopOpacity
                | AId::Stroke
                | AId::StrokeDasharray
                | AId::StrokeDashoffset
                | AId::StrokeLinecap
                | AId::StrokeLinejoin
                | AId::StrokeMiterlimit
                | AId::StrokeOpacity
                | AId::StrokeWidth
                | AId::TextAnchor
                | AId::TextDecoration
                | AId::TextOverflow
                | AId::TextRendering
                | AId::Transform
                | AId::TransformOrigin
                | AId::UnicodeBidi
                | AId::VectorEffect
                | AId::Visibility
                | AId::WhiteSpace
                | AId::WordSpacing
                | AId::WritingMode
        )
    }

    /// Checks if the current attribute is inheritable.
    fn is_inheritable(&self) -> bool {
        if self.is_presentation() {
            !is_non_inheritable(*self)
        } else {
            false
        }
    }

    fn allows_inherit_value(&self) -> bool {
        matches!(
            self,
            AId::AlignmentBaseline
                | AId::BaselineShift
                | AId::ClipPath
                | AId::ClipRule
                | AId::Color
                | AId::ColorInterpolationFilters
                | AId::Direction
                | AId::Display
                | AId::DominantBaseline
                | AId::Fill
                | AId::FillOpacity
                | AId::FillRule
                | AId::Filter
                | AId::FloodColor
                | AId::FloodOpacity
                | AId::FontFamily
                | AId::FontKerning
                | AId::FontOpticalSizing
                | AId::FontSize
                | AId::FontStretch
                | AId::FontStyle
                | AId::FontVariant
                | AId::FontWeight
                | AId::ImageRendering
                | AId::Kerning
                | AId::LetterSpacing
                | AId::MarkerEnd
                | AId::MarkerMid
                | AId::MarkerStart
                | AId::Mask
                | AId::Opacity
                | AId::Overflow
                | AId::ShapeRendering
                | AId::StopColor
                | AId::StopOpacity
                | AId::Stroke
                | AId::StrokeDasharray
                | AId::StrokeDashoffset
                | AId::StrokeLinecap
                | AId::StrokeLinejoin
                | AId::StrokeMiterlimit
                | AId::StrokeOpacity
                | AId::StrokeWidth
                | AId::TextAnchor
                | AId::TextDecoration
                | AId::TextRendering
                | AId::Visibility
                | AId::WordSpacing
                | AId::WritingMode
        )
    }
}

fn is_non_inheritable(id: AId) -> bool {
    matches!(
        id,
        AId::AlignmentBaseline
            | AId::BaselineShift
            | AId::ClipPath
            | AId::Display
            | AId::DominantBaseline
            | AId::Filter
            | AId::FloodColor
            | AId::FloodOpacity
            | AId::Mask
            | AId::Opacity
            | AId::Overflow
            | AId::LightingColor
            | AId::StopColor
            | AId::StopOpacity
            | AId::TextDecoration
            | AId::Transform
            | AId::TransformOrigin
    )
}

// TODO: is there a way yo make it less ugly? Too many lifetimes.
/// A trait for parsing attribute values.
pub trait FromValue<'a, 'input: 'a>: Sized {
    /// Parses an attribute value.
    ///
    /// When `None` is returned, the attribute value will be logged as a parsing failure.
    fn parse(node: SvgNode<'a, 'input>, aid: AId, value: &'a str) -> Option<Self>;
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for &'a str {
    fn parse(_: SvgNode<'a, 'input>, _: AId, value: &'a str) -> Option<Self> {
        Some(value)
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for f32 {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        svgtypes::Number::from_str(value).ok().map(|v| v.0 as f32)
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for svgtypes::Length {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        svgtypes::Length::from_str(value).ok()
    }
}

// TODO: to svgtypes?
impl<'a, 'input: 'a> FromValue<'a, 'input> for Opacity {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        let length = svgtypes::Length::from_str(value).ok()?;
        if length.unit == svgtypes::LengthUnit::Percent {
            Some(Opacity::new_clamped(length.number as f32 / 100.0))
        } else if length.unit == svgtypes::LengthUnit::None {
            Some(Opacity::new_clamped(length.number as f32))
        } else {
            None
        }
    }
}

