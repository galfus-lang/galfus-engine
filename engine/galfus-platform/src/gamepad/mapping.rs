#[cfg(not(target_arch = "wasm32"))]
use gilrs::{Axis as GilrsAxis, Button as GilrsButton};

use super::types::{GamepadAxis, GamepadButton};

/// Maps a `gilrs::Button` to normalized [`GamepadButton`].
#[cfg(not(target_arch = "wasm32"))]
pub fn map_gilrs_button(button: GilrsButton) -> GamepadButton {
    match button {
        GilrsButton::South => GamepadButton::South,
        GilrsButton::East => GamepadButton::East,
        GilrsButton::North => GamepadButton::North,
        GilrsButton::West => GamepadButton::West,
        GilrsButton::C => GamepadButton::Other(1),
        GilrsButton::Z => GamepadButton::Other(2),
        GilrsButton::LeftTrigger => GamepadButton::LeftBumper,
        GilrsButton::RightTrigger => GamepadButton::RightBumper,
        GilrsButton::LeftTrigger2 => GamepadButton::LeftTrigger,
        GilrsButton::RightTrigger2 => GamepadButton::RightTrigger,
        GilrsButton::Select => GamepadButton::Select,
        GilrsButton::Start => GamepadButton::Start,
        GilrsButton::Mode => GamepadButton::Guide,
        GilrsButton::LeftThumb => GamepadButton::LeftThumbstick,
        GilrsButton::RightThumb => GamepadButton::RightThumbstick,
        GilrsButton::DPadUp => GamepadButton::DpadUp,
        GilrsButton::DPadDown => GamepadButton::DpadDown,
        GilrsButton::DPadLeft => GamepadButton::DpadLeft,
        GilrsButton::DPadRight => GamepadButton::DpadRight,
        GilrsButton::Unknown => GamepadButton::Other(0),
    }
}

/// Maps a `gilrs::Axis` to normalized [`GamepadAxis`].
#[cfg(not(target_arch = "wasm32"))]
pub fn map_gilrs_axis(axis: GilrsAxis) -> GamepadAxis {
    match axis {
        GilrsAxis::LeftStickX => GamepadAxis::LeftStickX,
        GilrsAxis::LeftStickY => GamepadAxis::LeftStickY,
        GilrsAxis::RightStickX => GamepadAxis::RightStickX,
        GilrsAxis::RightStickY => GamepadAxis::RightStickY,
        GilrsAxis::LeftZ => GamepadAxis::LeftTrigger,
        GilrsAxis::RightZ => GamepadAxis::RightTrigger,
        GilrsAxis::DPadX => GamepadAxis::Other(1),
        GilrsAxis::DPadY => GamepadAxis::Other(2),
        GilrsAxis::Unknown => GamepadAxis::Other(0),
    }
}

/// Maps a standard W3C Gamepad API button index (0..=16) to normalized [`GamepadButton`].
pub fn map_w3c_button_index(index: u16) -> GamepadButton {
    match index {
        0 => GamepadButton::South,
        1 => GamepadButton::East,
        2 => GamepadButton::West,
        3 => GamepadButton::North,
        4 => GamepadButton::LeftBumper,
        5 => GamepadButton::RightBumper,
        6 => GamepadButton::LeftTrigger,
        7 => GamepadButton::RightTrigger,
        8 => GamepadButton::Select,
        9 => GamepadButton::Start,
        10 => GamepadButton::LeftThumbstick,
        11 => GamepadButton::RightThumbstick,
        12 => GamepadButton::DpadUp,
        13 => GamepadButton::DpadDown,
        14 => GamepadButton::DpadLeft,
        15 => GamepadButton::DpadRight,
        16 => GamepadButton::Guide,
        other => GamepadButton::Other(other),
    }
}

/// Maps a standard W3C Gamepad API axis index (0..=3) to normalized [`GamepadAxis`].
pub fn map_w3c_axis_index(index: u16) -> GamepadAxis {
    match index {
        0 => GamepadAxis::LeftStickX,
        1 => GamepadAxis::LeftStickY,
        2 => GamepadAxis::RightStickX,
        3 => GamepadAxis::RightStickY,
        other => GamepadAxis::Other(other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_w3c_button_mapping() {
        assert_eq!(map_w3c_button_index(0), GamepadButton::South);
        assert_eq!(map_w3c_button_index(1), GamepadButton::East);
        assert_eq!(map_w3c_button_index(9), GamepadButton::Start);
        assert_eq!(map_w3c_button_index(99), GamepadButton::Other(99));
    }

    #[test]
    fn test_w3c_axis_mapping() {
        assert_eq!(map_w3c_axis_index(0), GamepadAxis::LeftStickX);
        assert_eq!(map_w3c_axis_index(1), GamepadAxis::LeftStickY);
        assert_eq!(map_w3c_axis_index(99), GamepadAxis::Other(99));
    }
}
