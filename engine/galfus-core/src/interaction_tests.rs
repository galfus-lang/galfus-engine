use super::*;

fn hit(collider_id: u32) -> InteractionHit {
    InteractionHit {
        realm_id: 1,
        model_id: 9,
        collider_id,
        presentation_target_id: 1,
        local_pos: [0.0; 2],
        uv: [0.5; 2],
        geometry: InteractionGeometry::ThreeD {
            point: [0.0, 0.0, -4.0],
            normal: [0.0, 0.0, 1.0],
            distance: 4.0,
        },
        element_id: None,
    }
}

#[test]
fn tracks_independent_colliders_and_cancels_removed_targets() {
    let mut system = InteractionSystem::new();
    let movement = InteractionPointerEvent::Move {
        window_id: 1,
        pointer_id: 1,
        position: [0.0; 2],
        delta: [0.0; 2],
    };
    system.handle_event(&movement, None);
    assert!(system.poll_events().is_empty());
    system.handle_event(&movement, Some(hit(1)));
    let events = system.poll_events();
    assert_eq!(events[0].interaction_type, InteractionType::Hover);
    assert_eq!(events[0].geometry, Some(hit(1).geometry));
    system.handle_event(
        &InteractionPointerEvent::Button {
            window_id: 1,
            pointer_id: 1,
            position: [0.0; 2],
            button: 0,
            state: InteractionButtonState::Pressed,
        },
        Some(hit(1)),
    );
    system.poll_events();
    system.handle_event(&movement, Some(hit(2)));
    let events = system.poll_events();
    assert_eq!(
        events
            .iter()
            .map(|e| e.interaction_type)
            .collect::<Vec<_>>(),
        vec![
            InteractionType::Leave,
            InteractionType::Hover,
            InteractionType::Move,
            InteractionType::PressMove
        ]
    );
    assert_eq!(events[3].collider_id, 1);
    system.reconcile(|_, target| target.collider_id != 1);
    assert_eq!(
        system.poll_events()[0].interaction_type,
        InteractionType::Cancel
    );
    system.reconcile(|_, _| false);
    assert_eq!(
        system.poll_events()[0].interaction_type,
        InteractionType::Leave
    );
}
