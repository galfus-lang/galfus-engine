use crate::window::WindowEvent;

/// Aggregated, normalized platform event delivered to the host.
#[derive(Debug, Clone, PartialEq)]
pub enum PlatformEvent {
    /// Window lifecycle, dimensions, or state event.
    Window(WindowEvent),
}

impl From<WindowEvent> for PlatformEvent {
    #[inline]
    fn from(event: WindowEvent) -> Self {
        Self::Window(event)
    }
}
