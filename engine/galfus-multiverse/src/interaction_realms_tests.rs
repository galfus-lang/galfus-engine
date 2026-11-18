use crate::interaction::{InteractionButtonState, InteractionPointerEvent, InteractionType};
use crate::{InvocationDesc, MultiverseContext, TargetDesc, TargetKind, ViewportRect};
use galfus_realm_core::collision::{Collider2D, Collider3D, ColliderShape2D, ColliderShape3D};
use glam::{UVec2, Vec2, Vec3};

pub(super) fn setup(mut mv: MultiverseContext, realm_id: u32) -> MultiverseContext {
    mv.create_target(
        1,
        TargetDesc {
            kind: TargetKind::Window { window_id: 7 },
            size: Some(UVec2::splat(100)),
        },
    )
    .unwrap();
    mv.update_window_size(7, UVec2::splat(100));
    mv.create_invocation(
        1,
        InvocationDesc {
            realm_id,
            target_id: 1,
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
    mv
}

#[test]
fn pointer_uses_real_2d_camera_and_cancels_removed_spatial_collider() {
    use galfus_realm_2d::Realm2DContext;
    use galfus_realm_2d_resources::{Camera2D, Transform2D};
    let mut realm = Realm2DContext::new(2);
    realm
        .set_camera(
            1,
            Camera2D::new(10.0, 0),
            Transform2D::from_translation(Vec2::new(5., 3.)),
        )
        .unwrap();
    realm
        .set_model_transform_2d(10, Transform2D::from_translation(Vec2::new(7.5, 3.)))
        .unwrap();
    realm
        .create_collider_2d(Collider2D {
            id: 11,
            model_id: 10,
            shape: ColliderShape2D::Circle { radius: 0.5 },
            offset: [0.; 2],
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
        position: [75., 50.],
        delta: [0.; 2],
    });
    assert_eq!(
        mv.poll_interaction_events()[0].interaction_type,
        InteractionType::Hover
    );
    mv.handle_pointer_event(&InteractionPointerEvent::Button {
        window_id: 7,
        pointer_id: 0,
        position: [75., 50.],
        button: 0,
        state: InteractionButtonState::Pressed,
    });
    mv.poll_interaction_events();
    mv.handle_pointer_event(&InteractionPointerEvent::Cancel {
        window_id: 7,
        pointer_id: 0,
    });
    assert_eq!(
        mv.poll_interaction_events()
            .iter()
            .map(|e| e.interaction_type)
            .collect::<Vec<_>>(),
        vec![InteractionType::Cancel, InteractionType::Leave]
    );
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [75., 50.],
        delta: [0.; 2],
    });
    mv.handle_pointer_event(&InteractionPointerEvent::Button {
        window_id: 7,
        pointer_id: 0,
        position: [75., 50.],
        button: 0,
        state: InteractionButtonState::Pressed,
    });
    mv.poll_interaction_events();
    mv.get_realm_mut::<Realm2DContext>(2)
        .unwrap()
        .destroy_spatial_model_2d(10)
        .unwrap();
    assert!(mv.poll_interaction_events().is_empty());
    present(&mut mv, 1).unwrap();
    let events = mv.poll_interaction_events();
    assert_eq!(
        events
            .iter()
            .map(|e| e.interaction_type)
            .collect::<Vec<_>>(),
        vec![InteractionType::Cancel, InteractionType::Leave]
    );
}

