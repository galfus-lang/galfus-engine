// SPDX-License-Identifier: Apache-2.0 OR MIT

use std::collections::HashMap;
use std::num::NonZeroU32;
use std::str::FromStr;


use tiny_skia_path::Transform;

use crate::{
    BlendMode, ImageRendering, Opacity, ShapeRendering, SpreadMethod, TextRendering, Units,
    Visibility,
};
pub use names::{AId, EId};

/// An SVG tree container.
///
/// Contains only element and text nodes.
/// Text nodes are present only inside the `text` element.
pub struct Document<'input> {
    nodes: Vec<NodeData>,
    attrs: Vec<Attribute<'input>>,
    links: HashMap<String, NodeId>,
}

impl<'input> Document<'input> {
    /// Returns the root node.
    #[inline]
    pub fn root<'a>(&'a self) -> SvgNode<'a, 'input> {
        SvgNode {
            id: NodeId::new(0),
            d: &self.nodes[0],
            doc: self,
        }
    }

    /// Returns the root element.
    #[inline]
    pub fn root_element<'a>(&'a self) -> SvgNode<'a, 'input> {
        // `unwrap` is safe, because `Document` is guarantee to have at least one element.
        self.root().first_element_child().unwrap()
    }

    /// Returns an iterator over document's descendant nodes.
    ///
    /// Shorthand for `doc.root().descendants()`.
    #[inline]
    pub fn descendants<'a>(&'a self) -> Descendants<'a, 'input> {
        self.root().descendants()
    }

    /// Returns an element by ID.
    ///
    /// Unlike the [`Descendants`] iterator, this is just a HashMap lookup.
    /// Meaning it's way faster.
    #[inline]
    pub fn element_by_id<'a>(&'a self, id: &str) -> Option<SvgNode<'a, 'input>> {
        let node_id = self.links.get(id)?;
        Some(self.get(*node_id))
    }

    #[inline]
    fn get<'a>(&'a self, id: NodeId) -> SvgNode<'a, 'input> {
        SvgNode {
            id,
            d: &self.nodes[id.get_usize()],
            doc: self,
        }
    }
}

impl std::fmt::Debug for Document<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> Result<(), std::fmt::Error> {
        if !self.root().has_children() {
            return write!(f, "Document []");
        }

        macro_rules! writeln_indented {
            ($depth:expr, $f:expr, $fmt:expr) => {
                for _ in 0..$depth { write!($f, "    ")?; }
                writeln!($f, $fmt)?;
            };
            ($depth:expr, $f:expr, $fmt:expr, $($arg:tt)*) => {
                for _ in 0..$depth { write!($f, "    ")?; }
                writeln!($f, $fmt, $($arg)*)?;
            };
        }

        fn print_children(
            parent: SvgNode,
            depth: usize,
            f: &mut std::fmt::Formatter,
        ) -> Result<(), std::fmt::Error> {
            for child in parent.children() {
                if child.is_element() {
                    writeln_indented!(depth, f, "Element {{");
                    writeln_indented!(depth, f, "    tag_name: {:?}", child.tag_name());

                    if !child.attributes().is_empty() {
                        writeln_indented!(depth + 1, f, "attributes: [");
                        for attr in child.attributes() {
                            writeln_indented!(depth + 2, f, "{:?}", attr);
                        }
                        writeln_indented!(depth + 1, f, "]");
                    }

                    if child.has_children() {
                        writeln_indented!(depth, f, "    children: [");
                        print_children(child, depth + 2, f)?;
                        writeln_indented!(depth, f, "    ]");
                    }

                    writeln_indented!(depth, f, "}}");
                } else {
                    writeln_indented!(depth, f, "{:?}", child);
                }
            }

            Ok(())
        }

        writeln!(f, "Document [")?;
        print_children(self.root(), 1, f)?;
        writeln!(f, "]")?;

        Ok(())
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct ShortRange {
    start: u32,
    end: u32,
}

impl ShortRange {
    #[inline]
    fn new(start: u32, end: u32) -> Self {
        ShortRange { start, end }
    }

