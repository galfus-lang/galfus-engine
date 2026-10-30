use glam::{IVec2, UVec2};

#[cfg(all(target_arch = "wasm32", feature = "browser"))]
use std::cell::RefCell;
#[cfg(all(target_arch = "wasm32", feature = "browser"))]
use std::rc::Rc;
#[cfg(all(target_arch = "wasm32", feature = "browser"))]
use wasm_bindgen::{JsCast, closure::Closure};

use crate::error::PlatformResult;
use crate::window::WindowEvent;
use crate::window::types::{
    CursorGrabMode, CursorIcon, FullscreenMode, UserAttentionType, WindowConfig,
};

#[cfg(all(target_arch = "wasm32", feature = "browser"))]
#[derive(Debug)]
struct BrowserResizeState {
    size: UVec2,
    scale_factor: f64,
    events: Vec<WindowEvent>,
}

#[cfg(all(target_arch = "wasm32", feature = "browser"))]
struct BrowserResizeObserver {
    observer: web_sys::ResizeObserver,
    _callback: Closure<dyn FnMut(js_sys::Array, web_sys::ResizeObserver)>,
}

/// A browser canvas surface representation.
pub struct BrowserWindow {
    id: u32,
    canvas_id: String,
    title: String,
    size: UVec2,
    #[cfg(not(all(target_arch = "wasm32", feature = "browser")))]
    scale_factor: f64,
    visible: bool,
    resizable: bool,
    #[cfg(all(target_arch = "wasm32", feature = "browser"))]
    resize_state: Rc<RefCell<BrowserResizeState>>,
    #[cfg(all(target_arch = "wasm32", feature = "browser"))]
    canvas: Option<web_sys::HtmlCanvasElement>,
    #[cfg(all(target_arch = "wasm32", feature = "browser"))]
    resize_observer: Option<BrowserResizeObserver>,
}

impl BrowserWindow {
    /// Constructs a browser canvas representation from configuration.
    pub fn new(config: &WindowConfig) -> PlatformResult<Self> {
        let canvas_id = config
            .canvas_id
            .clone()
            .unwrap_or_else(|| "galfus-canvas".to_string());

        let window = Self {
            id: config.id,
            canvas_id,
            title: config.title.clone(),
            size: config.size,
            #[cfg(not(all(target_arch = "wasm32", feature = "browser")))]
            scale_factor: 1.0,
            visible: true,
            resizable: config.resizable,
            #[cfg(all(target_arch = "wasm32", feature = "browser"))]
            resize_state: Rc::new(RefCell::new(BrowserResizeState {
                size: config.size,
                scale_factor: 1.0,
                events: Vec::new(),
            })),
            #[cfg(all(target_arch = "wasm32", feature = "browser"))]
            canvas: None,
            #[cfg(all(target_arch = "wasm32", feature = "browser"))]
            resize_observer: None,
        };

        #[cfg(all(target_arch = "wasm32", feature = "browser"))]
        {
            let mut window = window;
            window.observe_canvas_resize()?;
            Ok(window)
        }

        #[cfg(not(all(target_arch = "wasm32", feature = "browser")))]
        Ok(window)
    }

    /// Returns the logical window ID.
    pub const fn id(&self) -> u32 {
        self.id
    }

    /// Returns the DOM element ID for this canvas.
    pub fn canvas_id(&self) -> &str {
        &self.canvas_id
    }

    /// Returns the document/tab title.
    pub fn title(&self) -> &str {
        &self.title
    }

    /// Updates the title.
    pub fn set_title(&mut self, title: &str) {
        self.title = title.to_string();
    }

    /// Returns canvas dimensions.
    pub fn inner_size(&self) -> UVec2 {
        #[cfg(all(target_arch = "wasm32", feature = "browser"))]
        return self.resize_state.borrow().size;

        #[cfg(not(all(target_arch = "wasm32", feature = "browser")))]
        self.size
    }

    /// Updates canvas dimensions.
    pub fn set_inner_size(&mut self, width: u32, height: u32) {
        self.size = UVec2::new(width, height);

        #[cfg(all(target_arch = "wasm32", feature = "browser"))]
        {
            let size = UVec2::new(width, height);
            let mut state = self.resize_state.borrow_mut();
            state.size = size;
            if let Some(canvas) = &self.canvas {
                canvas.set_width(width);
                canvas.set_height(height);
            }
        }
    }

    /// Sets the minimum inner dimensions.
    pub fn set_min_inner_size(&self, _min_size: Option<UVec2>) {}

    /// Sets the maximum inner dimensions.
    pub fn set_max_inner_size(&self, _max_size: Option<UVec2>) {}

    /// Returns outer size (equivalent to inner on canvas).
    pub fn outer_size(&self) -> UVec2 {
        self.size
    }

    /// Canvas position is managed by DOM layout.
    pub fn position(&self) -> Option<IVec2> {
        None
    }

    /// Setting window position is not applicable to web canvases.
    pub fn set_position(&self, _x: i32, _y: i32) {}

    /// Returns display device pixel ratio.
    pub fn scale_factor(&self) -> f64 {
        #[cfg(all(target_arch = "wasm32", feature = "browser"))]
        return self.resize_state.borrow().scale_factor;

        #[cfg(not(all(target_arch = "wasm32", feature = "browser")))]
        self.scale_factor
    }

    /// Shows or hides the canvas.
    pub fn set_visible(&mut self, visible: bool) {
        self.visible = visible;
    }

    /// Returns whether the canvas is visible.
    pub fn is_visible(&self) -> bool {
        self.visible
    }

