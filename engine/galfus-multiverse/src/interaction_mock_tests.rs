use crate::interaction::{InteractionButtonState, InteractionPointerEvent, InteractionType};
use crate::*;
use galfus_realm_core::collision::HitResult2D;
use galfus_realm_core::*;
use glam::{UVec2, Vec2};

struct MockPickRealm {
    id: u32,
    kind: RealmKind,
    hit_model: Option<u32>,
}

impl MockPickRealm {
    fn new(id: u32, kind: RealmKind, hit_model: Option<u32>) -> Self {
        Self {
            id,
            kind,
            hit_model,
        }
    }
}

impl Realm for MockPickRealm {
    fn snapshot_interaction(&self) -> Option<Box<dyn Realm>> {
        Some(Box::new(Self::new(self.id, self.kind, self.hit_model)))
    }
    fn has_interactive_collider(&self, model_id: u32, collider_id: u32) -> bool {
        self.hit_model == Some(model_id) && collider_id == model_id * 10
    }
    fn viewport_point_2d(&self, _: Option<u32>, position: Vec2, size: Vec2) -> Option<Vec2> {
        Some(Vec2::new(
            position.x - size.x * 0.5,
            size.y * 0.5 - position.y,
        ))
    }
    fn id(&self) -> u32 {
        self.id
    }

    fn kind(&self) -> RealmKind {
        self.kind
    }

    fn prepare(&mut self, _ctx: &RealmPrepareContext<'_>) -> RealmResult<()> {
        Ok(())
    }

    fn render(&mut self, _ctx: &RealmInvocationContext<'_>) -> RealmResult<()> {
        Ok(())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }

    fn pick_2d(&self, _camera_slot: Option<u32>, point: Vec2) -> Option<HitResult2D> {
        self.hit_model.map(|model_id| HitResult2D {
            model_id,
            collider_id: model_id * 10,
            point,
            normal: Vec2::Y,
            uv: Vec2::new(0.5, 0.5),
            z_layer: 0.0,
            element_id: None,
        })
    }
}

#[test]
fn test_multiverse_interaction_hover_and_click() {
    let mut mv = MultiverseContext::new();

    // 1. Create Window Target (id 1, 800x600)
    let target = TargetDesc {
        kind: TargetKind::Window { window_id: 100 },
        size: Some(UVec2::new(800, 600)),
    };
    mv.create_target(1, target).unwrap();
    mv.update_window_size(100, UVec2::new(800, 600));

    // 2. Register Mock Realm (id 10)
    let realm = Box::new(MockPickRealm::new(10, RealmKind::TwoD, Some(42)));
    mv.register_realm(realm).unwrap();

    // 3. Create Invocation
    let inv = InvocationDesc {
        realm_id: 10,
        target_id: 1,
        camera_slot: None,
        viewport: ViewportRect::full(),
        filters: vec![],
        z_index: 0,
        enabled: true,
        clear_color: None,
        anti_aliasing: None,
    };
    mv.create_invocation(1000, inv).unwrap();
    present(&mut mv, 0).unwrap();

    // 4. Move pointer over window: should generate Hover and Move events for model 42
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 100,
        pointer_id: 1,
        position: [400.0, 300.0],
        delta: [5.0, 0.0],
    });

    let events = mv.poll_interaction_events();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].interaction_type, InteractionType::Hover);
    assert_eq!(events[0].model_id, 42);
    assert_eq!(events[0].realm_id, 10);
    assert_eq!(events[1].interaction_type, InteractionType::Move);
    assert_eq!(events[1].model_id, 42);

    // 5. Button Press: should generate Down event
    mv.handle_pointer_event(&InteractionPointerEvent::Button {
        window_id: 100,
        pointer_id: 1,
        position: [400.0, 300.0],
        button: 0,
        state: InteractionButtonState::Pressed,
    });

    let events = mv.poll_interaction_events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].interaction_type, InteractionType::Down);
    assert_eq!(events[0].model_id, 42);

    // 6. Button Release: should generate Up and Click events
    mv.handle_pointer_event(&InteractionPointerEvent::Button {
        window_id: 100,
        pointer_id: 1,
        position: [400.0, 300.0],
        button: 0,
        state: InteractionButtonState::Released,
    });

    let events = mv.poll_interaction_events();
    assert_eq!(events.len(), 3);
    assert_eq!(events[0].interaction_type, InteractionType::PressUp);
    assert_eq!(events[1].interaction_type, InteractionType::Up);
    assert_eq!(events[2].interaction_type, InteractionType::Click);

    // 7. Pointer Leave: should generate Leave event
    mv.handle_pointer_event(&InteractionPointerEvent::Leave {
        window_id: 100,
        pointer_id: 1,
    });

    let events = mv.poll_interaction_events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].interaction_type, InteractionType::Leave);
    assert_eq!(events[0].model_id, 42);
}

