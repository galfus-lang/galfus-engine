#[cfg(not(target_arch = "wasm32"))]
use std::sync::Arc;

#[cfg(not(target_arch = "wasm32"))]
use glam::{IVec2, UVec2};
#[cfg(not(target_arch = "wasm32"))]
use winit::dpi::{PhysicalPosition, PhysicalSize};
#[cfg(not(target_arch = "wasm32"))]
use winit::raw_window_handle::{
    DisplayHandle, HandleError, HasDisplayHandle, HasWindowHandle, WindowHandle,
};
#[cfg(not(target_arch = "wasm32"))]
use winit::window::{
    CursorGrabMode as WinitCursorGrabMode, CursorIcon as WinitCursorIcon,
    Fullscreen as WinitFullscreen, UserAttentionType as WinitUserAttentionType,
    Window as WinitWindow,
};

#[cfg(not(target_arch = "wasm32"))]
use crate::error::{PlatformError, PlatformResult};
#[cfg(not(target_arch = "wasm32"))]
use crate::window::types::{
    CursorGrabMode, CursorIcon, FullscreenMode, UserAttentionType, WindowConfig, WindowState,
};

/// A native desktop window backed by `winit`.
#[cfg(not(target_arch = "wasm32"))]
pub struct NativeWindow {
    id: u32,
    window: Arc<WinitWindow>,
    current_title: String,
}

#[cfg(not(target_arch = "wasm32"))]
impl NativeWindow {
    /// Wraps an initialized `winit::window::Window` with logical ID and initial config.
    pub fn new(config: &WindowConfig, window: Arc<WinitWindow>) -> Self {
        let instance = Self {
            id: config.id,
            window,
            current_title: config.title.clone(),
        };

        instance.apply_initial_state(config.initial_state);
        instance
    }

    /// Returns the logical ID of this window.
    pub const fn id(&self) -> u32 {
        self.id
    }

    /// Returns a reference to the underlying `winit` window.
    pub fn raw_window(&self) -> &Arc<WinitWindow> {
        &self.window
    }

    /// Returns the current title of the window.
    pub fn title(&self) -> &str {
        &self.current_title
    }

    /// Updates the title of the window.
    pub fn set_title(&mut self, title: &str) {
        self.current_title = title.to_string();
        self.window.set_title(title);
    }

    /// Returns the current inner pixel dimensions.
    pub fn inner_size(&self) -> UVec2 {
        let size = self.window.inner_size();
        UVec2::new(size.width, size.height)
    }

    /// Requests a new inner size for the window.
    pub fn set_inner_size(&self, width: u32, height: u32) {
        let _ = self
            .window
            .request_inner_size(PhysicalSize::new(width.max(100), height.max(100)));
    }

    /// Sets the minimum inner dimensions.
    pub fn set_min_inner_size(&self, min_size: Option<UVec2>) {
        let size = min_size.map(|s| PhysicalSize::new(s.x, s.y));
        self.window.set_min_inner_size(size);
    }

    /// Sets the maximum inner dimensions.
    pub fn set_max_inner_size(&self, max_size: Option<UVec2>) {
        let size = max_size.map(|s| PhysicalSize::new(s.x, s.y));
        self.window.set_max_inner_size(size);
    }

    /// Returns the outer pixel dimensions of the window.
    pub fn outer_size(&self) -> UVec2 {
        let size = self.window.outer_size();
        UVec2::new(size.width, size.height)
    }

    /// Returns the current screen position in physical coordinates, if supported.
    pub fn position(&self) -> Option<IVec2> {
        self.window
            .outer_position()
            .ok()
            .map(|pos| IVec2::new(pos.x, pos.y))
    }

    /// Sets the outer screen position of the window.
    pub fn set_position(&self, x: i32, y: i32) {
        self.window.set_outer_position(PhysicalPosition::new(x, y));
    }

    /// Returns the current display DPI scale factor.
    pub fn scale_factor(&self) -> f64 {
        self.window.scale_factor()
    }

    /// Shows or hides the window.
    pub fn set_visible(&self, visible: bool) {
        self.window.set_visible(visible);
    }

    /// Returns whether the window is currently visible.
    pub fn is_visible(&self) -> bool {
        self.window.is_visible().unwrap_or(true)
    }

    /// Configures the fullscreen state of the window.
    pub fn set_fullscreen(&self, mode: Option<FullscreenMode>) {
        let winit_mode = mode.map(|m| match m {
            FullscreenMode::Borderless => WinitFullscreen::Borderless(None),
            FullscreenMode::Exclusive => WinitFullscreen::Borderless(None),
        });
        self.window.set_fullscreen(winit_mode);
    }

    /// Returns true if the window is currently in fullscreen mode.
    pub fn is_fullscreen(&self) -> bool {
        self.window.fullscreen().is_some()
    }

