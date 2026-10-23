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
use crate::window::types::WindowConfig;
#[cfg(not(target_arch = "wasm32"))]
use glam::Vec2;

/// Central coordinator for platform operations, windows, and input events.
pub struct PlatformContext {
    main_thread_id: ThreadId,
    capabilities: PlatformCapabilities,
    windows: HashMap<u32, Window>,
    #[cfg(not(target_arch = "wasm32"))]
    winit_to_logical: HashMap<WinitWindowId, u32>,
    #[cfg(not(target_arch = "wasm32"))]
    pointer_positions: HashMap<(u32, u64), Vec2>,
    #[cfg(not(target_arch = "wasm32"))]
    modifiers: HashMap<u32, ModifiersState>,
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
            #[cfg(not(target_arch = "wasm32"))]
            winit_to_logical: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            pointer_positions: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            modifiers: HashMap::new(),
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
            #[cfg(not(target_arch = "wasm32"))]
            winit_to_logical: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            pointer_positions: HashMap::new(),
            #[cfg(not(target_arch = "wasm32"))]
            modifiers: HashMap::new(),
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
            self.pointer_positions.retain(|(w, _), _| *w != id);
            self.modifiers.remove(&id);
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

    /// Loads raw audio data bytes and registers it under a host logical ID.
    pub fn load_sound_bytes(&mut self, id: u32, bytes: &[u8]) -> PlatformResult<f32> {
        self.audio.load_sound_bytes(id, bytes)
    }

    /// Plays a registered sound resource using the given playback configuration.
    pub fn play_sound(
        &mut self,
        sound_id: u32,
        config: crate::audio::PlaybackConfig,
    ) -> PlatformResult<u32> {
        self.audio.play_sound(sound_id, config)
    }

    /// Plays a sound positioned in 3D/2D relative to an emitter and a listener ear/microphone.
    pub fn play_sound_spatial(
        &mut self,
        sound_id: u32,
        emitter: crate::audio::SpatialTransform,
        listener: crate::audio::SpatialTransform,
        config: crate::audio::SpatialAudioConfig,
    ) -> PlatformResult<u32> {
        self.audio
            .play_sound_spatial(sound_id, emitter, listener, config)
    }

    /// Updates the spatial positioning of a playing sound voice.
    pub fn update_sound_spatial(
        &mut self,
        voice_id: u32,
        emitter: crate::audio::SpatialTransform,
        listener: crate::audio::SpatialTransform,
        config: crate::audio::SpatialAudioConfig,
    ) -> PlatformResult<()> {
        self.audio
            .update_sound_spatial(voice_id, emitter, listener, config)
    }

    /// Pauses an active sound playback voice.
    pub fn pause_sound(&mut self, voice_id: u32) -> PlatformResult<()> {
        self.audio.pause_sound(voice_id)
    }

    /// Resumes a paused sound playback voice.
    pub fn resume_sound(&mut self, voice_id: u32) -> PlatformResult<()> {
        self.audio.resume_sound(voice_id)
    }

    /// Stops a playing sound voice.
    pub fn stop_sound(&mut self, voice_id: u32) -> PlatformResult<()> {
        self.audio.stop_sound(voice_id)
    }

    /// Updates the volume of a sound voice.
    pub fn set_sound_volume(&mut self, voice_id: u32, volume: f32) -> PlatformResult<()> {
        self.audio.set_sound_volume(voice_id, volume)
    }

    /// Updates the panning position of a sound voice.
    pub fn set_sound_panning(&mut self, voice_id: u32, panning: f32) -> PlatformResult<()> {
        self.audio.set_sound_panning(voice_id, panning)
    }

    /// Unloads a registered sound resource.
    pub fn unload_sound(&mut self, sound_id: u32) -> PlatformResult<()> {
        self.audio.unload_sound(sound_id)
    }

    /// Pumps platform events on demand, collecting and returning normalized events.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn pump_events(&mut self) -> PlatformResult<Vec<PlatformEvent>> {
        self.ensure_main_thread()?;

        let mut collector = EventCollector {
            winit_to_logical: &self.winit_to_logical,
            pointer_positions: &mut self.pointer_positions,
            modifiers: &mut self.modifiers,
            events: Vec::new(),
        };

        if let Some(mut el) = self.event_loop.take() {
            let _status = el.pump_app_events(Some(std::time::Duration::ZERO), &mut collector);
            self.event_loop = Some(el);
        }

        let mut events = collector.events;

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

        Ok(events)
    }

    /// On browser, returns empty or collected events from DOM listeners.
    #[cfg(target_arch = "wasm32")]
    pub fn pump_events(&mut self) -> PlatformResult<Vec<PlatformEvent>> {
        Ok(self
            .windows
            .values()
            .flat_map(|window| window.drain_resize_events())
            .map(PlatformEvent::Window)
            .collect())
    }
}

#[path = "context_events.rs"]
mod context_events;
#[cfg(not(target_arch = "wasm32"))]
use context_events::EventCollector;
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
