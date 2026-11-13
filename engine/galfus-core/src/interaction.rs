//! Dimension-independent pointer interaction state and events.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

/// State of a pointer button transition.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InteractionButtonState {
    /// Button transitioned to pressed.
    Pressed,
    /// Button transitioned to released.
    Released,
}

/// Normalized pointer input received by the Multiverse interaction system.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum InteractionPointerEvent {
    /// Pointer movement.
    #[serde(rename_all = "camelCase")]
    Move {
        /// Window surface identifier.
        window_id: u32,
        /// Pointer contact identifier.
        pointer_id: u64,
        /// Surface position in logical pixels.
        position: [f32; 2],
        /// Movement delta since previous event.
        delta: [f32; 2],
    },
    /// Button press or release.
    #[serde(rename_all = "camelCase")]
    Button {
        /// Window surface identifier.
        window_id: u32,
        /// Pointer contact identifier.
        pointer_id: u64,
        /// Surface position at button transition.
        position: [f32; 2],
        /// Normalized button index (0=primary, 1=secondary, 2=auxiliary).
        button: u32,
        /// Transition state.
        state: InteractionButtonState,
    },
    /// Wheel or trackpad scroll delta.
    #[serde(rename_all = "camelCase")]
    Scroll {
        /// Window surface identifier.
        window_id: u32,
        /// Pointer contact identifier.
        pointer_id: u64,
        /// Surface position during scroll.
        position: [f32; 2],
        /// Scroll delta `[dx, dy]`.
        delta: [f32; 2],
    },
    /// Pointer left the window boundary.
    #[serde(rename_all = "camelCase")]
    Leave {
        /// Window surface identifier.
        window_id: u32,
        /// Pointer contact identifier.
        pointer_id: u64,
    },
    /// Pointer input was cancelled by the platform.
    #[serde(rename_all = "camelCase")]
    Cancel { window_id: u32, pointer_id: u64 },
}

/// Category of an interaction event emitted toward a model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InteractionType {
    /// Cursor entered model boundary.
    Hover,
    /// Cursor exited model boundary.
    Leave,
    /// Button pressed on model.
    Down,
    /// Button released on model.
    Up,
    /// Complete click cycle on same model.
    Click,
    /// Cursor moved over model.
    Move,
    /// Cursor dragged while button pressed.
    PressMove,
    /// Button released for its original pressed target.
    PressUp,
    /// Pointer cancelled or window blurred.
    Cancel,
    /// Mouse wheel scrolled over model.
    Scroll,
}

/// Dimension-specific world-space data for an actual collider hit.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(tag = "dimension", rename_all = "camelCase")]
pub enum InteractionGeometry {
    TwoD {
        point: [f32; 2],
        normal: [f32; 2],
    },
    ThreeD {
        point: [f32; 3],
        normal: [f32; 3],
        distance: f32,
    },
}

/// High-level interaction event emitted toward a logical model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractionEvent {
    /// Event category.
    pub interaction_type: InteractionType,
    /// Window surface where the event occurred.
    pub window_id: u32,
    /// Pointer identifier.
    pub pointer_id: u64,
    /// Pointer position in logical pixels relative to the window.
    #[serde(default)]
    pub window_position: [f32; 2],
    /// Realm containing the model.
    pub realm_id: u32,
    /// Logical model identifier.
    pub model_id: u32,
    /// Logical collider identifier.
    pub collider_id: u32,
    /// Render target through which this collider was reached.
    #[serde(default)]
    pub presentation_target_id: u32,
    /// Active pointer button if applicable.
    pub button: Option<u32>,
    /// Legacy 2D hit coordinates; use `geometry` for dimension-specific world coordinates.
    pub local_pos: [f32; 2],
    /// Normalized surface UV coordinate `[0..1, 0..1]`.
    pub uv: [f32; 2],
    /// Movement delta.
    pub delta: [f32; 2],
    /// Scroll delta if applicable.
    pub scroll_delta: Option<[f32; 2]>,
    /// World-space hit data, absent for cancellation and captures outside the target.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry: Option<InteractionGeometry>,
    /// Optional logical sub-element identifier (e.g. topmost hit UI Panel).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub element_id: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct InteractionTarget {
    pub realm_id: u32,
    pub model_id: u32,
    pub collider_id: u32,
    pub presentation_target_id: u32,
    pub element_id: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct InteractionHit {
    pub realm_id: u32,
    pub model_id: u32,
    pub collider_id: u32,
    pub presentation_target_id: u32,
    pub local_pos: [f32; 2],
    pub uv: [f32; 2],
    pub geometry: InteractionGeometry,
    pub element_id: Option<u32>,
}

