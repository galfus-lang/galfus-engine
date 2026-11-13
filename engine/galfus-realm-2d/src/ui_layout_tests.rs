//! Layout alignment and distribution tests.

use crate::ui_layout::solve_ui_layout;
use galfus_realm_2d_resources::ui::{
    Model2DUI, PanelNode, ScrollPanelNode, UiAlign, UiDimension, UiGridTrack, UiJustify,
    UiLayoutDirection, UiLayoutStyle,
};

fn create_test_font_db() -> (fontdb::Database, String) {
    let mut db = fontdb::Database::new();
    db.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
    let family = db
        .faces()
        .next()
        .and_then(|face| face.families.first().cloned())
        .map(|(family, _)| family)
        .unwrap_or_else(|| "sans-serif".to_string());
    (db, family)
}

#[test]
fn linear_alignment_positions_subtrees_without_repeat_damage() {
    let (fonts, family) = create_test_font_db();
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode {
            clip: true,
            ..Default::default()
        },
        UiLayoutStyle {
            width: UiDimension::Exact(200.0),
            height: UiDimension::Exact(100.0),
            direction: UiLayoutDirection::Row,
            gap: [10.0, 0.0],
            justify_content: UiJustify::SpaceBetween,
            align_items: UiAlign::Center,
            ..Default::default()
        },
    )
    .unwrap();
    for id in 2..=3 {
        ui.create_panel(
            id,
            PanelNode::default(),
            UiLayoutStyle {
                width: UiDimension::Exact(50.0),
                height: UiDimension::Exact(20.0),
                ..Default::default()
            },
        )
        .unwrap();
        ui.insert_child(1, id, None).unwrap();
    }
    ui.create_panel(
        4,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(10.0),
            height: UiDimension::Exact(10.0),
            ..Default::default()
        },
    )
    .unwrap();
    ui.insert_child(3, 4, None).unwrap();
    solve_ui_layout(&mut ui, &fonts, &family, 200.0, 100.0);
    assert_eq!(ui.computed[&2].absolute_rect, [0.0, 40.0, 50.0, 20.0]);
    assert_eq!(ui.computed[&3].absolute_rect, [150.0, 40.0, 50.0, 20.0]);
    assert_eq!(ui.computed[&4].absolute_rect, [150.0, 40.0, 10.0, 10.0]);
    assert_eq!(ui.computed[&4].clip_rect, Some([0.0, 0.0, 200.0, 100.0]));
    ui.damage_regions.clear();
    solve_ui_layout(&mut ui, &fonts, &family, 200.0, 100.0);
    assert!(ui.damage_regions.is_empty());
}

#[test]
fn vertical_flow_centers_distribution_and_aligns_to_end() {
    let (fonts, family) = create_test_font_db();
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(100.0),
            height: UiDimension::Exact(100.0),
            direction: UiLayoutDirection::Column,
            justify_content: UiJustify::Center,
            align_items: UiAlign::End,
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_panel(
        2,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(20.0),
            height: UiDimension::Exact(40.0),
            ..Default::default()
        },
    )
    .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    solve_ui_layout(&mut ui, &fonts, &family, 100.0, 100.0);
    assert_eq!(ui.computed[&2].absolute_rect, [80.0, 30.0, 20.0, 40.0]);
}

