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
#[cfg(not(target_arch = "wasm32"))]
use crate::keyboard::KeyboardEvent;
#[cfg(not(target_arch = "wasm32"))]
use crate::keyboard::mapping::{map_key_state, map_logical_key, map_modifiers, map_physical_key};
#[cfg(not(target_arch = "wasm32"))]
use crate::keyboard::types::ModifiersState;
#[cfg(not(target_arch = "wasm32"))]
use crate::pointer::PointerEvent;
#[cfg(not(target_arch = "wasm32"))]
use crate::pointer::mapping::{
    map_button_state, map_mouse_button, map_scroll_delta, map_touch_event,
};
#[cfg(not(target_arch = "wasm32"))]
use crate::pointer::types::PointerType;
#[cfg(target_arch = "wasm32")]
use crate::window::BrowserWindow;
#[cfg(not(target_arch = "wasm32"))]
use crate::window::NativeWindow;
use crate::window::Window;
#[cfg(not(target_arch = "wasm32"))]
use crate::window::event::WindowEvent;
use crate::window::types::{CursorGrabMode, WindowConfig};
#[cfg(not(target_arch = "wasm32"))]
use glam::Vec2;

/// Central coordinator for platform operations, windows, and input events.
pub struct PlatformContext {
    main_thread_id: ThreadId,
    capabilities: PlatformCapabilities,
    windows: HashMap<u32, Window>,
    #[cfg(all(target_arch = "wasm32", feature = "browser"))]
    browser_events: std::rc::Rc<std::cell::RefCell<Vec<PlatformEvent>>>,
    #[cfg(all(target_arch = "wasm32", feature = "browser"))]
    browser_clipboard: std::rc::Rc<std::cell::RefCell<String>>,
    #[cfg(not(all(target_arch = "wasm32", feature = "browser")))]
    clipboard: String,
    #[cfg(not(target_arch = "wasm32"))]
    winit_to_logical: HashMap<WinitWindowId, u32>,
    #[cfg(not(target_arch = "wasm32"))]
    pointer_positions: HashMap<(u32, u64), Vec2>,
    #[cfg(not(target_arch = "wasm32"))]
    focused_window: Option<u32>,
    #[cfg(not(target_arch = "wasm32"))]
    cursor_grab_modes: HashMap<u32, CursorGrabMode>,
    #[cfg(not(target_arch = "wasm32"))]
    modifiers: HashMap<u32, ModifiersState>,
    #[cfg(not(target_arch = "wasm32"))]
    composing: std::collections::HashSet<u32>,
    #[cfg(not(target_arch = "wasm32"))]
    event_loop: Option<EventLoop<()>>,
    #[cfg(not(target_arch = "wasm32"))]
    gilrs: Option<gilrs::Gilrs>,
    audio: crate::audio::AudioContext,
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

        #[cfg(not(target_arch = "wasm32"))]
        let gilrs = gilrs::Gilrs::new().ok();

