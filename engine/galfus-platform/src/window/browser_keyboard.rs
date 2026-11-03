//! Keyboard event normalization shared by canvas and IME surfaces.
use crate::keyboard::{KeyCode, KeyState, KeyboardEvent, LogicalKey, ModifiersState};

pub(super) fn map_key(
    window_id: u32,
    event: &web_sys::KeyboardEvent,
    pressed: bool,
) -> KeyboardEvent {
    let code = event.code();
    let mut chars = code.chars();
    let code = chars
        .next()
        .map(|c| c.to_ascii_lowercase().to_string() + chars.as_str())
        .unwrap_or_default();
    let physical_key: KeyCode =
        serde_json::from_value(serde_json::Value::String(code)).unwrap_or_default();
    let key = event.key();
    let logical_key: LogicalKey = serde_json::from_value(serde_json::Value::String(key.clone()))
        .unwrap_or(LogicalKey::Unidentified);
    let text = if pressed && !event.is_composing() && key.chars().count() == 1 {
        Some(key)
    } else {
        None
    };
    KeyboardEvent::Input {
        window_id,
        physical_key,
        logical_key,
        text,
        state: if pressed {
            KeyState::Pressed
        } else {
            KeyState::Released
        },
        modifiers: ModifiersState {
            shift: event.shift_key(),
            ctrl: event.ctrl_key(),
            alt: event.alt_key(),
            super_key: event.meta_key(),
        },
        repeat: event.repeat(),
    }
}
