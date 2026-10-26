//! C-ABI path-follow animation entry points.

use std::os::raw::c_char;

use galfus_animation::AnimationTarget;

use crate::ffi::{from_c_str, set_last_error, to_c_string};
use crate::state::{with_animation, with_animation_mut};

/// Creates a new path follow instance. Returns 0 on success, -1 on failure.
///
/// Creates a new path follower traversing a declarative SVG-like path. Returns 0 on success, -1 on failure.
///
/// # Safety
/// Pointers must be valid, null-terminated UTF-8 C string pointers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_animation_create_path_follow(
    path_id: u32,
    commands_json: *const c_char,
    config_json: *const c_char,
) -> i32 {
    let cmds_str = match unsafe { from_c_str(commands_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    let commands: Vec<galfus_animation::PathCommand> = match serde_json::from_str(cmds_str) {
        Ok(c) => c,
        Err(e) => {
            set_last_error(&format!("Invalid PathCommands JSON: {e}"));
            return -1;
        }
    };
    let config: galfus_animation::PathFollowConfig = if !config_json.is_null() {
        let cfg_str = match unsafe { from_c_str(config_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        };
        match serde_json::from_str(cfg_str) {
            Ok(c) => c,
            Err(e) => {
                set_last_error(&format!("Invalid PathFollowConfig JSON: {e}"));
                return -1;
            }
        }
    } else {
        galfus_animation::PathFollowConfig::default()
    };

    match with_animation_mut(|anim| {
        anim.create_path_follow(path_id, commands, config)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Binds an existing path follow instance to an entity property target.
///
/// # Safety
/// `target_json` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_animation_bind_path_follow_target(
    path_id: u32,
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
        anim.bind_path_follow_target(path_id, target)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Unbinds a target from a path follower and releases its property lock.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_animation_unbind_path_follow_target(path_id: u32) -> i32 {
    match with_animation_mut(|anim| {
        anim.unbind_path_follow_target(path_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a path follower by ID and releases any associated property locks.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_animation_destroy_path_follow(path_id: u32) -> i32 {
    match with_animation_mut(|anim| anim.destroy_path_follow(path_id).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Queries the current runtime state of a path follower as a JSON string.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_animation_get_path_follow_state(path_id: u32) -> *mut c_char {
    match with_animation(|anim| {
        let state = anim
            .get_path_follow_state(path_id)
            .ok_or_else(|| format!("PathFollow ID {path_id} not found"))?;
        serde_json::to_string(&state).map_err(|e| e.to_string())
    }) {
        Ok(json) => to_c_string(&json),
        Err(e) => {
            set_last_error(&e);
            std::ptr::null_mut()
        }
    }
}