    #[inline]
    fn to_urange(self) -> std::ops::Range<usize> {
        self.start as usize..self.end as usize
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub(crate) struct NodeId(NonZeroU32);

impl NodeId {
    #[inline]
    fn new(id: u32) -> Self {
        debug_assert!(id < u32::MAX);

        // We are using `NonZeroU32` to reduce overhead of `Option<NodeId>`.
        NodeId(NonZeroU32::new(id + 1).unwrap())
    }

    #[inline]
    fn get(self) -> u32 {
        self.0.get() - 1
    }

    #[inline]
    fn get_usize(self) -> usize {
        self.get() as usize
    }
}

impl From<usize> for NodeId {
    #[inline]
    fn from(id: usize) -> Self {
        // We already checked that `id` is limited by u32::MAX.
        debug_assert!(id <= u32::MAX as usize);
        NodeId::new(id as u32)
    }
}

pub(crate) enum NodeKind {
    Root,
    Element {
        tag_name: EId,
        attributes: ShortRange,
    },
    Text(String),
}

struct NodeData {
    parent: Option<NodeId>,
    next_sibling: Option<NodeId>,
    children: Option<(NodeId, NodeId)>,
    kind: NodeKind,
}

/// An attribute.
#[derive(Clone)]
pub struct Attribute<'input> {
    /// Attribute's name.
    pub name: AId,
    /// Attribute's value.
    pub value: roxmltree::StringStorage<'input>,
    /// Attribute's importance
    pub important: bool,
}

impl std::fmt::Debug for Attribute<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> Result<(), std::fmt::Error> {
        write!(
            f,
            "Attribute {{ name: {:?}, value: {}, important: {} }}",
            self.name, self.value, self.important
        )
    }
}

/// An SVG node.
#[derive(Clone, Copy)]
pub struct SvgNode<'a, 'input: 'a> {
    id: NodeId,
    doc: &'a Document<'input>,
    d: &'a NodeData,
}

impl Eq for SvgNode<'_, '_> {}

impl PartialEq for SvgNode<'_, '_> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id && std::ptr::eq(self.doc, other.doc) && std::ptr::eq(self.d, other.d)
    }
}

