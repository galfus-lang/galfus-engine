//! UI Model owning hierarchical panel/text trees, layout caches, and damage regions.

use galfus_core::id::is_reserved_logical_id;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::style::UiLayoutStyle;
use super::tree::{UiComputedLayout, UiDirtyFlags, UiNode, UiTreeError};
use super::types::{PanelNode, ScrollPanelNode, SpritePanelNode, TextNode, UiNodeKind};

/// Legacy visual quad for flat UI descriptor compatibility.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiQuad2D {
    pub rect: [f32; 4],
    #[serde(default)]
    pub z_layer: f32,
    #[serde(default = "super::types::default_zero_vec4")]
    pub border_radius: [f32; 4],
    #[serde(default = "super::types::default_zero_vec4")]
    pub border_width: [f32; 4],
    #[serde(default = "super::types::default_white_vec4")]
    pub background_color: [f32; 4],
    #[serde(default = "super::types::default_zero_vec4")]
    pub border_color: [f32; 4],
    #[serde(default)]
    pub texture_id: Option<u32>,
    #[serde(default = "super::types::default_unit_vec4")]
    pub uv_rect: [f32; 4],
    #[serde(default)]
    pub sampler_index: u32,
    #[serde(default = "super::types::default_white_vec4")]
    pub tint_color: [f32; 4],
    #[serde(default)]
    pub clip_rect: Option<[f32; 4]>,
}

/// Legacy text run for flat UI descriptor compatibility.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiText2D {
    pub position: [f32; 2],
    #[serde(default)]
    pub z_layer: f32,
    pub font_size: f32,
    #[serde(default = "super::types::default_white_vec4")]
    pub color: [f32; 4],
    /// Unicode text stored as UTF-16; JSON transports encode it as a string.
    pub text: super::UiText,
    #[serde(default)]
    pub clip_rect: Option<[f32; 4]>,
}

/// Dedicated 2D UI Model holding a core-owned tree of panels and text elements.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Model2DUI {
    /// Optional human-readable debug label.
    pub label: Option<String>,
    /// Root panel node identifier.
    #[serde(default)]
    pub root_id: Option<u32>,
    /// Nodes in the UI tree indexed by logical ID.
    #[serde(default)]
    pub nodes: HashMap<u32, UiNode>,
    /// Cached layout calculations per element.
    #[serde(skip)]
    pub computed: HashMap<u32, UiComputedLayout>,
    /// Invalidation flags per node for fine-grained update passes.
    #[serde(skip)]
    pub dirty_flags: HashMap<u32, UiDirtyFlags>,
    /// Accumulated damaged screen regions `[x, y, width, height]` for partial redraws.
    #[serde(skip)]
    pub damage_regions: Vec<[f32; 4]>,

    /// Temporary compatibility batches for flat quad descriptions.
    #[serde(default)]
    pub quads: Vec<UiQuad2D>,
    /// Temporary compatibility batches for flat text descriptions.
    #[serde(default)]
    pub texts: Vec<UiText2D>,
}

impl Model2DUI {
    /// Creates an empty UI model.
    pub fn new() -> Self {
        Self::default()
    }

    /// Validates that an element logical ID does not fall into the core-reserved range.
    pub fn validate_id(&self, id: u32) -> Result<(), UiTreeError> {
        if is_reserved_logical_id(id) {
            Err(UiTreeError::ReservedId(id))
        } else {
            Ok(())
        }
    }

    /// Sets or replaces the root element ID.
    pub fn set_root(&mut self, root_id: u32) -> Result<(), UiTreeError> {
        self.validate_id(root_id)?;
        let root = self
            .nodes
            .get(&root_id)
            .ok_or(UiTreeError::NodeNotFound(root_id))?;
        if root.parent.is_some() || !root.kind.is_panel() {
            return Err(UiTreeError::InvalidTree(
                "root must be a parentless panel".into(),
            ));
        }
        self.root_id = Some(root_id);
        self.mark_dirty(root_id, UiDirtyFlags::ALL);
        Ok(())
    }

    /// Creates and inserts a basic panel element.
    pub fn create_panel(
        &mut self,
        id: u32,
        panel: PanelNode,
        layout: UiLayoutStyle,
    ) -> Result<(), UiTreeError> {
        self.add_node_internal(id, UiNodeKind::Panel(panel), layout)
    }

    /// Creates and inserts a textured/nine-slice sprite panel element.
    pub fn create_sprite_panel(
        &mut self,
        id: u32,
        sprite: SpritePanelNode,
        layout: UiLayoutStyle,
    ) -> Result<(), UiTreeError> {
        self.add_node_internal(id, UiNodeKind::SpritePanel(sprite), layout)
    }

    /// Creates and inserts a scrollable viewport panel element.
    pub fn create_scroll_panel(
        &mut self,
        id: u32,
        scroll: ScrollPanelNode,
        layout: UiLayoutStyle,
    ) -> Result<(), UiTreeError> {
        self.add_node_internal(id, UiNodeKind::ScrollPanel(scroll), layout)
    }