#[derive(Debug, Default)]
struct PointerState {
    current_hover: Option<InteractionTarget>,
    pressed_targets: BTreeMap<u32, InteractionTarget>,
    last_position: [f32; 2],
}

/// Tracks pointer state after a realm resolves its hit target.
#[derive(Default)]
pub struct InteractionSystem {
    pointers: HashMap<(u32, u64), PointerState>,
    events: Vec<InteractionEvent>,
}

impl InteractionSystem {
    /// Creates a new interaction manager.
    pub fn new() -> Self {
        Self::default()
    }

    /// Drains all accumulated interaction events.
    pub fn poll_events(&mut self) -> Vec<InteractionEvent> {
        std::mem::take(&mut self.events)
    }

    /// Cancels pressed targets and clears hover after collider or realm removal.
    pub fn reconcile(&mut self, valid: impl Fn(u32, InteractionTarget) -> bool) {
        let mut keys: Vec<_> = self.pointers.keys().copied().collect();
        keys.sort_unstable();
        for (window_id, pointer_id) in keys {
            let state = self.pointers.get_mut(&(window_id, pointer_id)).unwrap();
            let mut cancelled: Vec<_> = state
                .pressed_targets
                .iter()
                .filter(|(_, target)| !valid(window_id, **target))
                .map(|(&button, &target)| (button, target))
                .collect();
            cancelled.sort_by_key(|(button, _)| *button);
            for (button, target) in cancelled {
                state.pressed_targets.remove(&button);
                self.events.push(simple_event(
                    InteractionType::Cancel,
                    window_id,
                    pointer_id,
                    target,
                    Some(button),
                    state.last_position,
                ));
            }
            if state
                .current_hover
                .is_some_and(|target| !valid(window_id, target))
            {
                let target = state.current_hover.take().unwrap();
                self.events.push(simple_event(
                    InteractionType::Leave,
                    window_id,
                    pointer_id,
                    target,
                    None,
                    state.last_position,
                ));
            }
        }
    }

    /// Cancels and removes every pointer belonging to a closed window.
    pub fn cancel_window(&mut self, window_id: u32) {
        let mut keys: Vec<_> = self
            .pointers
            .keys()
            .filter(|(id, _)| *id == window_id)
            .copied()
            .collect();
        keys.sort_unstable();
        for (_, pointer_id) in keys {
            let state = self.pointers.remove(&(window_id, pointer_id)).unwrap();
            let mut pressed: Vec<_> = state.pressed_targets.into_iter().collect();
            pressed.sort_by_key(|(button, _)| *button);
            for (button, target) in pressed {
                self.events.push(simple_event(
                    InteractionType::Cancel,
                    window_id,
                    pointer_id,
                    target,
                    Some(button),
                    state.last_position,
                ));
            }
            if let Some(target) = state.current_hover {
                self.events.push(simple_event(
                    InteractionType::Leave,
                    window_id,
                    pointer_id,
                    target,
                    None,
                    state.last_position,
                ));
            }
        }
    }

