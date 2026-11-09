//! Central Multiverse interaction routing, pointer tracking, and model picking engine.

use std::collections::HashMap;

use galfus_realm_core::collision::Ray3D;
use galfus_realm_core::types::RealmKind;
use glam::{Vec2, Vec3};
use serde::{Deserialize, Serialize};

use crate::types::TargetKind;

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
    /// Pointer cancelled or window blurred.
    Cancel,
    /// Mouse wheel scrolled over model.
    Scroll,
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
    /// Realm containing the model.
    pub realm_id: u32,
    /// Logical model identifier.
    pub model_id: u32,
    /// Logical collider identifier.
    pub collider_id: u32,
    /// Active pointer button if applicable.
    pub button: Option<u32>,
    /// Hit point in model/world local coordinates.
    pub local_pos: [f32; 2],
    /// Normalized surface UV coordinate `[0..1, 0..1]`.
    pub uv: [f32; 2],
    /// Movement delta.
    pub delta: [f32; 2],
    /// Scroll delta if applicable.
    pub scroll_delta: Option<[f32; 2]>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct HitTarget {
    realm_id: u32,
    model_id: u32,
    collider_id: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct PickHit {
    realm_id: u32,
    model_id: u32,
    collider_id: u32,
    local_pos: [f32; 2],
    uv: [f32; 2],
}

#[derive(Debug, Default)]
struct PointerState {
    current_hover: Option<HitTarget>,
    pressed_targets: HashMap<u32, HitTarget>,
}

/// Multiverse subsystem managing pointer hit tests and interaction dispatch.
#[derive(Default)]
pub struct MultiverseInteractionSystem {
    pointers: HashMap<(u32, u64), PointerState>,
    events: Vec<InteractionEvent>,
}

impl MultiverseInteractionSystem {
    /// Creates a new interaction manager.
    pub fn new() -> Self {
        Self::default()
    }

    /// Drains all accumulated interaction events.
    pub fn poll_events(&mut self) -> Vec<InteractionEvent> {
        std::mem::take(&mut self.events)
    }

    /// Evaluates a platform pointer event, performing picking and enqueuing interaction events.
    pub fn handle_event(
        &mut self,
        event: &InteractionPointerEvent,
        window_sizes: &HashMap<u32, glam::UVec2>,
        targets: &HashMap<u32, crate::types::TargetDesc>,
        invocations: &HashMap<u32, crate::types::InvocationDesc>,
        realms: &HashMap<u32, Box<dyn galfus_realm_core::Realm>>,
    ) {
        match event {
            InteractionPointerEvent::Move {
                window_id,
                pointer_id,
                position,
                delta,
            } => {
                let hit = self.pick_window(
                    *window_id,
                    Vec2::from(*position),
                    window_sizes,
                    targets,
                    invocations,
                    realms,
                );
                let state = self.pointers.entry((*window_id, *pointer_id)).or_default();
                let next_target = hit.as_ref().map(|h| HitTarget {
                    realm_id: h.realm_id,
                    model_id: h.model_id,
                    collider_id: h.collider_id,
                });

                let prev_model = state.current_hover.map(|t| (t.realm_id, t.model_id));
                let next_model = hit.as_ref().map(|h| (h.realm_id, h.model_id));

                if prev_model != next_model {
                    if let Some(prev) = state.current_hover {
                        self.events.push(InteractionEvent {
                            interaction_type: InteractionType::Leave,
                            window_id: *window_id,
                            pointer_id: *pointer_id,
                            realm_id: prev.realm_id,
                            model_id: prev.model_id,
                            collider_id: prev.collider_id,
                            button: None,
                            local_pos: *position,
                            uv: [0.5, 0.5],
                            delta: *delta,
                            scroll_delta: None,
                        });
                    }
                    if let Some(h) = &hit {
                        self.events.push(InteractionEvent {
                            interaction_type: InteractionType::Hover,
                            window_id: *window_id,
                            pointer_id: *pointer_id,
                            realm_id: h.realm_id,
                            model_id: h.model_id,
                            collider_id: h.collider_id,
                            button: None,
                            local_pos: h.local_pos,
                            uv: h.uv,
                            delta: *delta,
                            scroll_delta: None,
                        });
                    }
                }
                state.current_hover = next_target;

                if let Some(h) = &hit {
                    self.events.push(InteractionEvent {
                        interaction_type: InteractionType::Move,
                        window_id: *window_id,
                        pointer_id: *pointer_id,
                        realm_id: h.realm_id,
                        model_id: h.model_id,
                        collider_id: h.collider_id,
                        button: None,
                        local_pos: h.local_pos,
                        uv: h.uv,
                        delta: *delta,
                        scroll_delta: None,
                    });

                    if !state.pressed_targets.is_empty() {
                        self.events.push(InteractionEvent {
                            interaction_type: InteractionType::PressMove,
                            window_id: *window_id,
                            pointer_id: *pointer_id,
                            realm_id: h.realm_id,
                            model_id: h.model_id,
                            collider_id: h.collider_id,
                            button: None,
                            local_pos: h.local_pos,
                            uv: h.uv,
                            delta: *delta,
                            scroll_delta: None,
                        });
                    }
                }
            }

            InteractionPointerEvent::Button {
                window_id,
                pointer_id,
                position,
                button,
                state: btn_state,
            } => {
                let hit = self.pick_window(
                    *window_id,
                    Vec2::from(*position),
                    window_sizes,
                    targets,
                    invocations,
                    realms,
                );
                let state = self.pointers.entry((*window_id, *pointer_id)).or_default();

                match btn_state {
                    InteractionButtonState::Pressed => {
                        if let Some(h) = hit {
                            let target = HitTarget {
                                realm_id: h.realm_id,
                                model_id: h.model_id,
                                collider_id: h.collider_id,
                            };
                            state.pressed_targets.insert(*button, target);
                            self.events.push(InteractionEvent {
                                interaction_type: InteractionType::Down,
                                window_id: *window_id,
                                pointer_id: *pointer_id,
                                realm_id: h.realm_id,
                                model_id: h.model_id,
                                collider_id: h.collider_id,
                                button: Some(*button),
                                local_pos: h.local_pos,
                                uv: h.uv,
                                delta: [0.0, 0.0],
                                scroll_delta: None,
                            });
                        }
                    }
                    InteractionButtonState::Released => {
                        let pressed = state.pressed_targets.remove(button);
                        if let Some(h) = hit {
                            self.events.push(InteractionEvent {
                                interaction_type: InteractionType::Up,
                                window_id: *window_id,
                                pointer_id: *pointer_id,
                                realm_id: h.realm_id,
                                model_id: h.model_id,
                                collider_id: h.collider_id,
                                button: Some(*button),
                                local_pos: h.local_pos,
                                uv: h.uv,
                                delta: [0.0, 0.0],
                                scroll_delta: None,
                            });
                            if let Some(pressed_target) = pressed
                                && pressed_target.model_id == h.model_id
                            {
                                self.events.push(InteractionEvent {
                                    interaction_type: InteractionType::Click,
                                    window_id: *window_id,
                                    pointer_id: *pointer_id,
                                    realm_id: h.realm_id,
                                    model_id: h.model_id,
                                    collider_id: h.collider_id,
                                    button: Some(*button),
                                    local_pos: h.local_pos,
                                    uv: h.uv,
                                    delta: [0.0, 0.0],
                                    scroll_delta: None,
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
                if let Some(h) = self.pick_window(
                    *window_id,
                    Vec2::from(*position),
                    window_sizes,
                    targets,
                    invocations,
                    realms,
                ) {
                    self.events.push(InteractionEvent {
                        interaction_type: InteractionType::Scroll,
                        window_id: *window_id,
                        pointer_id: *pointer_id,
                        realm_id: h.realm_id,
                        model_id: h.model_id,
                        collider_id: h.collider_id,
                        button: None,
                        local_pos: h.local_pos,
                        uv: h.uv,
                        delta: [0.0, 0.0],
                        scroll_delta: Some(*delta),
                    });
                }
            }

            InteractionPointerEvent::Leave {
                window_id,
                pointer_id,
            } => {
                if let Some(mut state) = self.pointers.remove(&(*window_id, *pointer_id))
                    && let Some(prev) = state.current_hover.take()
                {
                    self.events.push(InteractionEvent {
                        interaction_type: InteractionType::Leave,
                        window_id: *window_id,
                        pointer_id: *pointer_id,
                        realm_id: prev.realm_id,
                        model_id: prev.model_id,
                        collider_id: prev.collider_id,
                        button: None,
                        local_pos: [0.0, 0.0],
                        uv: [0.5, 0.5],
                        delta: [0.0, 0.0],
                        scroll_delta: None,
                    });
                }
            }
        }
    }

    fn pick_window(
        &self,
        window_id: u32,
        pos: Vec2,
        window_sizes: &HashMap<u32, glam::UVec2>,
        targets: &HashMap<u32, crate::types::TargetDesc>,
        invocations: &HashMap<u32, crate::types::InvocationDesc>,
        realms: &HashMap<u32, Box<dyn galfus_realm_core::Realm>>,
    ) -> Option<PickHit> {
        let win_size = window_sizes
            .get(&window_id)
            .copied()
            .unwrap_or(glam::uvec2(800, 600));

        let mut candidate_invs: Vec<&crate::types::InvocationDesc> = invocations
            .values()
            .filter(|inv| {
                if !inv.enabled {
                    return false;
                }
                if let Some(target) = targets.get(&inv.target_id)
                    && let TargetKind::Window {
                        window_id: target_win,
                    } = target.kind
                {
                    target_win == window_id
                } else {
                    false
                }
            })
            .collect();

        // Sort descending by z_index so top-most invocations are hit-tested first
        candidate_invs.sort_by_key(|a| std::cmp::Reverse(a.z_index));

        for inv in candidate_invs {
            let vp = inv.viewport.resolve(win_size);
            let (vx, vy, vw, vh) = (vp.x as f32, vp.y as f32, vp.z as f32, vp.w as f32);

            if pos.x >= vx && pos.x <= (vx + vw) && pos.y >= vy && pos.y <= (vy + vh) {
                let local_x = pos.x - vx;
                let local_y = pos.y - vy;

                if let Some(realm) = realms.get(&inv.realm_id) {
                    match realm.kind() {
                        RealmKind::TwoD => {
                            let world_x = local_x - vw * 0.5;
                            let world_y = vh * 0.5 - local_y;
                            if let Some(hit) =
                                realm.pick_2d(inv.camera_slot, Vec2::new(world_x, world_y))
                            {
                                return Some(PickHit {
                                    realm_id: inv.realm_id,
                                    model_id: hit.model_id,
                                    collider_id: hit.collider_id,
                                    local_pos: [hit.point.x, hit.point.y],
                                    uv: [hit.uv.x, hit.uv.y],
                                });
                            }
                        }
                        RealmKind::ThreeD => {
                            let ndc_x = (local_x / vw) * 2.0 - 1.0;
                            let ndc_y = 1.0 - (local_y / vh) * 2.0;
                            let ray = Ray3D::new(
                                Vec3::new(ndc_x * 10.0, ndc_y * 10.0, -10.0),
                                Vec3::new(0.0, 0.0, 1.0),
                            );
                            if let Some(hit) = realm.pick_3d(inv.camera_slot, ray) {
                                return Some(PickHit {
                                    realm_id: inv.realm_id,
                                    model_id: hit.model_id,
                                    collider_id: hit.collider_id,
                                    local_pos: [hit.point.x, hit.point.y],
                                    uv: [hit.uv.x, hit.uv.y],
                                });
                            }
                        }
                        _ => {}
                    }
                }
            }
        }

        None
    }
}
