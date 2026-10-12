use serde::{Deserialize, Serialize};

use crate::keyboard::KeyboardEvent;
use crate::pointer::PointerEvent;
use crate::window::WindowEvent;

/// Aggregated, normalized platform event delivered to the host.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlatformEvent {
    /// Window lifecycle, dimensions, or state event.
    Window(WindowEvent),

    /// Pointer (mouse, touch, pen, scroll) event.
    Pointer(PointerEvent),

    /// Keyboard (keys, modifiers, text) event.
    Keyboard(KeyboardEvent),
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
        assert!(json_key.contains("\"shift\":true"));

        let deserialized_key: PlatformEvent =
            serde_json::from_str(&json_key).expect("key deserialization failed");
        assert_eq!(key_ev, deserialized_key);
    }
}
