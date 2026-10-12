use glam::Vec2;
use serde::{Deserialize, Serialize};

use crate::pointer::types::{PointerButton, PointerButtonState, PointerType, ScrollDelta};

/// Normalized pointer event representing mouse, touch, or pen interactions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum PointerEvent {
    /// Pointer changed coordinates within the target surface.
    Move {
        /// Logical ID of the window where the event occurred.
        window_id: u32,
        /// Unique identifier for this pointer contact (0 for primary mouse).
        pointer_id: u64,
        /// Type of pointing device.
        pointer_type: PointerType,
        /// Current surface position in logical pixels.
        position: Vec2,
        /// Positional movement delta since the last recorded position.
        delta: Vec2,
        /// Contact pressure in range `[0.0, 1.0]`. Defaults to `0.5` for mouse click, `0.0` when hovering.
        pressure: f32,
    },

    /// Pointer button was pressed or released.
    Button {
        /// Logical ID of the window where the event occurred.
        window_id: u32,
        /// Unique identifier for this pointer contact.
        pointer_id: u64,
        /// Type of pointing device.
        pointer_type: PointerType,
        /// Current surface position at button transition time.
        position: Vec2,
        /// Button that changed state.
        button: PointerButton,
        /// New state of the button.
        state: PointerButtonState,
        /// Contact pressure in range `[0.0, 1.0]`.
        pressure: f32,
    },

    /// Pointer entered the window boundary.
    Enter {
        /// Logical ID of the window entered.
        window_id: u32,
        /// Unique identifier for this pointer contact.
        pointer_id: u64,
        /// Type of pointing device.
        pointer_type: PointerType,
        /// Position upon entry.
        position: Vec2,
    },

    /// Pointer left the window boundary.
    Leave {
        /// Logical ID of the window exited.
        window_id: u32,
        /// Unique identifier for this pointer contact.
        pointer_id: u64,
        /// Type of pointing device.
        pointer_type: PointerType,
        /// Position upon exit.
        position: Vec2,
    },

    /// Pointer interaction was interrupted or cancelled (e.g. system gesture takeover).
    Cancel {
        /// Logical ID of the window where cancellation occurred.
        window_id: u32,
        /// Unique identifier for this pointer contact.
        pointer_id: u64,
        /// Type of pointing device.
        pointer_type: PointerType,
        /// Position at cancellation.
        position: Vec2,
    },

    /// Pointer wheel or touchpad scroll delta.
    Scroll {
        /// Logical ID of the window scrolled over.
        window_id: u32,
        /// Unique identifier for this pointer contact.
        pointer_id: u64,
        /// Type of pointing device.
        pointer_type: PointerType,
        /// Position where the scroll event originated.
        position: Vec2,
        /// Scroll delta in lines or pixels.
        delta: ScrollDelta,
    },
}

impl PointerEvent {
    /// Returns the logical window ID associated with this pointer event.
    #[inline]
    pub const fn window_id(&self) -> u32 {
        match *self {
            Self::Move { window_id, .. }
            | Self::Button { window_id, .. }
            | Self::Enter { window_id, .. }
            | Self::Leave { window_id, .. }
            | Self::Cancel { window_id, .. }
            | Self::Scroll { window_id, .. } => window_id,
        }
    }

    /// Returns the unique contact pointer ID.
    #[inline]
    pub const fn pointer_id(&self) -> u64 {
        match *self {
            Self::Move { pointer_id, .. }
            | Self::Button { pointer_id, .. }
            | Self::Enter { pointer_id, .. }
            | Self::Leave { pointer_id, .. }
            | Self::Cancel { pointer_id, .. }
            | Self::Scroll { pointer_id, .. } => pointer_id,
        }
    }

    /// Returns the pointer hardware type.
    #[inline]
    pub const fn pointer_type(&self) -> PointerType {
        match *self {
            Self::Move { pointer_type, .. }
            | Self::Button { pointer_type, .. }
            | Self::Enter { pointer_type, .. }
            | Self::Leave { pointer_type, .. }
            | Self::Cancel { pointer_type, .. }
            | Self::Scroll { pointer_type, .. } => pointer_type,
        }
    }

    /// Returns the surface position of the pointer event.
    #[inline]
    pub const fn position(&self) -> Vec2 {
        match *self {
            Self::Move { position, .. }
            | Self::Button { position, .. }
            | Self::Enter { position, .. }
            | Self::Leave { position, .. }
            | Self::Cancel { position, .. }
            | Self::Scroll { position, .. } => position,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::PlatformEvent;

    #[test]
    fn test_pointer_event_accessors() {
        let pos = Vec2::new(100.0, 200.0);
        let delta = Vec2::new(5.0, -3.0);
        let move_ev = PointerEvent::Move {
            window_id: 1,
            pointer_id: 0,
            pointer_type: PointerType::Mouse,
            position: pos,
            delta,
            pressure: 0.5,
        };
        assert_eq!(move_ev.window_id(), 1);
        assert_eq!(move_ev.pointer_id(), 0);
        assert_eq!(move_ev.pointer_type(), PointerType::Mouse);
        assert_eq!(move_ev.position(), pos);

        let button_ev = PointerEvent::Button {
            window_id: 2,
            pointer_id: 1,
            pointer_type: PointerType::Touch,
            position: pos,
            button: PointerButton::Primary,
            state: PointerButtonState::Pressed,
            pressure: 1.0,
        };
        assert_eq!(button_ev.window_id(), 2);
        assert_eq!(button_ev.pointer_id(), 1);
        assert_eq!(button_ev.pointer_type(), PointerType::Touch);
        assert_eq!(button_ev.position(), pos);

        let enter_ev = PointerEvent::Enter {
            window_id: 3,
            pointer_id: 2,
            pointer_type: PointerType::Pen,
            position: pos,
        };
        assert_eq!(enter_ev.window_id(), 3);
        assert_eq!(enter_ev.pointer_id(), 2);
        assert_eq!(enter_ev.pointer_type(), PointerType::Pen);

        let leave_ev = PointerEvent::Leave {
            window_id: 4,
            pointer_id: 0,
            pointer_type: PointerType::Mouse,
            position: pos,
        };
        assert_eq!(leave_ev.window_id(), 4);

        let cancel_ev = PointerEvent::Cancel {
            window_id: 5,
            pointer_id: 1,
            pointer_type: PointerType::Touch,
            position: pos,
        };
        assert_eq!(cancel_ev.window_id(), 5);

        let scroll_ev = PointerEvent::Scroll {
            window_id: 6,
            pointer_id: 0,
            pointer_type: PointerType::Mouse,
            position: pos,
            delta: ScrollDelta::Lines(Vec2::new(0.0, 1.0)),
        };
        assert_eq!(scroll_ev.window_id(), 6);
    }

    #[test]
    fn test_pointer_event_into_platform_event() {
        let ev = PointerEvent::Move {
            window_id: 1,
            pointer_id: 0,
            pointer_type: PointerType::Mouse,
            position: Vec2::ZERO,
            delta: Vec2::ZERO,
            pressure: 0.0,
        };
        let platform_ev: PlatformEvent = ev.clone().into();
        assert_eq!(platform_ev, PlatformEvent::Pointer(ev));
    }
}
