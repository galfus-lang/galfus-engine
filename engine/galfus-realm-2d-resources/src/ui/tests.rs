//! Unit tests for Phase 1 & 2 Core UI tree ownership, invalidation, and style expansion.

use super::*;

#[test]
fn ui_commands_are_atomic_and_preserve_unmodified_nodes() {
    let mut ui = Model2DUI::new();
    let layout = UiLayoutStyle::default();
    ui.apply_commands(&[
        UiCommand::Create {
            id: 1,
            kind: UiNodeKind::Panel(PanelNode::default()),
            layout: layout.clone(),
        },
        UiCommand::Create {
            id: 2,
            kind: UiNodeKind::Text(TextNode::default()),
            layout: layout.clone(),
        },
        UiCommand::Insert {
            parent_id: 1,
            child_id: 2,
            index: None,
        },
    ])
    .unwrap();
    assert_eq!(ui.nodes[&1].children, [2]);
    let previous = ui.clone();
    assert!(
        ui.apply_commands(&[
            UiCommand::SetVisible {
                id: 2,
                visible: false
            },
            UiCommand::Remove { id: 999 },
        ])
        .is_err()
    );
    assert_eq!(ui, previous);
    ui.apply_commands(&[UiCommand::SetVisible {
        id: 2,
        visible: false,
    }])
    .unwrap();
    assert!(!ui.nodes[&2].visible);
    assert_eq!(ui.nodes[&1], previous.nodes[&1]);
}

#[test]
fn default_nodes_match_transport_defaults() {
    assert_eq!(
        SpritePanelNode::default(),
        serde_json::from_str("{}").unwrap()
    );
    assert_eq!(
        ScrollPanelNode::default(),
        serde_json::from_str("{}").unwrap()
    );
    assert_eq!(
        UiLayoutStyle::default(),
        serde_json::from_str("{}").unwrap()
    );
}