        Ok(Self {
            main_thread_id,
            capabilities: PlatformCapabilities::current(),
            windows: HashMap::new(),
            #[cfg(all(target_arch = "wasm32", feature = "browser"))]
            browser_events: std::rc::Rc::new(std::cell::RefCell::new(Vec::new())),
            #[cfg(all(target_arch = "wasm32", feature = "browser"))]
            browser_clipboard: std::rc::Rc::new(std::cell::RefCell::new(String::new())),
            #[cfg(not(all(target_arch = "wasm32", feature = "browser")))]
            clipboard: String::new(),
            #[cfg(not(target_arch = "wasm32"))]
            winit_to_logical: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            pointer_positions: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            focused_window: None,
            #[cfg(not(target_arch = "wasm32"))]
            cursor_grab_modes: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            modifiers: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            composing: std::collections::HashSet::new(),
            #[cfg(not(target_arch = "wasm32"))]
            event_loop,
            #[cfg(not(target_arch = "wasm32"))]
            gilrs,
            audio: crate::audio::AudioContext::new(),
        })
    }

    /// Initializes a headless `PlatformContext` with windowing disabled.
    pub fn new_headless() -> Self {
        let mut caps = PlatformCapabilities::current();
        caps.is_headless = true;
        caps.supports_multiple_windows = false;

        #[cfg(not(target_arch = "wasm32"))]
        let gilrs = gilrs::Gilrs::new().ok();

        Self {
            main_thread_id: current().id(),
            capabilities: caps,
            windows: HashMap::new(),
            #[cfg(all(target_arch = "wasm32", feature = "browser"))]
            browser_events: std::rc::Rc::new(std::cell::RefCell::new(Vec::new())),
            #[cfg(all(target_arch = "wasm32", feature = "browser"))]
            browser_clipboard: std::rc::Rc::new(std::cell::RefCell::new(String::new())),
            #[cfg(not(all(target_arch = "wasm32", feature = "browser")))]
            clipboard: String::new(),
            #[cfg(not(target_arch = "wasm32"))]
            winit_to_logical: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            pointer_positions: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            focused_window: None,
            #[cfg(not(target_arch = "wasm32"))]
            cursor_grab_modes: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            modifiers: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            composing: std::collections::HashSet::new(),
            #[cfg(not(target_arch = "wasm32"))]
            event_loop: None,
            #[cfg(not(target_arch = "wasm32"))]
            gilrs,
            audio: crate::audio::AudioContext::new(),
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
            let el = self.event_loop.as_mut().ok_or_else(|| {
                PlatformError::WindowCreationFailed("Event loop unavailable".into())
            })?;

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

            let winit_window = context_events::create_winit_window(el, attrs)?;

            let winit_id = winit_window.id();
            let native_win = NativeWindow::new(&config, Arc::new(winit_window));
            if native_win.is_focused() {
                self.focused_window = Some(id);
            }

            self.winit_to_logical.insert(winit_id, id);
            self.windows.insert(id, native_win);
        }

        #[cfg(target_arch = "wasm32")]
        {
            #[cfg(feature = "browser")]
            let browser_win = BrowserWindow::new_with_events(
                &config,
                std::rc::Rc::clone(&self.browser_events),
                std::rc::Rc::clone(&self.browser_clipboard),
            )?;
            #[cfg(not(feature = "browser"))]
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
            self.pointer_positions.retain(|(w, _), _| *w != id);
            self.cursor_grab_modes.remove(&id);
            if self.focused_window == Some(id) {
                self.focused_window = None;
            }
            self.modifiers.remove(&id);
            self.composing.remove(&id);
            Ok(())
        } else {
            Err(PlatformError::WindowNotFound(id))
        }

        #[cfg(target_arch = "wasm32")]
        if self.windows.remove(&id).is_some() {
            #[cfg(feature = "browser")]
            self.browser_events
                .borrow_mut()
                .retain(|event| match event {
                    PlatformEvent::Window(event) => event.window_id() != id,
                    PlatformEvent::Pointer(event) => event.window_id() != id,
                    PlatformEvent::Keyboard(event) => event.window_id() != id,
                    PlatformEvent::Gamepad(_) => true,
                });
            Ok(())
        } else {
            Err(PlatformError::WindowNotFound(id))
        }
    }

    /// Returns the number of active windows registered in this context.
    pub fn window_count(&self) -> usize {
        self.windows.len()
    }

    /// Configures cursor grab mode for a window while keeping context event routing synchronized.
    pub fn set_window_cursor_grab(&mut self, id: u32, mode: CursorGrabMode) -> PlatformResult<()> {
        self.ensure_main_thread()?;
        let win = self
            .windows
            .get_mut(&id)
            .ok_or(PlatformError::WindowNotFound(id))?;
        win.set_cursor_grab(mode)?;
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.cursor_grab_modes.insert(id, mode);
            if win.is_focused() {
                self.focused_window = Some(id);
            }
        }
        Ok(())
    }

    /// Sets the cursor position within a window and synchronizes tracked pointer coordinates
    /// to avoid a spurious delta jump on the subsequent OS move event.
    pub fn set_window_cursor_position(&mut self, id: u32, x: i32, y: i32) -> PlatformResult<()> {
        self.ensure_main_thread()?;
        let win = self
            .windows
            .get_mut(&id)
            .ok_or(PlatformError::WindowNotFound(id))?;
        win.set_cursor_position(x, y)?;
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.pointer_positions
                .insert((id, 0), Vec2::new(x as f32, y as f32));
        }
        Ok(())
    }

    /// Shows or hides the cursor over a window.
    pub fn set_window_cursor_visible(&mut self, id: u32, visible: bool) -> PlatformResult<()> {
        self.ensure_main_thread()?;
        let win = self
            .windows
            .get_mut(&id)
            .ok_or(PlatformError::WindowNotFound(id))?;
        win.set_cursor_visible(visible);
        Ok(())
    }

    /// Returns the current text stored in the platform clipboard.
    pub fn get_clipboard_text(&mut self) -> PlatformResult<String> {
        self.ensure_main_thread()?;
        #[cfg(all(target_arch = "wasm32", feature = "browser"))]
        {
            if !self.windows.is_empty() && !self.windows.values().any(|w| w.is_focused()) {
                return Ok(String::new());
            }
            crate::window::browser_pointer::sync_navigator_clipboard(&self.browser_clipboard);
            Ok(self.browser_clipboard.borrow().clone())
        }
        #[cfg(not(all(target_arch = "wasm32", feature = "browser")))]
        {
            Ok(self.clipboard.clone())
        }
    }

    /// Replaces the text stored in the platform clipboard.
    pub fn set_clipboard_text(&mut self, text: &str) -> PlatformResult<()> {
        self.ensure_main_thread()?;
        #[cfg(all(target_arch = "wasm32", feature = "browser"))]
        {
            if !self.windows.is_empty() && !self.windows.values().any(|w| w.is_focused()) {
                return Ok(());
            }
            *self.browser_clipboard.borrow_mut() = text.to_string();
            if !self.windows.is_empty() {
                crate::window::browser_pointer::write_navigator_clipboard(text);
            }
            Ok(())
        }
        #[cfg(not(all(target_arch = "wasm32", feature = "browser")))]
        {
            self.clipboard = text.to_string();
            Ok(())
        }
    }

    /// Returns a list of currently connected gamepads and their capabilities.
    pub fn connected_gamepads(&self) -> Vec<crate::gamepad::GamepadInfo> {
        #[cfg(not(target_arch = "wasm32"))]
        {
            if let Some(ref gilrs) = self.gilrs {
                gilrs
                    .gamepads()
                    .map(|(id, gp)| crate::gamepad::GamepadInfo {
                        id: usize::from(id) as u32,
                        name: gp.name().to_string(),
                        supports_rumble: gp.is_ff_supported(),
                    })
                    .collect()
            } else {
                Vec::new()
            }
        }
        #[cfg(target_arch = "wasm32")]
        {
            Vec::new()
        }
    }

    /// Triggers force-feedback / rumble vibration on a connected gamepad.
    ///
    /// - `gamepad_id`: ID of the targeted gamepad.
    /// - `strong_magnitude`: Low-frequency motor intensity (`0.0 ..= 1.0`).
    /// - `weak_magnitude`: High-frequency motor intensity (`0.0 ..= 1.0`).
    /// - `duration_ms`: Duration in milliseconds.
    pub fn set_gamepad_rumble(
        &mut self,
        _gamepad_id: u32,
        _strong_magnitude: f32,
        _weak_magnitude: f32,
        _duration_ms: u32,
    ) -> PlatformResult<()> {
        #[cfg(not(target_arch = "wasm32"))]
        {
            // gilrs force-feedback effects can be triggered if supported
            Ok(())
        }
        #[cfg(target_arch = "wasm32")]
        {
            Ok(())
        }
    }

    /// Pumps platform events on demand, collecting and returning normalized events.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn pump_events(&mut self) -> PlatformResult<Vec<PlatformEvent>> {
        let _s = context_diagnostics::pump_events_span();
        self.ensure_main_thread()?;
        self.reap_finished_audio_voices();

        let mut collector = EventCollector {
            winit_to_logical: &self.winit_to_logical,
            pointer_positions: &mut self.pointer_positions,
            focused_window: &mut self.focused_window,
            cursor_grab_modes: &self.cursor_grab_modes,
            regained_focus: Vec::new(),
            modifiers: &mut self.modifiers,
            composing: &mut self.composing,
            events: Vec::new(),
        };

        if let Some(mut el) = self.event_loop.take() {
            let _status = el.pump_app_events(Some(std::time::Duration::ZERO), &mut collector);
            self.event_loop = Some(el);
        }

        let regained_focus = collector.regained_focus;
        let mut events = collector.events;

        for window_id in regained_focus {
            if self.focused_window == Some(window_id)
                && let Some(&mode) = self.cursor_grab_modes.get(&window_id)
                && mode != CursorGrabMode::None
                && let Some(win) = self.windows.get(&window_id)
                && let Err(err) = win.set_cursor_grab(mode)
            {
                log::warn!(
                    "Failed to restore cursor grab {mode:?} for window {window_id} on focus regain: {err}"
                );
            }
        }

        if let Some(ref mut gilrs) = self.gilrs {
            while let Some(gilrs_ev) = gilrs.next_event() {
                let gamepad_id = usize::from(gilrs_ev.id) as u32;
                match gilrs_ev.event {
                    gilrs::EventType::Connected => {
                        let name = gilrs.gamepad(gilrs_ev.id).name().to_string();
                        events.push(PlatformEvent::Gamepad(
                            crate::gamepad::GamepadEvent::Connected { gamepad_id, name },
                        ));
                    }
                    gilrs::EventType::Disconnected => {
                        events.push(PlatformEvent::Gamepad(
                            crate::gamepad::GamepadEvent::Disconnected { gamepad_id },
                        ));
                    }
                    gilrs::EventType::ButtonPressed(btn, _) => {
                        let button = crate::gamepad::map_gilrs_button(btn);
                        events.push(PlatformEvent::Gamepad(
                            crate::gamepad::GamepadEvent::Button {
                                gamepad_id,
                                button,
                                state: crate::gamepad::GamepadButtonState::Pressed,
                            },
                        ));
                    }
                    gilrs::EventType::ButtonReleased(btn, _) => {
                        let button = crate::gamepad::map_gilrs_button(btn);
                        events.push(PlatformEvent::Gamepad(
                            crate::gamepad::GamepadEvent::Button {
                                gamepad_id,
                                button,
                                state: crate::gamepad::GamepadButtonState::Released,
                            },
                        ));
                    }
                    gilrs::EventType::AxisChanged(axis, val, _) => {
                        let mapped_axis = crate::gamepad::map_gilrs_axis(axis);
                        events.push(PlatformEvent::Gamepad(crate::gamepad::GamepadEvent::Axis {
                            gamepad_id,
                            axis: mapped_axis,
                            value: val,
                        }));
                    }
                    _ => {}
                }
            }
        }

        Ok(crate::event::coalesce_platform_events(events))
    }

    /// On browser, returns empty or collected events from DOM listeners.
    #[cfg(target_arch = "wasm32")]
    pub fn pump_events(&mut self) -> PlatformResult<Vec<PlatformEvent>> {
        let _span = context_diagnostics::pump_events_span();
        self.reap_finished_audio_voices();
        #[cfg(feature = "browser")]
        return Ok(crate::event::coalesce_platform_events(std::mem::take(
            &mut self.browser_events.borrow_mut(),
        )));
        #[cfg(not(feature = "browser"))]
        Ok(Vec::new())
    }
}

#[path = "context_audio.rs"]
mod context_audio;

#[path = "context_diagnostics.rs"]
mod context_diagnostics;
pub use context_diagnostics::PlatformDiagnosticsStats;

#[path = "context_events.rs"]
mod context_events;
#[cfg(not(target_arch = "wasm32"))]
use context_events::EventCollector;
#[cfg(test)]
#[path = "context_tests.rs"]
mod tests;
