//! Native winit event normalization for the platform context.

#[cfg(not(target_arch = "wasm32"))]
use super::*;

#[cfg(not(target_arch = "wasm32"))]
pub(super) struct EventCollector<'a> {
    pub(super) winit_to_logical: &'a HashMap<WinitWindowId, u32>,
    pub(super) pointer_positions: &'a mut HashMap<(u32, u64), Vec2>,
    pub(super) focused_window: &'a mut Option<u32>,
    pub(super) cursor_grab_modes: &'a HashMap<u32, CursorGrabMode>,
    pub(super) regained_focus: Vec<u32>,
    pub(super) modifiers: &'a mut HashMap<u32, ModifiersState>,
    pub(super) composing: &'a mut std::collections::HashSet<u32>,
    pub(super) events: Vec<PlatformEvent>,
}

#[cfg(not(target_arch = "wasm32"))]
impl<'a> EventCollector<'a> {
    pub(super) fn handle_focus_changed(&mut self, logical_id: u32, focused: bool) {
        if focused {
            *self.focused_window = Some(logical_id);
            self.regained_focus.push(logical_id);
        } else {
            if *self.focused_window == Some(logical_id) {
                *self.focused_window = None;
            }
            self.composing.remove(&logical_id);
        }
        self.events
            .push(PlatformEvent::Window(WindowEvent::FocusChanged {
                window_id: logical_id,
                focused,
            }));
    }

    pub(super) fn handle_cursor_moved(&mut self, logical_id: u32, x: f64, y: f64) {
        let pos = Vec2::new(x as f32, y as f32);
        let prev_pos = self.pointer_positions.insert((logical_id, 0), pos);
        if *self.focused_window == Some(logical_id)
            && self.cursor_grab_modes.get(&logical_id).copied() == Some(CursorGrabMode::Locked)
        {
            return;
        }
        let delta = match prev_pos {
            Some(prev) => pos - prev,
            None => Vec2::ZERO,
        };
        self.events.push(PlatformEvent::Pointer(PointerEvent::Move {
            window_id: logical_id,
            pointer_id: 0,
            pointer_type: PointerType::Mouse,
            position: pos,
            delta,
            pressure: 0.0,
        }));
    }

