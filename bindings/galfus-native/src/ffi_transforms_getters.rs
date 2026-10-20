//! Fixed-layout transform and state query functions for Galfus Engine.
#![allow(clippy::missing_safety_doc)]

use galfus_realm_2d::Realm2DContext;
use galfus_realm_3d::Realm3DContext;
use glam::Vec3;

use crate::ffi::set_last_error;
use crate::ffi_native_structs::{GalfusCameraLookAt3D, GalfusTransform2D, GalfusTransform3D};
use crate::state::{with_context, with_multiverse, with_multiverse_mut};

// State & transform query getters.

/// Sets or clears a camera look-at state from a fixed C-layout value.
///
/// `look_at` is copied during this call. Set `enabled` to zero to clear the look-at state.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_camera_look_at(
    realm_id: u32,
    camera_id: u32,
    look_at: *const GalfusCameraLookAt3D,
) -> i32 {
    if look_at.is_null() {
        set_last_error("Null pointer passed to set_camera_look_at");
        return -1;
    }
    // SAFETY: The pointer was checked above and the input is copied before this function returns.
    let look_at = unsafe { *look_at };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        if look_at.enabled == 0 {
            realm.clear_camera_look_at(camera_id)
        } else {
            realm.set_camera_look_at(
                camera_id,
                Vec3::new(look_at.target_x, look_at.target_y, look_at.target_z),
                Vec3::new(look_at.up_x, look_at.up_y, look_at.up_z),
            )
        }
        .map_err(|error| error.to_string())
    }) {
        Ok(()) => 0,
        Err(error) => {
            set_last_error(&error);
            -1
        }
    }
}

/// Reads a camera look-at state into a host-owned fixed C-layout value.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_get_camera_look_at(
    realm_id: u32,
    camera_id: u32,
    out_look_at: *mut GalfusCameraLookAt3D,
) -> i32 {
    if out_look_at.is_null() {
        set_last_error("Null pointer passed to get_camera_look_at");
        return -1;
    }
    match with_multiverse(|mv| {
        let realm = mv
            .get_realm::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        let look_at = realm
            .get_camera_look_at(camera_id)
            .map_err(|error| error.to_string())?;
        let value = look_at.map_or(
            GalfusCameraLookAt3D {
                enabled: 0,
                target_x: 0.0,
                target_y: 0.0,
                target_z: 0.0,
                up_x: 0.0,
                up_y: 0.0,
                up_z: 0.0,
            },
            |look_at| GalfusCameraLookAt3D {
                enabled: 1,
                target_x: look_at.target.x,
                target_y: look_at.target.y,
                target_z: look_at.target.z,
                up_x: look_at.up.x,
                up_y: look_at.up.y,
                up_z: look_at.up.z,
            },
        );
        // SAFETY: The pointer was checked above and points to one caller-owned output struct.
        unsafe { *out_look_at = value };
        Ok(())
    }) {
        Ok(()) => 0,
        Err(error) => {
            set_last_error(&error);
            -1
        }
    }
}

