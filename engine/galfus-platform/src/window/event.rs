use serde::{Deserialize, Serialize};

/// Normalized window lifecycle and dimension events dispatched to the host.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum WindowEvent {
    /// Window inner dimensions or DPI scale factor changed.
    Resized {
        window_id: u32,
        width: u32,
        height: u32,
        scale_factor: f64,
    },

    /// Window screen position changed.
    Moved { window_id: u32, x: i32, y: i32 },

    /// The user requested the window to close (e.g. clicked the X button or Alt+F4).
    CloseRequested { window_id: u32 },

    /// Window gained or lost input focus.
    FocusChanged { window_id: u32, focused: bool },

    /// Window was minimized or hidden by other surfaces.
    Occluded { window_id: u32, occluded: bool },

    /// Display DPI scale factor changed.
    ScaleFactorChanged { window_id: u32, scale_factor: f64 },

    /// The window surface requires redrawing.
    RedrawRequested { window_id: u32 },
}

impl WindowEvent {
    /// Returns the logical window ID associated with this event.
    pub const fn window_id(&self) -> u32 {
        match self {
            Self::Resized { window_id, .. }
            | Self::Moved { window_id, .. }
            | Self::CloseRequested { window_id }
            | Self::FocusChanged { window_id, .. }
            | Self::Occluded { window_id, .. }
            | Self::ScaleFactorChanged { window_id, .. }
            | Self::RedrawRequested { window_id } => *window_id,
        }
    }
}
