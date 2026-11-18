use serde::{Deserialize, Serialize};

use crate::gamepad::GamepadEvent;
use crate::keyboard::KeyboardEvent;
use crate::pointer::PointerEvent;
use crate::window::WindowEvent;

/// Aggregated, normalized platform event delivered to the host.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PlatformEvent {
    /// Window lifecycle, dimensions, or state event.
    Window(WindowEvent),

    /// Pointer (mouse, touch, pen, scroll) event.
    Pointer(PointerEvent),

    /// Keyboard (keys, modifiers, text) event.
    Keyboard(KeyboardEvent),

    /// Gamepad (controller connection, button, axis) event.
    Gamepad(GamepadEvent),
}

impl From<WindowEvent> for PlatformEvent {
    #[inline]
    fn from(event: WindowEvent) -> Self {
        Self::Window(event)
    }
}

impl From<PointerEvent> for PlatformEvent {
    #[inline]
    fn from(event: PointerEvent) -> Self {
        Self::Pointer(event)
    }
}

impl From<KeyboardEvent> for PlatformEvent {
    #[inline]
    fn from(event: KeyboardEvent) -> Self {
        Self::Keyboard(event)
    }
}

impl From<GamepadEvent> for PlatformEvent {
    #[inline]
    fn from(event: GamepadEvent) -> Self {
        Self::Gamepad(event)
    }
}

