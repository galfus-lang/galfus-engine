//! Browser input-method bridge. Editing state remains owned by the host.

use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};
use wasm_bindgen::{JsCast, closure::Closure};

use crate::{
    error::{PlatformError, PlatformResult},
    keyboard::{KeyCode, KeyState, KeyboardEvent, LogicalKey, ModifiersState},
};

fn error(value: impl std::fmt::Debug) -> PlatformError {
    PlatformError::WindowCreationFailed(format!("Browser IME: {value:?}"))
}

type DomCallback<T> = (&'static str, Closure<dyn FnMut(T)>);

pub(super) struct BrowserIme {
    window_id: u32,
    input: web_sys::HtmlTextAreaElement,
    events: Rc<RefCell<Vec<KeyboardEvent>>>,
    callbacks: Vec<DomCallback<web_sys::CompositionEvent>>,
    key_callbacks: Vec<DomCallback<web_sys::KeyboardEvent>>,
    event_callbacks: Vec<DomCallback<web_sys::Event>>,
    enabled: Rc<Cell<bool>>,
}

impl BrowserIme {
    pub(super) fn new(window_id: u32) -> PlatformResult<Self> {
        let document = web_sys::window()
            .and_then(|w| w.document())
            .ok_or_else(|| error("document unavailable"))?;
        let input = document
            .create_element("textarea")
            .map_err(error)?
            .dyn_into::<web_sys::HtmlTextAreaElement>()
            .map_err(error)?;
        input.set_attribute("aria-hidden", "true").map_err(error)?;
        input.set_attribute("tabindex", "-1").map_err(error)?;
        input.set_attribute("style", "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1").map_err(error)?;
        document
            .body()
            .ok_or_else(|| error("document body unavailable"))?
            .append_child(&input)
            .map_err(error)?;
        let events = Rc::new(RefCell::new(Vec::new()));
        let enabled = Rc::new(Cell::new(false));
        let mut callbacks = Vec::new();
        for name in ["compositionupdate", "compositionend"] {
            let queue = Rc::clone(&events);
            let active = Rc::clone(&enabled);
            let input_ref = input.clone();
            let callback = Closure::<dyn FnMut(web_sys::CompositionEvent)>::new(
                move |event: web_sys::CompositionEvent| {
                    if !active.get() {
                        return;
                    }
                    let text = event.data().unwrap_or_default();
                    let mut queue = queue.borrow_mut();
                    if name == "compositionupdate" {
                        queue.push(KeyboardEvent::ImePreedit {
                            window_id,
                            text,
                            selection: None,
                        });
                    } else {
                        queue.push(KeyboardEvent::ImePreedit {
                            window_id,
                            text: String::new(),
                            selection: None,
                        });
                        if !text.is_empty() {
                            queue.push(KeyboardEvent::ImeCommit { window_id, text });
                        }
                        input_ref.set_value("");
                    }
                },
            );
            input
                .add_event_listener_with_callback(name, callback.as_ref().unchecked_ref())
                .map_err(error)?;
            callbacks.push((name, callback));
        }
        let mut key_callbacks = Vec::new();
        for name in ["keydown", "keyup"] {
            let queue = Rc::clone(&events);
            let callback = Closure::<dyn FnMut(web_sys::KeyboardEvent)>::new(
                move |event: web_sys::KeyboardEvent| {
                    let code = event.code();
                    let mut chars = code.chars();
                    let code = chars
                        .next()
                        .map(|c| c.to_ascii_lowercase().to_string() + chars.as_str())
                        .unwrap_or_default();
                    let physical_key: KeyCode =
                        serde_json::from_value(serde_json::Value::String(code)).unwrap_or_default();
                    let key = event.key();
                    let logical_key: LogicalKey =
                        serde_json::from_value(serde_json::Value::String(key.clone()))
                            .unwrap_or(LogicalKey::Unidentified);
                    let text =
                        if name == "keydown" && !event.is_composing() && key.chars().count() == 1 {
                            Some(key)
                        } else {
                            None
                        };
                    queue.borrow_mut().push(KeyboardEvent::Input {
                        window_id,
                        physical_key,
                        logical_key,
                        text,
                        state: if name == "keydown" {
                            KeyState::Pressed
                        } else {
                            KeyState::Released
                        },
                        modifiers: ModifiersState {
                            shift: event.shift_key(),
                            ctrl: event.ctrl_key(),
                            alt: event.alt_key(),
                            super_key: event.meta_key(),
                        },
                        repeat: event.repeat(),
                    });
                },
            );
            input
                .add_event_listener_with_callback(name, callback.as_ref().unchecked_ref())
                .map_err(error)?;
            key_callbacks.push((name, callback));
        }
        let mut event_callbacks = Vec::new();
        let active = Rc::clone(&enabled);
        let queue = Rc::clone(&events);
        let callback = Closure::<dyn FnMut(web_sys::Event)>::new(move |_| {
            if active.replace(false) {
                queue
                    .borrow_mut()
                    .push(KeyboardEvent::ImeDisabled { window_id });
            }
        });
        input
            .add_event_listener_with_callback("blur", callback.as_ref().unchecked_ref())
            .map_err(error)?;
        event_callbacks.push(("blur", callback));
        let input_ref = input.clone();
        let callback = Closure::<dyn FnMut(web_sys::Event)>::new(move |event: web_sys::Event| {
            if event
                .dyn_ref::<web_sys::InputEvent>()
                .is_some_and(|event| !event.is_composing())
            {
                input_ref.set_value("");
            }
        });
        input
            .add_event_listener_with_callback("input", callback.as_ref().unchecked_ref())
            .map_err(error)?;
        event_callbacks.push(("input", callback));
        Ok(Self {
            window_id,
            input,
            events,
            callbacks,
            key_callbacks,
            event_callbacks,
            enabled,
        })
    }

    pub(super) fn enable(&mut self) -> PlatformResult<()> {
        if !self.enabled.get() {
            self.input.focus().map_err(error)?;
            self.enabled.set(true);
            self.events.borrow_mut().push(KeyboardEvent::ImeEnabled {
                window_id: self.window_id,
            });
        }
        Ok(())
    }

    pub(super) fn disable(&mut self) -> PlatformResult<()> {
        if self.enabled.replace(false) {
            self.input.blur().map_err(error)?;
            self.input.set_value("");
            self.events.borrow_mut().push(KeyboardEvent::ImeDisabled {
                window_id: self.window_id,
            });
        }
        Ok(())
    }

    pub(super) fn set_cursor_area(
        &self,
        canvas: &web_sys::HtmlCanvasElement,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> PlatformResult<()> {
        let rect = canvas.get_bounding_client_rect();
        let scale_x = rect.width() / f64::from(canvas.width().max(1));
        let scale_y = rect.height() / f64::from(canvas.height().max(1));
        self.input.set_attribute("style", &format!("position:fixed;left:{}px;top:{}px;width:{}px;height:{}px;opacity:0;pointer-events:none;z-index:-1", rect.left() + f64::from(x) * scale_x, rect.top() + f64::from(y) * scale_y, (f64::from(width) * scale_x).max(1.0), (f64::from(height) * scale_y).max(1.0))).map_err(error)
    }

    pub(super) fn drain(&self) -> Vec<KeyboardEvent> {
        std::mem::take(&mut self.events.borrow_mut())
    }
}

impl Drop for BrowserIme {
    fn drop(&mut self) {
        for (name, callback) in &self.callbacks {
            let _ = self
                .input
                .remove_event_listener_with_callback(name, callback.as_ref().unchecked_ref());
        }
        for (name, callback) in &self.key_callbacks {
            let _ = self
                .input
                .remove_event_listener_with_callback(name, callback.as_ref().unchecked_ref());
        }
        for (name, callback) in &self.event_callbacks {
            let _ = self
                .input
                .remove_event_listener_with_callback(name, callback.as_ref().unchecked_ref());
        }
        self.input.remove();
    }
}
