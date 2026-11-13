//! Core UI node hierarchy, computed layout bounds, invalidation flags, and tree mutation.

use galfus_core::id::{RESERVED_RANGE_END, RESERVED_RANGE_START};
use serde::{Deserialize, Serialize};

use super::style::UiLayoutStyle;
use super::types::UiNodeKind;

/// Invalidation categories for fine-grained damage and recalculation tracking.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub struct UiDirtyFlags(pub u32);

impl UiDirtyFlags {
    pub const NONE: u32 = 0;
    /// Visual style altered (colors, borders, opacity, texture tint). No layout changes.
    pub const PAINT: u32 = 1 << 0;
    /// Layout sizing, constraints, padding, or flow changed.
    pub const LAYOUT: u32 = 1 << 1;
    /// Text content, font size, or wrap mode changed requiring shape/metrics re-evaluation.
    pub const TEXT_MEASURE: u32 = 1 << 2;
    /// Scroll offset, transform, or clipping scissor modified.
    pub const CLIP_TRANSFORM: u32 = 1 << 3;
    /// Tree topology altered (child inserted, removed, or reordered).
    pub const HIERARCHY: u32 = 1 << 4;
    /// Complete invalidation mask.
    pub const ALL: u32 = (1 << 5) - 1;

    pub fn contains(&self, flag: u32) -> bool {
        (self.0 & flag) != 0
    }

    pub fn insert(&mut self, flag: u32) {
        self.0 |= flag;
    }

    pub fn remove(&mut self, flag: u32) {
        self.0 &= !flag;
    }
}

/// A node in the UI hierarchy tree.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiNode {
    /// Logical element identifier.
    pub id: u32,
    /// Parent node identifier, or `None` if this is the root node.
    #[serde(default)]
    pub parent: Option<u32>,
    /// Ordered list of child node identifiers.
    #[serde(default)]
    pub children: Vec<u32>,
    /// Sizing, flow, constraints, and layout configuration.
    #[serde(default)]
    pub layout: UiLayoutStyle,
    /// Element type and specific styling.
    pub kind: UiNodeKind,
    /// Whether this node and its children are displayed.
    #[serde(default = "super::types::default_true")]
    pub visible: bool,
    /// Explicit sub-layer offset.
    #[serde(default)]
    pub z_layer: f32,
}

impl UiNode {
    pub fn new(id: u32, kind: UiNodeKind) -> Self {
        Self {
            id,
            parent: None,
            children: Vec::new(),
            layout: UiLayoutStyle::default(),
            kind,
            visible: true,
            z_layer: 0.0,
        }
    }
}

/// Computed geometry, absolute bounds, and rendering parameters after layout resolution.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiComputedLayout {
    /// Local rectangle `[x, y, width, height]` relative to parent inner padding.
    pub local_rect: [f32; 4],
    /// Absolute rectangle `[x, y, width, height]` relative to root UI origin.
    pub absolute_rect: [f32; 4],
    /// Active scissor clipping rectangle `[x, y, width, height]` in root UI space, if clipped.
    pub clip_rect: Option<[f32; 4]>,
    /// Accumulated composite opacity `0.0..=1.0` combined from all ancestors.
    pub accumulated_opacity: f32,
    /// Inner scrollable or content extent `[content_width, content_height]`.
    pub content_size: [f32; 2],
}

/// Error returned on invalid UI tree mutations.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum UiTreeError {
    #[error(
        "Logical ID {0} is in the reserved core range {RESERVED_RANGE_START}..={RESERVED_RANGE_END}"
    )]
    ReservedId(u32),
    #[error("UI node {0} not found")]
    NodeNotFound(u32),
    #[error("Node {0} already exists")]
    DuplicateNode(u32),
    #[error("Cannot insert node {0} into itself or its descendants (cycle prevented)")]
    CycleDetected(u32),
    #[error("Cannot attach non-panel child to a text node")]
    TextCannotHaveChildren,
    #[error("Invalid UI tree: {0}")]
    InvalidTree(String),
}
