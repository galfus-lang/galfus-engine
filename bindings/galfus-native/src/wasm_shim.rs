//! Minimal compatibility layer that lets the generated `wasm_bind` module reuse the Node-API
//! binding bodies (`napi_bind.rs`) unchanged under `wasm-bindgen`.

use serde::Serialize;
use serde::de::DeserializeOwned;
use wasm_bindgen::JsValue;

/// Result alias matching the Node-API binding signatures.
pub type Result<T> = std::result::Result<T, JsValue>;
/// Untyped JavaScript value.
pub type JsUnknown = JsValue;
/// Byte buffer received from a JavaScript `Uint8Array`.
pub type Uint8Array = Vec<u8>;
/// Float buffer received from a JavaScript `Float32Array`.
pub type Float32Array = Vec<f32>;
/// Index buffer received from a JavaScript `Uint32Array`.
pub type Uint32Array = Vec<u32>;

/// Error category kept for source compatibility with the Node-API bodies.
#[derive(Clone, Copy)]
pub enum Status {
    GenericFailure,
    InvalidArg,
}

/// Error factory producing a JavaScript string error.
pub struct Error;

impl Error {
    /// Builds a JavaScript error value from a status and a reason.
    pub fn from_reason<S: AsRef<str>>(_status: Status, reason: S) -> JsValue {
        JsValue::from_str(reason.as_ref())
    }
}

/// Serde bridge between Rust values and JavaScript values.
pub struct Env;

impl Env {
    /// Serializes a Rust value into a plain JavaScript value (maps become objects).
    pub fn to_js_value<T: Serialize>(&self, value: &T) -> Result<JsValue> {
        value
            .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Deserializes a JavaScript value into a Rust value.
    pub fn from_js_value<T: DeserializeOwned>(&self, value: JsValue) -> Result<T> {
        serde_wasm_bindgen::from_value(value).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

/// Converts an optional JavaScript value into a JSON C string (`None` for null/undefined).
pub fn js_to_c_string(env: &Env, val: Option<JsValue>) -> Result<Option<std::ffi::CString>> {
    let Some(value) = val else {
        return Ok(None);
    };
    if value.is_null() || value.is_undefined() {
        return Ok(None);
    }
    let text = if let Some(text) = value.as_string() {
        text
    } else {
        let json: serde_json::Value = env.from_js_value(value)?;
        serde_json::to_string(&json).map_err(|e| JsValue::from_str(&e.to_string()))?
    };
    std::ffi::CString::new(text)
        .map(Some)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
