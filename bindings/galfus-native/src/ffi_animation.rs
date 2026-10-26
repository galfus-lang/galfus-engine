//! C-ABI functions for the Galfus animation system.

use std::os::raw::c_char;

use galfus_animation::{AnimValue, AnimationTarget, Easing, LoopMode, TransitionConfig};

use crate::ffi::{from_c_str, set_last_error, to_c_string};
use crate::state::{with_animation, with_animation_mut, with_multiverse_mut};

pub(crate) fn parse_easing_id(id: u32) -> Easing {
    match id {
        1 => Easing::EaseInQuad,
        2 => Easing::EaseOutQuad,
        3 => Easing::EaseInOutQuad,
        4 => Easing::EaseInCubic,
        5 => Easing::EaseOutCubic,
        6 => Easing::EaseInOutCubic,
        7 => Easing::EaseInQuart,
        8 => Easing::EaseOutQuart,
        9 => Easing::EaseInOutQuart,
        10 => Easing::EaseInQuint,
        11 => Easing::EaseOutQuint,
        12 => Easing::EaseInOutQuint,
        13 => Easing::EaseInSine,
        14 => Easing::EaseOutSine,
        15 => Easing::EaseInOutSine,
        16 => Easing::EaseInExpo,
        17 => Easing::EaseOutExpo,
        18 => Easing::EaseInOutExpo,
        19 => Easing::EaseInCirc,
        20 => Easing::EaseOutCirc,
        21 => Easing::EaseInOutCirc,
        22 => Easing::EaseInBack,
        23 => Easing::EaseOutBack,
        24 => Easing::EaseInOutBack,
        25 => Easing::EaseInElastic,
        26 => Easing::EaseOutElastic,
        27 => Easing::EaseInOutElastic,
        28 => Easing::EaseInBounce,
        29 => Easing::EaseOutBounce,
        30 => Easing::EaseInOutBounce,
        _ => Easing::Linear,
    }
}

