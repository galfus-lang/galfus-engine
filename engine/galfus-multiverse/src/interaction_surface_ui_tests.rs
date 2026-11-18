//! Cross-realm interaction surface tests.

use super::*;

#[test]
fn pointer_maps_3d_surface_uv_to_the_correct_2d_viewport_position() {
    use crate::{InteractionSurface, TargetTextureBinding};
    use galfus_realm_2d::Realm2DContext;
    use galfus_realm_2d_resources::{Camera2D, Transform2D};
    use galfus_realm_3d::Realm3DContext;
    use galfus_realm_3d_resources::{camera::Camera3D, transform::Transform3D};

    let mut outer = Realm3DContext::new(2);
    outer
        .create_camera(
            1,
            Camera3D::perspective(60.0, 1.0, 10.0, 0),
            Transform3D::default(),
        )
        .unwrap();
    outer
        .set_spatial_model_transform_3d(10, Transform3D::from_position(Vec3::new(0.0, 0.0, -5.0)))
        .unwrap();
    outer
        .create_collider_3d(Collider3D {
            id: 11,
            model_id: 10,
            shape: ColliderShape3D::Rectangle {
                half_extents: [1.0, 1.0],
            },
            offset: [0.0; 3],
            local_matrix: None,
            active: true,
            sensor: false,
            layer: 1,
            mask: u32::MAX,
        })
        .unwrap();
    outer
        .create_collider_3d(Collider3D {
            id: 12,
            model_id: 10,
            shape: ColliderShape3D::Sphere { radius: 1.0 },
            offset: [10.0, 0.0, 0.0],
            local_matrix: None,
            active: true,
            sensor: false,
            layer: 1,
            mask: u32::MAX,
        })
        .unwrap();

    let mut inner = Realm2DContext::new(3);
    inner
        .set_camera(1, Camera2D::new(10.0, 0), Transform2D::default())
        .unwrap();
    inner
        .set_model_transform_2d(20, Transform2D::from_translation(Vec2::new(2.5, 2.5)))
        .unwrap();
    inner
        .create_collider_2d(Collider2D {
            id: 21,
            model_id: 20,
            shape: ColliderShape2D::Circle { radius: 0.3 },
            offset: [0.0; 2],
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
    assert!(
        mv.connect_interaction_surface(InteractionSurface {
            realm_id: 2,
            model_id: 10,
            collider_id: 12,
            slot: "screen".into(),
            flip_y: false,
        })
        .is_err()
    );
    mv.connect_interaction_surface(InteractionSurface {
        realm_id: 2,
        model_id: 10,
        collider_id: 11,
        slot: "screen".into(),
        flip_y: false,
    })
    .unwrap();
    present(&mut mv, 0).unwrap();
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [58.660254, 41.339746],
        delta: [0.0; 2],
    });
    let events = mv.poll_interaction_events();
    assert_eq!((events[0].realm_id, events[0].collider_id), (3, 21));
    match events[0].geometry.unwrap() {
        galfus_core::interaction::InteractionGeometry::TwoD { point, .. } => {
            assert!((point[0] - 2.5).abs() < 1e-3 && (point[1] - 2.5).abs() < 1e-3);
        }
        _ => panic!("expected a 2D interaction hit"),
    }
}