/// Reads the transform of a 3D model into a caller-owned fixed-layout value.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_get_model_transform(
    realm_id: u32,
    model_id: u32,
    out_transform: *mut GalfusTransform3D,
) -> i32 {
    if out_transform.is_null() {
        set_last_error("Null pointer passed to get_model_transform");
        return -1;
    }
    match with_multiverse(|mv| {
        let realm = mv
            .get_realm::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        let t = realm
            .get_model_transform(model_id)
            .map_err(|e| e.to_string())?;
        // SAFETY: The pointer was checked above and points to one caller-owned output struct.
        unsafe { *out_transform = t.into() };
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Reads the transform of a 3D camera into a caller-owned fixed-layout value.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_get_camera_transform(
    realm_id: u32,
    camera_id: u32,
    out_transform: *mut GalfusTransform3D,
) -> i32 {
    if out_transform.is_null() {
        set_last_error("Null pointer passed to get_camera_transform");
        return -1;
    }
    match with_multiverse(|mv| {
        let realm = mv
            .get_realm::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        let t = realm
            .get_camera_transform(camera_id)
            .map_err(|e| e.to_string())?;
        // SAFETY: The pointer was checked above and points to one caller-owned output struct.
        unsafe { *out_transform = t.into() };
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Reads the world-space bounding box (min, max) of a 3D model into two 3-float out buffers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_get_model_aabb(
    realm_id: u32,
    model_id: u32,
    out_min: *mut f32,
    out_max: *mut f32,
) -> i32 {
    if out_min.is_null() || out_max.is_null() {
        set_last_error("Null pointer passed to get_model_aabb");
        return -1;
    }
    match with_multiverse(|mv| {
        let realm = mv
            .get_realm::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        let (min, max) = realm.get_model_aabb(model_id).map_err(|e| e.to_string())?;
        let min_slice = unsafe { std::slice::from_raw_parts_mut(out_min, 3) };
        let max_slice = unsafe { std::slice::from_raw_parts_mut(out_max, 3) };
        min_slice[0] = min.x;
        min_slice[1] = min.y;
        min_slice[2] = min.z;
        max_slice[0] = max.x;
        max_slice[1] = max.y;
        max_slice[2] = max.z;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Reads the transform of a 2D sprite into a caller-owned fixed-layout value.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_get_sprite_transform(
    realm_id: u32,
    sprite_id: u32,
    out_transform: *mut GalfusTransform2D,
) -> i32 {
    if out_transform.is_null() {
        set_last_error("Null pointer passed to get_sprite_transform");
        return -1;
    }
    match with_multiverse(|mv| {
        let realm = mv
            .get_realm::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        let t = realm
            .get_sprite_transform(sprite_id)
            .ok_or_else(|| format!("Sprite #{sprite_id} not found in Realm2D #{realm_id}"))?;
        // SAFETY: The pointer was checked above and points to one caller-owned output struct.
        unsafe { *out_transform = t.into() };
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Reads the transform of a 2D camera into a caller-owned fixed-layout value.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_get_camera_transform(
    realm_id: u32,
    camera_id: u32,
    out_transform: *mut GalfusTransform2D,
) -> i32 {
    if out_transform.is_null() {
        set_last_error("Null pointer passed to get_camera_transform");
        return -1;
    }
    match with_multiverse(|mv| {
        let realm = mv
            .get_realm::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        let t = realm
            .get_camera_transform(camera_id)
            .ok_or_else(|| format!("Camera #{camera_id} not found in Realm2D #{realm_id}"))?;
        // SAFETY: The pointer was checked above and points to one caller-owned output struct.
        unsafe { *out_transform = t.into() };
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Reads the resolved size (width, height) of a Multiverse Target.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_multiverse_get_target_size(
    target_id: u32,
    out_width: *mut u32,
    out_height: *mut u32,
) -> i32 {
    if out_width.is_null() || out_height.is_null() {
        set_last_error("Null pointer passed to get_target_size");
        return -1;
    }
    match with_multiverse(|mv| {
        let size = mv
            .target_size(target_id)
            .ok_or_else(|| format!("Target #{target_id} not found"))?;
        unsafe {
            *out_width = size.x;
            *out_height = size.y;
        }
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Reads the current inner size (width, height) of a Platform window.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_platform_get_window_size(
    window_id: u32,
    out_width: *mut u32,
    out_height: *mut u32,
) -> i32 {
    if out_width.is_null() || out_height.is_null() {
        set_last_error("Null pointer passed to get_window_size");
        return -1;
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        match with_context(|ctx| {
            let win = ctx
                .get_window(window_id)
                .map_err(|e| format!("Window #{window_id} not found: {e}"))?;
            let size = win.raw_window().inner_size();
            unsafe {
                *out_width = size.width;
                *out_height = size.height;
            }
            Ok(())
        }) {
            Ok(()) => 0,
            Err(e) => {
                set_last_error(&e);
                -1
            }
        }
    }
    #[cfg(target_arch = "wasm32")]
    {
        set_last_error("galfus_platform_get_window_size not implemented for wasm32");
        -1
    }
}
