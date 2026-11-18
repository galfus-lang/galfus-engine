use super::interaction_realms_tests::{present, setup};
use crate::interaction::{InteractionPointerEvent, InteractionType};
use crate::{InvocationDesc, MultiverseContext, TargetDesc, ViewportRect};
use galfus_realm_core::collision::{Collider2D, ColliderShape2D};
use glam::{UVec2, Vec2};

#[test]
fn interaction_uses_only_the_last_successfully_submitted_frame() {
    use galfus_realm_2d::Realm2DContext;
    use galfus_realm_2d_resources::{Camera2D, Transform2D};
    use galfus_realm_core::{
        Realm, RealmError, RealmInvocationContext, RealmKind, RealmPrepareContext, RealmResult,
    };
    use std::sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    };

    struct FailingRealm(Arc<AtomicBool>);
    impl Realm for FailingRealm {
        fn id(&self) -> u32 {
            4
        }
        fn kind(&self) -> RealmKind {
            RealmKind::Custom
        }
        fn prepare(&mut self, _: &RealmPrepareContext<'_>) -> RealmResult<()> {
            if self.0.load(Ordering::SeqCst) {
                Err(RealmError::Internal("test failure".into()))
            } else {
                Ok(())
            }
        }
        fn render(&mut self, _: &RealmInvocationContext<'_>) -> RealmResult<()> {
            Ok(())
        }
        fn as_any(&self) -> &dyn std::any::Any {
            self
        }
        fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
            self
        }
    }

    let mut realm = Realm2DContext::new(2);
    realm
        .set_camera(1, Camera2D::new(10.0, 0), Transform2D::default())
        .unwrap();
    realm
        .set_model_transform_2d(10, Transform2D::default())
        .unwrap();
    realm
        .create_collider_2d(Collider2D {
            id: 11,
            model_id: 10,
            shape: ColliderShape2D::Circle { radius: 0.5 },
            offset: [0.0; 2],
            local_matrix: None,
            active: true,
            sensor: false,
            layer: 1,
            mask: u32::MAX,
        })
        .unwrap();
    let fail = Arc::new(AtomicBool::new(false));
    let mut mv = MultiverseContext::new();
    mv.register_realm(Box::new(realm)).unwrap();
    mv.register_realm(Box::new(FailingRealm(fail.clone())))
        .unwrap();
    let mut mv = setup(mv, 2);
    let movement = |x| InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [x, 50.0],
        delta: [0.0; 2],
    };
    mv.handle_pointer_event(&movement(50.0));
    assert!(mv.poll_interaction_events().is_empty());
    mv.dispatch(99, 0.0).unwrap(); // No window surface was actually presented.
    mv.handle_pointer_event(&movement(50.0));
    assert!(mv.poll_interaction_events().is_empty());
    present(&mut mv, 0).unwrap();
    mv.get_realm_mut::<Realm2DContext>(2)
        .unwrap()
        .set_model_transform_2d(10, Transform2D::from_translation(Vec2::new(3.0, 0.0)))
        .unwrap();
    mv.handle_pointer_event(&movement(50.0));
    assert_eq!(
        mv.poll_interaction_events()[0].interaction_type,
        InteractionType::Hover
    );
    fail.store(true, Ordering::SeqCst);
    assert!(present(&mut mv, 1).is_err());
    mv.handle_pointer_event(&movement(80.0));
    assert_eq!(
        mv.poll_interaction_events()[0].interaction_type,
        InteractionType::Leave
    );
    fail.store(false, Ordering::SeqCst);
    present(&mut mv, 2).unwrap();
    mv.handle_pointer_event(&movement(80.0));
    assert_eq!(
        mv.poll_interaction_events()[0].interaction_type,
        InteractionType::Hover
    );
}

#[test]
fn each_window_keeps_its_own_last_presented_state() {
    use galfus_realm_2d::Realm2DContext;
    use galfus_realm_2d_resources::{Camera2D, Transform2D};
    let mut realm = Realm2DContext::new(2);
    realm
        .set_camera(1, Camera2D::new(10.0, 0), Transform2D::default())
        .unwrap();
    realm
        .set_model_transform_2d(10, Transform2D::default())
        .unwrap();
    realm
        .create_collider_2d(Collider2D {
            id: 11,
            model_id: 10,
            shape: ColliderShape2D::Circle { radius: 0.5 },
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
    mv.create_target(3, TargetDesc::window(8)).unwrap();
    mv.update_window_size(8, UVec2::splat(100));
    mv.create_invocation(
        3,
        InvocationDesc {
            realm_id: 2,
            target_id: 3,
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
    mv.dispatch(0, 0.0).unwrap();
    mv.publish_interaction_frame(&[7]);
    mv.get_realm_mut::<Realm2DContext>(2)
        .unwrap()
        .set_model_transform_2d(10, Transform2D::from_translation(Vec2::new(3.0, 0.0)))
        .unwrap();
    mv.dispatch(1, 0.0).unwrap();
    mv.publish_interaction_frame(&[8]);
    for (window_id, x) in [(7, 50.0), (8, 80.0)] {
        mv.handle_pointer_event(&InteractionPointerEvent::Move {
            window_id,
            pointer_id: 0,
            position: [x, 50.0],
            delta: [0.0; 2],
        });
        let events = mv.poll_interaction_events();
        assert_eq!(events[0].interaction_type, InteractionType::Hover);
        assert_eq!(events[0].window_id, window_id);
    }
    mv.detach_window(7).unwrap();
    assert_eq!(
        mv.poll_interaction_events()[0].interaction_type,
        InteractionType::Leave
    );
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 7,
        pointer_id: 0,
        position: [50.0; 2],
        delta: [0.0; 2],
    });
    assert!(mv.poll_interaction_events().is_empty());
}