#[test]
fn flex_grow_redistributes_space_after_maximum_and_reflows_descendants() {
    let (fonts, family) = create_test_font_db();
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(200.0),
            height: UiDimension::Exact(100.0),
            direction: UiLayoutDirection::Row,
            gap: [10.0, 0.0],
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_panel(
        2,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(40.0),
            height: UiDimension::Exact(30.0),
            max_width: Some(60.0),
            flex_grow: 1.0,
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_panel(
        3,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(40.0),
            height: UiDimension::Exact(30.0),
            flex_grow: 2.0,
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_panel(
        4,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Percent(50.0),
            height: UiDimension::Exact(10.0),
            ..Default::default()
        },
    )
    .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    ui.insert_child(1, 3, None).unwrap();
    ui.insert_child(2, 4, None).unwrap();
    solve_ui_layout(&mut ui, &fonts, &family, 200.0, 100.0);
    assert_eq!(ui.computed[&2].absolute_rect, [0.0, 0.0, 60.0, 30.0]);
    assert!((ui.computed[&3].absolute_rect[2] - 130.0).abs() < 0.001);
    assert_eq!(ui.computed[&3].absolute_rect[0], 70.0);
    assert_eq!(ui.computed[&4].absolute_rect[2], 30.0);
    ui.damage_regions.clear();
    solve_ui_layout(&mut ui, &fonts, &family, 200.0, 100.0);
    assert!(ui.damage_regions.is_empty());
}

#[test]
fn flex_grow_in_column_preserves_fixed_children() {
    let (fonts, family) = create_test_font_db();
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(100.0),
            height: UiDimension::Exact(100.0),
            gap: [0.0, 10.0],
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_panel(
        2,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(20.0),
            height: UiDimension::Exact(20.0),
            flex_grow: 1.0,
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_panel(
        3,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(20.0),
            height: UiDimension::Exact(20.0),
            ..Default::default()
        },
    )
    .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    ui.insert_child(1, 3, None).unwrap();
    solve_ui_layout(&mut ui, &fonts, &family, 100.0, 100.0);
    assert_eq!(ui.computed[&2].absolute_rect, [0.0, 0.0, 20.0, 70.0]);
    assert_eq!(ui.computed[&3].absolute_rect, [0.0, 80.0, 20.0, 20.0]);
}

#[test]
fn detaching_subtree_records_previous_bounds_and_discards_layout() {
    let (fonts, family) = create_test_font_db();
    let mut ui = Model2DUI::new();
    for id in 1..=3 {
        ui.create_panel(
            id,
            PanelNode::default(),
            UiLayoutStyle {
                width: UiDimension::Exact(20.0),
                height: UiDimension::Exact(20.0),
                ..Default::default()
            },
        )
        .unwrap();
    }
    ui.insert_child(1, 2, None).unwrap();
    ui.insert_child(2, 3, None).unwrap();
    solve_ui_layout(&mut ui, &fonts, &family, 100.0, 100.0);
    ui.damage_regions.clear();
    ui.remove_child(1, 2).unwrap();
    assert!(!ui.computed.contains_key(&2));
    assert!(!ui.computed.contains_key(&3));
    assert_eq!(ui.damage_regions.len(), 2);
}

#[test]
fn flex_shrink_respects_minimum_and_redistributes_deficit() {
    let (fonts, family) = create_test_font_db();
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(100.0),
            height: UiDimension::Exact(40.0),
            direction: UiLayoutDirection::Row,
            ..Default::default()
        },
    )
    .unwrap();
    for id in 2..=3 {
        ui.create_panel(
            id,
            PanelNode::default(),
            UiLayoutStyle {
                width: UiDimension::Exact(80.0),
                height: UiDimension::Exact(20.0),
                min_width: if id == 2 { Some(60.0) } else { None },
                ..Default::default()
            },
        )
        .unwrap();
        ui.insert_child(1, id, None).unwrap();
    }
    solve_ui_layout(&mut ui, &fonts, &family, 100.0, 40.0);
    assert_eq!(ui.computed[&2].absolute_rect, [0.0, 0.0, 60.0, 20.0]);
    assert_eq!(ui.computed[&3].absolute_rect, [60.0, 0.0, 40.0, 20.0]);
}

#[test]
fn scroll_axis_keeps_overflow_instead_of_shrinking_items() {
    let (fonts, family) = create_test_font_db();
    let mut ui = Model2DUI::new();
    ui.create_scroll_panel(
        1,
        ScrollPanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(100.0),
            height: UiDimension::Exact(100.0),
            ..Default::default()
        },
    )
    .unwrap();
    for id in 2..=3 {
        ui.create_panel(
            id,
            PanelNode::default(),
            UiLayoutStyle {
                width: UiDimension::Exact(20.0),
                height: UiDimension::Exact(80.0),
                ..Default::default()
            },
        )
        .unwrap();
        ui.insert_child(1, id, None).unwrap();
    }
    solve_ui_layout(&mut ui, &fonts, &family, 100.0, 100.0);
    assert_eq!(ui.computed[&2].absolute_rect[3], 80.0);
    assert_eq!(ui.computed[&3].absolute_rect, [0.0, 80.0, 20.0, 80.0]);
    assert_eq!(ui.computed[&1].content_size[1], 160.0);
}

#[test]
fn stretch_expands_automatic_cross_axis_without_overriding_fixed_size() {
    let (fonts, family) = create_test_font_db();
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(100.0),
            height: UiDimension::Exact(80.0),
            direction: UiLayoutDirection::Row,
            align_items: UiAlign::Stretch,
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_panel(
        2,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(30.0),
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_panel(
        3,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(30.0),
            height: UiDimension::Exact(20.0),
            ..Default::default()
        },
    )
    .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    ui.insert_child(1, 3, None).unwrap();
    solve_ui_layout(&mut ui, &fonts, &family, 100.0, 80.0);
    assert_eq!(ui.computed[&2].absolute_rect[3], 80.0);
    assert_eq!(ui.computed[&3].absolute_rect[3], 20.0);
}

#[test]
fn grid_distributes_fractional_columns_and_fixed_rows() {
    let (fonts, family) = create_test_font_db();
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(320.0),
            height: UiDimension::Exact(200.0),
            padding: [10.0; 4],
            gap: [10.0; 2],
            grid_columns: vec![UiGridTrack::Fraction(1.0); 3],
            grid_row_height: Some(58.0),
            ..Default::default()
        },
    )
    .unwrap();
    for id in 2..=5 {
        ui.create_panel(id, PanelNode::default(), UiLayoutStyle::default())
            .unwrap();
        ui.insert_child(1, id, None).unwrap();
    }
    solve_ui_layout(&mut ui, &fonts, &family, 320.0, 200.0);
    let width = 280.0 / 3.0;
    assert!((ui.computed[&2].absolute_rect[2] - width).abs() < 0.001);
    assert_eq!(ui.computed[&2].absolute_rect[3], 58.0);
    assert!((ui.computed[&3].absolute_rect[0] - (20.0 + width)).abs() < 0.001);
    assert_eq!(ui.computed[&5].absolute_rect[1], 78.0);
    ui.damage_regions.clear();
    solve_ui_layout(&mut ui, &fonts, &family, 320.0, 200.0);
    assert!(ui.damage_regions.is_empty());
}