#[test]
fn pointer_uses_real_perspective_camera_and_its_clip_range() {
    use galfus_realm_3d::Realm3DContext;
    use galfus_realm_3d_resources::{camera::Camera3D, transform::Transform3D};
    let mut realm = Realm3DContext::new(3);
    realm
        .create_camera(
            1,
            Camera3D::perspective(60., 1., 10., 0),
            Transform3D::default(),
        )
        .unwrap();
    for (id, z) in [(10, -5.), (20, -12.)] {
        realm
            .set_spatial_model_transform_3d(id, Transform3D::from_position(Vec3::new(0., 0., z)))
            .unwrap();
        realm
            .create_collider_3d(Collider3D {
                id,
                model_id: id,
                shape: ColliderShape3D::Sphere { radius: 0.5 },
                offset: [0.; 3],
                local_matrix: None,
                active: true,
                sensor: false,
                layer: 1,
                mask: u32::MAX,
            })
            .unwrap();
    }
    let mut mv = MultiverseContext::new();
    mv.register_realm(Box::new(realm)).unwrap();
    let mut mv = setup(mv, 3);
    present(&mut mv, 0).unwrap();
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [50., 50.],
        delta: [0.; 2],
    });
    let events = mv.poll_interaction_events();
    assert_eq!(events[0].model_id, 10);
    match events[0].geometry.unwrap() {
        galfus_core::interaction::InteractionGeometry::ThreeD {
            point,
            normal,
            distance,
        } => {
            assert!((point[2] + 4.5).abs() < 1e-4);
            assert!((normal[2] - 1.0).abs() < 1e-4);
            assert!((distance - 3.5).abs() < 1e-4);
        }
        _ => panic!("expected a 3D interaction hit"),
    }
    mv.get_realm_mut::<Realm3DContext>(3)
        .unwrap()
        .set_spatial_model_transform_3d(10, Transform3D::from_position(Vec3::new(2.0, 0.0, -5.0)))
        .unwrap();
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [50.0, 50.0],
        delta: [0.0; 2],
    });
    assert_eq!(
        mv.poll_interaction_events()[0].interaction_type,
        InteractionType::Move
    );
    present(&mut mv, 1).unwrap();
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [50.0, 50.0],
        delta: [0.0; 2],
    });
    assert_eq!(
        mv.poll_interaction_events()[0].interaction_type,
        InteractionType::Leave
    );
    mv.get_realm_mut::<Realm3DContext>(3)
        .unwrap()
        .destroy_spatial_model_3d(10)
        .unwrap();
    present(&mut mv, 2).unwrap();
    mv.poll_interaction_events();
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [50., 50.],
        delta: [0.; 2],
    });
    assert!(mv.poll_interaction_events().is_empty());
}

