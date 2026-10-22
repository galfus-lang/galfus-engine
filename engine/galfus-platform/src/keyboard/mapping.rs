use winit::event::ElementState;
use winit::keyboard::{
    Key as WinitKey, KeyCode as WinitKeyCode, ModifiersState as WinitModifiersState,
    NamedKey as WinitNamedKey, PhysicalKey as WinitPhysicalKey,
};

use crate::keyboard::types::{KeyCode, KeyState, LogicalKey, ModifiersState, NamedKey};

/// Maps a winit `PhysicalKey` to a normalized `KeyCode`.
pub fn map_physical_key(key: WinitPhysicalKey) -> KeyCode {
    match key {
        WinitPhysicalKey::Code(code) => match code {
            WinitKeyCode::KeyA => KeyCode::KeyA,
            WinitKeyCode::KeyB => KeyCode::KeyB,
            WinitKeyCode::KeyC => KeyCode::KeyC,
            WinitKeyCode::KeyD => KeyCode::KeyD,
            WinitKeyCode::KeyE => KeyCode::KeyE,
            WinitKeyCode::KeyF => KeyCode::KeyF,
            WinitKeyCode::KeyG => KeyCode::KeyG,
            WinitKeyCode::KeyH => KeyCode::KeyH,
            WinitKeyCode::KeyI => KeyCode::KeyI,
            WinitKeyCode::KeyJ => KeyCode::KeyJ,
            WinitKeyCode::KeyK => KeyCode::KeyK,
            WinitKeyCode::KeyL => KeyCode::KeyL,
            WinitKeyCode::KeyM => KeyCode::KeyM,
            WinitKeyCode::KeyN => KeyCode::KeyN,
            WinitKeyCode::KeyO => KeyCode::KeyO,
            WinitKeyCode::KeyP => KeyCode::KeyP,
            WinitKeyCode::KeyQ => KeyCode::KeyQ,
            WinitKeyCode::KeyR => KeyCode::KeyR,
            WinitKeyCode::KeyS => KeyCode::KeyS,
            WinitKeyCode::KeyT => KeyCode::KeyT,
            WinitKeyCode::KeyU => KeyCode::KeyU,
            WinitKeyCode::KeyV => KeyCode::KeyV,
            WinitKeyCode::KeyW => KeyCode::KeyW,
            WinitKeyCode::KeyX => KeyCode::KeyX,
            WinitKeyCode::KeyY => KeyCode::KeyY,
            WinitKeyCode::KeyZ => KeyCode::KeyZ,

            WinitKeyCode::Digit0 => KeyCode::Digit0,
            WinitKeyCode::Digit1 => KeyCode::Digit1,
            WinitKeyCode::Digit2 => KeyCode::Digit2,
            WinitKeyCode::Digit3 => KeyCode::Digit3,
            WinitKeyCode::Digit4 => KeyCode::Digit4,
            WinitKeyCode::Digit5 => KeyCode::Digit5,
            WinitKeyCode::Digit6 => KeyCode::Digit6,
            WinitKeyCode::Digit7 => KeyCode::Digit7,
            WinitKeyCode::Digit8 => KeyCode::Digit8,
            WinitKeyCode::Digit9 => KeyCode::Digit9,

            WinitKeyCode::Escape => KeyCode::Escape,
            WinitKeyCode::Enter => KeyCode::Enter,
            WinitKeyCode::Tab => KeyCode::Tab,
            WinitKeyCode::Space => KeyCode::Space,
            WinitKeyCode::Backspace => KeyCode::Backspace,
            WinitKeyCode::Delete => KeyCode::Delete,
            WinitKeyCode::Insert => KeyCode::Insert,
            WinitKeyCode::Home => KeyCode::Home,
            WinitKeyCode::End => KeyCode::End,
            WinitKeyCode::PageUp => KeyCode::PageUp,
            WinitKeyCode::PageDown => KeyCode::PageDown,
            WinitKeyCode::ArrowUp => KeyCode::ArrowUp,
            WinitKeyCode::ArrowDown => KeyCode::ArrowDown,
            WinitKeyCode::ArrowLeft => KeyCode::ArrowLeft,
            WinitKeyCode::ArrowRight => KeyCode::ArrowRight,

            WinitKeyCode::ShiftLeft => KeyCode::ShiftLeft,
            WinitKeyCode::ShiftRight => KeyCode::ShiftRight,
            WinitKeyCode::ControlLeft => KeyCode::ControlLeft,
            WinitKeyCode::ControlRight => KeyCode::ControlRight,
            WinitKeyCode::AltLeft => KeyCode::AltLeft,
            WinitKeyCode::AltRight => KeyCode::AltRight,
            WinitKeyCode::SuperLeft => KeyCode::SuperLeft,
            WinitKeyCode::SuperRight => KeyCode::SuperRight,
            WinitKeyCode::CapsLock => KeyCode::CapsLock,

            WinitKeyCode::F1 => KeyCode::F1,
            WinitKeyCode::F2 => KeyCode::F2,
            WinitKeyCode::F3 => KeyCode::F3,
            WinitKeyCode::F4 => KeyCode::F4,
            WinitKeyCode::F5 => KeyCode::F5,
            WinitKeyCode::F6 => KeyCode::F6,
            WinitKeyCode::F7 => KeyCode::F7,
            WinitKeyCode::F8 => KeyCode::F8,
            WinitKeyCode::F9 => KeyCode::F9,
            WinitKeyCode::F10 => KeyCode::F10,
            WinitKeyCode::F11 => KeyCode::F11,
            WinitKeyCode::F12 => KeyCode::F12,

            WinitKeyCode::Backquote => KeyCode::Backquote,
            WinitKeyCode::Minus => KeyCode::Minus,
            WinitKeyCode::Equal => KeyCode::Equal,
            WinitKeyCode::BracketLeft => KeyCode::BracketLeft,
            WinitKeyCode::BracketRight => KeyCode::BracketRight,
            WinitKeyCode::Backslash => KeyCode::Backslash,
            WinitKeyCode::Semicolon => KeyCode::Semicolon,
            WinitKeyCode::Quote => KeyCode::Quote,
            WinitKeyCode::Comma => KeyCode::Comma,
            WinitKeyCode::Period => KeyCode::Period,
            WinitKeyCode::Slash => KeyCode::Slash,

            WinitKeyCode::Numpad0 => KeyCode::Numpad0,
            WinitKeyCode::Numpad1 => KeyCode::Numpad1,
            WinitKeyCode::Numpad2 => KeyCode::Numpad2,
            WinitKeyCode::Numpad3 => KeyCode::Numpad3,
            WinitKeyCode::Numpad4 => KeyCode::Numpad4,
            WinitKeyCode::Numpad5 => KeyCode::Numpad5,
            WinitKeyCode::Numpad6 => KeyCode::Numpad6,
            WinitKeyCode::Numpad7 => KeyCode::Numpad7,
            WinitKeyCode::Numpad8 => KeyCode::Numpad8,
            WinitKeyCode::Numpad9 => KeyCode::Numpad9,
            WinitKeyCode::NumpadAdd => KeyCode::NumpadAdd,
            WinitKeyCode::NumpadSubtract => KeyCode::NumpadSubtract,
            WinitKeyCode::NumpadMultiply => KeyCode::NumpadMultiply,
            WinitKeyCode::NumpadDivide => KeyCode::NumpadDivide,
            WinitKeyCode::NumpadEnter => KeyCode::NumpadEnter,
            WinitKeyCode::NumpadDecimal => KeyCode::NumpadDecimal,
            _ => KeyCode::Unknown,
        },
        WinitPhysicalKey::Unidentified(_) => KeyCode::Unknown,
    }
}

