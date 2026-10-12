use glam::{IVec2, UVec2};
use serde::{Deserialize, Serialize};

/// Normalized lifecycle state of an OS window or canvas.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WindowState {
    #[default]
    Windowed,
    Minimized,
    Maximized,
    Fullscreen,
    BorderlessFullscreen,
}

/// Fullscreen display modes supported by the platform.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FullscreenMode {
    Exclusive,
    Borderless,
}

/// Normalized cursor grab behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CursorGrabMode {
    #[default]
    None,
    Confined,
    Locked,
}

/// Standard cursor visual appearance icons.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CursorIcon {
    #[default]
    Default,
    Pointer,
    Grab,
    Grabbing,
    Crosshair,
    Text,
    Move,
    NotAllowed,
    Wait,
    Progress,
}

/// User attention request urgency.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UserAttentionType {
    Informational,
    Critical,
}

/// Configuration parameters for creating a new window or binding a canvas.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WindowConfig {
    /// Host-controlled logical ID. Must not be in the reserved ID range.
    pub id: u32,

    /// Window title bar text.
    pub title: String,

    /// Initial inner dimensions in physical pixels.
    pub size: UVec2,

    /// Optional initial screen position. May be ignored on Wayland or web.
    pub position: Option<IVec2>,

    /// Whether the user can manually resize the window.
    pub resizable: bool,

    /// Whether OS decorations (title bar, borders) are visible.
    pub decorations: bool,

    /// Whether alpha transparency is enabled for the surface.
    pub transparent: bool,

    /// Initial lifecycle state (windowed, maximized, fullscreen, etc.).
    pub initial_state: WindowState,

    /// DOM canvas ID when running in the browser.
    pub canvas_id: Option<String>,
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            id: 0,
            title: "Galfus Window".into(),
            size: UVec2::new(1280, 720),
            position: None,
            resizable: true,
            decorations: true,
            transparent: false,
            initial_state: WindowState::Windowed,
            canvas_id: None,
        }
    }
}

impl WindowConfig {
    /// Creates a default window configuration with the given logical ID and title.
    pub fn new(id: u32, title: impl Into<String>) -> Self {
        Self {
            id,
            title: title.into(),
            ..Default::default()
        }
    }

    /// Sets the window inner dimensions.
    #[must_use]
    pub fn with_size(mut self, width: u32, height: u32) -> Self {
        self.size = UVec2::new(width.max(100), height.max(100));
        self
    }

    /// Sets whether the window has decorations.
    #[must_use]
    pub fn with_decorations(mut self, decorations: bool) -> Self {
        self.decorations = decorations;
        self
    }

    /// Sets whether the window is resizable.
    #[must_use]
    pub fn with_resizable(mut self, resizable: bool) -> Self {
        self.resizable = resizable;
        self
    }

    /// Sets the initial window state.
    #[must_use]
    pub fn with_initial_state(mut self, state: WindowState) -> Self {
        self.initial_state = state;
        self
    }
}
