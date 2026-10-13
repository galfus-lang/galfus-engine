use std::os::raw::c_char;

use crate::ffi::{from_c_str, set_last_error, to_c_string};
use crate::state::{attach_window_to_multiverse, with_multiverse_mut};

/// Attaches a platform window to the Multiverse context for surface rendering.
/// Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_multiverse_attach_window(window_id: u32) -> i32 {
    match attach_window_to_multiverse(window_id) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Creates a Target in the Multiverse. Returns 0 on success, -1 on failure.
///
/// # Safety
/// `desc_json` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_multiverse_create_target(
    target_id: u32,
    desc_json: *const c_char,
) -> i32 {
    let json_str = match unsafe { from_c_str(desc_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let desc: galfus_multiverse::TargetDesc = match serde_json::from_str(json_str) {
        Ok(d) => d,
        Err(e) => {
            set_last_error(&format!("Invalid TargetDesc JSON: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| mv.create_target(target_id, desc).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a Target in the Multiverse. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_multiverse_destroy_target(target_id: u32) -> i32 {
    match with_multiverse_mut(|mv| mv.destroy_target(target_id).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers a solid color test Realm in the Multiverse. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_multiverse_register_color_realm(
    realm_id: u32,
    r: f32,
    g: f32,
    b: f32,
    a: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        mv.register_color_realm(realm_id, [r, g, b, a])
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers a custom WGSL post-processing shader with an ID. Returns 0 on success, -1 on failure.
///
/// # Safety
/// `source` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_multiverse_register_shader(
    shader_id: u32,
    source: *const c_char,
) -> i32 {
    let source_str = match unsafe { from_c_str(source) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        mv.register_shader(shader_id, source_str)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Creates an Invocation in the Multiverse. Returns 0 on success, -1 on failure.
///
/// # Safety
/// `desc_json` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_multiverse_create_invocation(
    invocation_id: u32,
    desc_json: *const c_char,
) -> i32 {
    let json_str = match unsafe { from_c_str(desc_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let desc: galfus_multiverse::InvocationDesc = match serde_json::from_str(json_str) {
        Ok(d) => d,
        Err(e) => {
            set_last_error(&format!("Invalid InvocationDesc JSON: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        mv.create_invocation(invocation_id, desc)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys an Invocation in the Multiverse. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_multiverse_destroy_invocation(invocation_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        mv.destroy_invocation(invocation_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Enables or disables an Invocation in the Multiverse. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_multiverse_set_invocation_enabled(
    invocation_id: u32,
    enabled: bool,
) -> i32 {
    match with_multiverse_mut(|mv| {
        mv.set_invocation_enabled(invocation_id, enabled)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the viewport of an existing Invocation. Returns 0 on success, -1 on failure.
///
/// # Safety
/// `viewport_json` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_multiverse_set_invocation_viewport(
    invocation_id: u32,
    viewport_json: *const c_char,
) -> i32 {
    let json_str = match unsafe { from_c_str(viewport_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let viewport: galfus_multiverse::ViewportRect = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(e) => {
            set_last_error(&format!("Invalid ViewportRect JSON: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        mv.set_invocation_viewport(invocation_id, viewport)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the post-process filter chain for an Invocation. Returns 0 on success, -1 on failure.
///
/// # Safety
/// `filters_json` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_multiverse_set_invocation_filters(
    invocation_id: u32,
    filters_json: *const c_char,
) -> i32 {
    let json_str = match unsafe { from_c_str(filters_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let filters: Vec<galfus_multiverse::InvocationFilter> = match serde_json::from_str(json_str) {
        Ok(f) => f,
        Err(e) => {
            set_last_error(&format!("Invalid InvocationFilter list JSON: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        mv.set_invocation_filters(invocation_id, filters)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the clear color for an Invocation. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_multiverse_set_invocation_clear_color(
    invocation_id: u32,
    r: f32,
    g: f32,
    b: f32,
    a: f32,
    has_clear: bool,
) -> i32 {
    let clear_color = if has_clear { Some([r, g, b, a]) } else { None };

    match with_multiverse_mut(|mv| {
        mv.set_invocation_clear_color(invocation_id, clear_color)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the camera slot bound to an existing Invocation. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_multiverse_set_invocation_camera_slot(
    invocation_id: u32,
    camera_slot: u32,
    has_slot: bool,
) -> i32 {
    let slot = if has_slot { Some(camera_slot) } else { None };

    match with_multiverse_mut(|mv| {
        mv.set_invocation_camera_slot(invocation_id, slot)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Binds a Target's output texture to a Realm slot. Returns 0 on success, -1 on failure.
///
/// # Safety
/// `binding_json` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_multiverse_bind_target_texture(binding_json: *const c_char) -> i32 {
    let json_str = match unsafe { from_c_str(binding_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let binding: galfus_multiverse::TargetTextureBinding = match serde_json::from_str(json_str) {
        Ok(b) => b,
        Err(e) => {
            set_last_error(&format!("Invalid TargetTextureBinding JSON: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| mv.bind_target_texture(binding).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Resolves the Multiverse schedule and returns it as a JSON string pointer.
/// Caller must free using `galfus_string_free`. Returns null on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_multiverse_resolve() -> *mut c_char {
    let res = with_multiverse_mut(|mv| {
        let schedule = mv.resolve().map_err(|e| e.to_string())?;
        serde_json::to_string(schedule).map_err(|e| e.to_string())
    });

    match res {
        Ok(json) => to_c_string(&json),
        Err(e) => {
            set_last_error(&e);
            std::ptr::null_mut()
        }
    }
}

/// Updates the known size for a window target (e.g. on window resize).
#[unsafe(no_mangle)]
pub extern "C" fn galfus_multiverse_update_window_size(
    window_id: u32,
    width: u32,
    height: u32,
) -> i32 {
    let size = glam::UVec2::new(width, height);
    with_multiverse_mut(|mv| {
        mv.update_window_size(window_id, size);
        Ok(())
    })
    .unwrap_or(());
    0
}

/// Unregisters a Realm and clears associated invocations. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_multiverse_unregister_realm(realm_id: u32) -> i32 {
    match with_multiverse_mut(|mv| mv.unregister_realm(realm_id).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}



/// Unbinds a Target texture from a Realm slot. Returns 0 on success, -1 on failure.
///
/// # Safety
/// `slot` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_multiverse_unbind_target_texture(
    realm_id: u32,
    slot: *const c_char,
) -> i32 {
    let slot_str = match unsafe { from_c_str(slot) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        mv.unbind_target_texture(realm_id, slot_str)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Dispatches the Multiverse schedule for a frame. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_multiverse_dispatch(frame_id: u64, delta_time: f32) -> i32 {
    match with_multiverse_mut(|mv| mv.dispatch(frame_id, delta_time).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi::{galfus_platform_shutdown, galfus_string_free};
    use std::ffi::CString;

    #[test]
    fn test_multiverse_c_api() {
        let _ = galfus_platform_shutdown();

        // 1. Create target
        let target_json =
            CString::new(r#"{"kind":{"type":"texture","width":800,"height":600}}"#).unwrap();
        let target_res = unsafe { galfus_multiverse_create_target(1, target_json.as_ptr()) };
        assert_eq!(target_res, 0);

        // 2. Register color realm
        assert_eq!(
            galfus_multiverse_register_color_realm(10, 1.0, 0.5, 0.25, 1.0),
            0
        );

        // 3. Create invocation with cameraSlot
        let inv_json = CString::new(
            r#"{"targetId":1,"realmId":10,"cameraSlot":2,"zIndex":0,"enabled":true,"viewport":{"unit":"normalized","x":0.0,"y":0.0,"width":1.0,"height":1.0},"clearColor":[0.0,0.0,0.0,1.0]}"#,
        )
        .unwrap();
        assert_eq!(
            unsafe { galfus_multiverse_create_invocation(100, inv_json.as_ptr()) },
            0
        );

        // 4. Mutate camera slot
        assert_eq!(
            galfus_multiverse_set_invocation_camera_slot(100, 5, true),
            0
        );

        // 5. Mutate viewport
        let vp_json =
            CString::new(r#"{"unit":"normalized","x":0.0,"y":0.0,"width":0.5,"height":1.0}"#)
                .unwrap();
        assert_eq!(
            unsafe { galfus_multiverse_set_invocation_viewport(100, vp_json.as_ptr()) },
            0
        );

        // 6. Mutate clear color
        assert_eq!(
            galfus_multiverse_set_invocation_clear_color(100, 0.2, 0.4, 0.6, 1.0, true),
            0
        );

        // 7. Test window size update
        assert_eq!(galfus_multiverse_update_window_size(1, 1024, 768), 0);

        // 8. Test Target Texture binding and unbinding
        let target2_json =
            CString::new(r#"{"kind":{"type":"texture","width":800,"height":600}}"#).unwrap();
        assert_eq!(
            unsafe { galfus_multiverse_create_target(2, target2_json.as_ptr()) },
            0
        );
        let binding_json =
            CString::new(r#"{"sourceTargetId":1,"realmId":10,"slot":"portalTexture"}"#).unwrap();
        assert_eq!(
            unsafe { galfus_multiverse_bind_target_texture(binding_json.as_ptr()) },
            0
        );
        let slot_str = CString::new("portalTexture").unwrap();
        assert_eq!(
            unsafe { galfus_multiverse_unbind_target_texture(10, slot_str.as_ptr()) },
            0
        );

        // 9. Resolve schedule JSON & Dispatch frame
        let schedule_ptr = galfus_multiverse_resolve();
        assert!(!schedule_ptr.is_null());
        let schedule_str = unsafe { std::ffi::CStr::from_ptr(schedule_ptr).to_str().unwrap() };
        assert!(schedule_str.contains("\"cameraSlot\":5"));
        unsafe { galfus_string_free(schedule_ptr) };

        assert_eq!(galfus_multiverse_dispatch(1, 0.016), 0);

        // 10. Cleanup
        assert_eq!(galfus_multiverse_destroy_invocation(100), 0);
        assert_eq!(galfus_multiverse_unregister_realm(10), 0);
        assert_eq!(galfus_multiverse_destroy_target(1), 0);
        assert_eq!(galfus_multiverse_destroy_target(2), 0);
        assert_eq!(galfus_platform_shutdown(), 0);
    }
}
