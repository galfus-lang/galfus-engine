use glam::Vec2;
use winit::event::{ElementState, Force, MouseButton, MouseScrollDelta, Touch, TouchPhase};

use crate::pointer::event::PointerEvent;
use crate::pointer::types::{PointerButton, PointerButtonState, PointerType, ScrollDelta};

/// Converts a winit `MouseButton` to a normalized `PointerButton`.
#[inline]
pub const fn map_mouse_button(button: MouseButton) -> PointerButton {
    match button {
        MouseButton::Left => PointerButton::Primary,
        MouseButton::Right => PointerButton::Secondary,
        MouseButton::Middle => PointerButton::Auxiliary,
        MouseButton::Back => PointerButton::Back,
        MouseButton::Forward => PointerButton::Forward,
        MouseButton::Other(c) => PointerButton::Other(c),
    }
}

/// Converts a winit `ElementState` to a normalized `PointerButtonState` and default pressure.
#[inline]
pub const fn map_button_state(state: ElementState) -> (PointerButtonState, f32) {
    match state {
        ElementState::Pressed => (PointerButtonState::Pressed, 0.5),
        ElementState::Released => (PointerButtonState::Released, 0.0),
    }
}

/// Converts a winit `MouseScrollDelta` to a normalized `ScrollDelta`.
#[inline]
pub fn map_scroll_delta(delta: MouseScrollDelta) -> ScrollDelta {
    match delta {
        MouseScrollDelta::LineDelta(x, y) => ScrollDelta::Lines(Vec2::new(x, y)),
        MouseScrollDelta::PixelDelta(pos) => {
            ScrollDelta::Pixels(Vec2::new(pos.x as f32, pos.y as f32))
        }
    }
}

/// Extracts normalized contact pressure from a winit touch event force.
#[inline]
pub fn extract_touch_pressure(force: Option<Force>, phase: TouchPhase) -> f32 {
    match force {
        Some(Force::Normalized(f)) => (f as f32).clamp(0.0, 1.0),
        Some(Force::Calibrated {
            force,
            max_possible_force,
            ..
        }) if max_possible_force > 0.0 => ((force / max_possible_force) as f32).clamp(0.0, 1.0),

        _ => match phase {
            TouchPhase::Started | TouchPhase::Moved => 1.0,
            TouchPhase::Ended | TouchPhase::Cancelled => 0.0,
        },
    }
}

/// Translates a winit `Touch` event into one or two normalized `PointerEvent`s.
pub fn map_touch_event(window_id: u32, touch: &Touch, prev_pos: Option<Vec2>) -> Vec<PointerEvent> {
    let pointer_id = touch.id;
    let position = Vec2::new(touch.location.x as f32, touch.location.y as f32);
    let pressure = extract_touch_pressure(touch.force, touch.phase);

    match touch.phase {
        TouchPhase::Started => vec![
            PointerEvent::Enter {
                window_id,
                pointer_id,
                pointer_type: PointerType::Touch,
                position,
            },
            PointerEvent::Button {
                window_id,
                pointer_id,
                pointer_type: PointerType::Touch,
                position,
                button: PointerButton::Primary,
                state: PointerButtonState::Pressed,
                pressure,
            },
        ],
        TouchPhase::Moved => {
            let delta = match prev_pos {
                Some(prev) => position - prev,
                None => Vec2::ZERO,
            };
            vec![PointerEvent::Move {
                window_id,
                pointer_id,
                pointer_type: PointerType::Touch,
                position,
                delta,
                pressure,
            }]
        }
        TouchPhase::Ended => vec![
            PointerEvent::Button {
                window_id,
                pointer_id,
                pointer_type: PointerType::Touch,
                position,
                button: PointerButton::Primary,
                state: PointerButtonState::Released,
                pressure: 0.0,
            },
            PointerEvent::Leave {
                window_id,
                pointer_id,
                pointer_type: PointerType::Touch,
                position,
            },
        ],
        TouchPhase::Cancelled => vec![PointerEvent::Cancel {
            window_id,
            pointer_id,
            pointer_type: PointerType::Touch,
            position,
        }],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_mouse_button() {
        assert_eq!(map_mouse_button(MouseButton::Left), PointerButton::Primary);
        assert_eq!(
            map_mouse_button(MouseButton::Right),
            PointerButton::Secondary
        );
        assert_eq!(
            map_mouse_button(MouseButton::Middle),
            PointerButton::Auxiliary
        );
        assert_eq!(map_mouse_button(MouseButton::Back), PointerButton::Back);
        assert_eq!(
            map_mouse_button(MouseButton::Forward),
            PointerButton::Forward
        );
        assert_eq!(
            map_mouse_button(MouseButton::Other(99)),
            PointerButton::Other(99)
        );
    }

    #[test]
    fn test_map_button_state() {
        let (state_pressed, pressure_pressed) = map_button_state(ElementState::Pressed);
        assert_eq!(state_pressed, PointerButtonState::Pressed);
        assert_eq!(pressure_pressed, 0.5);

        let (state_released, pressure_released) = map_button_state(ElementState::Released);
        assert_eq!(state_released, PointerButtonState::Released);
        assert_eq!(pressure_released, 0.0);
    }

    #[test]
    fn test_map_scroll_delta() {
        let lines = map_scroll_delta(MouseScrollDelta::LineDelta(1.0, -2.0));
        assert_eq!(lines, ScrollDelta::Lines(Vec2::new(1.0, -2.0)));

        let pixels = map_scroll_delta(MouseScrollDelta::PixelDelta(
            winit::dpi::PhysicalPosition::new(15.0, 30.0),
        ));
        assert_eq!(pixels, ScrollDelta::Pixels(Vec2::new(15.0, 30.0)));
    }

    #[test]
    fn test_extract_touch_pressure() {
        let norm = extract_touch_pressure(Some(Force::Normalized(0.75)), TouchPhase::Moved);
        assert_eq!(norm, 0.75);

        let calib = extract_touch_pressure(
            Some(Force::Calibrated {
                force: 15.0,
                max_possible_force: 30.0,
                altitude_angle: None,
            }),
            TouchPhase::Moved,
        );
        assert_eq!(calib, 0.5);

        let fallback_active = extract_touch_pressure(None, TouchPhase::Started);
        assert_eq!(fallback_active, 1.0);

        let fallback_inactive = extract_touch_pressure(None, TouchPhase::Ended);
        assert_eq!(fallback_inactive, 0.0);
    }
}
