use serde::{Deserialize, Serialize};

/// Physical key location on a standard keyboard layout (W3C Key Code).
///
/// Invariant with respect to the user's software keyboard layout (e.g. QWERTY vs AZERTY).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum KeyCode {
    #[default]
    Unknown,

    // Alphabetic
    KeyA,
    KeyB,
    KeyC,
    KeyD,
    KeyE,
    KeyF,
    KeyG,
    KeyH,
    KeyI,
    KeyJ,
    KeyK,
    KeyL,
    KeyM,
    KeyN,
    KeyO,
    KeyP,
    KeyQ,
    KeyR,
    KeyS,
    KeyT,
    KeyU,
    KeyV,
    KeyW,
    KeyX,
    KeyY,
    KeyZ,

    // Digits
    Digit0,
    Digit1,
    Digit2,
    Digit3,
    Digit4,
    Digit5,
    Digit6,
    Digit7,
    Digit8,
    Digit9,

    // Controls and navigation
    Escape,
    Enter,
    Tab,
    Space,
    Backspace,
    Delete,
    Insert,
    Home,
    End,
    PageUp,
    PageDown,
    ArrowUp,
    ArrowDown,
    ArrowLeft,
    ArrowRight,

    // Modifiers
    ShiftLeft,
    ShiftRight,
    ControlLeft,
    ControlRight,
    AltLeft,
    AltRight,
    SuperLeft,
    SuperRight,
    CapsLock,

    // Function keys
    F1,
    F2,
    F3,
    F4,
    F5,
    F6,
    F7,
    F8,
    F9,
    F10,
    F11,
    F12,

    // Punctuation & symbols
    Backquote,
    Minus,
    Equal,
    BracketLeft,
    BracketRight,
    Backslash,
    Semicolon,
    Quote,
    Comma,
    Period,
    Slash,

    // Keypad
    Numpad0,
    Numpad1,
    Numpad2,
    Numpad3,
    Numpad4,
    Numpad5,
    Numpad6,
    Numpad7,
    Numpad8,
    Numpad9,
    NumpadAdd,
    NumpadSubtract,
    NumpadMultiply,
    NumpadDivide,
    NumpadEnter,
    NumpadDecimal,
}

/// Standard named logical key (W3C Named Key).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NamedKey {
    Enter,
    Tab,
    Space,
    Backspace,
    Escape,
    Delete,
    Insert,
    Home,
    End,
    PageUp,
    PageDown,
    ArrowUp,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    Shift,
    Control,
    Alt,
    Super,
    CapsLock,
    F1,
    F2,
    F3,
    F4,
    F5,
    F6,
    F7,
    F8,
    F9,
    F10,
    F11,
    F12,
    Other,
}

/// Interpreted logical key value after layout resolution and active modifiers.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LogicalKey {
    /// Printable text character or sequence (e.g. "a", "A", "1", "ñ").
    Character(String),

    /// Functional / non-printable key.
    Named(NamedKey),

    /// Unidentified key.
    Unidentified,
}

impl LogicalKey {
    /// Returns the character string if this logical key is a character.
    #[inline]
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::Character(s) => Some(s.as_str()),
            _ => None,
        }
    }
}

/// State of a keyboard key transition.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum KeyState {
    /// Key was pressed down.
    Pressed,

    /// Key was released.
    Released,
}

impl KeyState {
    /// Returns `true` if the key transitioned to pressed.
    #[inline]
    pub const fn is_pressed(self) -> bool {
        matches!(self, Self::Pressed)
    }
}

/// Active keyboard modifier state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModifiersState {
    /// Shift key is active.
    pub shift: bool,

    /// Control key is active.
    pub ctrl: bool,

    /// Alt / Option key is active.
    pub alt: bool,

    /// Windows / Command / Meta key is active.
    pub super_key: bool,
}

impl ModifiersState {
    /// Empty modifier state with no active modifiers.
    pub const EMPTY: Self = Self {
        shift: false,
        ctrl: false,
        alt: false,
        super_key: false,
    };

    /// Returns `true` if no modifiers are currently pressed.
    #[inline]
    pub const fn is_empty(self) -> bool {
        !self.shift && !self.ctrl && !self.alt && !self.super_key
    }
}
