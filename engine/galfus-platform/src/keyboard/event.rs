use serde::{Deserialize, Serialize};

use crate::keyboard::types::{KeyCode, KeyState, LogicalKey, ModifiersState};

/// Normalized keyboard input event delivered from the platform.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum KeyboardEvent {
    /// Key transition event with physical keycode, resolved logical key, and modifiers.
    Input {
        /// Logical ID of the window where the key event originated.
        window_id: u32,
        /// Physical key position (layout-independent).
        physical_key: KeyCode,
        /// Resolved logical key value.
        logical_key: LogicalKey,
        /// Text produced by this key press (if any).
        text: Option<String>,
        /// Transition state (Pressed or Released).
        state: KeyState,
        /// Keyboard modifiers active at the time of the event.
        modifiers: ModifiersState,
        /// True if this is an OS auto-repeat event from holding the key down.
        repeat: bool,
    },

    /// Active keyboard modifiers changed (e.g. Shift pressed or released).
    ModifiersChanged {
        /// Logical ID of the window where modifiers changed.
        window_id: u32,
        /// New modifier state.
        modifiers: ModifiersState,
    },
}

impl KeyboardEvent {
    /// Returns the logical window ID associated with this event.
    #[inline]
    pub const fn window_id(&self) -> u32 {
        match *self {
            Self::Input { window_id, .. } | Self::ModifiersChanged { window_id, .. } => window_id,
        }
    }

    /// Returns the active modifiers associated with this event.
    #[inline]
    pub const fn modifiers(&self) -> ModifiersState {
        match *self {
            Self::Input { modifiers, .. } | Self::ModifiersChanged { modifiers, .. } => modifiers,
        }
    }

    /// Returns the key transition state if this is an input event.
    #[inline]
    pub const fn state(&self) -> Option<KeyState> {
        match *self {
            Self::Input { state, .. } => Some(state),
            Self::ModifiersChanged { .. } => None,
        }
    }

    /// Returns `true` if this is a key press event.
    #[inline]
    pub const fn is_pressed(&self) -> bool {
        match *self {
            Self::Input { state, .. } => state.is_pressed(),
            Self::ModifiersChanged { .. } => false,
        }
    }

    /// Returns the physical key code if this is an input event.
    #[inline]
    pub const fn physical_key(&self) -> Option<KeyCode> {
        match *self {
            Self::Input { physical_key, .. } => Some(physical_key),
            Self::ModifiersChanged { .. } => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::PlatformEvent;

    #[test]
    fn test_keyboard_event_accessors() {
        let input_ev = KeyboardEvent::Input {
            window_id: 1,
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
        };

        assert_eq!(input_ev.window_id(), 1);
        assert_eq!(input_ev.physical_key(), Some(KeyCode::KeyW));
        assert_eq!(input_ev.state(), Some(KeyState::Pressed));
        assert!(input_ev.is_pressed());
        assert!(input_ev.modifiers().shift);

        let mods_ev = KeyboardEvent::ModifiersChanged {
            window_id: 2,
            modifiers: ModifiersState::EMPTY,
        };

        assert_eq!(mods_ev.window_id(), 2);
        assert_eq!(mods_ev.physical_key(), None);
        assert_eq!(mods_ev.state(), None);
        assert!(!mods_ev.is_pressed());
        assert!(mods_ev.modifiers().is_empty());
    }

    #[test]
    fn test_keyboard_event_into_platform_event() {
        let ev = KeyboardEvent::ModifiersChanged {
            window_id: 1,
            modifiers: ModifiersState::EMPTY,
        };
        let platform_ev: PlatformEvent = ev.clone().into();
        assert_eq!(platform_ev, PlatformEvent::Keyboard(ev));
    }
}
