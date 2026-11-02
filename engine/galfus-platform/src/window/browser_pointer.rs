//! Browser canvas pointer event adapter.

use glam::Vec2;
use std::{
    cell::{Cell, RefCell},
    collections::HashMap,
    rc::Rc,
};
use wasm_bindgen::{JsCast, closure::Closure};

use crate::{
    error::{PlatformError, PlatformResult},
    event::PlatformEvent,
    pointer::{PointerButton, PointerButtonState, PointerEvent, PointerType},
};

type Callback<T> = (&'static str, Closure<dyn FnMut(T)>);

pub(super) struct BrowserPointer {
    canvas: web_sys::HtmlCanvasElement,
    callbacks: Vec<Callback<web_sys::PointerEvent>>,
    keyboard_callbacks: Vec<Callback<web_sys::KeyboardEvent>>,
    window_callbacks: Vec<Callback<web_sys::Event>>,
    added_tabindex: bool,
}

impl BrowserPointer {
    pub(super) fn new(
        window_id: u32,
        canvas: &web_sys::HtmlCanvasElement,
        tab_capture: Rc<Cell<bool>>,
        events: Rc<RefCell<Vec<PlatformEvent>>>,
    ) -> PlatformResult<Self> {
        let positions = Rc::new(RefCell::new(HashMap::<u64, Vec2>::new()));
        let mut result = Self {
            canvas: canvas.clone(),
            callbacks: Vec::new(),
            keyboard_callbacks: Vec::new(),
            window_callbacks: Vec::new(),
            added_tabindex: false,
        };
        for name in [
            "pointerenter",
            "pointerleave",
            "pointermove",
            "pointerdown",
            "pointerup",
            "pointercancel",
        ] {
            let queue = Rc::clone(&events);
            let positions = Rc::clone(&positions);
            let surface = canvas.clone();
            let callback = Closure::<dyn FnMut(web_sys::PointerEvent)>::new(
                move |event: web_sys::PointerEvent| {
                    let pointer_type = match event.pointer_type().as_str() {
                        "touch" => PointerType::Touch,
                        "pen" => PointerType::Pen,
                        _ => PointerType::Mouse,
                    };
                    let pointer_id = if pointer_type == PointerType::Mouse {
                        0
                    } else {
                        event.pointer_id().max(0) as u64
                    };
                    let rect = surface.get_bounding_client_rect();
                    if rect.width() <= 0.0 || rect.height() <= 0.0 {
                        return;
                    }
                    let position = Vec2::new(
                        ((event.client_x() - rect.left()) * f64::from(surface.width())
                            / rect.width()) as f32,
                        ((event.client_y() - rect.top()) * f64::from(surface.height())
                            / rect.height()) as f32,
                    );
                    let pressure = event.pressure().clamp(0.0, 1.0);
                    let mut positions = positions.borrow_mut();
                    let previous = positions.insert(pointer_id, position).unwrap_or(position);
                    let mapped = match name {
                        "pointerenter" => PointerEvent::Enter {
                            window_id,
                            pointer_id,
                            pointer_type,
                            position,
                        },
                        "pointerleave" => {
                            positions.remove(&pointer_id);
                            PointerEvent::Leave {
                                window_id,
                                pointer_id,
                                pointer_type,
                                position,
                            }
                        }
                        "pointercancel" => {
                            positions.remove(&pointer_id);
                            PointerEvent::Cancel {
                                window_id,
                                pointer_id,
                                pointer_type,
                                position,
                            }
                        }
                        "pointermove" => PointerEvent::Move {
                            window_id,
                            pointer_id,
                            pointer_type,
                            position,
                            delta: position - previous,
                            pressure,
                        },
                        _ => {
                            let button = match event.button() {
                                0 => PointerButton::Primary,
                                1 => PointerButton::Auxiliary,
                                2 => PointerButton::Secondary,
                                3 => PointerButton::Back,
                                4 => PointerButton::Forward,
                                value => PointerButton::Other(value.max(0) as u16),
                            };
                            if name == "pointerdown" {
                                let _ = surface.set_pointer_capture(event.pointer_id());
                                let ime_focused = web_sys::window()
                                    .and_then(|window| window.document())
                                    .and_then(|document| document.active_element())
                                    .and_then(|active| active.get_attribute("data-galfus-ime"))
                                    .is_some_and(|id| id.parse::<u32>().ok() == Some(window_id));
                                if !ime_focused {
                                    let _ = surface.unchecked_ref::<web_sys::HtmlElement>().focus();
                                }
                            }
                            PointerEvent::Button {
                                window_id,
                                pointer_id,
                                pointer_type,
                                position,
                                button,
                                state: if name == "pointerdown" {
                                    PointerButtonState::Pressed
                                } else {
                                    PointerButtonState::Released
                                },
                                pressure,
                            }
                        }
                    };
                    queue.borrow_mut().push(PlatformEvent::Pointer(mapped));
                },
            );
            canvas
                .add_event_listener_with_callback(name, callback.as_ref().unchecked_ref())
                .map_err(|error| {
                    PlatformError::WindowCreationFailed(format!(
                        "Browser pointer listener: {error:?}"
                    ))
                })?;
            result.callbacks.push((name, callback));
        }
        let added_tabindex = !canvas.has_attribute("tabindex");
        if added_tabindex {
            canvas.set_attribute("tabindex", "0").map_err(|error| {
                PlatformError::WindowCreationFailed(format!("Browser canvas focus: {error:?}"))
            })?;
            result.added_tabindex = true;
        }
        for name in ["keydown", "keyup"] {
            let queue = Rc::clone(&events);
            let capture = Rc::clone(&tab_capture);
            let callback = Closure::<dyn FnMut(web_sys::KeyboardEvent)>::new(
                move |event: web_sys::KeyboardEvent| {
                    if event.is_composing() {
                        return;
                    }
                    if capture.get()
                        && event.key() == "Tab"
                        && !event.ctrl_key()
                        && !event.alt_key()
                        && !event.meta_key()
                    {
                        event.prevent_default();
                    }
                    queue.borrow_mut().push(PlatformEvent::Keyboard(
                        super::browser_keyboard::map_key(window_id, &event, name == "keydown"),
                    ));
                },
            );
            canvas
                .add_event_listener_with_callback(name, callback.as_ref().unchecked_ref())
                .map_err(|error| {
                    PlatformError::WindowCreationFailed(format!(
                        "Browser keyboard listener: {error:?}"
                    ))
                })?;
            result.keyboard_callbacks.push((name, callback));
        }
        let window = web_sys::window().ok_or_else(|| {
            PlatformError::WindowCreationFailed("Browser window is unavailable".into())
        })?;
        for name in ["focus", "blur"] {
            let queue = Rc::clone(&events);
            let callback = Closure::<dyn FnMut(web_sys::Event)>::new(move |_| {
                queue.borrow_mut().push(PlatformEvent::Window(
                    crate::window::WindowEvent::FocusChanged {
                        window_id,
                        focused: name == "focus",
                    },
                ));
            });
            window
                .add_event_listener_with_callback(name, callback.as_ref().unchecked_ref())
                .map_err(|error| {
                    PlatformError::WindowCreationFailed(format!(
                        "Browser window listener: {error:?}"
                    ))
                })?;
            result.window_callbacks.push((name, callback));
        }
        Ok(result)
    }
}

impl Drop for BrowserPointer {
    fn drop(&mut self) {
        for (name, callback) in &self.callbacks {
            let _ = self
                .canvas
                .remove_event_listener_with_callback(name, callback.as_ref().unchecked_ref());
        }
        for (name, callback) in &self.keyboard_callbacks {
            let _ = self
                .canvas
                .remove_event_listener_with_callback(name, callback.as_ref().unchecked_ref());
        }
        if let Some(window) = web_sys::window() {
            for (name, callback) in &self.window_callbacks {
                let _ = window
                    .remove_event_listener_with_callback(name, callback.as_ref().unchecked_ref());
            }
        }
        if self.added_tabindex && self.canvas.get_attribute("tabindex").as_deref() == Some("0") {
            let _ = self.canvas.remove_attribute("tabindex");
        }
    }
}
