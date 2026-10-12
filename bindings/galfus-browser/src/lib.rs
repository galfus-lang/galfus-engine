//! Browser and WebAssembly bindings for Galfus Engine.
//!
//! Provides direct native JavaScript object integration for web applications via `wasm-bindgen`
//! and `serde-wasm-bindgen`.

use wasm_bindgen::prelude::*;

use galfus_platform::{PlatformContext, WindowConfig};

/// WebAssembly-exported coordinator for Galfus platform operations on the web.
#[wasm_bindgen]
pub struct GalfusBrowser {
    context: PlatformContext,
}

#[wasm_bindgen]
impl GalfusBrowser {
    /// Creates a new `GalfusBrowser` instance.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Result<GalfusBrowser, JsValue> {
        let context = PlatformContext::new()
            .map_err(|e| JsValue::from_str(&format!("Failed to initialize platform: {e}")))?;
        Ok(Self { context })
    }

    /// Creates a headless `GalfusBrowser` instance (useful in Web Workers or test runners).
    #[wasm_bindgen(js_name = "newHeadless")]
    pub fn new_headless() -> GalfusBrowser {
        Self {
            context: PlatformContext::new_headless(),
        }
    }

    /// Returns the environment capabilities as a direct JavaScript object.
    #[wasm_bindgen(js_name = "getCapabilities")]
    pub fn get_capabilities(&self) -> Result<JsValue, JsValue> {
        let caps = self.context.capabilities();
        serde_wasm_bindgen::to_value(&caps)
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {e}")))
    }

    /// Creates and binds a canvas surface using the provided JavaScript configuration object.
    #[wasm_bindgen(js_name = "createWindow")]
    pub fn create_window(&mut self, config_val: JsValue) -> Result<u32, JsValue> {
        let config: WindowConfig = serde_wasm_bindgen::from_value(config_val)
            .map_err(|e| JsValue::from_str(&format!("Invalid WindowConfig object: {e}")))?;

        self.context
            .create_window(config)
            .map_err(|e| JsValue::from_str(&format!("Window creation failed: {e}")))
    }

    /// Unbinds and destroys the surface associated with the logical ID.
    #[wasm_bindgen(js_name = "closeWindow")]
    pub fn close_window(&mut self, window_id: u32) -> Result<(), JsValue> {
        self.context
            .close_window(window_id)
            .map_err(|e| JsValue::from_str(&format!("Close window failed: {e}")))
    }

    /// Updates the title of the canvas or document.
    #[wasm_bindgen(js_name = "setWindowTitle")]
    pub fn set_window_title(&mut self, window_id: u32, title: String) -> Result<(), JsValue> {
        let win = self
            .context
            .get_window_mut(window_id)
            .map_err(|e| JsValue::from_str(&format!("Window not found: {e}")))?;
        win.set_title(&title);
        Ok(())
    }

    /// Drains and returns collected platform events as a direct JavaScript array of objects.
    #[wasm_bindgen(js_name = "pumpEvents")]
    pub fn pump_events(&mut self) -> Result<JsValue, JsValue> {
        let events = self
            .context
            .pump_events()
            .map_err(|e| JsValue::from_str(&format!("Pump events failed: {e}")))?;

        serde_wasm_bindgen::to_value(&events)
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {e}")))
    }
}
