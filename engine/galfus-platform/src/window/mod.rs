pub mod browser;
pub mod event;
#[cfg(not(target_arch = "wasm32"))]
pub mod native;
pub mod types;

pub use browser::BrowserWindow;
pub use event::WindowEvent;
pub use types::{
    CursorGrabMode, CursorIcon, FullscreenMode, UserAttentionType, WindowConfig, WindowState,
};

#[cfg(not(target_arch = "wasm32"))]
pub use native::NativeWindow;

/// Platform-appropriate window abstraction type.
#[cfg(not(target_arch = "wasm32"))]
pub type Window = NativeWindow;

/// Platform-appropriate window abstraction type.
#[cfg(target_arch = "wasm32")]
pub type Window = BrowserWindow;