/// Filters out internal redraw notifications and coalesces consecutive high-frequency
/// continuous events (`PointerEvent::Move`, `PointerEvent::Scroll`, `WindowEvent::Resized`,
/// `WindowEvent::Moved`, `GamepadEvent::Axis`) while preserving strict ordering around
/// discrete state transitions (`Button`, `Keyboard`, `FocusChanged`, `CloseRequested`).
pub fn coalesce_platform_events(events: Vec<PlatformEvent>) -> Vec<PlatformEvent> {
    use crate::pointer::ScrollDelta;

    let mut window_events = Vec::new();
    let mut input_events: Vec<PlatformEvent> = Vec::with_capacity(events.len());

    for event in events {
        match event {
            PlatformEvent::Window(WindowEvent::RedrawRequested { .. }) => continue,
            PlatformEvent::Window(win_ev) => {
                match &win_ev {
                    WindowEvent::Resized {
                        window_id,
                        width,
                        height,
                        scale_factor,
                    } => {
                        if let Some(PlatformEvent::Window(WindowEvent::Resized {
                            width: prev_w,
                            height: prev_h,
                            scale_factor: prev_sf,
                            ..
                        })) = window_events.iter_mut().rev().find(
                            |e| matches!(e, PlatformEvent::Window(w) if w.window_id() == *window_id),
                        ) {
                            *prev_w = *width;
                            *prev_h = *height;
                            *prev_sf = *scale_factor;
                            continue;
                        }
                    }
                    WindowEvent::Moved { window_id, x, y } => {
                        if let Some(PlatformEvent::Window(WindowEvent::Moved {
                            x: prev_x,
                            y: prev_y,
                            ..
                        })) = window_events.iter_mut().rev().find(
                            |e| matches!(e, PlatformEvent::Window(w) if w.window_id() == *window_id),
                        ) {
                            *prev_x = *x;
                            *prev_y = *y;
                            continue;
                        }
                    }
                    _ => {}
                }
                window_events.push(PlatformEvent::Window(win_ev));
            }
            PlatformEvent::Pointer(PointerEvent::Move {
                window_id,
                pointer_id,
                pointer_type,
                position,
                delta,
                pressure,
            }) => {
                let mut merged = false;
                if let Some(PlatformEvent::Pointer(PointerEvent::Move {
                    window_id: prev_window,
                    pointer_id: prev_pointer,
                    pointer_type: prev_type,
                    position: prev_pos,
                    delta: prev_delta,
                    pressure: prev_pressure,
                })) = input_events.last_mut()
                    && *prev_window == window_id
                    && *prev_pointer == pointer_id
                {
                    *prev_type = pointer_type;
                    *prev_pos = position;
                    *prev_delta += delta;
                    *prev_pressure = pressure;
                    merged = true;
                }
                if !merged {
                    input_events.push(PlatformEvent::Pointer(PointerEvent::Move {
                        window_id,
                        pointer_id,
                        pointer_type,
                        position,
                        delta,
                        pressure,
                    }));
                }
            }
            PlatformEvent::Pointer(PointerEvent::Scroll {
                window_id,
                pointer_id,
                pointer_type,
                position,
                delta,
            }) => {
                let mut merged = false;
                if let Some(PlatformEvent::Pointer(PointerEvent::Scroll {
                    window_id: prev_window,
                    pointer_id: prev_pointer,
                    position: prev_pos,
                    delta: prev_delta,
                    ..
                })) = input_events.last_mut()
                    && *prev_window == window_id
                    && *prev_pointer == pointer_id
                {
                    match (prev_delta, delta) {
                        (ScrollDelta::Lines(acc), ScrollDelta::Lines(d))
                        | (ScrollDelta::Pixels(acc), ScrollDelta::Pixels(d)) => {
                            *prev_pos = position;
                            *acc += d;
                            merged = true;
                        }
                        _ => {}
                    }
                }
                if !merged {
                    input_events.push(PlatformEvent::Pointer(PointerEvent::Scroll {
                        window_id,
                        pointer_id,
                        pointer_type,
                        position,
                        delta,
                    }));
                }
            }
            PlatformEvent::Gamepad(GamepadEvent::Axis {
                gamepad_id,
                axis,
                value,
            }) => {
                let mut merged = false;
                for prev in input_events.iter_mut().rev() {
                    if let PlatformEvent::Gamepad(prev_gp) = prev
                        && prev_gp.gamepad_id() == gamepad_id
                    {
                        if let GamepadEvent::Axis {
                            axis: prev_axis,
                            value: prev_val,
                            ..
                        } = prev_gp
                            && *prev_axis == axis
                        {
                            *prev_val = value;
                            merged = true;
                            break;
                        }
                        if matches!(
                            prev_gp,
                            GamepadEvent::Button { .. } | GamepadEvent::Disconnected { .. }
                        ) {
                            break;
                        }
                    }
                }
                if !merged {
                    input_events.push(PlatformEvent::Gamepad(GamepadEvent::Axis {
                        gamepad_id,
                        axis,
                        value,
                    }));
                }
            }
            other => input_events.push(other),
        }
    }

    window_events.extend(input_events);
    window_events
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keyboard::{KeyCode, KeyState, LogicalKey, ModifiersState};
    use crate::pointer::{PointerButton, PointerButtonState, PointerType};
    use glam::Vec2;

    #[test]
    fn test_serde_camel_case_serialization() {
        let pointer_ev = PlatformEvent::Pointer(PointerEvent::Button {
            window_id: 1,
            pointer_id: 0,
            pointer_type: PointerType::Mouse,
            position: Vec2::new(100.0, 200.0),
            button: PointerButton::Primary,
            state: PointerButtonState::Pressed,
            pressure: 0.5,
        });

        let json = serde_json::to_string(&pointer_ev).expect("serialization failed");
        assert!(json.contains("\"windowId\":1"));
        assert!(json.contains("\"pointerType\":\"mouse\""));
        assert!(json.contains("\"button\":\"primary\""));

        let deserialized: PlatformEvent =
            serde_json::from_str(&json).expect("deserialization failed");
        assert_eq!(pointer_ev, deserialized);

        let key_ev = PlatformEvent::Keyboard(KeyboardEvent::Input {
            window_id: 2,
            physical_key: KeyCode::KeyW,
            logical_key: LogicalKey::Character("w".into()),
            text: Some("w".into()),
            state: KeyState::Pressed,
            modifiers: ModifiersState {
                shift: true,
                ctrl: false,
                alt: false,
                super_key: false,
            },
            repeat: false,
        });

        let json_key = serde_json::to_string(&key_ev).expect("key serialization failed");
        assert!(json_key.contains("\"physicalKey\":\"keyW\""));
        assert!(json_key.contains("\"logicalKey\":\"w\""));
        assert!(json_key.contains("\"shift\":true"));

        let deserialized_key: PlatformEvent =
            serde_json::from_str(&json_key).expect("key deserialization failed");
        assert_eq!(key_ev, deserialized_key);

        let named_key_ev = PlatformEvent::Keyboard(KeyboardEvent::Input {
            window_id: 2,
            physical_key: KeyCode::Escape,
            logical_key: LogicalKey::Named(crate::keyboard::NamedKey::Escape),
            text: None,
            state: KeyState::Pressed,
            modifiers: ModifiersState::EMPTY,
            repeat: false,
        });

        let json_named =
            serde_json::to_string(&named_key_ev).expect("named key serialization failed");
        assert!(json_named.contains("\"physicalKey\":\"escape\""));
        assert!(json_named.contains("\"logicalKey\":\"Escape\""));

        let deserialized_named: PlatformEvent =
            serde_json::from_str(&json_named).expect("named key deserialization failed");
        assert_eq!(named_key_ev, deserialized_named);
    }

    #[test]
    fn test_coalesce_platform_events_merges_moves_and_preserves_button_boundaries() {
        use crate::pointer::ScrollDelta;

        let raw = vec![
            PlatformEvent::Window(WindowEvent::RedrawRequested { window_id: 1 }),
            PlatformEvent::Pointer(PointerEvent::Move {
                window_id: 1,
                pointer_id: 0,
                pointer_type: PointerType::Mouse,
                position: Vec2::new(10.0, 20.0),
                delta: Vec2::new(2.0, 3.0),
                pressure: 0.0,
            }),
            PlatformEvent::Pointer(PointerEvent::Move {
                window_id: 1,
                pointer_id: 0,
                pointer_type: PointerType::Mouse,
                position: Vec2::new(15.0, 25.0),
                delta: Vec2::new(5.0, 5.0),
                pressure: 0.0,
            }),
            PlatformEvent::Pointer(PointerEvent::Button {
                window_id: 1,
                pointer_id: 0,
                pointer_type: PointerType::Mouse,
                position: Vec2::new(15.0, 25.0),
                button: PointerButton::Primary,
                state: PointerButtonState::Pressed,
                pressure: 0.5,
            }),
            PlatformEvent::Pointer(PointerEvent::Move {
                window_id: 1,
                pointer_id: 0,
                pointer_type: PointerType::Mouse,
                position: Vec2::new(30.0, 40.0),
                delta: Vec2::new(15.0, 15.0),
                pressure: 0.5,
            }),
            PlatformEvent::Pointer(PointerEvent::Scroll {
                window_id: 1,
                pointer_id: 0,
                pointer_type: PointerType::Mouse,
                position: Vec2::new(30.0, 40.0),
                delta: ScrollDelta::Lines(Vec2::new(0.0, 1.0)),
            }),
            PlatformEvent::Pointer(PointerEvent::Scroll {
                window_id: 1,
                pointer_id: 0,
                pointer_type: PointerType::Mouse,
                position: Vec2::new(30.0, 40.0),
                delta: ScrollDelta::Lines(Vec2::new(0.0, 2.0)),
            }),
        ];

        let coalesced = coalesce_platform_events(raw);
        assert_eq!(coalesced.len(), 4);
        assert_eq!(
            coalesced[0],
            PlatformEvent::Pointer(PointerEvent::Move {
                window_id: 1,
                pointer_id: 0,
                pointer_type: PointerType::Mouse,
                position: Vec2::new(15.0, 25.0),
                delta: Vec2::new(7.0, 8.0),
                pressure: 0.0,
            })
        );
        assert!(matches!(
            coalesced[1],
            PlatformEvent::Pointer(PointerEvent::Button { .. })
        ));
        assert!(matches!(
            coalesced[2],
            PlatformEvent::Pointer(PointerEvent::Move { .. })
        ));
        assert_eq!(
            coalesced[3],
            PlatformEvent::Pointer(PointerEvent::Scroll {
                window_id: 1,
                pointer_id: 0,
                pointer_type: PointerType::Mouse,
                position: Vec2::new(30.0, 40.0),
                delta: ScrollDelta::Lines(Vec2::new(0.0, 3.0)),
            })
        );
    }
    #[test]
    fn coalescing_preserves_order_across_windows() {
        let move_event = |window_id| {
            PlatformEvent::Pointer(PointerEvent::Move {
                window_id,
                pointer_id: 1,
                pointer_type: PointerType::Mouse,
                position: Vec2::ZERO,
                delta: Vec2::ZERO,
                pressure: 0.0,
            })
        };
        let events = coalesce_platform_events(vec![move_event(43), move_event(42), move_event(43)]);
        let ids: Vec<_> = events
            .iter()
            .filter_map(|event| match event {
                PlatformEvent::Pointer(pointer) => Some(pointer.window_id()),
                _ => None,
            })
            .collect();
        assert_eq!(ids, [43, 42, 43]);
    }
}