#[test]
fn panel_deserializes_individual_border_colors() {
    let panel: PanelNode = serde_json::from_str(
        r#"{
      "borderColors": [[1,0,0,1],[0,1,0,1],[0,0,1,1],[1,1,1,1]],
      "borderWidth": [1,2,3,4]
    }"#,
    )
    .unwrap();
    assert_eq!(panel.border_colors.unwrap()[1], [0.0, 1.0, 0.0, 1.0]);
    assert_eq!(panel.border_width, [1.0, 2.0, 3.0, 4.0]);
    let shorthand: PanelNode = serde_json::from_str(
        r#"{
      "borderColors": [[1,0,0,1],[0,1,0,1]],
      "borderWidth": [3,5], "borderRadius": 8
    }"#,
    )
    .unwrap();
    assert_eq!(shorthand.border_width, [3.0, 5.0, 3.0, 5.0]);
    assert_eq!(shorthand.border_radius, [8.0; 4]);
    assert_eq!(
        shorthand.border_colors.unwrap(),
        [
            [1.0, 0.0, 0.0, 1.0],
            [0.0, 1.0, 0.0, 1.0],
            [1.0, 0.0, 0.0, 1.0],
            [0.0, 1.0, 0.0, 1.0]
        ]
    );
    assert!(serde_json::from_str::<PanelNode>(r#"{"borderWidth":[]}"#).is_err());
}

#[test]
fn transport_tree_validation_rejects_invalid_links_and_cycles() {
    let mut ui = Model2DUI::new();
    for id in 1..=3 {
        ui.create_panel(id, PanelNode::default(), UiLayoutStyle::default())
            .unwrap();
    }
    ui.insert_child(1, 2, None).unwrap();
    assert_eq!(ui.validate_tree(), Ok(())); // Detached node 3 is valid.

    let mut invalid = ui.clone();
    invalid.nodes.get_mut(&1).unwrap().children.push(2);
    assert!(invalid.validate_tree().is_err());

    let mut invalid = ui.clone();
    invalid.nodes.get_mut(&2).unwrap().parent = None;
    assert!(invalid.validate_tree().is_err());

    let mut invalid = ui.clone();
    invalid.nodes.get_mut(&2).unwrap().id = 42;
    assert!(invalid.validate_tree().is_err());

    let mut invalid = ui.clone();
    invalid.remove_child(1, 2).unwrap();
    invalid.nodes.get_mut(&2).unwrap().parent = Some(3);
    invalid.nodes.get_mut(&2).unwrap().children.push(3);
    invalid.nodes.get_mut(&3).unwrap().parent = Some(2);
    invalid.nodes.get_mut(&3).unwrap().children.push(2);
    assert!(matches!(
        invalid.validate_tree(),
        Err(UiTreeError::CycleDetected(_))
    ));
}

#[test]
fn root_must_remain_a_parentless_panel() {
    let mut ui = Model2DUI::new();
    ui.create_panel(1, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_panel(2, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_text(3, TextNode::default(), UiLayoutStyle::default())
        .unwrap();
    assert!(ui.insert_child(2, 1, None).is_err());
    assert!(ui.set_root(3).is_err());
    ui.insert_child(1, 2, None).unwrap();
    assert!(ui.set_root(2).is_err());
    assert_eq!(ui.validate_tree(), Ok(()));
}
use galfus_core::id::RESERVED_RANGE_START;

#[test]
fn test_node_creation_and_reserved_ids() {
    let mut ui = Model2DUI::new();

    // Valid node creation
    assert!(
        ui.create_panel(1, PanelNode::default(), UiLayoutStyle::default())
            .is_ok()
    );
    assert_eq!(ui.root_id, Some(1));

    // Duplicate node rejected
    assert_eq!(
        ui.create_panel(1, PanelNode::default(), UiLayoutStyle::default()),
        Err(UiTreeError::DuplicateNode(1))
    );

    // Reserved ID rejected
    assert_eq!(
        ui.create_panel(
            RESERVED_RANGE_START,
            PanelNode::default(),
            UiLayoutStyle::default()
        ),
        Err(UiTreeError::ReservedId(RESERVED_RANGE_START))
    );
}

#[test]
fn test_tree_hierarchy_and_cycle_prevention() {
    let mut ui = Model2DUI::new();
    ui.create_panel(1, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_panel(2, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_panel(3, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();

    // Insert 2 into 1, 3 into 2
    assert!(ui.insert_child(1, 2, None).is_ok());
    assert!(ui.insert_child(2, 3, None).is_ok());

    assert_eq!(ui.nodes[&1].children, vec![2]);
    assert_eq!(ui.nodes[&2].children, vec![3]);
    assert_eq!(ui.nodes[&2].parent, Some(1));
    assert_eq!(ui.nodes[&3].parent, Some(2));

    // Direct self-cycle: 1 into 1
    assert_eq!(
        ui.insert_child(1, 1, None),
        Err(UiTreeError::CycleDetected(1))
    );

    // Indirect cycle: 1 into 3 (since 3 is descendant of 1)
    assert_eq!(
        ui.insert_child(3, 1, None),
        Err(UiTreeError::CycleDetected(1))
    );
}

#[test]
fn test_text_cannot_have_children() {
    let mut ui = Model2DUI::new();
    ui.create_text(10, TextNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_panel(20, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();

    assert_eq!(
        ui.insert_child(10, 20, None),
        Err(UiTreeError::TextCannotHaveChildren)
    );
}

#[test]
fn test_reparent_and_reorder() {
    let mut ui = Model2DUI::new();
    ui.create_panel(1, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_panel(2, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_panel(3, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_panel(4, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();

    ui.insert_child(1, 2, None).unwrap();
    ui.insert_child(1, 3, None).unwrap();
    ui.insert_child(1, 4, None).unwrap();
    assert_eq!(ui.nodes[&1].children, vec![2, 3, 4]);

    // Moving an existing child past the end clamps after removing it.
    ui.insert_child(1, 2, Some(usize::MAX)).unwrap();
    assert_eq!(ui.nodes[&1].children, vec![3, 4, 2]);
    ui.insert_child(1, 2, Some(0)).unwrap();

    // Reorder 4 to front
    ui.reorder_child(1, 4, 0).unwrap();
    assert_eq!(ui.nodes[&1].children, vec![4, 2, 3]);

    // Reparent 4 from 1 to 2
    ui.insert_child(2, 4, None).unwrap();
    assert_eq!(ui.nodes[&1].children, vec![2, 3]);
    assert_eq!(ui.nodes[&2].children, vec![4]);
    assert_eq!(ui.nodes[&4].parent, Some(2));
}

#[test]
fn test_recursive_destroy() {
    let mut ui = Model2DUI::new();
    ui.create_panel(1, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_panel(2, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_panel(3, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_panel(4, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();

    ui.insert_child(1, 2, None).unwrap();
    ui.insert_child(2, 3, None).unwrap();
    ui.insert_child(1, 4, None).unwrap();

    // Destroy node 2: should destroy 2 and 3, leave 1 and 4
    let destroyed = ui.destroy_node(2).unwrap();
    assert!(destroyed.contains(&2));
    assert!(destroyed.contains(&3));
    assert!(!destroyed.contains(&1));
    assert!(!destroyed.contains(&4));

    assert_eq!(ui.nodes[&1].children, vec![4]);
    assert!(!ui.nodes.contains_key(&2));
    assert!(!ui.nodes.contains_key(&3));
}

#[test]
fn test_css_shorthand_normalization() {
    // 1 value -> all 4 sides equal
    assert_eq!(normalize_border_widths(&[5.0]), [5.0, 5.0, 5.0, 5.0]);
    // 2 values -> [v, h, v, h]
    assert_eq!(
        normalize_border_widths(&[10.0, 20.0]),
        [10.0, 20.0, 10.0, 20.0]
    );
    // 4 values -> [top, right, bottom, left]
    assert_eq!(
        normalize_border_widths(&[1.0, 2.0, 3.0, 4.0]),
        [1.0, 2.0, 3.0, 4.0]
    );

    // Corner radius
    assert_eq!(normalize_corner_radii(&[8.0]), [8.0, 8.0, 8.0, 8.0]);
    assert_eq!(normalize_corner_radii(&[4.0, 12.0]), [4.0, 12.0, 4.0, 12.0]);
    assert_eq!(
        normalize_corner_radii(&[1.0, 2.0, 3.0, 4.0]),
        [1.0, 2.0, 3.0, 4.0]
    );
}

#[test]
fn test_dirty_flag_bubbling() {
    let mut ui = Model2DUI::new();
    ui.create_panel(1, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_panel(2, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_panel(3, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    ui.insert_child(2, 3, None).unwrap();

    // Clear flags
    ui.dirty_flags.clear();

    // Mark 3 with PAINT only -> does not bubble layout to ancestors
    ui.mark_dirty(3, UiDirtyFlags::PAINT);
    assert!(ui.dirty_flags[&3].contains(UiDirtyFlags::PAINT));
    assert!(!ui.dirty_flags.contains_key(&2));
    assert!(!ui.dirty_flags.contains_key(&1));

    // Mark 3 with LAYOUT -> bubbles LAYOUT to 2 and 1
    ui.mark_dirty(3, UiDirtyFlags::LAYOUT);
    assert!(ui.dirty_flags[&2].contains(UiDirtyFlags::LAYOUT));
    assert!(ui.dirty_flags[&1].contains(UiDirtyFlags::LAYOUT));
}
