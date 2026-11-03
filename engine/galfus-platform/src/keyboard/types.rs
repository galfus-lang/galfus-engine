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

impl NamedKey {
    /// Returns the standard canonical string representation of this named key.
    #[inline]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Enter => "Enter",
            Self::Tab => "Tab",
            Self::Space => "Space",
            Self::Backspace => "Backspace",
            Self::Escape => "Escape",
            Self::Delete => "Delete",
            Self::Insert => "Insert",
            Self::Home => "Home",
            Self::End => "End",
            Self::PageUp => "PageUp",
            Self::PageDown => "PageDown",
            Self::ArrowUp => "ArrowUp",
            Self::ArrowDown => "ArrowDown",
            Self::ArrowLeft => "ArrowLeft",
            Self::ArrowRight => "ArrowRight",
            Self::Shift => "Shift",
            Self::Control => "Control",
            Self::Alt => "Alt",
            Self::Super => "Super",
            Self::CapsLock => "CapsLock",
            Self::F1 => "F1",
            Self::F2 => "F2",
            Self::F3 => "F3",
            Self::F4 => "F4",
            Self::F5 => "F5",
            Self::F6 => "F6",
            Self::F7 => "F7",
            Self::F8 => "F8",
            Self::F9 => "F9",
            Self::F10 => "F10",
            Self::F11 => "F11",
            Self::F12 => "F12",
            Self::Other => "Other",
        }
    }
}

/// Interpreted logical key value after layout resolution and active modifiers.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum LogicalKey {
    /// Printable text character or sequence (e.g. "a", "A", "1", "ñ").
    Character(String),

    /// Functional / non-printable key.
    Named(NamedKey),

    /// Unidentified key.
    Unidentified,
}

impl LogicalKey {
    /// Returns the normalized string representation of this logical key.
    #[inline]
    pub fn as_str(&self) -> &str {
        match self {
            Self::Character(s) => s.as_str(),
            Self::Named(named) => named.as_str(),
            Self::Unidentified => "Unidentified",
        }
    }
}

impl std::fmt::Display for LogicalKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl serde::Serialize for LogicalKey {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> serde::Deserialize<'de> for LogicalKey {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Ok(match s.as_str() {
            "Enter" => Self::Named(NamedKey::Enter),
            "Tab" => Self::Named(NamedKey::Tab),
            "Space" => Self::Named(NamedKey::Space),
            "Backspace" => Self::Named(NamedKey::Backspace),
            "Escape" => Self::Named(NamedKey::Escape),
            "Delete" => Self::Named(NamedKey::Delete),
            "Insert" => Self::Named(NamedKey::Insert),
            "Home" => Self::Named(NamedKey::Home),
            "End" => Self::Named(NamedKey::End),
            "PageUp" => Self::Named(NamedKey::PageUp),
            "PageDown" => Self::Named(NamedKey::PageDown),
            "ArrowUp" => Self::Named(NamedKey::ArrowUp),
            "ArrowDown" => Self::Named(NamedKey::ArrowDown),
            "ArrowLeft" => Self::Named(NamedKey::ArrowLeft),
            "ArrowRight" => Self::Named(NamedKey::ArrowRight),
            "Shift" => Self::Named(NamedKey::Shift),
            "Control" => Self::Named(NamedKey::Control),
            "Alt" => Self::Named(NamedKey::Alt),
            "Super" => Self::Named(NamedKey::Super),
            "CapsLock" => Self::Named(NamedKey::CapsLock),
            "F1" => Self::Named(NamedKey::F1),
            "F2" => Self::Named(NamedKey::F2),
            "F3" => Self::Named(NamedKey::F3),
            "F4" => Self::Named(NamedKey::F4),
            "F5" => Self::Named(NamedKey::F5),
            "F6" => Self::Named(NamedKey::F6),
            "F7" => Self::Named(NamedKey::F7),
            "F8" => Self::Named(NamedKey::F8),
            "F9" => Self::Named(NamedKey::F9),
            "F10" => Self::Named(NamedKey::F10),
            "F11" => Self::Named(NamedKey::F11),
            "F12" => Self::Named(NamedKey::F12),
            "Unidentified" => Self::Unidentified,
            other => Self::Character(other.to_string()),
        })
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