    /// Requests HTML5 Fullscreen for the canvas.
    pub fn set_fullscreen(&self, _mode: Option<FullscreenMode>) {}

    /// Returns whether the canvas is in fullscreen.
    pub fn is_fullscreen(&self) -> bool {
        false
    }

    /// Maximized state for web canvas.
    pub fn set_maximized(&self, _maximized: bool) {}

    /// Returns true if maximized.
    pub fn is_maximized(&self) -> bool {
        false
    }

    /// Minimized state for web canvas.
    pub fn set_minimized(&self, _minimized: bool) {}

    /// Returns true if minimized.
    pub fn is_minimized(&self) -> bool {
        false
    }

    /// Resizable state for web canvas.
    pub fn set_resizable(&mut self, resizable: bool) {
        self.resizable = resizable;
    }

    /// Returns whether the canvas can be resized.
    pub fn is_resizable(&self) -> bool {
        self.resizable
    }

    /// Decorations for web canvas.
    pub fn set_decorations(&self, _decorations: bool) {}

    /// Returns whether decorations are enabled.
    pub fn is_decorated(&self) -> bool {
        false
    }

    /// Returns whether the canvas currently has focus.
    pub fn is_focused(&self) -> bool {
        true
    }

    /// Focuses the canvas DOM element.
    pub fn focus(&self) {}

    /// User attention on web.
    pub fn request_user_attention(&self, _attention: Option<UserAttentionType>) {}

    /// Cursor visibility on web.
    pub fn set_cursor_visible(&self, _visible: bool) {}

    /// Pointer Lock API support.
    pub fn set_cursor_grab(&self, _mode: CursorGrabMode) -> PlatformResult<()> {
        Ok(())
    }

    /// Sets cursor position.
    pub fn set_cursor_position(&self, _x: i32, _y: i32) -> PlatformResult<()> {
        Ok(())
    }

    /// CSS cursor styling.
    pub fn set_cursor_icon(&self, _icon: CursorIcon) {}

    /// Sets application window icon (graceful no-op in browser canvas environment).
    pub fn set_icon(&self, _data: &[u8]) -> PlatformResult<()> {
        Ok(())
    }

    /// Schedules `requestAnimationFrame`.
    pub fn request_redraw(&self) {}

    /// Drains resize events produced by the DOM canvas observer.
    pub fn drain_resize_events(&self) -> Vec<WindowEvent> {
        #[cfg(all(target_arch = "wasm32", feature = "browser"))]
        return std::mem::take(&mut self.resize_state.borrow_mut().events);

        #[cfg(not(all(target_arch = "wasm32", feature = "browser")))]
        Vec::new()
    }

    #[cfg(all(target_arch = "wasm32", feature = "browser"))]
    fn observe_canvas_resize(&mut self) -> PlatformResult<()> {
        let window = web_sys::window().ok_or_else(|| {
            crate::error::PlatformError::WindowCreationFailed(
                "Browser window is unavailable".into(),
            )
        })?;
        let document = window.document().ok_or_else(|| {
            crate::error::PlatformError::WindowCreationFailed(
                "Browser document is unavailable".into(),
            )
        })?;
        let element = document.get_element_by_id(&self.canvas_id).ok_or_else(|| {
            crate::error::PlatformError::WindowCreationFailed(format!(
                "Canvas element '{}' was not found",
                self.canvas_id
            ))
        })?;
        let canvas = element
            .dyn_into::<web_sys::HtmlCanvasElement>()
            .map_err(|_| {
                crate::error::PlatformError::WindowCreationFailed(format!(
                    "Element '{}' is not a canvas",
                    self.canvas_id
                ))
            })?;
        let observed_element: web_sys::Element = canvas.clone().unchecked_into();
        let observed_canvas = canvas.clone();
        let state = Rc::clone(&self.resize_state);
        let window_id = self.id;
        let callback = Closure::<dyn FnMut(js_sys::Array, web_sys::ResizeObserver)>::new(
            move |_entries, _observer| {
                let width = observed_canvas.client_width().max(1) as u32;
                let height = observed_canvas.client_height().max(1) as u32;
                let scale_factor = web_sys::window()
                    .map(|window| window.device_pixel_ratio())
                    .filter(|scale| *scale > 0.0)
                    .unwrap_or(1.0);
                let size = UVec2::new(width, height);
                let mut state = state.borrow_mut();

                if observed_canvas.width() != width {
                    observed_canvas.set_width(width);
                }
                if observed_canvas.height() != height {
                    observed_canvas.set_height(height);
                }

                if state.size == size && state.scale_factor == scale_factor {
                    return;
                }

                state.size = size;
                state.scale_factor = scale_factor;
                state.events.push(WindowEvent::Resized {
                    window_id,
                    width,
                    height,
                    scale_factor,
                });
            },
        );
        let observer =
            web_sys::ResizeObserver::new(callback.as_ref().unchecked_ref()).map_err(|error| {
                crate::error::PlatformError::WindowCreationFailed(format!(
                    "Failed to create canvas resize observer: {error:?}"
                ))
            })?;
        observer.observe(&observed_element);

        self.canvas = Some(canvas);
        self.resize_observer = Some(BrowserResizeObserver {
            observer,
            _callback: callback,
        });
        Ok(())
    }
}

#[cfg(all(target_arch = "wasm32", feature = "browser"))]
impl Drop for BrowserWindow {
    fn drop(&mut self) {
        if let Some(resize_observer) = &self.resize_observer {
            resize_observer.observer.disconnect();
        }
    }
}
