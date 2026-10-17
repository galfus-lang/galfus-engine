//! Direct float array transforms and query getters for Galfus Engine.
#![allow(clippy::missing_safety_doc)]

use galfus_realm_2d::Realm2DContext;
use galfus_realm_2d_resources::transform::Transform2D;
use galfus_realm_3d::Realm3DContext;
use galfus_realm_3d_resources::transform::Transform3D;
use glam::{Quat, Vec2, Vec3};

use crate::ffi::set_last_error;
use crate::state::{with_context, with_multiverse, with_multiverse_mut};

// ============================================================================
// Direct Float Array Fast-Path Transforms (3D)
// 10 floats: [px, py, pz, rx, ry, rz, rw, sx, sy, sz]
// ============================================================================

/// Sets the transform of a 3D model directly from a 10-float buffer.
/// Layout: `[px, py, pz, rx, ry, rz, rw, sx, sy, sz]`
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_model_transform_raw(
    realm_id: u32,
    model_id: u32,
    ptr: *const f32,
) -> i32 {
    if ptr.is_null() {
        set_last_error("Null pointer passed to set_model_transform_raw");
        return -1;
    }
    let slice = unsafe { std::slice::from_raw_parts(ptr, 10) };
    let transform = Transform3D {
        position: Vec3::new(slice[0], slice[1], slice[2]),
        rotation: Quat::from_xyzw(slice[3], slice[4], slice[5], slice[6]),
        scale: Vec3::new(slice[7], slice[8], slice[9]),
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .set_model_transform(model_id, transform)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Sets the transform of a 3D camera directly from a 10-float buffer.
/// Layout: `[px, py, pz, rx, ry, rz, rw, sx, sy, sz]`
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_camera_transform_raw(
    realm_id: u32,
    camera_id: u32,
    ptr: *const f32,
) -> i32 {
    if ptr.is_null() {
        set_last_error("Null pointer passed to set_camera_transform_raw");
        return -1;
    }
    let slice = unsafe { std::slice::from_raw_parts(ptr, 10) };
    let transform = Transform3D {
        position: Vec3::new(slice[0], slice[1], slice[2]),
        rotation: Quat::from_xyzw(slice[3], slice[4], slice[5], slice[6]),
        scale: Vec3::new(slice[7], slice[8], slice[9]),
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
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

// ============================================================================
// Direct Float Array Fast-Path Transforms (2D)
// 6 floats: [px, py, rot, sx, sy, z_layer]
// ============================================================================

/// Sets the transform of a 2D sprite directly from a 6-float buffer.
/// Layout: `[px, py, rot, sx, sy, z_layer]`
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_sprite_transform_raw(
    realm_id: u32,
    sprite_id: u32,
    ptr: *const f32,
) -> i32 {
    if ptr.is_null() {
        set_last_error("Null pointer passed to set_sprite_transform_raw");
        return -1;
    }
    let slice = unsafe { std::slice::from_raw_parts(ptr, 6) };
    let transform = Transform2D {
        position: Vec2::new(slice[0], slice[1]),
        rotation: slice[2],
        scale: Vec2::new(slice[3], slice[4]),
        z_layer: slice[5] as i32,
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_sprite_transform(sprite_id, transform);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Sets the transform of a 2D camera directly from a 6-float buffer.
/// Layout: `[px, py, rot, sx, sy, z_layer]`
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_camera_transform_raw(
    realm_id: u32,
    camera_id: u32,
    ptr: *const f32,
) -> i32 {
    if ptr.is_null() {
        set_last_error("Null pointer passed to set_camera_transform_raw");
        return -1;
    }
    let slice = unsafe { std::slice::from_raw_parts(ptr, 6) };
    let transform = Transform2D {
        position: Vec2::new(slice[0], slice[1]),
        rotation: slice[2],
        scale: Vec2::new(slice[3], slice[4]),
        z_layer: slice[5] as i32,
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_camera_transform(camera_id, transform);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

// ============================================================================
// State & Transform Query Getters
// ============================================================================

/// Reads the transform of a 3D model into an out 10-float buffer.
/// Layout: `[px, py, pz, rx, ry, rz, rw, sx, sy, sz]`
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_get_model_transform(
    realm_id: u32,
    model_id: u32,
    out_ptr: *mut f32,
) -> i32 {
    if out_ptr.is_null() {
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
        let slice = unsafe { std::slice::from_raw_parts_mut(out_ptr, 10) };
        slice[0] = t.position.x;
        slice[1] = t.position.y;
        slice[2] = t.position.z;
        slice[3] = t.rotation.x;
        slice[4] = t.rotation.y;
        slice[5] = t.rotation.z;
        slice[6] = t.rotation.w;
        slice[7] = t.scale.x;
        slice[8] = t.scale.y;
        slice[9] = t.scale.z;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Reads the transform of a 3D camera into an out 10-float buffer.
/// Layout: `[px, py, pz, rx, ry, rz, rw, sx, sy, sz]`
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_get_camera_transform(
    realm_id: u32,
    camera_id: u32,
    out_ptr: *mut f32,
) -> i32 {
    if out_ptr.is_null() {
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
        let slice = unsafe { std::slice::from_raw_parts_mut(out_ptr, 10) };
        slice[0] = t.position.x;
        slice[1] = t.position.y;
        slice[2] = t.position.z;
        slice[3] = t.rotation.x;
        slice[4] = t.rotation.y;
        slice[5] = t.rotation.z;
        slice[6] = t.rotation.w;
        slice[7] = t.scale.x;
        slice[8] = t.scale.y;
        slice[9] = t.scale.z;
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

/// Reads the transform of a 2D sprite into an out 6-float buffer.
/// Layout: `[px, py, rot, sx, sy, z_layer]`
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_get_sprite_transform(
    realm_id: u32,
    sprite_id: u32,
    out_ptr: *mut f32,
) -> i32 {
    if out_ptr.is_null() {
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
        let slice = unsafe { std::slice::from_raw_parts_mut(out_ptr, 6) };
        slice[0] = t.position.x;
        slice[1] = t.position.y;
        slice[2] = t.rotation;
        slice[3] = t.scale.x;
        slice[4] = t.scale.y;
        slice[5] = t.z_layer as f32;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Reads the transform of a 2D camera into an out 6-float buffer.
/// Layout: `[px, py, rot, sx, sy, z_layer]`
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_get_camera_transform(
    realm_id: u32,
    camera_id: u32,
    out_ptr: *mut f32,
) -> i32 {
    if out_ptr.is_null() {
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
        let slice = unsafe { std::slice::from_raw_parts_mut(out_ptr, 6) };
        slice[0] = t.position.x;
        slice[1] = t.position.y;
        slice[2] = t.rotation;
        slice[3] = t.scale.x;
        slice[4] = t.scale.y;
        slice[5] = t.z_layer as f32;
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