#[test]
fn pointer_crosses_a_collider_surface_into_a_3d_realm() {
    use crate::{InteractionSurface, TargetTextureBinding};
    use galfus_realm_2d::Realm2DContext;
    use galfus_realm_2d_resources::{Camera2D, Transform2D};
    use galfus_realm_3d::Realm3DContext;
    use galfus_realm_3d_resources::{camera::Camera3D, transform::Transform3D};

    let mut outer = Realm2DContext::new(2);
    outer
        .set_camera(1, Camera2D::new(10.0, 0), Transform2D::default())
        .unwrap();
    outer
        .set_model_transform_2d(10, Transform2D::default())
        .unwrap();
    outer
        .create_collider_2d(Collider2D {
            id: 11,
            model_id: 10,
            shape: ColliderShape2D::Rectangle {
                half_extents: [2.0, 2.0],
            },
            offset: [0.0; 2],
            local_matrix: None,
            active: true,
            sensor: false,
            layer: 1,
            mask: u32::MAX,
        })
        .unwrap();
    outer
        .create_collider_2d(Collider2D {
            id: 12,
            model_id: 10,
            shape: ColliderShape2D::Circle { radius: 0.5 },
            offset: [3.0, 0.0],
            local_matrix: None,
            active: true,
            sensor: false,
            layer: 1,
            mask: u32::MAX,
        })
        .unwrap();

    let mut inner = Realm3DContext::new(3);
    inner
        .create_camera(
            1,
            Camera3D::perspective(60.0, 1.0, 10.0, 0),
            Transform3D::default(),
        )
        .unwrap();
    inner
        .set_spatial_model_transform_3d(20, Transform3D::from_position(Vec3::new(0.0, 0.0, -5.0)))
        .unwrap();
    inner
        .create_collider_3d(Collider3D {
            id: 21,
            model_id: 20,
            shape: ColliderShape3D::Sphere { radius: 1.0 },
            offset: [0.0; 3],
            local_matrix: None,
            active: true,
            sensor: false,
            layer: 1,
            mask: u32::MAX,
        })
        .unwrap();

    let mut mv = MultiverseContext::new();
    mv.register_realm(Box::new(outer)).unwrap();
    mv.register_realm(Box::new(inner)).unwrap();
    let mut mv = setup(mv, 2);
    mv.create_target(2, TargetDesc::texture(100, 100)).unwrap();
    mv.create_invocation(
        2,
        InvocationDesc {
            realm_id: 3,
            target_id: 2,
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
        source_target_id: 2,
        realm_id: 2,
        slot: "screen".into(),
    })
    .unwrap();
    mv.connect_interaction_surface(InteractionSurface {
        realm_id: 2,
        model_id: 10,
        collider_id: 11,
        slot: "screen".into(),
        flip_y: true,
    })
    .unwrap();

    present(&mut mv, 0).unwrap();
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [50.0, 50.0],
        delta: [0.0; 2],
    });
    let events = mv.poll_interaction_events();
    assert_eq!((events[0].realm_id, events[0].collider_id), (3, 21));
    assert_eq!(events[0].window_position, [50.0, 50.0]);
    assert_eq!(events[0].presentation_target_id, 2);
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [80.0, 50.0],
        delta: [30.0, 0.0],
    });
    let events = mv.poll_interaction_events();
    assert!(
        events.iter().any(
            |event| event.interaction_type == InteractionType::Hover && event.collider_id == 12
        )
    );
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [50.0, 50.0],
        delta: [-30.0, 0.0],
    });
    mv.poll_interaction_events();
    mv.handle_pointer_event(&InteractionPointerEvent::Button {
        window_id: 7,
        pointer_id: 0,
        position: [50.0, 50.0],
        button: 0,
        state: InteractionButtonState::Pressed,
    });
    mv.poll_interaction_events();
    mv.set_invocation_enabled(2, false).unwrap();
    assert!(mv.poll_interaction_events().is_empty());
    present(&mut mv, 1).unwrap();
    assert_eq!(
        mv.poll_interaction_events()
            .iter()
            .map(|event| event.interaction_type)
            .collect::<Vec<_>>(),
        vec![InteractionType::Cancel, InteractionType::Leave]
    );
    mv.set_invocation_enabled(2, true).unwrap();
    present(&mut mv, 2).unwrap();
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [50.0, 50.0],
        delta: [0.0; 2],
    });
    mv.poll_interaction_events();
    mv.handle_pointer_event(&InteractionPointerEvent::Button {
        window_id: 7,
        pointer_id: 0,
        position: [50.0, 50.0],
        button: 0,
        state: InteractionButtonState::Pressed,
    });
    mv.poll_interaction_events();
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [95.0, 50.0],
        delta: [45.0, 0.0],
    });
    let events = mv.poll_interaction_events();
    assert!(events.iter().any(
        |event| event.interaction_type == InteractionType::PressMove && event.collider_id == 21
    ));
    mv.handle_pointer_event(&InteractionPointerEvent::Button {
        window_id: 7,
        pointer_id: 0,
        position: [95.0, 50.0],
        button: 0,
        state: InteractionButtonState::Released,
    });
    let events = mv.poll_interaction_events();
    assert_eq!(events[0].interaction_type, InteractionType::PressUp);
    assert_eq!(events[0].collider_id, 21);
    assert!(
        !events
            .iter()
            .any(|event| event.interaction_type == InteractionType::Click)
    );

    mv.disconnect_interaction_surface(2, 11).unwrap();
    present(&mut mv, 3).unwrap();
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [50.0, 50.0],
        delta: [-45.0, 0.0],
    });
    assert_eq!(mv.poll_interaction_events()[0].realm_id, 2);
    assert!(
        mv.connect_interaction_surface(InteractionSurface {
            realm_id: 2,
            model_id: 999,
            collider_id: 11,
            slot: "screen".into(),
            flip_y: true,
        })
        .is_err()
    );
    assert!(
        mv.connect_interaction_surface(InteractionSurface {
            realm_id: 2,
            model_id: 10,
            collider_id: u32::MAX,
            slot: "screen".into(),
            flip_y: true,
        })
        .is_err()
    );
    mv.connect_interaction_surface(InteractionSurface {
        realm_id: 2,
        model_id: 10,
        collider_id: 11,
        slot: "screen".into(),
        flip_y: true,
    })
    .unwrap();
    mv.unbind_target_texture(2, "screen").unwrap();
    mv.bind_target_texture(TargetTextureBinding {
        source_target_id: 2,
        realm_id: 2,
        slot: "screen".into(),
    })
    .unwrap();
    present(&mut mv, 4).unwrap();
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [50.0, 50.0],
        delta: [0.0; 2],
    });
    assert!(
        mv.poll_interaction_events()
            .iter()
            .all(|event| event.realm_id == 2)
    );
}

#[path = "interaction_surface_ui_tests.rs"]
mod surface_ui_tests;

// Emulates a successful window presentation in headless tests.
pub(super) fn present(
    mv: &mut crate::MultiverseContext,
    frame_id: u64,
) -> crate::MultiverseResult<()> {
    mv.dispatch(frame_id, 0.0)?;
    mv.publish_interaction_frame(&[7]);
    Ok(())
}