    /// Evaluates a platform pointer event, performing picking and enqueuing interaction events.
    pub fn handle_event(&mut self, event: &InteractionPointerEvent, hit: Option<InteractionHit>) {
        match event {
            InteractionPointerEvent::Move {
                window_id,
                pointer_id,
                position,
                delta,
            } => {
                let state = self.pointers.entry((*window_id, *pointer_id)).or_default();
                state.last_position = *position;
                let next_target = hit.as_ref().map(|h| InteractionTarget {
                    realm_id: h.realm_id,
                    model_id: h.model_id,
                    collider_id: h.collider_id,
                    presentation_target_id: h.presentation_target_id,
                    element_id: h.element_id,
                });

                if state.current_hover != next_target {
                    if let Some(prev) = state.current_hover {
                        self.events.push(InteractionEvent {
                            interaction_type: InteractionType::Leave,
                            window_id: *window_id,
                            pointer_id: *pointer_id,
                            window_position: *position,
                            realm_id: prev.realm_id,
                            model_id: prev.model_id,
                            collider_id: prev.collider_id,
                            presentation_target_id: prev.presentation_target_id,
                            button: None,
                            local_pos: *position,
                            uv: [0.5, 0.5],
                            geometry: None,
                            delta: *delta,
                            scroll_delta: None,
                            element_id: prev.element_id,
                        });
                    }
                    if let Some(h) = &hit {
                        self.events.push(InteractionEvent {
                            interaction_type: InteractionType::Hover,
                            window_id: *window_id,
                            pointer_id: *pointer_id,
                            window_position: *position,
                            realm_id: h.realm_id,
                            model_id: h.model_id,
                            collider_id: h.collider_id,
                            presentation_target_id: h.presentation_target_id,
                            button: None,
                            local_pos: h.local_pos,
                            uv: h.uv,
                            geometry: Some(h.geometry),
                            delta: *delta,
                            scroll_delta: None,
                            element_id: h.element_id,
                        });
                    }
                }
                state.current_hover = next_target;

                if let Some(h) = &hit {
                    self.events.push(InteractionEvent {
                        interaction_type: InteractionType::Move,
                        window_id: *window_id,
                        pointer_id: *pointer_id,
                        window_position: *position,
                        realm_id: h.realm_id,
                        model_id: h.model_id,
                        collider_id: h.collider_id,
                        presentation_target_id: h.presentation_target_id,
                        button: None,
                        local_pos: h.local_pos,
                        uv: h.uv,
                        geometry: Some(h.geometry),
                        delta: *delta,
                        scroll_delta: None,
                        element_id: h.element_id,
                    });
                }
                for (&button, target) in &state.pressed_targets {
                    let matching_hit = hit.as_ref().filter(|h| {
                        h.realm_id == target.realm_id
                            && h.model_id == target.model_id
                            && h.collider_id == target.collider_id
                            && h.presentation_target_id == target.presentation_target_id
                            && h.element_id == target.element_id
                    });
                    self.events.push(InteractionEvent {
                        interaction_type: InteractionType::PressMove,
                        window_id: *window_id,
                        pointer_id: *pointer_id,
                        window_position: *position,
                        realm_id: target.realm_id,
                        model_id: target.model_id,
                        collider_id: target.collider_id,
                        presentation_target_id: target.presentation_target_id,
                        button: Some(button),
                        local_pos: matching_hit.map_or(*position, |h| h.local_pos),
                        uv: matching_hit.map_or([0.5, 0.5], |h| h.uv),
                        geometry: matching_hit.map(|h| h.geometry),
                        delta: *delta,
                        scroll_delta: None,
                        element_id: target.element_id,
                    });
                }
            }

            InteractionPointerEvent::Button {
                window_id,
                pointer_id,
                position,
                button,
                state: btn_state,
            } => {
                let state = self.pointers.entry((*window_id, *pointer_id)).or_default();
                state.last_position = *position;

                match btn_state {
                    InteractionButtonState::Pressed => {
                        if let Some(h) = hit {
                            let target = InteractionTarget {
                                realm_id: h.realm_id,
                                model_id: h.model_id,
                                collider_id: h.collider_id,
                                presentation_target_id: h.presentation_target_id,
                                element_id: h.element_id,
                            };
                            state.pressed_targets.insert(*button, target);
                            self.events.push(InteractionEvent {
                                interaction_type: InteractionType::Down,
                                window_id: *window_id,
                                pointer_id: *pointer_id,
                                window_position: *position,
                                realm_id: h.realm_id,
                                model_id: h.model_id,
                                collider_id: h.collider_id,
                                presentation_target_id: h.presentation_target_id,
                                button: Some(*button),
                                local_pos: h.local_pos,
                                uv: h.uv,
                                geometry: Some(h.geometry),
                                delta: [0.0, 0.0],
                                scroll_delta: None,
                                element_id: h.element_id,
                            });
                        }
                    }
                    InteractionButtonState::Released => {
                        let pressed = state.pressed_targets.remove(button);
                        if let Some(target) = pressed {
                            let matching_hit = hit.as_ref().filter(|h| {
                                h.realm_id == target.realm_id
                                    && h.model_id == target.model_id
                                    && h.collider_id == target.collider_id
                                    && h.presentation_target_id == target.presentation_target_id
                                    && h.element_id == target.element_id
                            });
                            self.events.push(InteractionEvent {
                                interaction_type: InteractionType::PressUp,
                                window_id: *window_id,
                                pointer_id: *pointer_id,
                                window_position: *position,
                                realm_id: target.realm_id,
                                model_id: target.model_id,
                                collider_id: target.collider_id,
                                presentation_target_id: target.presentation_target_id,
                                button: Some(*button),
                                local_pos: matching_hit.map_or(*position, |h| h.local_pos),
                                uv: matching_hit.map_or([0.5, 0.5], |h| h.uv),
                                geometry: matching_hit.map(|h| h.geometry),
                                delta: [0.0, 0.0],
                                scroll_delta: None,
                                element_id: target.element_id,
                            });
                        }
                        if let Some(h) = hit {
                            self.events.push(InteractionEvent {
                                interaction_type: InteractionType::Up,
                                window_id: *window_id,
                                pointer_id: *pointer_id,
                                window_position: *position,
                                realm_id: h.realm_id,
                                model_id: h.model_id,
                                collider_id: h.collider_id,
                                presentation_target_id: h.presentation_target_id,
                                button: Some(*button),
                                local_pos: h.local_pos,
                                uv: h.uv,
                                geometry: Some(h.geometry),
                                delta: [0.0, 0.0],
                                scroll_delta: None,
                                element_id: h.element_id,
                            });
                            if let Some(pressed_target) = pressed
                                && pressed_target
                                    == (InteractionTarget {
                                        realm_id: h.realm_id,
                                        model_id: h.model_id,
                                        collider_id: h.collider_id,
                                        presentation_target_id: h.presentation_target_id,
                                        element_id: h.element_id,
                                    })
                            {
                                self.events.push(InteractionEvent {
                                    interaction_type: InteractionType::Click,
                                    window_id: *window_id,
                                    pointer_id: *pointer_id,
                                    window_position: *position,
                                    realm_id: h.realm_id,
                                    model_id: h.model_id,
                                    collider_id: h.collider_id,
                                    presentation_target_id: h.presentation_target_id,
                                    button: Some(*button),
                                    local_pos: h.local_pos,
                                    uv: h.uv,
                                    geometry: Some(h.geometry),
                                    delta: [0.0, 0.0],
                                    scroll_delta: None,
                                    element_id: h.element_id,
                                });
                            }
                        }
                    }
                }
            }

            InteractionPointerEvent::Scroll {
                window_id,
                pointer_id,
                position,
                delta,
            } => {
                if let Some(h) = hit {
                    self.events.push(InteractionEvent {
                        interaction_type: InteractionType::Scroll,
                        window_id: *window_id,
                        pointer_id: *pointer_id,
                        window_position: *position,
                        realm_id: h.realm_id,
                        model_id: h.model_id,
                        collider_id: h.collider_id,
                        presentation_target_id: h.presentation_target_id,
                        button: None,
                        local_pos: h.local_pos,
                        uv: h.uv,
                        geometry: Some(h.geometry),
                        delta: [0.0, 0.0],
                        scroll_delta: Some(*delta),
                        element_id: h.element_id,
                    });
                }
            }

            InteractionPointerEvent::Leave {
                window_id,
                pointer_id,
            }
            | InteractionPointerEvent::Cancel {
                window_id,
                pointer_id,
            } => {
                if let Some(state) = self.pointers.remove(&(*window_id, *pointer_id)) {
                    let mut pressed: Vec<_> = state.pressed_targets.into_iter().collect();
                    pressed.sort_by_key(|(button, _)| *button);
                    for (button, target) in pressed {
                        self.events.push(simple_event(
                            InteractionType::Cancel,
                            *window_id,
                            *pointer_id,
                            target,
                            Some(button),
                            state.last_position,
                        ));
                    }
                    if let Some(target) = state.current_hover {
                        self.events.push(simple_event(
                            InteractionType::Leave,
                            *window_id,
                            *pointer_id,
                            target,
                            None,
                            state.last_position,
                        ));
                    }
                }
            }
        }
    }
}

fn simple_event(
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

#[cfg(test)]
#[path = "interaction_tests.rs"]
mod tests;
