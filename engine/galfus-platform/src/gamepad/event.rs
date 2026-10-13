use serde::{Deserialize, Serialize};

use super::types::{GamepadAxis, GamepadButton, GamepadButtonState};

/// Normalized gamepad input event.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum GamepadEvent {
    /// A new gamepad was connected.
    Connected {
        /// Gamepad logical identifier.
        gamepad_id: u32,
        /// Gamepad name.
        name: String,
    },
    /// A gamepad was disconnected.
    Disconnected {
        /// Gamepad logical identifier.
        gamepad_id: u32,
    },
    /// A gamepad button changed state.
    Button {
        /// Gamepad logical identifier.
        gamepad_id: u32,
        /// Normalized button.
        button: GamepadButton,
        /// Pressed or released.
        state: GamepadButtonState,
    },
    /// A gamepad analog axis changed value.
    Axis {
        /// Gamepad logical identifier.
        gamepad_id: u32,
        /// Normalized axis.
        axis: GamepadAxis,
        /// Normalized axis position (`[-1.0, 1.0]` for sticks, `[0.0, 1.0]` for triggers).
        value: f32,
    },
}

impl GamepadEvent {
    /// Returns the gamepad logical identifier associated with this event.
    #[inline]
    pub const fn gamepad_id(&self) -> u32 {
        match *self {
            Self::Connected { gamepad_id, .. } => gamepad_id,
            Self::Disconnected { gamepad_id } => gamepad_id,
            Self::Button { gamepad_id, .. } => gamepad_id,
            Self::Axis { gamepad_id, .. } => gamepad_id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gamepad_event_accessors() {
        let ev = GamepadEvent::Button {
            gamepad_id: 2,
            button: GamepadButton::South,
            state: GamepadButtonState::Pressed,
        };
        assert_eq!(ev.gamepad_id(), 2);

        let axis_ev = GamepadEvent::Axis {
            gamepad_id: 3,
            axis: GamepadAxis::LeftStickX,
            value: 0.75,
        };
        assert_eq!(axis_ev.gamepad_id(), 3);
    }
}
