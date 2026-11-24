//! Event construction and hover-transition helpers for `InteractionSystem`.

use std::collections::VecDeque;

use super::{
    InteractionEvent, InteractionHit, InteractionTarget, InteractionType, PointerState,
    push_bounded_event,
};

pub(super) fn update_hover(
    events: &mut VecDeque<InteractionEvent>,
    state: &mut PointerState,
    window_id: u32,
    pointer_id: u64,
    position: [f32; 2],
    delta: [f32; 2],
    hit: &Option<InteractionHit>,
) -> Option<InteractionTarget> {
    let next_target = hit.as_ref().map(|h| InteractionTarget {
        realm_id: h.realm_id,
        model_id: h.model_id,
        collider_id: h.collider_id,
        presentation_target_id: h.presentation_target_id,
        element_id: h.element_id,
    });
    if state.current_hover != next_target {
        if let Some(prev) = state.current_hover {
            let mut ev = simple_event(
                InteractionType::Leave,
                window_id,
                pointer_id,
                prev,
                None,
                position,
            );
            ev.delta = delta;
            push_bounded_event(events, ev);
        }
        if let Some(h) = hit {
            push_bounded_event(
                events,
                hit_event(
                    InteractionType::Hover,
                    window_id,
                    pointer_id,
                    position,
                    h,
                    None,
                    delta,
                    None,
                ),
            );
        }
        state.current_hover = next_target;
    }
    next_target
}

#[allow(clippy::too_many_arguments)]
pub(super) fn hit_event(
    interaction_type: InteractionType,
    window_id: u32,
    pointer_id: u64,
    window_position: [f32; 2],
    h: &InteractionHit,
    button: Option<u32>,
    delta: [f32; 2],
    scroll_delta: Option<[f32; 2]>,
) -> InteractionEvent {
    InteractionEvent {
        interaction_type,
        window_id,
        pointer_id,
        window_position,
        realm_id: h.realm_id,
        model_id: h.model_id,
        collider_id: h.collider_id,
        presentation_target_id: h.presentation_target_id,
        button,
        local_pos: h.local_pos,
        uv: h.uv,
        geometry: Some(h.geometry),
        delta,
        scroll_delta,
        element_id: h.element_id,
    }
}

pub(super) fn simple_event(
    interaction_type: InteractionType,
    window_id: u32,
    pointer_id: u64,
    target: InteractionTarget,
    button: Option<u32>,
    position: [f32; 2],
) -> InteractionEvent {
    InteractionEvent {
        interaction_type,
        window_id,
        pointer_id,
        window_position: position,
        realm_id: target.realm_id,
        model_id: target.model_id,
        collider_id: target.collider_id,
        presentation_target_id: target.presentation_target_id,
        button,
        local_pos: position,
        uv: [0.5, 0.5],
        geometry: None,
        delta: [0.0; 2],
        scroll_delta: None,
        element_id: target.element_id,
    }
}