impl<'a, 'input: 'a> SvgNode<'a, 'input> {
    #[inline]
    fn id(&self) -> NodeId {
        self.id
    }

    /// Checks if the current node is an element.
    #[inline]
    pub fn is_element(&self) -> bool {
        matches!(self.d.kind, NodeKind::Element { .. })
    }

    /// Checks if the current node is a text.
    #[inline]
    pub fn is_text(&self) -> bool {
        matches!(self.d.kind, NodeKind::Text(_))
    }

    /// Returns node's document.
    #[inline]
    pub fn document(&self) -> &'a Document<'input> {
        self.doc
    }

    /// Returns element's tag name, unless the current node is text.
    #[inline]
    pub fn tag_name(&self) -> Option<EId> {
        match self.d.kind {
            NodeKind::Element { tag_name, .. } => Some(tag_name),
            _ => None,
        }
    }
    /// Returns element's `id` attribute value.
    ///
    /// Returns an empty string otherwise.
    #[inline]
    pub fn element_id(&self) -> &'a str {
        self.attribute(AId::Id).unwrap_or("")
    }

    /// Returns an attribute value.
    pub fn attribute<T: FromValue<'a, 'input>>(&self, aid: AId) -> Option<T> {
        let value = self
            .attributes()
            .iter()
            .find(|a| a.name == aid)
            .map(|a| a.value.as_str())?;
        // These AId have an initial value of none
        let is_possible_none = matches!(
            aid,
            AId::Mask
                | AId::MarkerStart
                | AId::MarkerMid
                | AId::MarkerEnd
                | AId::ClipPath
                | AId::Filter
                | AId::FontSizeAdjust
                | AId::TextDecoration
                | AId::Stroke
                | AId::StrokeDasharray
        );
        if is_possible_none && value == "none" {
            return None;
        }
        match T::parse(*self, aid, value) {
            Some(v) => Some(v),
            None => {
                // TODO: show position in XML
                log::warn!("Failed to parse {} value: '{}'.", aid, value);
                None
            }
        }
    }

    /// Returns an attribute value.
    ///
    /// Same as `SvgNode::attribute`, but doesn't show a warning.
    pub fn try_attribute<T: FromValue<'a, 'input>>(&self, aid: AId) -> Option<T> {
        let value = self
            .attributes()
            .iter()
            .find(|a| a.name == aid)
            .map(|a| a.value.as_str())?;
        T::parse(*self, aid, value)
    }

    #[inline]
    fn node_attribute(&self, aid: AId) -> Option<SvgNode<'a, 'input>> {
        let value = self.attribute(aid)?;
        let id = if aid == AId::Href {
            svgtypes::IRI::from_str(value).ok().map(|v| v.0)
        } else {
            svgtypes::FuncIRI::from_str(value).ok().map(|v| v.0)
        }?;

        self.document().element_by_id(id)
    }

    /// Checks if an attribute is present.
    #[inline]
    pub fn has_attribute(&self, aid: AId) -> bool {
        self.attributes().iter().any(|a| a.name == aid)
    }

    /// Returns a list of all element's attributes.
    #[inline]
    pub fn attributes(&self) -> &'a [Attribute<'input>] {
        match self.d.kind {
            NodeKind::Element { ref attributes, .. } => &self.doc.attrs[attributes.to_urange()],
            _ => &[],
        }
    }

    #[inline]
    fn attribute_id(&self, aid: AId) -> Option<usize> {
        match self.d.kind {
            NodeKind::Element { ref attributes, .. } => {
                let idx = self.attributes().iter().position(|attr| attr.name == aid)?;
                Some(attributes.start as usize + idx)
            }
            _ => None,
        }
    }

    /// Finds a [`Node`] that contains the required attribute.
    ///
    /// For inheritable attributes walks over ancestors until a node with
    /// the specified attribute is found.
    ///
    /// For non-inheritable attributes checks only the current node and the parent one.
    /// As per SVG spec.
    pub fn find_attribute<T: FromValue<'a, 'input>>(&self, aid: AId) -> Option<T> {
        self.find_attribute_impl(aid)?.attribute(aid)
    }

    fn find_attribute_impl(&self, aid: AId) -> Option<SvgNode<'a, 'input>> {
        if aid.is_inheritable() {
            for n in self.ancestors() {
                if n.has_attribute(aid) {
                    return Some(n);
                }
            }

            None
        } else {
            if self.has_attribute(aid) {
                Some(*self)
            } else {
                // Non-inheritable attributes can inherit a value only from a direct parent.
                let n = self.parent_element()?;
                if n.has_attribute(aid) { Some(n) } else { None }
            }
        }
    }

    /// Returns node's text data.
    ///
    /// For text nodes returns its content. For elements returns the first child node text.
    #[inline]
    pub fn text(&self) -> &'a str {
        match self.d.kind {
            NodeKind::Element { .. } => match self.first_child() {
                Some(child) if child.is_text() => match self.doc.nodes[child.id.get_usize()].kind {
                    NodeKind::Text(ref text) => text,
                    _ => "",
                },
                _ => "",
            },
            NodeKind::Text(ref text) => text,
            _ => "",
        }
    }

    /// Returns a parent node.
    #[inline]
    pub fn parent(&self) -> Option<Self> {
        self.d.parent.map(|id| self.doc.get(id))
    }

    /// Returns the parent element.
    #[inline]
    pub fn parent_element(&self) -> Option<Self> {
        self.ancestors().skip(1).find(|n| n.is_element())
    }

    /// Returns the next sibling.
    #[inline]
    pub fn next_sibling(&self) -> Option<Self> {
        self.d.next_sibling.map(|id| self.doc.get(id))
    }

    /// Returns the first child.
    #[inline]
    pub fn first_child(&self) -> Option<Self> {
        self.d.children.map(|(id, _)| self.doc.get(id))
    }

    /// Returns the first child element.
    #[inline]
    pub fn first_element_child(&self) -> Option<Self> {
        self.children().find(|n| n.is_element())
    }

    /// Returns the last child.
    #[inline]
    pub fn last_child(&self) -> Option<Self> {
        self.d.children.map(|(_, id)| self.doc.get(id))
    }

    /// Checks if the node has child nodes.
    #[inline]
    pub fn has_children(&self) -> bool {
        self.d.children.is_some()
    }

    /// Returns an iterator over ancestor nodes starting at this node.
    #[inline]
    pub fn ancestors(&self) -> Ancestors<'a, 'input> {
        Ancestors(Some(*self))
    }

    /// Returns an iterator over children nodes.
    #[inline]
    pub fn children(&self) -> Children<'a, 'input> {
        Children {
            front: self.first_child(),
            back: self.last_child(),
        }
    }

    /// Returns an iterator which traverses the subtree starting at this node.
    #[inline]
    fn traverse(&self) -> Traverse<'a, 'input> {
        Traverse {
            root: *self,
            edge: None,
        }
    }

    /// Returns an iterator over this node and its descendants.
    #[inline]
    pub fn descendants(&self) -> Descendants<'a, 'input> {
        Descendants(self.traverse())
    }

    /// Returns an iterator over elements linked via `xlink:href`.
    #[inline]
    pub fn href_iter(&self) -> HrefIter<'a, 'input> {
        HrefIter {
            doc: self.document(),
            origin: self.id(),
            curr: self.id(),
            is_first: true,
            is_finished: false,
        }
    }
}

