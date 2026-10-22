use glam::Vec2;
use serde::{Deserialize, Serialize};

/// Origin and hardware classification of an input pointer.
///
/// Follows the W3C Pointer Events model where mouse, touch contacts,
/// and pen styluses share a single unified abstraction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PointerType {
    /// Traditional desktop mouse or trackpad cursor.
    #[default]
    Mouse,

    /// Direct touch contact on a touchscreen or digitizer.
    Touch,

    /// Stylus or digital pen input, with optional pressure and tilt.
    Pen,
}

/// Normalized pointer button classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PointerButton {
    /// Left mouse button, primary touch contact, or pen tip contact.
    Primary,

    /// Right mouse button or pen barrel / secondary button.
    Secondary,

    /// Middle mouse button.
    Auxiliary,

    /// Browser / navigation "Back" button (X1).
    Back,

    /// Browser / navigation "Forward" button (X2).
    Forward,

    /// Additional hardware button with driver index.
    Other(u16),
}

/// State of a pointer button transition.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PointerButtonState {
    /// The button transitioned to pressed / active.
    Pressed,

    /// The button transitioned to released / inactive.
    Released,
}

impl PointerButtonState {
    /// Returns `true` if the button is pressed.
    #[inline]
    pub const fn is_pressed(self) -> bool {
        matches!(self, Self::Pressed)
    }
}

/// Normalized scroll / wheel movement delta.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScrollDelta {
    /// Scroll delta expressed in logical text lines / notches.
    Lines(Vec2),

    /// Scroll delta expressed in physical display pixels.
    Pixels(Vec2),
}
