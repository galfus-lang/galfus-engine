//! Native winit event normalization for the platform context.

#[cfg(not(target_arch = "wasm32"))]
use super::*;

#[cfg(not(target_arch = "wasm32"))]
pub(super) struct EventCollector<'a> {
    pub(super) winit_to_logical: &'a HashMap<WinitWindowId, u32>,
    pub(super) pointer_positions: &'a mut HashMap<(u32, u64), Vec2>,
    pub(super) modifiers: &'a mut HashMap<u32, ModifiersState>,
    pub(super) events: Vec<PlatformEvent>,
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
                WinitWindowEvent::CursorMoved { position, .. } => {
                    let pos = Vec2::new(position.x as f32, position.y as f32);
                    let prev_pos = self.pointer_positions.insert((logical_id, 0), pos);
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
                }
                _ => {}
            }
        }
    }
}