/// Creates a new transition from JSON descriptors. Returns 0 on success, -1 on failure.
///
/// # Safety
/// Pointers must be valid, null-terminated UTF-8 C string pointers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_animation_create_transition(
    transition_id: u32,
    initial_value_json: *const c_char,
    config_json: *const c_char,
) -> i32 {
    let val_str = match unsafe { from_c_str(initial_value_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    let initial_val: AnimValue = match serde_json::from_str(val_str) {
        Ok(v) => v,
        Err(e) => {
            set_last_error(&format!("Invalid AnimValue JSON: {e}"));
            return -1;
        }
    };

    let config = if !config_json.is_null() {
        let cfg_str = match unsafe { from_c_str(config_json) } {
            Ok(s) => s.trim(),
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        };
        if cfg_str.is_empty() || cfg_str == "undefined" || cfg_str == "null" {
            TransitionConfig::default()
        } else {
            match serde_json::from_str::<TransitionConfig>(cfg_str) {
                Ok(c) => c,
                Err(e) => {
                    set_last_error(&format!("Invalid TransitionConfig JSON: {e}"));
                    return -1;
                }
            }
        }
    } else {
        TransitionConfig::default()
    };

    match with_animation_mut(|anim| {
        anim.create_transition(transition_id, initial_val, config)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Binds an existing transition to an entity property target. Returns 0 on success, -1 on failure.
///
/// # Safety
/// `target_json` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_animation_bind_target(
    transition_id: u32,
    target_json: *const c_char,
) -> i32 {
    let target_str = match unsafe { from_c_str(target_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    let target: AnimationTarget = match serde_json::from_str(target_str) {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&format!("Invalid AnimationTarget JSON: {e}"));
            return -1;
        }
    };

    match with_animation_mut(|anim| {
        anim.bind_target(transition_id, target)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Unbinds a target from a transition and releases its property lock. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_animation_unbind_target(transition_id: u32) -> i32 {
    match with_animation_mut(|anim| anim.unbind_target(transition_id).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Triggers a smooth transition towards a new target value. Returns 0 on success, -1 on failure.
///
/// # Safety
/// Pointers must be valid, null-terminated UTF-8 C string pointers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_animation_transition_to(
    transition_id: u32,
    target_value_json: *const c_char,
    config_json: *const c_char,
) -> i32 {
    let val_str = match unsafe { from_c_str(target_value_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    let target_val: AnimValue = match serde_json::from_str(val_str) {
        Ok(v) => v,
        Err(e) => {
            set_last_error(&format!("Invalid AnimValue JSON: {e}"));
            return -1;
        }
    };

    let config = if !config_json.is_null() {
        let cfg_str = match unsafe { from_c_str(config_json) } {
            Ok(s) => s.trim(),
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        };
        if cfg_str.is_empty() || cfg_str == "undefined" || cfg_str == "null" {
            None
        } else {
            match serde_json::from_str::<TransitionConfig>(cfg_str) {
                Ok(c) => Some(c),
                Err(e) => {
                    set_last_error(&format!("Invalid TransitionConfig JSON: {e}"));
                    return -1;
                }
            }
        }
    } else {
        None
    };

    match with_animation_mut(|anim| {
        anim.transition_to(transition_id, target_val, config)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Fast-path creating a scalar transition.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_animation_create_scalar_transition(
    transition_id: u32,
    initial_scalar: f32,
    duration: f32,
    delay: f32,
    easing_id: u32,
) -> i32 {
    let config = TransitionConfig {
        duration,
        delay,
        easing: parse_easing_id(easing_id),
        loop_mode: LoopMode::Once,
    };
    match with_animation_mut(|anim| {
        anim.create_transition(transition_id, AnimValue::Scalar(initial_scalar), config)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Fast-path transitioning a scalar property.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_animation_transition_to_scalar(
    transition_id: u32,
    target_scalar: f32,
    duration: f32,
    delay: f32,
    easing_id: u32,
) -> i32 {
    let config = if duration > 0.0 || delay > 0.0 || easing_id > 0 {
        Some(TransitionConfig {
            duration,
            delay,
            easing: parse_easing_id(easing_id),
            loop_mode: LoopMode::Once,
        })
    } else {
        None
    };
    match with_animation_mut(|anim| {
        anim.transition_to(transition_id, AnimValue::Scalar(target_scalar), config)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Fast-path transitioning a 3D Transform from 10 raw floats.
///
/// # Safety
/// `ptr` must point to at least 10 contiguous aligned `f32` values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_animation_transition_to_transform3d(
    transition_id: u32,
    ptr: *const f32,
    duration: f32,
    delay: f32,
    easing_id: u32,
) -> i32 {
    if ptr.is_null() {
        set_last_error("Null pointer passed for Transform3D floats");
        return -1;
    }
    let slice = unsafe { std::slice::from_raw_parts(ptr, 10) };
    let mut arr = [0.0f32; 10];
    arr.copy_from_slice(slice);

    let config = if duration > 0.0 || delay > 0.0 || easing_id > 0 {
        Some(TransitionConfig {
            duration,
            delay,
            easing: parse_easing_id(easing_id),
            loop_mode: LoopMode::Once,
        })
    } else {
        None
    };

    match with_animation_mut(|anim| {
        anim.transition_to(transition_id, AnimValue::Transform3D(arr), config)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Fast-path transitioning a 2D Transform from 6 raw floats.
///
/// # Safety
/// `ptr` must point to at least 6 contiguous aligned `f32` values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_animation_transition_to_transform2d(
    transition_id: u32,
    ptr: *const f32,
    duration: f32,
    delay: f32,
    easing_id: u32,
) -> i32 {
    if ptr.is_null() {
        set_last_error("Null pointer passed for Transform2D floats");
        return -1;
    }
    let slice = unsafe { std::slice::from_raw_parts(ptr, 6) };
    let mut arr = [0.0f32; 6];
    arr.copy_from_slice(slice);

    let config = if duration > 0.0 || delay > 0.0 || easing_id > 0 {
        Some(TransitionConfig {
            duration,
            delay,
            easing: parse_easing_id(easing_id),
            loop_mode: LoopMode::Once,
        })
    } else {
        None
    };

    match with_animation_mut(|anim| {
        anim.transition_to(transition_id, AnimValue::Transform2D(arr), config)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Queries the current state of a transition, returning a JSON string or null pointer on error.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_animation_get_state(transition_id: u32) -> *mut c_char {
    match with_animation(|anim| {
        let state = anim
            .get_state(transition_id)
            .ok_or_else(|| format!("Transition {transition_id} not found"))?;
        serde_json::to_string(&state).map_err(|e| e.to_string())
    }) {
        Ok(json) => to_c_string(&json),
        Err(e) => {
            set_last_error(&e);
            std::ptr::null_mut()
        }
    }
}

/// Queries the current evaluated value of a transition, returning a JSON string or null pointer on error.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_animation_get_value(transition_id: u32) -> *mut c_char {
    match with_animation(|anim| {
        let val = anim
            .get_value(transition_id)
            .ok_or_else(|| format!("Transition {transition_id} not found"))?;
        serde_json::to_string(&val).map_err(|e| e.to_string())
    }) {
        Ok(json) => to_c_string(&json),
        Err(e) => {
            set_last_error(&e);
            std::ptr::null_mut()
        }
    }
}

/// Destroys a transition by ID. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_animation_destroy_transition(transition_id: u32) -> i32 {
    match with_animation_mut(|anim| {
        anim.destroy_transition(transition_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Advances all active transitions by `dt` seconds and applies evaluated values to Multiverse.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_animation_step(dt: f32) -> i32 {
    let step_res = with_animation_mut(|anim| {
        anim.step(dt);
        Ok(())
    });
    if let Err(e) = step_res {
        set_last_error(&e);
        return -1;
    }

    // Apply values to multiverse
    let apply_res = with_multiverse_mut(|mv| {
        with_animation_mut(|anim| anim.apply_to_multiverse(mv).map_err(|e| e.to_string()))
    });
    if let Err(e) = apply_res {
        set_last_error(&e);
        return -1;
    }

    0
}

/// Drains and returns all queued animation lifecycle events as a JSON array string.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_animation_pump_events() -> *mut c_char {
    match with_animation_mut(|anim| {
        let events = anim.pump_events();
        serde_json::to_string(&events).map_err(|e| e.to_string())
    }) {
        Ok(json) => to_c_string(&json),
        Err(e) => {
            set_last_error(&e);
            to_c_string("[]")
        }
    }
}

/// Writes directly to a custom animation channel.
///
/// # Safety
/// `value_json` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_animation_set_custom_channel(
    channel_id: u32,
    value_json: *const c_char,
) -> i32 {
    let val_str = match unsafe { from_c_str(value_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    let val: AnimValue = match serde_json::from_str(val_str) {
        Ok(v) => v,
        Err(e) => {
            set_last_error(&format!("Invalid AnimValue JSON: {e}"));
            return -1;
        }
    };
    match with_animation_mut(|anim| {
        anim.set_custom_channel(channel_id, val);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Reads directly from a custom animation channel, returning a JSON string.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_animation_get_custom_channel(channel_id: u32) -> *mut c_char {
    match with_animation(|anim| {
        let val = anim
            .get_custom_channel(channel_id)
            .ok_or_else(|| format!("Channel {channel_id} not found"))?;
        serde_json::to_string(&val).map_err(|e| e.to_string())
    }) {
        Ok(json) => to_c_string(&json),
        Err(e) => {
            set_last_error(&e);
            std::ptr::null_mut()
        }
    }
}

#[path = "ffi_animation_path.rs"]
mod ffi_animation_path;
pub use ffi_animation_path::*;
