use napi::JsUnknown;
use napi::bindgen_prelude::*;
use napi_derive::napi;

use galfus_platform::{CursorGrabMode, CursorIcon, WindowConfig};
use galfus_realm_3d::Realm3DContext;

use crate::ffi_realm_3d_desc::{CameraLookAt3DDesc, CameraLookAt3DStateDesc};
use crate::state::{
    attach_window_to_multiverse, close_window, init_context, init_context_headless,
    shutdown_context, with_animation, with_animation_mut, with_context, with_context_mut,
    with_multiverse_mut,
};
use galfus_animation::{
    AnimValue, AnimationTarget, LoopMode, PathCommand, PathFollowConfig, TransitionConfig,
};

#[path = "napi_platform.rs"]
mod napi_platform;
pub use napi_platform::*;

#[path = "napi_multiverse.rs"]
mod napi_multiverse;
pub use napi_multiverse::*;

#[path = "napi_resources_animation.rs"]
mod napi_resources_animation;
pub use napi_resources_animation::*;

fn js_to_c_string(env: &Env, val: Option<JsUnknown>) -> Result<Option<std::ffi::CString>> {
    match val {
        None => Ok(None),
        Some(v) => {
            let v_type = v.get_type()?;
            if v_type == napi::ValueType::Undefined || v_type == napi::ValueType::Null {
                return Ok(None);
            }
            if v_type == napi::ValueType::String {
                let s: String = env.from_js_value(v)?;
                let cs = std::ffi::CString::new(s)
                    .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
                return Ok(Some(cs));
            }
            let json_val: serde_json::Value = env.from_js_value(v)?;
            let json_str = serde_json::to_string(&json_val)
                .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
            let cs = std::ffi::CString::new(json_str)
                .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
            Ok(Some(cs))
        }
    }
}

fn check_ffi_res(code: i32) -> Result<()> {
    if code == 0 {
        Ok(())
    } else {
        let ptr = crate::ffi::galfus_get_last_error();
        let err = if ptr.is_null() {
            "Unknown native error".to_string()
        } else {
            let s = unsafe { std::ffi::CStr::from_ptr(ptr) }
                .to_string_lossy()
                .to_string();
            unsafe {
                crate::ffi::galfus_string_free(ptr);
            }
            s
        };
        Err(Error::new(Status::GenericFailure, err))
    }
}

#[path = "napi_realm_3d.rs"]
mod napi_realm_3d;
pub use napi_realm_3d::*;

#[path = "napi_realm_2d.rs"]
mod napi_realm_2d;
pub use napi_realm_2d::*;
