use serde::{Deserialize, Serialize};

/// Standard gamepad buttons normalized according to modern dual-stick controllers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GamepadButton {
    /// Bottom action button (South: A on Xbox, Cross on PlayStation, B on Nintendo).
    South,
    /// Right action button (East: B on Xbox, Circle on PlayStation, A on Nintendo).
    East,
    /// Left action button (West: X on Xbox, Square on PlayStation, Y on Nintendo).
    West,
    /// Top action button (North: Y on Xbox, Triangle on PlayStation, X on Nintendo).
    North,
    /// Left bumper / shoulder button (L1 / LB).
    LeftBumper,
    /// Right bumper / shoulder button (R1 / RB).
    RightBumper,
    /// Left trigger button (L2 / LT when evaluated as binary or click).
    LeftTrigger,
    /// Right trigger button (R2 / RT when evaluated as binary or click).
    RightTrigger,
    /// Select / Back / View / Share button.
    Select,
    /// Start / Options / Menu button.
    Start,
    /// Guide / Home / PS / Xbox logo button.
    Guide,
    /// Left thumbstick click (L3).
    LeftThumbstick,
    /// Right thumbstick click (R3).
    RightThumbstick,
    /// Directional pad up.
    DpadUp,
    /// Directional pad down.
    DpadDown,
    /// Directional pad left.
    DpadLeft,
    /// Directional pad right.
    DpadRight,
    /// Vendor-specific or extra button index.
    Other(u16),
}

/// Standard analog axes normalized to `[-1.0, 1.0]` (or `[0.0, 1.0]` for triggers).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GamepadAxis {
    /// Horizontal axis of the left stick (-1.0 = left, 1.0 = right).
    LeftStickX,
    /// Vertical axis of the left stick (-1.0 = down, 1.0 = up).
    LeftStickY,
    /// Horizontal axis of the right stick (-1.0 = left, 1.0 = right).
    RightStickX,
    /// Vertical axis of the right stick (-1.0 = down, 1.0 = up).
    RightStickY,
    /// Left trigger analog pull (0.0 = released, 1.0 = fully pressed).
    LeftTrigger,
    /// Right trigger analog pull (0.0 = released, 1.0 = fully pressed).
    RightTrigger,
    /// Vendor-specific or extra axis index.
    Other(u16),
}

/// Gamepad button state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GamepadButtonState {
    /// The button was pressed down.
    Pressed,
    /// The button was released.
    Released,
}

impl GamepadButtonState {
    /// Returns true if the state is `Pressed`.
    #[inline]
    pub const fn is_pressed(&self) -> bool {
        matches!(self, Self::Pressed)
    }

    /// Returns true if the state is `Released`.
    #[inline]
    pub const fn is_released(&self) -> bool {
        matches!(self, Self::Released)
    }
}

/// High-level information describing a connected gamepad.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamepadInfo {
    /// Logical identifier for the gamepad assigned by the platform.
    pub id: u32,
    /// Human-readable device name reported by the driver/OS.
    pub name: String,
    /// Whether the device supports force-feedback / rumble vibration.
    pub supports_rumble: bool,
}