/// Maps a winit `NamedKey` to a normalized `NamedKey`.
#[inline]
pub fn map_named_key(named: WinitNamedKey) -> NamedKey {
    match named {
        WinitNamedKey::Enter => NamedKey::Enter,
        WinitNamedKey::Tab => NamedKey::Tab,
        WinitNamedKey::Space => NamedKey::Space,
        WinitNamedKey::Backspace => NamedKey::Backspace,
        WinitNamedKey::Escape => NamedKey::Escape,
        WinitNamedKey::Delete => NamedKey::Delete,
        WinitNamedKey::Insert => NamedKey::Insert,
        WinitNamedKey::Home => NamedKey::Home,
        WinitNamedKey::End => NamedKey::End,
        WinitNamedKey::PageUp => NamedKey::PageUp,
        WinitNamedKey::PageDown => NamedKey::PageDown,
        WinitNamedKey::ArrowUp => NamedKey::ArrowUp,
        WinitNamedKey::ArrowDown => NamedKey::ArrowDown,
        WinitNamedKey::ArrowLeft => NamedKey::ArrowLeft,
        WinitNamedKey::ArrowRight => NamedKey::ArrowRight,
        WinitNamedKey::Shift => NamedKey::Shift,
        WinitNamedKey::Control => NamedKey::Control,
        WinitNamedKey::Alt => NamedKey::Alt,
        WinitNamedKey::Super => NamedKey::Super,
        WinitNamedKey::CapsLock => NamedKey::CapsLock,
        WinitNamedKey::F1 => NamedKey::F1,
        WinitNamedKey::F2 => NamedKey::F2,
        WinitNamedKey::F3 => NamedKey::F3,
        WinitNamedKey::F4 => NamedKey::F4,
        WinitNamedKey::F5 => NamedKey::F5,
        WinitNamedKey::F6 => NamedKey::F6,
        WinitNamedKey::F7 => NamedKey::F7,
        WinitNamedKey::F8 => NamedKey::F8,
        WinitNamedKey::F9 => NamedKey::F9,
        WinitNamedKey::F10 => NamedKey::F10,
        WinitNamedKey::F11 => NamedKey::F11,
        WinitNamedKey::F12 => NamedKey::F12,
        _ => NamedKey::Other,
    }
}

