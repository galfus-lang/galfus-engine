//! Validation of UI trees received through the transport boundary.

use std::collections::HashSet;

use super::{Model2DUI, UiTreeError};

impl Model2DUI {
    /// Validates a complete tree before accepting it from an external caller.
    pub fn validate_tree(&self) -> Result<(), UiTreeError> {
        match self.root_id {
            Some(id) => {
                self.validate_id(id)?;
                let root = self.nodes.get(&id).ok_or(UiTreeError::NodeNotFound(id))?;
                if root.parent.is_some() || !root.kind.is_panel() {
                    return Err(UiTreeError::InvalidTree(
                        "root must be a parentless panel".into(),
                    ));
                }
            }
            None if !self.nodes.is_empty() => {
                return Err(UiTreeError::InvalidTree(
                    "nodes require a root panel".into(),
                ));
            }
            None => return Ok(()),
        }

        for (&id, node) in &self.nodes {
            if let super::UiNodeKind::RichText(text) = &node.kind
                && !text.is_valid()
            {
                return Err(UiTreeError::InvalidTree("invalid rich text style".into()));
            }
            self.validate_id(id)?;
            if id != node.id {
                return Err(UiTreeError::InvalidTree(format!(
                    "node key {id} does not match ID {}",
                    node.id
                )));
            }
            if !node.kind.is_panel() && !node.children.is_empty() {
                return Err(UiTreeError::TextCannotHaveChildren);
            }
            let mut unique = HashSet::new();
            for &child in &node.children {
                self.validate_id(child)?;
                if !unique.insert(child) {
                    return Err(UiTreeError::InvalidTree(format!(
                        "node {id} contains child {child} more than once"
                    )));
                }
                let child_node = self
                    .nodes
                    .get(&child)
                    .ok_or(UiTreeError::NodeNotFound(child))?;
                if child_node.parent != Some(id) {
                    return Err(UiTreeError::InvalidTree(format!(
                        "node {child} does not reference parent {id}"
                    )));
                }
            }
            if let Some(parent) = node.parent {
                self.validate_id(parent)?;
                let parent_node = self
                    .nodes
                    .get(&parent)
                    .ok_or(UiTreeError::NodeNotFound(parent))?;
                if !parent_node.children.contains(&id) {
                    return Err(UiTreeError::InvalidTree(format!(
                        "parent {parent} does not contain node {id}"
                    )));
                }
            }
        }

        // Detached subtrees are allowed, but they must also be acyclic.
        let mut visited = HashSet::new();
        for &id in self.nodes.keys() {
            let mut path = HashSet::new();
            let mut current = Some(id);
            while let Some(node_id) = current {
                if visited.contains(&node_id) {
                    break;
                }
                if !path.insert(node_id) {
                    return Err(UiTreeError::CycleDetected(node_id));
                }
                current = self.nodes[&node_id].parent;
            }
            visited.extend(path);
        }
        Ok(())
    }
}
