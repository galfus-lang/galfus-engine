//! Camera FFI entry points.

use std::os::raw::c_char;

use galfus_realm_3d::Realm3DContext;
use galfus_realm_3d_resources::camera::Camera3D;

use super::parse_transform_3d;
use crate::ffi::{from_c_str, set_last_error};
use crate::ffi_native_structs::GalfusTransform3D;
use crate::ffi_realm_3d_desc::*;
use crate::state::with_multiverse_mut;

/// Registers or updates a 3D Camera in the 3D Realm.
///
/// # Safety
/// Pointers must be valid, null-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_camera(
    realm_id: u32,
    camera_id: u32,
    camera_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let cam_desc: Camera3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(camera_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Camera3DDesc: {e}"));
                return -1;
            }
        };

    let trans_desc: Transform3DDesc = match unsafe { parse_transform_3d(transform_json) } {
        Ok(d) => d,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let look_at = cam_desc.look_at.clone();
    let mut camera: Camera3D = cam_desc.into();
    if let Some(look_at) = look_at {
        let (target, up) = look_at.into_vectors();
        if let Err(e) = camera.set_look_at(target, up) {
            set_last_error(&format!("Invalid CameraLookAt3DDesc: {e}"));
            return -1;
        }
    }

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_camera(camera_id, camera, trans_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Clears the optional look-at configuration of an existing 3D Camera.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_clear_camera_look_at(realm_id: u32, camera_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .clear_camera_look_at(camera_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Camera in the 3D Realm.
///
/// # Safety
/// `transform_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_camera_transform(
    realm_id: u32,
    camera_id: u32,
    transform: *const GalfusTransform3D,
) -> i32 {
    if transform.is_null() {
        set_last_error("Null pointer passed to set_camera_transform");
        return -1;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let transform = unsafe { (*transform).into() };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .set_camera_transform(camera_id, transform)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}
