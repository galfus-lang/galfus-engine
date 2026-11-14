//! Atomic mutations of the core-owned UI tree.

use serde::{Deserialize, Serialize};

use super::{Model2DUI, UiDirtyFlags, UiLayoutStyle, UiNodeKind, UiTreeError};

/// A host-requested mutation. Logical element IDs are validated by the core.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum UiCommand {
    Create {
        id: u32,
        kind: UiNodeKind,
        #[serde(default)]
        layout: UiLayoutStyle,
    },
    SetRoot {
        id: u32,
    },
    Insert {
        parent_id: u32,
        child_id: u32,
        #[serde(default)]
        index: Option<usize>,
    },
    Detach {
        parent_id: u32,
        child_id: u32,
    },
    Reorder {
        parent_id: u32,
        child_id: u32,
        index: usize,
    },
    Remove {
        id: u32,
    },
    SetKind {
        id: u32,
        kind: UiNodeKind,
    },
    SetLayout {
        id: u32,
        layout: UiLayoutStyle,
    },
    SetVisible {
        id: u32,
        visible: bool,
    },
    SetZLayer {
        id: u32,
        z_layer: f32,
    },
}

impl Model2DUI {
    /// Applies a batch atomically. Failed commands leave the existing tree unchanged.
    pub fn apply_commands(&mut self, commands: &[UiCommand]) -> Result<(), UiTreeError> {
        let mut staged = self.clone();
        for command in commands {
            match command {
                UiCommand::Create { id, kind, layout } => match kind {
                    UiNodeKind::Panel(panel) => {
                        staged.create_panel(*id, panel.clone(), layout.clone())?
                    }
                    UiNodeKind::SpritePanel(sprite) => {
                        staged.create_sprite_panel(*id, sprite.clone(), layout.clone())?
                    }
                    UiNodeKind::ScrollPanel(scroll) => {
                        staged.create_scroll_panel(*id, scroll.clone(), layout.clone())?
                    }
                    UiNodeKind::Text(text) => {
                        staged.create_text(*id, text.clone(), layout.clone())?
                    }
                    UiNodeKind::RichText(text) => {
                        staged.create_rich_text(*id, text.clone(), layout.clone())?
                    }
                },
                UiCommand::SetRoot { id } => staged.set_root(*id)?,
                UiCommand::Insert {
                    parent_id,
                    child_id,
                    index,
                } => staged.insert_child(*parent_id, *child_id, *index)?,
                UiCommand::Detach {
                    parent_id,
                    child_id,
                } => staged.remove_child(*parent_id, *child_id)?,
                UiCommand::Reorder {
                    parent_id,
                    child_id,
                    index,
                } => staged.reorder_child(*parent_id, *child_id, *index)?,
                UiCommand::Remove { id } => {
                    staged.destroy_node(*id)?;
                }
                UiCommand::SetKind { id, kind } => {
                    staged.validate_id(*id)?;
                    let node = staged
                        .nodes
                        .get_mut(id)
                        .ok_or(UiTreeError::NodeNotFound(*id))?;
                    if node.kind != *kind {
                        node.kind = kind.clone();
                        staged.mark_dirty(*id, UiDirtyFlags::ALL);
                    }
                }
                UiCommand::SetLayout { id, layout } => {
                    staged.validate_id(*id)?;
                    let node = staged
                        .nodes
                        .get_mut(id)
                        .ok_or(UiTreeError::NodeNotFound(*id))?;
                    if node.layout != *layout {
                        node.layout = layout.clone();
                        staged.mark_dirty(*id, UiDirtyFlags::LAYOUT | UiDirtyFlags::CLIP_TRANSFORM);
                    }
                }
                UiCommand::SetVisible { id, visible } => {
                    staged.validate_id(*id)?;
                    let node = staged
                        .nodes
                        .get_mut(id)
                        .ok_or(UiTreeError::NodeNotFound(*id))?;
                    if node.visible != *visible {
                        node.visible = *visible;
                        staged.mark_dirty(*id, UiDirtyFlags::PAINT | UiDirtyFlags::HIERARCHY);
                    }
                }
                UiCommand::SetZLayer { id, z_layer } => {
                    staged.validate_id(*id)?;
                    if !z_layer.is_finite() {
                        return Err(UiTreeError::InvalidTree("z layer must be finite".into()));
                    }
                    let node = staged
                        .nodes
                        .get_mut(id)
                        .ok_or(UiTreeError::NodeNotFound(*id))?;
                    if node.z_layer != *z_layer {
                        node.z_layer = *z_layer;
                        staged.mark_dirty(*id, UiDirtyFlags::PAINT);
                    }
                }
            }
        }
        staged.validate_tree()?;
        *self = staged;
        Ok(())
    }
}