    pub(super) fn handle_mouse_motion(&mut self, dx: f64, dy: f64) {
        let Some(logical_id) = *self.focused_window else {
            return;
        };
        if self.cursor_grab_modes.get(&logical_id).copied() != Some(CursorGrabMode::Locked) {
            return;
        }
        let delta = Vec2::new(dx as f32, dy as f32);
        if delta == Vec2::ZERO {
            return;
        }
        let pos = self
            .pointer_positions
            .get(&(logical_id, 0))
            .copied()
            .unwrap_or(Vec2::ZERO);
        self.events.push(PlatformEvent::Pointer(PointerEvent::Move {
            window_id: logical_id,
            pointer_id: 0,
            pointer_type: PointerType::Mouse,
            position: pos,
            delta,
            pressure: 0.0,
        }));
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn map_ime(window_id: u32, ime: winit::event::Ime) -> KeyboardEvent {
    use winit::event::Ime;
    match ime {
        Ime::Enabled => KeyboardEvent::ImeEnabled { window_id },
        Ime::Disabled => KeyboardEvent::ImeDisabled { window_id },
        Ime::Commit(text) => KeyboardEvent::ImeCommit { window_id, text },
        Ime::Preedit(text, selection) => {
            let selection = selection.and_then(|(start, end)| {
                Some([
                    u32::try_from(text.get(..start)?.encode_utf16().count()).ok()?,
                    u32::try_from(text.get(..end)?.encode_utf16().count()).ok()?,
                ])
            });
            KeyboardEvent::ImePreedit {
                window_id,
                text,
                selection,
            }
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn committed_key_text(
    text: Option<&str>,
    pressed: bool,
    modifiers: ModifiersState,
    composing: bool,
) -> Option<&str> {
    if !pressed || composing || modifiers.super_key || (modifiers.ctrl && !modifiers.alt) {
        return None;
    }
    text.filter(|value| !value.is_empty() && !value.chars().any(char::is_control))
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod ime_tests {
    use super::*;
    #[test]
    fn maps_preedit_byte_selection_to_utf16() {
        let text = "あ😀x".to_string();
        assert_eq!(
            map_ime(7, winit::event::Ime::Preedit(text.clone(), Some((3, 7)))),
            KeyboardEvent::ImePreedit {
                window_id: 7,
                text: text.clone(),
                selection: Some([1, 3])
            }
        );
        assert_eq!(
            map_ime(7, winit::event::Ime::Preedit(text.clone(), Some((1, 7)))),
            KeyboardEvent::ImePreedit {
                window_id: 7,
                text,
                selection: None
            }
        );
    }

    #[test]
    fn only_commits_text_from_non_composing_pressed_keys() {
        let mods = ModifiersState::EMPTY;
        assert_eq!(committed_key_text(Some("é"), true, mods, false), Some("é"));
        assert_eq!(committed_key_text(Some("a"), false, mods, false), None);
        assert_eq!(committed_key_text(Some("a"), true, mods, true), None);
        assert_eq!(committed_key_text(Some("\n"), true, mods, false), None);
        let ctrl = ModifiersState { ctrl: true, ..mods };
        assert_eq!(committed_key_text(Some("a"), true, ctrl, false), None);
        let alt_gr = ModifiersState { alt: true, ..ctrl };
        assert_eq!(
            committed_key_text(Some("€"), true, alt_gr, false),
            Some("€")
        );
    }

    #[test]
    fn locked_mouse_motion_emits_move_and_suppresses_cursor_moved() {
        let winit_to_logical = HashMap::new();
        let mut pointer_positions = HashMap::from([((1, 0), Vec2::new(100.0, 200.0))]);
        let mut focused_window = Some(1);
        let cursor_grab_modes = HashMap::from([(1, CursorGrabMode::Locked)]);
        let mut modifiers = HashMap::new();
        let mut composing = std::collections::HashSet::new();

        let mut collector = EventCollector {
            winit_to_logical: &winit_to_logical,
            pointer_positions: &mut pointer_positions,
            focused_window: &mut focused_window,
            cursor_grab_modes: &cursor_grab_modes,
            regained_focus: Vec::new(),
            modifiers: &mut modifiers,
            composing: &mut composing,
            events: Vec::new(),
        };

        // CursorMoved while locked updates tracked position without emitting duplicate Move.
        collector.handle_cursor_moved(1, 150.0, 250.0);
        assert!(collector.events.is_empty());

        // DeviceEvent::MouseMotion emits Move with raw delta and latest position.
        collector.handle_mouse_motion(12.5, -7.25);
        assert_eq!(collector.events.len(), 1);
        assert_eq!(
            collector.events[0],
            PlatformEvent::Pointer(PointerEvent::Move {
                window_id: 1,
                pointer_id: 0,
                pointer_type: PointerType::Mouse,
                position: Vec2::new(150.0, 250.0),
                delta: Vec2::new(12.5, -7.25),
                pressure: 0.0,
            })
        );

        // Losing focus stops forwarding device mouse motion.
        collector.handle_focus_changed(1, false);
        collector.handle_mouse_motion(5.0, 5.0);
        assert_eq!(collector.events.len(), 2); // only FocusChanged added

        // Regaining focus records window for cursor grab restoration and resumes locked motion.
        collector.handle_focus_changed(1, true);
        assert_eq!(collector.regained_focus, vec![1]);
        collector.handle_mouse_motion(-3.0, 4.0);
        assert_eq!(collector.events.len(), 4);
        assert_eq!(
            collector.events[3],
            PlatformEvent::Pointer(PointerEvent::Move {
                window_id: 1,
                pointer_id: 0,
                pointer_type: PointerType::Mouse,
                position: Vec2::new(150.0, 250.0),
                delta: Vec2::new(-3.0, 4.0),
                pressure: 0.0,
            })
        );
    }

    #[test]
    fn unlocked_mouse_ignores_device_motion_and_uses_cursor_moved() {
        let winit_to_logical = HashMap::new();
        let mut pointer_positions = HashMap::from([((1, 0), Vec2::new(10.0, 20.0))]);
        let mut focused_window = Some(1);
        let cursor_grab_modes = HashMap::from([(1, CursorGrabMode::None)]);
        let mut modifiers = HashMap::new();
        let mut composing = std::collections::HashSet::new();

        let mut collector = EventCollector {
            winit_to_logical: &winit_to_logical,
            pointer_positions: &mut pointer_positions,
            focused_window: &mut focused_window,
            cursor_grab_modes: &cursor_grab_modes,
            regained_focus: Vec::new(),
            modifiers: &mut modifiers,
            composing: &mut composing,
            events: Vec::new(),
        };

        collector.handle_mouse_motion(9.0, -4.0);
        assert!(collector.events.is_empty());

        collector.handle_cursor_moved(1, 25.0, 30.0);
        assert_eq!(collector.events.len(), 1);
        assert_eq!(
            collector.events[0],
            PlatformEvent::Pointer(PointerEvent::Move {
                window_id: 1,
                pointer_id: 0,
                pointer_type: PointerType::Mouse,
                position: Vec2::new(25.0, 30.0),
                delta: Vec2::new(15.0, 10.0),
                pressure: 0.0,
            })
        );
    }
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
                    self.handle_focus_changed(logical_id, focused);
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
                WinitWindowEvent::CursorMoved { position, .. } => {
                    self.handle_cursor_moved(logical_id, position.x, position.y);
                }
                WinitWindowEvent::CursorEntered { .. } => {
                    let pos = self
                        .pointer_positions
                        .get(&(logical_id, 0))
                        .copied()
                        .unwrap_or(Vec2::ZERO);
                    self.events
                        .push(PlatformEvent::Pointer(PointerEvent::Enter {
                            window_id: logical_id,
                            pointer_id: 0,
                            pointer_type: PointerType::Mouse,
                            position: pos,
                        }));
                }
                WinitWindowEvent::CursorLeft { .. } => {
                    let pos = self
                        .pointer_positions
                        .get(&(logical_id, 0))
                        .copied()
                        .unwrap_or(Vec2::ZERO);
                    self.events
                        .push(PlatformEvent::Pointer(PointerEvent::Leave {
                            window_id: logical_id,
                            pointer_id: 0,
                            pointer_type: PointerType::Mouse,
                            position: pos,
                        }));
                }
                WinitWindowEvent::MouseInput { state, button, .. } => {
                    let (mapped_state, pressure) = map_button_state(state);
                    let mapped_button = map_mouse_button(button);
                    let pos = self
                        .pointer_positions
                        .get(&(logical_id, 0))
                        .copied()
                        .unwrap_or(Vec2::ZERO);
                    self.events
                        .push(PlatformEvent::Pointer(PointerEvent::Button {
                            window_id: logical_id,
                            pointer_id: 0,
                            pointer_type: PointerType::Mouse,
                            position: pos,
                            button: mapped_button,
                            state: mapped_state,
                            pressure,
                        }));
                }
                WinitWindowEvent::MouseWheel { delta, .. } => {
                    let mapped_delta = map_scroll_delta(delta);
                    let pos = self
                        .pointer_positions
                        .get(&(logical_id, 0))
                        .copied()
                        .unwrap_or(Vec2::ZERO);
                    self.events
                        .push(PlatformEvent::Pointer(PointerEvent::Scroll {
                            window_id: logical_id,
                            pointer_id: 0,
                            pointer_type: PointerType::Mouse,
                            position: pos,
                            delta: mapped_delta,
                        }));
                }
                WinitWindowEvent::Touch(touch) => {
                    let prev_pos = self.pointer_positions.get(&(logical_id, touch.id)).copied();
                    let pos = Vec2::new(touch.location.x as f32, touch.location.y as f32);
                    match touch.phase {
                        winit::event::TouchPhase::Started | winit::event::TouchPhase::Moved => {
                            self.pointer_positions.insert((logical_id, touch.id), pos);
                        }
                        winit::event::TouchPhase::Ended | winit::event::TouchPhase::Cancelled => {
                            self.pointer_positions.remove(&(logical_id, touch.id));
                        }
                    }
                    let touch_events = map_touch_event(logical_id, &touch, prev_pos);
                    for ev in touch_events {
                        self.events.push(PlatformEvent::Pointer(ev));
                    }
                }
                WinitWindowEvent::ModifiersChanged(winit_mods) => {
                    let current_mods = map_modifiers(winit_mods.state());
                    self.modifiers.insert(logical_id, current_mods);
                    self.events
                        .push(PlatformEvent::Keyboard(KeyboardEvent::ModifiersChanged {
                            window_id: logical_id,
                            modifiers: current_mods,
                        }));
                }
                WinitWindowEvent::KeyboardInput { event: key_ev, .. } => {
                    let active_mods = self
                        .modifiers
                        .get(&logical_id)
                        .copied()
                        .unwrap_or(ModifiersState::EMPTY);
                    let physical_key = map_physical_key(key_ev.physical_key);
                    let logical_key = map_logical_key(key_ev.logical_key);
                    let state = map_key_state(key_ev.state);
                    let text = key_ev.text.map(|s| s.to_string());
                    let repeat = key_ev.repeat;

                    let committed = committed_key_text(
                        text.as_deref(),
                        state.is_pressed(),
                        active_mods,
                        self.composing.contains(&logical_id),
                    )
                    .map(str::to_owned);

                    self.events
                        .push(PlatformEvent::Keyboard(KeyboardEvent::Input {
                            window_id: logical_id,
                            physical_key,
                            logical_key,
                            text,
                            state,
                            modifiers: active_mods,
                            repeat,
                        }));
                    if let Some(text) = committed {
                        self.events
                            .push(PlatformEvent::Keyboard(KeyboardEvent::TextInput {
                                window_id: logical_id,
                                text,
                            }));
                    }
                }
                WinitWindowEvent::Ime(ime) => {
                    let event = map_ime(logical_id, ime);
                    match &event {
                        KeyboardEvent::ImePreedit { text, .. } => {
                            if text.is_empty() {
                                self.composing.remove(&logical_id);
                            } else {
                                self.composing.insert(logical_id);
                            }
                        }
                        KeyboardEvent::ImeDisabled { .. } | KeyboardEvent::ImeCommit { .. } => {
                            self.composing.remove(&logical_id);
                        }
                        _ => {}
                    }
                    let committed = if let KeyboardEvent::ImeCommit { text, .. } = &event {
                        Some(text.clone())
                    } else {
                        None
                    };
                    self.events.push(PlatformEvent::Keyboard(event));
                    if let Some(text) = committed {
                        self.events
                            .push(PlatformEvent::Keyboard(KeyboardEvent::TextInput {
                                window_id: logical_id,
                                text,
                            }));
                    }
                }
                _ => {}
            }
        }
    }

    fn device_event(
        &mut self,
        _event_loop: &ActiveEventLoop,
        _device_id: winit::event::DeviceId,
        event: winit::event::DeviceEvent,
    ) {
        if let winit::event::DeviceEvent::MouseMotion { delta: (dx, dy) } = event {
            self.handle_mouse_motion(dx, dy);
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn create_winit_window(
    el: &mut winit::event_loop::EventLoop<()>,
    attrs: winit::window::WindowAttributes,
) -> crate::error::PlatformResult<winit::window::Window> {
    use winit::platform::pump_events::EventLoopExtPumpEvents;
    let mut creator = WindowCreator {
        attrs: Some(attrs),
        result: None,
    };
    let _status = el.pump_app_events(Some(std::time::Duration::ZERO), &mut creator);
    creator
        .result
        .ok_or_else(|| {
            crate::error::PlatformError::WindowCreationFailed(
                "Event loop did not yield active window context".into(),
            )
        })?
        .map_err(|e| crate::error::PlatformError::WindowCreationFailed(e.to_string()))
}

#[cfg(not(target_arch = "wasm32"))]
struct WindowCreator {
    pub attrs: Option<winit::window::WindowAttributes>,
    pub result: Option<Result<winit::window::Window, winit::error::OsError>>,
}

#[cfg(not(target_arch = "wasm32"))]
impl ApplicationHandler for WindowCreator {
    fn resumed(&mut self, event_loop: &winit::event_loop::ActiveEventLoop) {
        if let Some(a) = self.attrs.take() {
            self.result = Some(event_loop.create_window(a));
        }
    }

    fn about_to_wait(&mut self, event_loop: &winit::event_loop::ActiveEventLoop) {
        if let Some(a) = self.attrs.take() {
            self.result = Some(event_loop.create_window(a));
        }
    }

    fn window_event(
        &mut self,
        _event_loop: &winit::event_loop::ActiveEventLoop,
        _window_id: WinitWindowId,
        _event: winit::event::WindowEvent,
    ) {
    }
}
