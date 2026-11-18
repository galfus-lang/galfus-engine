//! Presented-frame interaction behavior for core-owned UI panels.

use super::interaction_realms_tests::{present, setup};
use crate::MultiverseContext;
use crate::interaction::{InteractionButtonState, InteractionPointerEvent, InteractionType};
use galfus_realm_2d::Realm2DContext;
use galfus_realm_2d_resources::ui::{
    Model2DUI, PanelNode, ScrollPanelNode, UiCommand, UiDimension, UiLayoutStyle, UiNodeKind,
};
use galfus_realm_2d_resources::{Camera2D, Transform2D};
use galfus_realm_core::collision::{Collider2D, ColliderShape2D};

#[test]
fn panel_removal_cancels_capture_only_after_the_new_frame_is_presented() {
    let mut realm = Realm2DContext::new(2);
    realm
        .set_camera(1, Camera2D::new(10.0, 0), Transform2D::default())
        .unwrap();
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(10.0),
            height: UiDimension::Exact(10.0),
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_panel(
        2,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(2.0),
            height: UiDimension::Exact(2.0),
            position_offset: Some([4.0, 4.0]),
            ..Default::default()
        },
    )
    .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    galfus_realm_2d::ui_layout::solve_ui_layout(
        &mut ui,
        realm.font_db(),
        realm.default_font_family(),
        10.0,
        10.0,
    );
    realm.create_ui(10, ui, Transform2D::default()).unwrap();
    realm
        .create_collider_2d(Collider2D {
            id: 11,
            model_id: 10,
            shape: ColliderShape2D::Rectangle {
                half_extents: [5.0, 5.0],
            },
            offset: [0.0; 2],
            local_matrix: None,
            active: true,
            sensor: false,
            layer: 1,
            mask: u32::MAX,
        })
        .unwrap();
    let mut mv = MultiverseContext::new();
    mv.register_realm(Box::new(realm)).unwrap();
    let mut mv = setup(mv, 2);
    present(&mut mv, 0).unwrap();
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [50.0, 50.0],
        delta: [0.0; 2],
    });
    let hover = mv.poll_interaction_events();
    assert_eq!(hover[0].element_id, Some(2));
    mv.handle_pointer_event(&InteractionPointerEvent::Button {
        window_id: 7,
        pointer_id: 0,
        position: [50.0, 50.0],
        button: 0,
        state: InteractionButtonState::Pressed,
    });
    mv.poll_interaction_events();
    mv.get_realm_mut::<Realm2DContext>(2)
        .unwrap()
        .apply_ui_commands(10, &[UiCommand::Remove { id: 2 }])
        .unwrap();
    assert!(mv.poll_interaction_events().is_empty());
    present(&mut mv, 1).unwrap();
    let events = mv.poll_interaction_events();
    assert_eq!(
        events
            .iter()
            .map(|event| event.interaction_type)
            .collect::<Vec<_>>(),
        vec![InteractionType::Cancel, InteractionType::Leave]
    );
    assert!(events.iter().all(|event| event.element_id == Some(2)));
}

#[test]
fn wheel_scrolls_core_ui_and_still_emits_the_pointer_event() {
    let mut realm = Realm2DContext::new(2);
    realm
        .set_camera(1, Camera2D::new(10.0, 0), Transform2D::default())
        .unwrap();
    let mut ui = Model2DUI::new();
    ui.create_scroll_panel(
        1,
        ScrollPanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(10.0),
            height: UiDimension::Exact(10.0),
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_panel(
        2,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(10.0),
            height: UiDimension::Exact(20.0),
            ..Default::default()
        },
    )
    .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    galfus_realm_2d::ui_layout::solve_ui_layout(
        &mut ui,
        realm.font_db(),
        realm.default_font_family(),
        10.0,
        10.0,
    );
    realm.create_ui(10, ui, Transform2D::default()).unwrap();
    realm
        .create_collider_2d(Collider2D {
            id: 11,
            model_id: 10,
            shape: ColliderShape2D::Rectangle {
                half_extents: [5.0, 5.0],
            },
            offset: [0.0; 2],
            local_matrix: None,
            active: true,
            sensor: false,
            layer: 1,
            mask: u32::MAX,
        })
        .unwrap();
    let mut mv = MultiverseContext::new();
    mv.register_realm(Box::new(realm)).unwrap();
    let mut mv = setup(mv, 2);
    present(&mut mv, 0).unwrap();
    mv.handle_pointer_event(&InteractionPointerEvent::Scroll {
        window_id: 7,
        pointer_id: 0,
        position: [50.0, 50.0],
        delta: [0.0, -3.0],
    });
    let realm = mv.get_realm_mut::<Realm2DContext>(2).unwrap();
    let UiNodeKind::ScrollPanel(scroll) = &realm.uis[&10].0.nodes[&1].kind else {
        panic!("expected scroll panel")
    };
    assert_eq!(scroll.scroll_offset, [0.0, 3.0]);
    assert!(
        mv.poll_interaction_events()
            .iter()
            .any(|event| event.interaction_type == InteractionType::Scroll
                && event.element_id == Some(2))
    );
}
