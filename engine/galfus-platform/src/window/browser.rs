use glam::{IVec2, UVec2};

use crate::error::PlatformResult;
use crate::window::types::{CursorGrabMode, CursorIcon, FullscreenMode, WindowConfig};

/// A browser canvas surface representation.
#[derive(Debug)]
pub struct BrowserWindow {
    id: u32,
    canvas_id: String,
    title: String,
    size: UVec2,
    scale_factor: f64,
}

impl BrowserWindow {
    /// Constructs a browser canvas representation from configuration.
    pub fn new(config: &WindowConfig) -> PlatformResult<Self> {
        let canvas_id = config
            .canvas_id
            .clone()
            .unwrap_or_else(|| "galfus-canvas".to_string());

        Ok(Self {
            id: config.id,
            canvas_id,
            title: config.title.clone(),
            size: config.size,
            scale_factor: 1.0,
        })
    }

    /// Returns the logical window ID.
    pub const fn id(&self) -> u32 {
        self.id
    }

    /// Returns the DOM element ID for this canvas.
    pub fn canvas_id(&self) -> &str {
        &self.canvas_id
    }

    /// Returns the document/tab title.
    pub fn title(&self) -> &str {
        &self.title
    }

    /// Updates the title.
    pub fn set_title(&mut self, title: &str) {
        self.title = title.to_string();
    }

    /// Returns canvas dimensions.
    pub fn inner_size(&self) -> UVec2 {
        self.size
    }

    /// Updates canvas dimensions.
    pub fn set_inner_size(&mut self, width: u32, height: u32) {
        self.size = UVec2::new(width, height);
    }

    /// Returns outer size (equivalent to inner on canvas).
    pub fn outer_size(&self) -> UVec2 {
        self.size
    }

    /// Canvas position is managed by DOM layout.
    pub fn position(&self) -> Option<IVec2> {
        None
    }

    /// Setting window position is not applicable to web canvases.
    pub fn set_position(&self, _x: i32, _y: i32) {}

    /// Returns display device pixel ratio.
    pub fn scale_factor(&self) -> f64 {
        self.scale_factor
    }

    /// Requests HTML5 Fullscreen for the canvas.
    pub fn set_fullscreen(&self, _mode: Option<FullscreenMode>) {}

    /// Maximized state for web canvas.
    pub fn set_maximized(&self, _maximized: bool) {}

    /// Minimized state for web canvas.
    pub fn set_minimized(&self, _minimized: bool) {}

    /// Resizable state for web canvas.
    pub fn set_resizable(&self, _resizable: bool) {}

    /// Decorations for web canvas.
    pub fn set_decorations(&self, _decorations: bool) {}

    /// Cursor visibility on web.
    pub fn set_cursor_visible(&self, _visible: bool) {}

    /// Pointer Lock API support.
    pub fn set_cursor_grab(&self, _mode: CursorGrabMode) -> PlatformResult<()> {
        Ok(())
    }

    /// CSS cursor styling.
    pub fn set_cursor_icon(&self, _icon: CursorIcon) {}

    /// Schedules `requestAnimationFrame`.
    pub fn request_redraw(&self) {}
}