/// Maps a winit `Key` to a normalized `LogicalKey`.
#[inline]
pub fn map_logical_key(key: WinitKey) -> LogicalKey {
    match key {
        WinitKey::Character(s) => LogicalKey::Character(s.to_string()),
        WinitKey::Named(named) => LogicalKey::Named(map_named_key(named)),
        WinitKey::Unidentified(_) | WinitKey::Dead(_) => LogicalKey::Unidentified,
    }
}

/// Maps a winit `ElementState` to a normalized `KeyState`.
#[inline]
pub const fn map_key_state(state: ElementState) -> KeyState {
    match state {
        ElementState::Pressed => KeyState::Pressed,
        ElementState::Released => KeyState::Released,
    }
}

/// Maps winit `ModifiersState` to normalized `ModifiersState`.
#[inline]
pub fn map_modifiers(mods: WinitModifiersState) -> ModifiersState {
    ModifiersState {
        shift: mods.shift_key(),
        ctrl: mods.control_key(),
        alt: mods.alt_key(),
        super_key: mods.super_key(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_physical_key() {
        assert_eq!(
            map_physical_key(WinitPhysicalKey::Code(WinitKeyCode::KeyW)),
            KeyCode::KeyW
        );
        assert_eq!(
            map_physical_key(WinitPhysicalKey::Code(WinitKeyCode::Space)),
            KeyCode::Space
        );
        assert_eq!(
            map_physical_key(WinitPhysicalKey::Code(WinitKeyCode::Escape)),
            KeyCode::Escape
        );
        assert_eq!(
            map_physical_key(WinitPhysicalKey::Code(WinitKeyCode::ArrowUp)),
            KeyCode::ArrowUp
        );
    }

    #[test]
    fn test_map_logical_key() {
        assert_eq!(
            map_logical_key(WinitKey::Character("a".into())),
            LogicalKey::Character("a".into())
        );
        assert_eq!(
            map_logical_key(WinitKey::Named(WinitNamedKey::Enter)),
            LogicalKey::Named(NamedKey::Enter)
        );
        assert_eq!(
            map_logical_key(WinitKey::Named(WinitNamedKey::Space)),
            LogicalKey::Named(NamedKey::Space)
        );
    }

    #[test]
    fn test_map_key_state() {
        assert_eq!(map_key_state(ElementState::Pressed), KeyState::Pressed);
        assert_eq!(map_key_state(ElementState::Released), KeyState::Released);
    }

    #[test]
    fn test_map_modifiers() {
        let mut mods = WinitModifiersState::empty();
        assert_eq!(map_modifiers(mods), ModifiersState::EMPTY);

        mods.insert(WinitModifiersState::SHIFT);
        assert!(map_modifiers(mods).shift);

        mods.insert(WinitModifiersState::CONTROL);
        let mapped = map_modifiers(mods);
        assert!(mapped.shift);
        assert!(mapped.ctrl);
        assert!(!mapped.alt);
    }
}
