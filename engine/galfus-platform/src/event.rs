use crate::pointer::PointerEvent;
use crate::window::WindowEvent;

/// Aggregated, normalized platform event delivered to the host.
#[derive(Debug, Clone, PartialEq)]
pub enum PlatformEvent {
    /// Window lifecycle, dimensions, or state event.
    Window(WindowEvent),

    /// Pointer (mouse, touch, pen, scroll) event.
    Pointer(PointerEvent),
}

impl From<WindowEvent> for PlatformEvent {
    #[inline]
    fn from(event: WindowEvent) -> Self {
        Self::Window(event)
    }
}

impl From<PointerEvent> for PlatformEvent {
    #[inline]
    fn from(event: PointerEvent) -> Self {
        Self::Pointer(event)
    }
}