#[test]
fn test_multiverse_interaction_z_index_priority() {
    let mut mv = MultiverseContext::new();

    let target = TargetDesc {
        kind: TargetKind::Window { window_id: 100 },
        size: Some(UVec2::new(800, 600)),
    };
    mv.create_target(1, target).unwrap();
    mv.update_window_size(100, UVec2::new(800, 600));

    // Register two realms: background (model 1) and overlay (model 2)
    mv.register_realm(Box::new(MockPickRealm::new(10, RealmKind::TwoD, Some(1))))
        .unwrap();
    mv.register_realm(Box::new(MockPickRealm::new(20, RealmKind::TwoD, Some(2))))
        .unwrap();

    // Invocation 1000: background with z_index = 0
    mv.create_invocation(
        1000,
        InvocationDesc {
            realm_id: 10,
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

    // Invocation 2000: overlay with z_index = 10
    mv.create_invocation(
        2000,
        InvocationDesc {
            realm_id: 20,
            target_id: 1,
            camera_slot: None,
            viewport: ViewportRect::full(),
            filters: vec![],
            z_index: 10,
            enabled: true,
            clear_color: None,
            anti_aliasing: None,
        },
    )
    .unwrap();

    present(&mut mv, 0).unwrap();
    // Move pointer: overlay (model 2) should be hit first because it has higher z_index
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 100,
        pointer_id: 1,
        position: [400.0, 300.0],
        delta: [0.0, 0.0],
    });

    let events = mv.poll_interaction_events();
    assert!(!events.is_empty());
    assert_eq!(events[0].model_id, 2);
    assert_eq!(events[0].realm_id, 20);
}

struct MultiColliderRealm {
    id: u32,
    kind: RealmKind,
}

impl Realm for MultiColliderRealm {
    fn snapshot_interaction(&self) -> Option<Box<dyn Realm>> {
        Some(Box::new(Self {
            id: self.id,
            kind: self.kind,
        }))
    }
    fn has_interactive_collider(&self, model_id: u32, collider_id: u32) -> bool {
        model_id == 42 && (collider_id == 101 || collider_id == 102)
    }
    fn viewport_point_2d(&self, _: Option<u32>, position: Vec2, size: Vec2) -> Option<Vec2> {
        Some(Vec2::new(
            position.x - size.x * 0.5,
            size.y * 0.5 - position.y,
        ))
    }
    fn id(&self) -> u32 {
        self.id
    }
    fn kind(&self) -> RealmKind {
        self.kind
    }
    fn prepare(&mut self, _ctx: &RealmPrepareContext<'_>) -> RealmResult<()> {
        Ok(())
    }
    fn render(&mut self, _ctx: &RealmInvocationContext<'_>) -> RealmResult<()> {
        Ok(())
    }
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }
    fn pick_2d(&self, _camera_slot: Option<u32>, point: Vec2) -> Option<HitResult2D> {
        // Model 42 has Collider 101 on left (point.x < 0) and Collider 102 on right (point.x >= 0 and <= 100)
        if point.x >= -100.0 && point.x < 0.0 {
            Some(HitResult2D {
                model_id: 42,
                collider_id: 101,
                point,
                normal: Vec2::Y,
                uv: Vec2::new(0.25, 0.5),
                z_layer: 0.0,
                element_id: None,
            })
        } else if point.x >= 0.0 && point.x <= 100.0 {
            Some(HitResult2D {
                model_id: 42,
                collider_id: 102,
                point,
                normal: Vec2::Y,
                uv: Vec2::new(0.75, 0.5),
                z_layer: 0.0,
                element_id: None,
            })
        } else {
            None
        }
    }
}

