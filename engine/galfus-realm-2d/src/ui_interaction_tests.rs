//! Interaction snapshots preserve the UI geometry of the presented frame.

use crate::context::Realm2DContext;
use crate::ui_layout::solve_ui_layout;
use galfus_realm_2d_resources::Transform2D;
use galfus_realm_2d_resources::ui::{Model2DUI, PanelNode, UiDimension, UiLayoutStyle};
use galfus_realm_core::Realm;
use galfus_realm_core::collision::{Collider2D, ColliderShape2D};
use glam::{Affine2, Vec2};

#[test]
fn snapshot_picks_presented_panel_in_model_space_with_transformed_colliders() {
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(100.0),
            height: UiDimension::Exact(100.0),
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_panel(
        2,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(30.0),
            height: UiDimension::Exact(50.0),
            position_offset: Some([60.0, 0.0]),
            ..Default::default()
        },
    )
    .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    solve_ui_layout(
        &mut ui,
        &fontdb::Database::new(),
        "sans-serif",
        100.0,
        100.0,
    );
    let mut realm = Realm2DContext::new(1);
    realm.create_ui(10, ui, Transform2D::default()).unwrap();
    realm
        .create_collider_2d(Collider2D {
            id: 20,
            model_id: 10,
            shape: ColliderShape2D::Rectangle {
                half_extents: [30.0, 30.0],
            },
            offset: [0.0; 2],
            local_matrix: Some(Affine2::from_translation(Vec2::new(25.0, 0.0)).to_cols_array()),
            active: true,
            sensor: false,
            layer: 1,
            mask: u32::MAX,
        })
        .unwrap();
    let snapshot = realm.snapshot_interaction().unwrap();
    let frozen = snapshot.as_any().downcast_ref::<Realm2DContext>().unwrap();
    let point = Vec2::new(25.0, 25.0);
    assert_eq!(
        frozen.query_point_2d(point, u32::MAX)[0].element_id,
        Some(2)
    );
    assert!(frozen.has_interactive_element(10, 2));
    realm
        .uis
        .get_mut(&10)
        .unwrap()
        .0
        .nodes
        .get_mut(&2)
        .unwrap()
        .visible = false;
    assert_eq!(realm.query_point_2d(point, u32::MAX)[0].element_id, Some(1));
    assert!(!realm.has_interactive_element(10, 2));
    assert!(frozen.has_interactive_element(10, 2));
    assert_eq!(
        frozen.query_point_2d(point, u32::MAX)[0].element_id,
        Some(2)
    );
}
