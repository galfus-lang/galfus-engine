pub mod browser;
#[cfg(all(target_arch = "wasm32", feature = "browser"))]
mod browser_ime;
#[cfg(all(target_arch = "wasm32", feature = "browser"))]
mod browser_keyboard;
#[cfg(all(target_arch = "wasm32", feature = "browser"))]
pub(crate) mod browser_pointer;
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
