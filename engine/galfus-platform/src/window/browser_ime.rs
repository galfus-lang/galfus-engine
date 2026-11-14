//!Browser input-method bridge. Editing state remains owned by the host.

use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};
use wasm_bindgen::{JsCast, closure::Closure};

use crate::{
    error::{PlatformError, PlatformResult},
    event::PlatformEvent,
    keyboard::KeyboardEvent,
    window::WindowEvent,
};

fn error(value: impl std::fmt::Debug) -> PlatformError {
    PlatformError::WindowCreationFailed(format!("Browser IME: {value:?}"))
}

type DomCallback<T> = (&'static str, Closure<dyn FnMut(T)>);

pub(super) struct BrowserIme {
    window_id: u32,
    input: web_sys::HtmlTextAreaElement,
    events: Rc<RefCell<Vec<PlatformEvent>>>,
    callbacks: Vec<DomCallback<web_sys::CompositionEvent>>,
    key_callbacks: Vec<DomCallback<web_sys::KeyboardEvent>>,
    event_callbacks: Vec<DomCallback<web_sys::Event>>,
    focus_callbacks: Vec<DomCallback<web_sys::FocusEvent>>,
    clipboard_callbacks: Vec<DomCallback<web_sys::ClipboardEvent>>,
    enabled: Rc<Cell<bool>>,
    composing: Rc<Cell<bool>>,
}

impl BrowserIme {
    pub(super) fn new(
        window_id: u32,
        tab_capture: Rc<Cell<bool>>,
        focused: Rc<Cell<bool>>,
        clipboard: Rc<RefCell<String>>,
        events: Rc<RefCell<Vec<PlatformEvent>>>,
    ) -> PlatformResult<Self> {
        let document = web_sys::window()
            .and_then(|w| w.document())
            .ok_or_else(|| error("document unavailable"))?;
        let input = document
            .create_element("textarea")
            .map_err(error)?
            .dyn_into::<web_sys::HtmlTextAreaElement>()
            .map_err(error)?;
        input.set_attribute("aria-hidden", "true").map_err(error)?;
        input
            .set_attribute("data-galfus-ime", &window_id.to_string())
            .map_err(error)?;
        input.set_attribute("tabindex", "-1").map_err(error)?;
        input.set_attribute("style", "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1").map_err(error)?;
        document
            .body()
            .ok_or_else(|| error("document body unavailable"))?
            .append_child(&input)
            .map_err(error)?;
        let enabled = Rc::new(Cell::new(false));
        let composing = Rc::new(Cell::new(false));
        let mut callbacks = Vec::new();
        for name in ["compositionstart", "compositionupdate", "compositionend"] {
            let queue = Rc::clone(&events);
            let active = Rc::clone(&enabled);
            let composing_ref = Rc::clone(&composing);
            let input_ref = input.clone();
            let callback = Closure::<dyn FnMut(web_sys::CompositionEvent)>::new(
                move |event: web_sys::CompositionEvent| {
                    if !active.get() {
                        return;
                    }
                    let text = event.data().unwrap_or_default();
                    let mut queue = queue.borrow_mut();
                    if name == "compositionstart" {
                        composing_ref.set(true);
                    } else if name == "compositionupdate" {
                        queue.push(PlatformEvent::Keyboard(KeyboardEvent::ImePreedit {
                            window_id,
                            text,
                            selection: None,
                        }));
                    } else {
                        composing_ref.set(false);
                        queue.push(PlatformEvent::Keyboard(KeyboardEvent::ImePreedit {
                            window_id,
                            text: String::new(),
                            selection: None,
                        }));
                        if !text.is_empty() {
                            queue.push(PlatformEvent::Keyboard(KeyboardEvent::ImeCommit {
                                window_id,
                                text: text.clone(),
                            }));
                            queue.push(PlatformEvent::Keyboard(KeyboardEvent::TextInput {
                                window_id,
                                text,
                            }));
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
            input
                .add_event_listener_with_callback(name, callback.as_ref().unchecked_ref())
                .map_err(error)?;
            key_callbacks.push((name, callback));
        }

        let mut focus_callbacks = Vec::new();
        {
            let queue = Rc::clone(&events);
            let focused_ref = Rc::clone(&focused);
            let clipboard_ref = Rc::clone(&clipboard);
            let focus_cb = Closure::<dyn FnMut(web_sys::FocusEvent)>::new(move |_| {
                super::browser_pointer::sync_navigator_clipboard(&clipboard_ref);
                if !focused_ref.replace(true) {
                    queue
                        .borrow_mut()
                        .push(PlatformEvent::Window(WindowEvent::FocusChanged {
                            window_id,
                            focused: true,
                        }));
                }
            });
            input
                .add_event_listener_with_callback("focus", focus_cb.as_ref().unchecked_ref())
                .map_err(error)?;
            focus_callbacks.push(("focus", focus_cb));
        }
        {
            let active = Rc::clone(&enabled);
            let queue = Rc::clone(&events);
            let composing_ref = Rc::clone(&composing);
            let focused_ref = Rc::clone(&focused);
            let blur_cb =
                Closure::<dyn FnMut(web_sys::FocusEvent)>::new(move |ev: web_sys::FocusEvent| {
                    if active.replace(false) {
                        composing_ref.set(false);
                        queue.borrow_mut().push(PlatformEvent::Keyboard(
                            KeyboardEvent::ImeDisabled { window_id },
                        ));
                    }
                    let stay_in_window = ev
                        .related_target()
                        .and_then(|t| t.dyn_into::<web_sys::Element>().ok())
                        .is_some_and(|el| {
                            el.get_attribute("data-galfus-window")
                                .is_some_and(|id| id.parse::<u32>().ok() == Some(window_id))
                                || el
                                    .get_attribute("data-galfus-ime")
                                    .is_some_and(|id| id.parse::<u32>().ok() == Some(window_id))
                        });
                    if !stay_in_window && focused_ref.replace(false) {
                        queue
                            .borrow_mut()
                            .push(PlatformEvent::Window(WindowEvent::FocusChanged {
                                window_id,
                                focused: false,
                            }));
                    }
                });
            input
                .add_event_listener_with_callback("blur", blur_cb.as_ref().unchecked_ref())
                .map_err(error)?;
            focus_callbacks.push(("blur", blur_cb));
        }

        let mut clipboard_callbacks = Vec::new();
        {
            let clipboard_ref = Rc::clone(&clipboard);
            let queue = Rc::clone(&events);
            let active = Rc::clone(&enabled);
            let paste_cb = Closure::<dyn FnMut(web_sys::ClipboardEvent)>::new(
                move |ev: web_sys::ClipboardEvent| {
                    if let Some(dt) = ev.clipboard_data()
                        && let Ok(text) = dt.get_data("text/plain")
                    {
                        *clipboard_ref.borrow_mut() = text.clone();
                        if active.get() && !text.is_empty() {
                            queue.borrow_mut().push(PlatformEvent::Keyboard(
                                KeyboardEvent::TextInput { window_id, text },
                            ));
                        }
                    }
                    ev.prevent_default();
                },
            );
            input
                .add_event_listener_with_callback("paste", paste_cb.as_ref().unchecked_ref())
                .map_err(error)?;
            clipboard_callbacks.push(("paste", paste_cb));
        }

        let mut event_callbacks = Vec::new();
        let input_ref = input.clone();
        let composing_ref = Rc::clone(&composing);
        let queue = Rc::clone(&events);
        let active = Rc::clone(&enabled);
        let callback =
            Closure::<dyn FnMut(web_sys::Event)>::new(move |event: web_sys::Event| {
                let Some(input_event) = event.dyn_ref::<web_sys::InputEvent>() else {
                    return;
                };
                if !active.get() {
                    return;
                }
                if composing_ref.get() || input_event.is_composing() {
                    // Browser selection offsets are UTF-16. They describe the preedit only
                    // when the textarea contains exactly the current composition text.
                    if let Some(text) = input_event.data()
                        && input_ref.value() == text
                        && let (Ok(Some(start)), Ok(Some(end))) =
                            (input_ref.selection_start(), input_ref.selection_end())
                        && start <= end
                        && end as usize <= text.encode_utf16().count()
                    {
                        queue.borrow_mut().push(PlatformEvent::Keyboard(
                            KeyboardEvent::ImePreedit {
                                window_id,
                                text,
                                selection: Some([start, end]),
                            },
                        ));
                    }
                    return;
                }
                let kind = input_event.input_type();
                if kind.starts_with("insert")
                    && kind != "insertCompositionText"
                    && kind != "insertFromComposition"
                    && kind != "insertFromDrop"
                {
                    let text = input_event.data().unwrap_or_else(|| input_ref.value());
                    if !text.is_empty() {
                        queue.borrow_mut().push(PlatformEvent::Keyboard(
                            KeyboardEvent::TextInput { window_id, text },
                        ));
                    }
                }
                input_ref.set_value("");
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
            focus_callbacks,
            clipboard_callbacks,
            enabled,
            composing,
        })
    }

    pub(super) fn enable(&mut self) -> PlatformResult<()> {
        if !self.enabled.get() {
            self.input.focus().map_err(error)?;
            self.enabled.set(true);
            self.events
                .borrow_mut()
                .push(PlatformEvent::Keyboard(KeyboardEvent::ImeEnabled {
                    window_id: self.window_id,
                }));
        }
        Ok(())
    }

    pub(super) fn disable(&mut self) -> PlatformResult<()> {
        if self.enabled.replace(false) {
            self.composing.set(false);
            self.input.blur().map_err(error)?;
            self.input.set_value("");
            self.events
                .borrow_mut()
                .push(PlatformEvent::Keyboard(KeyboardEvent::ImeDisabled {
                    window_id: self.window_id,
                }));
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
        for (name, callback) in &self.focus_callbacks {
            let _ = self
                .input
                .remove_event_listener_with_callback(name, callback.as_ref().unchecked_ref());
        }
        for (name, callback) in &self.clipboard_callbacks {
            let _ = self
                .input
                .remove_event_listener_with_callback(name, callback.as_ref().unchecked_ref());
        }
        self.input.remove();
    }
}
