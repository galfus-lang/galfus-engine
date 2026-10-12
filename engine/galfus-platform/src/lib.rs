//! # Galfus Platform
//!
//! Environment normalization, surface management, event dispatch, and capability discovery.
//!
//! This crate provides:
//! - **Platform Context**: Main-thread validated coordinator for windows and events ([`PlatformContext`]).
//! - **Surface Management**: Multi-window support on desktop via `winit` and canvas integration for the browser ([`window::Window`], [`window::WindowConfig`]).
//! - **Event Normalization**: Unified event streams ([`event::PlatformEvent`], [`window::WindowEvent`]).
//! - **Capability Discovery**: Explicit environment feature reporting ([`capabilities::PlatformCapabilities`]).

pub mod capabilities;
pub mod context;
pub mod error;
pub mod event;
pub mod window;

pub use capabilities::PlatformCapabilities;
pub use context::PlatformContext;
pub use error::{PlatformError, PlatformResult};
pub use event::PlatformEvent;
pub use window::{
    CursorGrabMode, CursorIcon, FullscreenMode, UserAttentionType, Window, WindowConfig,
    WindowEvent, WindowState,
};