    /// Maximizes or unmaximizes the window.
    pub fn set_maximized(&self, maximized: bool) {
        self.window.set_maximized(maximized);
    }

    /// Returns true if the window is currently maximized.
    pub fn is_maximized(&self) -> bool {
        self.window.is_maximized()
    }

    /// Minimizes the window.
    pub fn set_minimized(&self, minimized: bool) {
        self.window.set_minimized(minimized);
    }

    /// Returns true if the window is currently minimized.
    pub fn is_minimized(&self) -> bool {
        self.window.is_minimized().unwrap_or(false)
    }

    /// Sets whether the window can be resized by the user.
    pub fn set_resizable(&self, resizable: bool) {
        self.window.set_resizable(resizable);
    }

    /// Returns true if the window is user-resizable.
    pub fn is_resizable(&self) -> bool {
        self.window.is_resizable()
    }

    /// Sets whether window decorations (title bar and borders) are displayed.
    pub fn set_decorations(&self, decorations: bool) {
        self.window.set_decorations(decorations);
    }

    /// Returns true if window decorations are enabled.
    pub fn is_decorated(&self) -> bool {
        self.window.is_decorated()
    }

    /// Returns true if the window currently has input focus.
    pub fn is_focused(&self) -> bool {
        self.window.has_focus()
    }

    /// Requests window input focus from the OS.
    pub fn focus(&self) {
        self.window.focus_window();
    }

    /// Requests user attention via taskbar/dock flashing.
    pub fn request_user_attention(&self, attention: Option<UserAttentionType>) {
        let winit_attention = attention.map(|a| match a {
            UserAttentionType::Critical => WinitUserAttentionType::Critical,
            UserAttentionType::Informational => WinitUserAttentionType::Informational,
        });
        self.window.request_user_attention(winit_attention);
    }

    /// Shows or hides the mouse cursor over this window.
    pub fn set_cursor_visible(&self, visible: bool) {
        self.window.set_cursor_visible(visible);
    }

    /// Configures cursor confinement or pointer locking.
    pub fn set_cursor_grab(&self, mode: CursorGrabMode) -> PlatformResult<()> {
        let winit_grab = match mode {
            CursorGrabMode::None => WinitCursorGrabMode::None,
            CursorGrabMode::Confined => WinitCursorGrabMode::Confined,
            CursorGrabMode::Locked => WinitCursorGrabMode::Locked,
        };

        self.window
            .set_cursor_grab(winit_grab)
            .map_err(|_e| PlatformError::UnsupportedCapability("Cursor grab failed"))
    }

    /// Sets the position of the mouse cursor within the window.
    pub fn set_cursor_position(&self, x: i32, y: i32) -> PlatformResult<()> {
        self.window
            .set_cursor_position(PhysicalPosition::new(x, y))
            .map_err(|_e| PlatformError::UnsupportedCapability("Setting cursor position failed"))
    }

    /// Sets the visual icon of the mouse cursor.
    pub fn set_cursor_icon(&self, icon: CursorIcon) {
        let winit_icon = match icon {
            CursorIcon::Default => WinitCursorIcon::Default,
            CursorIcon::Pointer => WinitCursorIcon::Pointer,
            CursorIcon::Grab => WinitCursorIcon::Grab,
            CursorIcon::Grabbing => WinitCursorIcon::Grabbing,
            CursorIcon::Crosshair => WinitCursorIcon::Crosshair,
            CursorIcon::Text => WinitCursorIcon::Text,
            CursorIcon::Move => WinitCursorIcon::Move,
            CursorIcon::NotAllowed => WinitCursorIcon::NotAllowed,
            CursorIcon::Wait => WinitCursorIcon::Wait,
            CursorIcon::Progress => WinitCursorIcon::Progress,
        };
        self.window.set_cursor(winit_icon);
    }

    /// Requests that a redraw event be scheduled for this window.
    pub fn request_redraw(&self) {
        self.window.request_redraw();
    }

    fn apply_initial_state(&self, state: WindowState) {
        match state {
            WindowState::Windowed => {
                self.window.set_fullscreen(None);
                self.window.set_maximized(false);
            }
            WindowState::Minimized => {
                self.window.set_minimized(true);
            }
            WindowState::Maximized => {
                self.window.set_maximized(true);
            }
            WindowState::Fullscreen | WindowState::BorderlessFullscreen => {
                self.set_fullscreen(Some(FullscreenMode::Borderless));
            }
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl HasWindowHandle for NativeWindow {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        self.window.window_handle()
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl HasDisplayHandle for NativeWindow {
    fn display_handle(&self) -> Result<DisplayHandle<'_>, HandleError> {
        self.window.display_handle()
    }
}
