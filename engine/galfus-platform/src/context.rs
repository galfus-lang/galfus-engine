use std::collections::HashMap;
use std::thread::{ThreadId, current};

use galfus_core::id::validate_host_logical_id;
#[cfg(not(target_arch = "wasm32"))]
use std::sync::Arc;
#[cfg(not(target_arch = "wasm32"))]
use winit::application::ApplicationHandler;
#[cfg(not(target_arch = "wasm32"))]
use winit::dpi::{PhysicalPosition, PhysicalSize};
#[cfg(not(target_arch = "wasm32"))]
use winit::event::WindowEvent as WinitWindowEvent;
#[cfg(not(target_arch = "wasm32"))]
use winit::event_loop::{ActiveEventLoop, EventLoop};
#[cfg(not(target_arch = "wasm32"))]
use winit::platform::pump_events::EventLoopExtPumpEvents;
#[cfg(not(target_arch = "wasm32"))]
use winit::window::{Window as WinitWindow, WindowId as WinitWindowId};

use crate::capabilities::PlatformCapabilities;
use crate::error::{PlatformError, PlatformResult};
use crate::event::PlatformEvent;
#[cfg(target_arch = "wasm32")]
use crate::window::BrowserWindow;
#[cfg(not(target_arch = "wasm32"))]
use crate::window::NativeWindow;
use crate::window::Window;
use crate::window::event::WindowEvent;
use crate::window::types::WindowConfig;

/// Central coordinator for platform operations, windows, and input events.
pub struct PlatformContext {
    main_thread_id: ThreadId,
    capabilities: PlatformCapabilities,
    windows: HashMap<u32, Window>,
    #[cfg(not(target_arch = "wasm32"))]
    winit_to_logical: HashMap<WinitWindowId, u32>,
    #[cfg(not(target_arch = "wasm32"))]
    event_loop: Option<EventLoop<()>>,
}

impl PlatformContext {
    /// Initializes a new `PlatformContext` with native windowing capabilities.
    pub fn new() -> PlatformResult<Self> {
        let main_thread_id = current().id();

        #[cfg(not(target_arch = "wasm32"))]
        let event_loop = {
            let mut builder = EventLoop::builder();
            #[cfg(all(not(target_arch = "wasm32"), target_os = "linux"))]
            {
                use winit::platform::wayland::EventLoopBuilderExtWayland;
                use winit::platform::x11::EventLoopBuilderExtX11;
                EventLoopBuilderExtX11::with_any_thread(&mut builder, true);
                EventLoopBuilderExtWayland::with_any_thread(&mut builder, true);
            }
            let el = builder.build().map_err(|e| {
                PlatformError::WindowCreationFailed(format!("EventLoop creation failed: {e}"))
            })?;
            Some(el)
        };

        Ok(Self {
            main_thread_id,
            capabilities: PlatformCapabilities::current(),
            windows: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            winit_to_logical: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            event_loop,
        })
    }

    /// Initializes a headless `PlatformContext` with windowing disabled.
    pub fn new_headless() -> Self {
        let mut caps = PlatformCapabilities::current();
        caps.is_headless = true;
        caps.supports_multiple_windows = false;

        Self {
            main_thread_id: current().id(),
            capabilities: caps,
            windows: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            winit_to_logical: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            event_loop: None,
        }
    }

    /// Returns the thread ID associated with the main thread of this context.
    pub fn main_thread_id(&self) -> ThreadId {
        self.main_thread_id
    }

    /// Verifies that the current execution is occurring on the thread that initialized the context.
    #[inline]
    pub fn ensure_main_thread(&self) -> PlatformResult<()> {
        if current().id() != self.main_thread_id {
            Err(PlatformError::NotOnMainThread)
        } else {
            Ok(())
        }
    }

    /// Returns the platform capabilities discovered in this environment.
    pub const fn capabilities(&self) -> PlatformCapabilities {
        self.capabilities
    }

    /// Creates and registers a new window, returning its logical ID on success.
    pub fn create_window(&mut self, config: WindowConfig) -> PlatformResult<u32> {
        self.ensure_main_thread()?;
        validate_host_logical_id(config.id)?;

        if self.capabilities.is_headless {
            return Err(PlatformError::UnsupportedCapability(
                "Window creation is not supported in headless mode",
            ));
        }

        let id = config.id;
        if self.windows.contains_key(&id) {
            return Err(PlatformError::WindowAlreadyExists(id));
        }

        #[cfg(not(target_arch = "wasm32"))]
        {
            let el = self.event_loop.as_ref().ok_or_else(|| {
                PlatformError::WindowCreationFailed("Event loop unavailable".into())
            })?;

            #[allow(deprecated)]
            let mut attrs = WinitWindow::default_attributes()
                .with_title(&config.title)
                .with_inner_size(PhysicalSize::new(
                    config.size.x.max(100),
                    config.size.y.max(100),
                ))
                .with_resizable(config.resizable)
                .with_decorations(config.decorations)
                .with_transparent(config.transparent);

            if let Some(pos) = config.position {
                attrs = attrs.with_position(PhysicalPosition::new(pos.x, pos.y));
            }

            #[allow(deprecated)]
            let winit_window = el
                .create_window(attrs)
                .map_err(|e| PlatformError::WindowCreationFailed(e.to_string()))?;

            let winit_id = winit_window.id();
            let native_win = NativeWindow::new(&config, Arc::new(winit_window));

            self.winit_to_logical.insert(winit_id, id);
            self.windows.insert(id, native_win);
        }

        #[cfg(target_arch = "wasm32")]
        {
            let browser_win = BrowserWindow::new(&config)?;
            self.windows.insert(id, browser_win);
        }

        Ok(id)
    }

