//! Wheel scrolling for core-owned UI trees.

use galfus_realm_2d_resources::ui::{Model2DUI, UiDirtyFlags, UiNodeKind};

/// Apply remaining wheel movement to each scrollable ancestor, nearest first.
pub(crate) fn scroll_element(ui: &mut Model2DUI, element: u32, delta: [f32; 2]) -> bool {
    if !delta.iter().all(|value| value.is_finite()) {
        return false;
    }
    let mut remaining = [-delta[0], -delta[1]];
    let mut current = Some(element);
    let mut changed = false;
    while let Some(id) = current {
        let Some(node) = ui.nodes.get_mut(&id) else {
            break;
        };
        current = node.parent;
        if let (UiNodeKind::ScrollPanel(scroll), Some(layout)) =
            (&mut node.kind, ui.computed.get(&id))
        {
            let pad = node.layout.padding;
            let viewport = [
                (layout.absolute_rect[2] - pad[1] - pad[3]).max(0.0),
                (layout.absolute_rect[3] - pad[0] - pad[2]).max(0.0),
            ];
            let enabled = [scroll.scroll_x_enabled, scroll.scroll_y_enabled];
            let mut node_changed = false;
            for axis in 0..2 {
                if enabled[axis] {
                    let old = scroll.scroll_offset[axis];
                    let max = (scroll.content_size[axis] - viewport[axis]).max(0.0);
                    let new = (old + remaining[axis]).clamp(0.0, max);
                    scroll.scroll_offset[axis] = new;
                    remaining[axis] -= new - old;
                    node_changed |= new != old;
                }
            }
            if node_changed {
                ui.mark_dirty(id, UiDirtyFlags::CLIP_TRANSFORM);
                changed = true;
            }
        }
        if remaining == [0.0, 0.0] {
            break;
        }
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;
    use galfus_realm_2d_resources::ui::{
        PanelNode, ScrollPanelNode, UiComputedLayout, UiLayoutStyle,
    };

    #[test]
    fn scroll_clamps_and_passes_unused_delta_to_ancestor() {
        let mut ui = Model2DUI::new();
        let outer = ScrollPanelNode {
            content_size: [10.0, 30.0],
            ..Default::default()
        };
        let inner = ScrollPanelNode {
            content_size: [10.0, 13.0],
            ..Default::default()
        };
        ui.create_scroll_panel(1, outer, UiLayoutStyle::default())
            .unwrap();
        ui.create_scroll_panel(2, inner, UiLayoutStyle::default())
            .unwrap();
        ui.create_panel(3, PanelNode::default(), UiLayoutStyle::default())
            .unwrap();
        ui.insert_child(1, 2, None).unwrap();
        ui.insert_child(2, 3, None).unwrap();
        for id in [1, 2] {
            ui.computed.insert(
                id,
                UiComputedLayout {
                    absolute_rect: [0.0, 0.0, 10.0, 10.0],
                    ..Default::default()
                },
            );
        }
        assert!(scroll_element(&mut ui, 3, [0.0, -8.0]));
        let offset = |id| match &ui.nodes[&id].kind {
            UiNodeKind::ScrollPanel(s) => s.scroll_offset[1],
            _ => unreachable!(),
        };
        assert_eq!(offset(2), 3.0);
        assert_eq!(offset(1), 5.0);
        assert!(!scroll_element(&mut ui, 3, [0.0, f32::NAN]));
    }
}
