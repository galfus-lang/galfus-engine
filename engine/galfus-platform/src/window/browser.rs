use glam::{IVec2, UVec2};

use crate::error::PlatformResult;
use crate::window::types::{
    CursorGrabMode, CursorIcon, FullscreenMode, UserAttentionType, WindowConfig,
};

/// A browser canvas surface representation.
#[derive(Debug)]
pub struct BrowserWindow {
    id: u32,
    canvas_id: String,
    title: String,
    size: UVec2,
    scale_factor: f64,
    visible: bool,
    resizable: bool,
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
            visible: true,
            resizable: config.resizable,
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

    /// Sets the minimum inner dimensions.
    pub fn set_min_inner_size(&self, _min_size: Option<UVec2>) {}

    /// Sets the maximum inner dimensions.
    pub fn set_max_inner_size(&self, _max_size: Option<UVec2>) {}

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

    /// Shows or hides the canvas.
    pub fn set_visible(&mut self, visible: bool) {
        self.visible = visible;
    }

    /// Returns whether the canvas is visible.
    pub fn is_visible(&self) -> bool {
        self.visible
    }

    /// Requests HTML5 Fullscreen for the canvas.
    pub fn set_fullscreen(&self, _mode: Option<FullscreenMode>) {}

    /// Returns whether the canvas is in fullscreen.
    pub fn is_fullscreen(&self) -> bool {
        false
    }

    /// Maximized state for web canvas.
    pub fn set_maximized(&self, _maximized: bool) {}

    /// Returns true if maximized.
    pub fn is_maximized(&self) -> bool {
        false
    }

    /// Minimized state for web canvas.
    pub fn set_minimized(&self, _minimized: bool) {}

    /// Returns true if minimized.
    pub fn is_minimized(&self) -> bool {
        false
    }

    /// Resizable state for web canvas.
    pub fn set_resizable(&mut self, resizable: bool) {
        self.resizable = resizable;
    }

    /// Returns whether the canvas can be resized.
    pub fn is_resizable(&self) -> bool {
        self.resizable
    }

    /// Decorations for web canvas.
    pub fn set_decorations(&self, _decorations: bool) {}

    /// Returns whether decorations are enabled.
    pub fn is_decorated(&self) -> bool {
        false
    }

    /// Returns whether the canvas currently has focus.
    pub fn is_focused(&self) -> bool {
        true
    }

    /// Focuses the canvas DOM element.
    pub fn focus(&self) {}

    /// User attention on web.
    pub fn request_user_attention(&self, _attention: Option<UserAttentionType>) {}

    /// Cursor visibility on web.
    pub fn set_cursor_visible(&self, _visible: bool) {}

    /// Pointer Lock API support.
    pub fn set_cursor_grab(&self, _mode: CursorGrabMode) -> PlatformResult<()> {
        Ok(())
    }

    /// Sets cursor position.
    pub fn set_cursor_position(&self, _x: i32, _y: i32) -> PlatformResult<()> {
        Ok(())
    }

    /// CSS cursor styling.
    pub fn set_cursor_icon(&self, _icon: CursorIcon) {}

    /// Schedules `requestAnimationFrame`.
    pub fn request_redraw(&self) {}
}