    /// Returns an immutable reference to the window with the given logical ID.
    pub fn get_window(&self, id: u32) -> PlatformResult<&Window> {
        self.windows
            .get(&id)
            .ok_or(PlatformError::WindowNotFound(id))
    }

    /// Returns a mutable reference to the window with the given logical ID.
    pub fn get_window_mut(&mut self, id: u32) -> PlatformResult<&mut Window> {
        self.ensure_main_thread()?;
        self.windows
            .get_mut(&id)
            .ok_or(PlatformError::WindowNotFound(id))
    }

    /// Closes and destroys the window associated with the logical ID.
    pub fn close_window(&mut self, id: u32) -> PlatformResult<()> {
        self.ensure_main_thread()?;

        #[cfg(not(target_arch = "wasm32"))]
        if let Some(win) = self.windows.remove(&id) {
            self.winit_to_logical.remove(&win.raw_window().id());
            Ok(())
        } else {
            Err(PlatformError::WindowNotFound(id))
        }

        #[cfg(target_arch = "wasm32")]
        if self.windows.remove(&id).is_some() {
            Ok(())
        } else {
            Err(PlatformError::WindowNotFound(id))
        }
    }

    /// Returns the number of active windows registered in this context.
    pub fn window_count(&self) -> usize {
        self.windows.len()
    }

    /// Pumps platform events on demand, collecting and returning normalized events.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn pump_events(&mut self) -> PlatformResult<Vec<PlatformEvent>> {
        self.ensure_main_thread()?;

        let mut collector = EventCollector {
            winit_to_logical: &self.winit_to_logical,
            events: Vec::new(),
        };

        if let Some(mut el) = self.event_loop.take() {
            let _status = el.pump_app_events(None, &mut collector);
            self.event_loop = Some(el);
        }

        Ok(collector.events)
    }

    /// On browser, returns empty or collected events from DOM listeners.
    #[cfg(target_arch = "wasm32")]
    pub fn pump_events(&mut self) -> PlatformResult<Vec<PlatformEvent>> {
        Ok(Vec::new())
    }
}

#[cfg(not(target_arch = "wasm32"))]
struct EventCollector<'a> {
    winit_to_logical: &'a HashMap<WinitWindowId, u32>,
    events: Vec<PlatformEvent>,
}

#[cfg(not(target_arch = "wasm32"))]
impl<'a> ApplicationHandler for EventCollector<'a> {
    fn resumed(&mut self, _event_loop: &ActiveEventLoop) {}

    fn window_event(
        &mut self,
        _event_loop: &ActiveEventLoop,
        window_id: WinitWindowId,
        event: WinitWindowEvent,
    ) {
        if let Some(&logical_id) = self.winit_to_logical.get(&window_id) {
            match event {
                WinitWindowEvent::Resized(size) => {
                    self.events
                        .push(PlatformEvent::Window(WindowEvent::Resized {
                            window_id: logical_id,
                            width: size.width,
                            height: size.height,
                            scale_factor: 1.0,
                        }));
                }
                WinitWindowEvent::Moved(pos) => {
                    self.events.push(PlatformEvent::Window(WindowEvent::Moved {
                        window_id: logical_id,
                        x: pos.x,
                        y: pos.y,
                    }));
                }
                WinitWindowEvent::CloseRequested => {
                    self.events
                        .push(PlatformEvent::Window(WindowEvent::CloseRequested {
                            window_id: logical_id,
                        }));
                }
                WinitWindowEvent::Focused(focused) => {
                    self.events
                        .push(PlatformEvent::Window(WindowEvent::FocusChanged {
                            window_id: logical_id,
                            focused,
                        }));
                }
                WinitWindowEvent::Occluded(occluded) => {
                    self.events
                        .push(PlatformEvent::Window(WindowEvent::Occluded {
                            window_id: logical_id,
                            occluded,
                        }));
                }
                WinitWindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                    self.events
                        .push(PlatformEvent::Window(WindowEvent::ScaleFactorChanged {
                            window_id: logical_id,
                            scale_factor,
                        }));
                }
                WinitWindowEvent::RedrawRequested => {
                    self.events
                        .push(PlatformEvent::Window(WindowEvent::RedrawRequested {
                            window_id: logical_id,
                        }));
                }
                _ => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_main_thread_enforcement() {
        let ctx = PlatformContext::new_headless();
        assert_eq!(ctx.main_thread_id(), thread::current().id());
        assert!(ctx.ensure_main_thread().is_ok());

        let worker_thread_id = thread::spawn(|| thread::current().id()).join().unwrap();
        assert_ne!(ctx.main_thread_id(), worker_thread_id);
    }

    #[test]
    fn test_reserved_logical_id_rejection() {
        let mut ctx = PlatformContext::new_headless();
        let config = WindowConfig::new(u32::MAX, "Illegal Window");
        assert!(matches!(
            ctx.create_window(config),
            Err(PlatformError::Core(
                galfus_core::CoreError::ReservedLogicalId { .. }
            ))
        ));
    }

    #[test]
    fn test_headless_mode_disallows_window_creation() {
        let mut ctx = PlatformContext::new_headless();
        let config = WindowConfig::new(1, "Legal Window");
        assert_eq!(
            ctx.create_window(config),
            Err(PlatformError::UnsupportedCapability(
                "Window creation is not supported in headless mode"
            ))
        );
    }
}