#[test]
fn test_multiverse_interaction_multiple_colliders_on_same_model() {
    let mut mv = MultiverseContext::new();

    let target = TargetDesc {
        kind: TargetKind::Window { window_id: 100 },
        size: Some(UVec2::new(800, 600)),
    };
    mv.create_target(1, target).unwrap();
    mv.update_window_size(100, UVec2::new(800, 600));

    mv.register_realm(Box::new(MultiColliderRealm {
        id: 10,
        kind: RealmKind::TwoD,
    }))
    .unwrap();

    mv.create_invocation(
        1000,
        InvocationDesc {
            realm_id: 10,
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

    present(&mut mv, 0).unwrap();
    // 1. Enter Collider 101 on Model 42 (x = 350 -> world_x = -50)
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 100,
        pointer_id: 1,
        position: [350.0, 300.0],
        delta: [0.0, 0.0],
    });

    let events = mv.poll_interaction_events();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].interaction_type, InteractionType::Hover);
    assert_eq!(events[0].model_id, 42);
    assert_eq!(events[0].collider_id, 101);
    assert_eq!(events[1].interaction_type, InteractionType::Move);
    assert_eq!(events[1].collider_id, 101);

    // 2. Cross over into Collider 102 on SAME Model 42 (x = 450 -> world_x = +50)
    // Each collider is an independent interaction target.
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 100,
        pointer_id: 1,
        position: [450.0, 300.0],
        delta: [100.0, 0.0],
    });

    let events = mv.poll_interaction_events();
    assert_eq!(events.len(), 3);
    assert_eq!(events[0].interaction_type, InteractionType::Leave);
    assert_eq!(events[0].collider_id, 101);
    assert_eq!(events[1].interaction_type, InteractionType::Hover);
    assert_eq!(events[1].collider_id, 102);
    assert_eq!(events[2].interaction_type, InteractionType::Move);
    assert_eq!(events[2].collider_id, 102);

    // 3. Press on Collider 102
    mv.handle_pointer_event(&InteractionPointerEvent::Button {
        window_id: 100,
        pointer_id: 1,
        position: [450.0, 300.0],
        button: 0,
        state: InteractionButtonState::Pressed,
    });
    let events = mv.poll_interaction_events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].interaction_type, InteractionType::Down);
    assert_eq!(events[0].collider_id, 102);

    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 100,
        pointer_id: 1,
        position: [600.0, 300.0],
        delta: [150.0, 0.0],
    });
    let events = mv.poll_interaction_events();
    assert_eq!(events[0].interaction_type, InteractionType::Leave);
    assert_eq!(events[1].interaction_type, InteractionType::PressMove);
    assert_eq!(events[1].collider_id, 102);

    // 4. Release on Collider 101 must not click Collider 102.
    mv.handle_pointer_event(&InteractionPointerEvent::Button {
        window_id: 100,
        pointer_id: 1,
        position: [350.0, 300.0],
        button: 0,
        state: InteractionButtonState::Released,
    });
    let events = mv.poll_interaction_events();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].interaction_type, InteractionType::PressUp);
    assert_eq!(events[0].collider_id, 102);
    assert_eq!(events[1].interaction_type, InteractionType::Up);
    assert_eq!(events[1].collider_id, 101);

    // 5. Move back over the first collider, then leave the model.
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 100,
        pointer_id: 1,
        position: [350.0, 300.0],
        delta: [-250.0, 0.0],
    });
    mv.poll_interaction_events();
    mv.handle_pointer_event(&InteractionPointerEvent::Move {
        window_id: 100,
        pointer_id: 1,
        position: [600.0, 300.0],
        delta: [250.0, 0.0],
    });
    let events = mv.poll_interaction_events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].interaction_type, InteractionType::Leave);
    assert_eq!(events[0].model_id, 42);
}

// Emulates a successful window presentation in headless tests.
fn present(mv: &mut crate::MultiverseContext, frame_id: u64) -> crate::MultiverseResult<()> {
    mv.dispatch(frame_id, 0.0)?;
    mv.publish_interaction_frame(&[100]);
    Ok(())
}