    /// Creates and inserts a text layout element.
    pub fn create_text(
        &mut self,
        id: u32,
        text: TextNode,
        layout: UiLayoutStyle,
    ) -> Result<(), UiTreeError> {
        self.add_node_internal(id, UiNodeKind::Text(text), layout)
    }

    /// Creates a formatted text element; events remain exclusive to panels.
    pub fn create_rich_text(
        &mut self,
        id: u32,
        text: super::RichText,
        layout: UiLayoutStyle,
    ) -> Result<(), UiTreeError> {
        if !text.is_valid() {
            return Err(UiTreeError::InvalidTree("invalid rich text style".into()));
        }
        self.add_node_internal(id, UiNodeKind::RichText(text), layout)
    }

    fn add_node_internal(
        &mut self,
        id: u32,
        kind: UiNodeKind,
        layout: UiLayoutStyle,
    ) -> Result<(), UiTreeError> {
        self.validate_id(id)?;
        if self.nodes.contains_key(&id) {
            return Err(UiTreeError::DuplicateNode(id));
        }
        let mut node = UiNode::new(id, kind);
        node.layout = layout;
        self.nodes.insert(id, node);
        if self.root_id.is_none() {
            self.root_id = Some(id);
        }
        self.mark_dirty(id, UiDirtyFlags::ALL);
        Ok(())
    }

    /// Inserts a child element under a parent container, enforcing cycle prevention and single-parent rules.
    pub fn insert_child(
        &mut self,
        parent_id: u32,
        child_id: u32,
        index: Option<usize>,
    ) -> Result<(), UiTreeError> {
        self.validate_id(parent_id)?;
        self.validate_id(child_id)?;

        if parent_id == child_id {
            return Err(UiTreeError::CycleDetected(child_id));
        }
        if !self.nodes.contains_key(&parent_id) {
            return Err(UiTreeError::NodeNotFound(parent_id));
        }
        if !self.nodes.contains_key(&child_id) {
            return Err(UiTreeError::NodeNotFound(child_id));
        }

        // Verify parent is a panel variant (text cannot have children)
        if matches!(
            self.nodes.get(&parent_id).unwrap().kind,
            UiNodeKind::Text(_) | UiNodeKind::RichText(_)
        ) {
            return Err(UiTreeError::TextCannotHaveChildren);
        }

        // Cycle check: climb up ancestors of parent_id to ensure child_id is not encountered
        let mut ancestor = Some(parent_id);
        while let Some(current) = ancestor {
            if current == child_id {
                return Err(UiTreeError::CycleDetected(child_id));
            }
            ancestor = self.nodes.get(&current).and_then(|n| n.parent);
        }
        if self.root_id == Some(child_id) {
            return Err(UiTreeError::InvalidTree(
                "root cannot be attached as a child".into(),
            ));
        }

        // Detach from previous parent if already attached
        if let Some(old_parent) = self.nodes.get(&child_id).and_then(|n| n.parent)
            && old_parent != parent_id
        {
            self.remove_child(old_parent, child_id)?;
        }

        // Insert into parent children list
        let parent = self.nodes.get_mut(&parent_id).unwrap();
        if let Some(idx) = index {
            parent.children.retain(|&id| id != child_id);
            let clamped = idx.min(parent.children.len());
            parent.children.insert(clamped, child_id);
        } else if !parent.children.contains(&child_id) {
            parent.children.push(child_id);
        }

        // Set child's parent link
        let child = self.nodes.get_mut(&child_id).unwrap();
        child.parent = Some(parent_id);

        self.mark_dirty(parent_id, UiDirtyFlags::HIERARCHY | UiDirtyFlags::LAYOUT);
        self.mark_dirty(child_id, UiDirtyFlags::HIERARCHY | UiDirtyFlags::LAYOUT);
        Ok(())
    }

    /// Detaches a child element from its parent without destroying it.
    pub fn remove_child(&mut self, parent_id: u32, child_id: u32) -> Result<(), UiTreeError> {
        self.validate_id(parent_id)?;
        self.validate_id(child_id)?;
        let parent = self
            .nodes
            .get_mut(&parent_id)
            .ok_or(UiTreeError::NodeNotFound(parent_id))?;
        if !parent.children.contains(&child_id) {
            return Err(UiTreeError::NodeNotFound(child_id));
        }
        parent.children.retain(|&c| c != child_id);

        if let Some(child) = self.nodes.get_mut(&child_id)
            && child.parent == Some(parent_id)
        {
            child.parent = None;
        }

        let mut stack = vec![child_id];
        while let Some(id) = stack.pop() {
            if let Some(node) = self.nodes.get(&id) {
                stack.extend(node.children.iter().copied());
            }
            if let Some(layout) = self.computed.remove(&id)
                && layout.absolute_rect[2] > 0.0
                && layout.absolute_rect[3] > 0.0
            {
                self.damage_regions.push(layout.absolute_rect);
            }
        }

        self.mark_dirty(parent_id, UiDirtyFlags::HIERARCHY | UiDirtyFlags::LAYOUT);
        self.mark_dirty(child_id, UiDirtyFlags::HIERARCHY | UiDirtyFlags::LAYOUT);
        Ok(())
    }

