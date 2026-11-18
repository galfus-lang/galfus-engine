use crate::interaction::{InteractionButtonState, InteractionPointerEvent, InteractionType};
use crate::interaction_realms_tests::{present, setup};
use crate::{
    InvocationDesc, MultiverseContext, TargetDesc, TargetTextureBinding, UiInteractionSurface,
    ViewportRect,
};
use galfus_realm_2d::Realm2DContext;
use galfus_realm_2d_resources::ui::{
    Model2DUI, PanelNode, SpritePanelNode, UiCommand, UiDimension, UiLayoutStyle,
};
use galfus_realm_2d_resources::{Camera2D, Transform2D};
use galfus_realm_core::collision::{Collider2D, ColliderShape2D};

fn collider(id: u32, model_id: u32, half: [f32; 2]) -> Collider2D {
    Collider2D {
        id,
        model_id,
        shape: ColliderShape2D::Rectangle { half_extents: half },
        offset: [0.0; 2],
        local_matrix: None,
        active: true,
        sensor: false,
        layer: 1,
        mask: u32::MAX,
    }
}

#[test]
fn multiple_ui_panels_route_to_their_targets_and_restore_panel_hits() {
    let mut outer = Realm2DContext::new(2);
    outer
        .set_camera(1, Camera2D::new(10.0, 0), Transform2D::default())
        .unwrap();
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(10.0),
            height: UiDimension::Exact(10.0),
            is_stack: true,
            ..Default::default()
        },
    )
    .unwrap();
    for (element, target, x) in [(2, 2, 0.0), (3, 3, 5.0)] {
        ui.create_sprite_panel(
            element,
            SpritePanelNode {
                texture_id: Some(target),
                ..Default::default()
            },
            UiLayoutStyle {
                width: UiDimension::Exact(5.0),
                height: UiDimension::Exact(10.0),
                position_offset: Some([x, 0.0]),
                ..Default::default()
            },
        )
        .unwrap();
        ui.insert_child(1, element, None).unwrap();
    }
    galfus_realm_2d::ui_layout::solve_ui_layout(
        &mut ui,
        outer.font_db(),
        outer.default_font_family(),
        10.0,
        10.0,
    );
    outer.create_ui(10, ui, Transform2D::default()).unwrap();
    outer
        .create_collider_2d(collider(11, 10, [5.0, 5.0]))
        .unwrap();
    let mut mv = MultiverseContext::new();
    mv.register_realm(Box::new(outer)).unwrap();
    for realm_id in [3, 4] {
        let mut inner = Realm2DContext::new(realm_id);
        inner
            .set_camera(1, Camera2D::new(10.0, 0), Transform2D::default())
            .unwrap();
        inner
            .set_model_transform_2d(20, Transform2D::default())
            .unwrap();
        inner
            .create_collider_2d(collider(21, 20, [1.0, 1.0]))
            .unwrap();
        mv.register_realm(Box::new(inner)).unwrap();
    }
    let mut mv = setup(mv, 2);
    for (target, realm, element, slot) in [(2, 3, 2, "left"), (3, 4, 3, "right")] {
        mv.create_target(target, TargetDesc::texture(100, 100))
            .unwrap();
        mv.create_invocation(
            target,
            InvocationDesc {
                realm_id: realm,
                target_id: target,
                camera_slot: None,
                viewport: ViewportRect::full(),
                filters: vec![],
                z_index: 0,
                enabled: true,
                clear_color: None,
                anti_aliasing: None,
            },
        )
        .unwrap();
        mv.bind_target_texture(TargetTextureBinding {
            source_target_id: target,
            realm_id: 2,
            slot: slot.into(),
        })
        .unwrap();
        mv.connect_ui_interaction_surface(UiInteractionSurface {
            realm_id: 2,
            model_id: 10,
            collider_id: 11,
            element_id: element,
            slot: slot.into(),
        })
        .unwrap();
    }
    present(&mut mv, 0).unwrap();
    let send = |mv: &mut MultiverseContext, x| {
        mv.handle_pointer_event(&InteractionPointerEvent::Move {
            window_id: 7,
            pointer_id: 0,
            position: [x, 50.0],
            delta: [0.0; 2],
        });
        mv.poll_interaction_events()
    };
    assert!(
        send(&mut mv, 25.0)
            .iter()
            .any(|e| e.interaction_type == InteractionType::Hover && e.realm_id == 3)
    );
    assert!(
        send(&mut mv, 75.0)
            .iter()
            .any(|e| e.interaction_type == InteractionType::Hover && e.realm_id == 4)
    );
    mv.handle_pointer_event(&InteractionPointerEvent::Button {
        window_id: 7,
        pointer_id: 0,
        position: [75.0, 50.0],
        button: 0,
        state: InteractionButtonState::Pressed,
    });
    mv.poll_interaction_events();
    assert!(
        send(&mut mv, 25.0)
            .iter()
            .any(|e| e.interaction_type == InteractionType::PressMove && e.realm_id == 4)
    );
    mv.handle_pointer_event(&InteractionPointerEvent::Button {
        window_id: 7,
        pointer_id: 0,
        position: [25.0, 50.0],
        button: 0,
        state: InteractionButtonState::Released,
    });
    assert!(
        mv.poll_interaction_events()
            .iter()
            .any(|e| e.interaction_type == InteractionType::PressUp && e.realm_id == 4)
    );
    send(&mut mv, 75.0);
    mv.get_realm_mut::<Realm2DContext>(2)
        .unwrap()
        .apply_ui_commands(
            10,
            &[UiCommand::SetSpriteUvRect {
                id: 3,
                uv_rect: [0.0, 0.0, 0.5, 1.0],
            }],
        )
        .unwrap();
    present(&mut mv, 1).unwrap();
    assert!(
        send(&mut mv, 75.0)
            .iter()
            .any(|e| e.interaction_type == InteractionType::Hover
                && e.realm_id == 2
                && e.element_id == Some(3))
    );
    mv.get_realm_mut::<Realm2DContext>(2)
        .unwrap()
        .apply_ui_commands(
            10,
            &[UiCommand::SetSpriteUvRect {
                id: 3,
                uv_rect: [0.0, 0.0, 1.0, 1.0],
            }],
        )
        .unwrap();
    present(&mut mv, 2).unwrap();
    assert!(
        send(&mut mv, 75.0)
            .iter()
            .any(|e| e.interaction_type == InteractionType::Hover && e.realm_id == 4)
    );
    mv.disconnect_ui_interaction_surface(2, 10, 2).unwrap();
    present(&mut mv, 3).unwrap();
    assert!(
        send(&mut mv, 25.0)
            .iter()
            .any(|e| e.interaction_type == InteractionType::Hover
                && e.realm_id == 2
                && e.element_id == Some(2))
    );
    mv.get_realm_mut::<Realm2DContext>(2)
        .unwrap()
        .apply_ui_commands(10, &[UiCommand::Remove { id: 3 }])
        .unwrap();
    present(&mut mv, 4).unwrap();
    assert!(
        send(&mut mv, 75.0)
            .iter()
            .any(|e| e.interaction_type == InteractionType::Hover
                && e.realm_id == 2
                && e.element_id == Some(1))
    );
}