    /// Reorders an existing child within its parent container.
    pub fn reorder_child(
        &mut self,
        parent_id: u32,
        child_id: u32,
        new_index: usize,
    ) -> Result<(), UiTreeError> {
        let parent = self
            .nodes
            .get_mut(&parent_id)
            .ok_or(UiTreeError::NodeNotFound(parent_id))?;
        if let Some(pos) = parent.children.iter().position(|&c| c == child_id) {
            parent.children.remove(pos);
            let clamped = new_index.min(parent.children.len());
            parent.children.insert(clamped, child_id);
            self.mark_dirty(parent_id, UiDirtyFlags::HIERARCHY | UiDirtyFlags::LAYOUT);
            Ok(())
        } else {
            Err(UiTreeError::NodeNotFound(child_id))
        }
    }

    /// Destroys a node and all of its descendants recursively, recording damage bounds and returning destroyed IDs.
    pub fn destroy_node(&mut self, id: u32) -> Result<Vec<u32>, UiTreeError> {
        self.validate_id(id)?;
        if !self.nodes.contains_key(&id) {
            return Err(UiTreeError::NodeNotFound(id));
        }

        // Detach from parent
        if let Some(parent_id) = self.nodes.get(&id).and_then(|n| n.parent) {
            if let Some(parent) = self.nodes.get_mut(&parent_id) {
                parent.children.retain(|&c| c != id);
            }
            self.mark_dirty(parent_id, UiDirtyFlags::HIERARCHY | UiDirtyFlags::LAYOUT);
        }

        if self.root_id == Some(id) {
            self.root_id = None;
        }

        // Recursively collect all descendant IDs
        let mut destroyed = Vec::new();
        let mut stack = vec![id];
        while let Some(current) = stack.pop() {
            destroyed.push(current);
            if let Some(node) = self.nodes.remove(&current) {
                for child_id in node.children {
                    stack.push(child_id);
                }
            }
            if let Some(layout) = self.computed.remove(&current)
                && layout.absolute_rect[2] > 0.0
                && layout.absolute_rect[3] > 0.0
            {
                self.damage_regions.push(layout.absolute_rect);
            }
            self.dirty_flags.remove(&current);
        }

        Ok(destroyed)
    }

    /// Marks dirty flags on a node, propagating layout invalidation upward to parents when required.
    pub fn mark_dirty(&mut self, id: u32, flags: u32) {
        self.dirty_flags.entry(id).or_default().insert(flags);
        // Bubble layout up ancestor chain
        if (flags & (UiDirtyFlags::LAYOUT | UiDirtyFlags::TEXT_MEASURE | UiDirtyFlags::HIERARCHY))
            != 0
        {
            let mut curr = self.nodes.get(&id).and_then(|n| n.parent);
            while let Some(parent_id) = curr {
                self.dirty_flags
                    .entry(parent_id)
                    .or_default()
                    .insert(UiDirtyFlags::LAYOUT);
                curr = self.nodes.get(&parent_id).and_then(|n| n.parent);
            }
        }
    }

    /// Resolves the topmost eligible panel at the given UI coordinate `[x, y]`
    /// using computed layout, draw order, and active scissor clipping.
    pub fn pick_panel(&self, point: [f32; 2]) -> Option<u32> {
        let root_id = self.root_id?;
        let [px, py] = point;

        let mut candidates = Vec::new();
        self.collect_panel_candidates(root_id, &mut candidates);

        for &node_id in candidates.iter().rev() {
            let Some(node) = self.nodes.get(&node_id) else {
                continue;
            };
            if !node.visible || !node.kind.is_panel() {
                continue;
            }
            let Some(layout) = self.computed.get(&node_id) else {
                continue;
            };
            let [x, y, w, h] = layout.absolute_rect;

            if px < x || px > x + w || py < y || py > y + h {
                continue;
            }

            if let Some([cx, cy, cw, ch]) = layout.clip_rect
                && (px < cx || px > cx + cw || py < cy || py > cy + ch)
            {
                continue;
            }

            return Some(node_id);
        }

        None
    }

    /// Whether a panel remains visible and attached to the computed UI tree.
    pub fn is_interactive_panel(&self, id: u32) -> bool {
        let Some(root) = self.root_id else {
            return false;
        };
        let Some(node) = self.nodes.get(&id) else {
            return false;
        };
        if !node.kind.is_panel() || !self.computed.contains_key(&id) {
            return false;
        }
        let mut current = Some(id);
        while let Some(id) = current {
            let Some(node) = self.nodes.get(&id) else {
                return false;
            };
            if !node.visible {
                return false;
            }
            if id == root {
                return true;
            }
            current = node.parent;
        }
        false
    }

    fn collect_panel_candidates(&self, node_id: u32, out: &mut Vec<u32>) {
        if let Some(node) = self.nodes.get(&node_id) {
            if !node.visible {
                return;
            }
            out.push(node_id);
            for &child_id in &node.children {
                self.collect_panel_candidates(child_id, out);
            }
        }
    }
}
