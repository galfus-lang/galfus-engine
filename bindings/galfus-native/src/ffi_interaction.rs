//! FFI bindings for Collider registration, spatial picking, and pointer interaction.

use std::os::raw::c_char;

use galfus_multiverse::interaction::InteractionPointerEvent;
use galfus_realm_2d::Realm2DContext;
use galfus_realm_3d::Realm3DContext;
use galfus_realm_core::collision::{Collider2D, Collider3D, ColliderShape2D, ColliderShape3D};
use serde::Deserialize;

use crate::ffi::{from_c_str, set_last_error, to_c_string};
use crate::state::with_multiverse_mut;

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ColliderInput2D {
    Full {
        shape: ColliderShape2D,
        #[serde(default)]
        offset: Option<[f32; 2]>,
        #[serde(default, rename = "localMatrix")]
        local_matrix: Option<[f32; 6]>,
        #[serde(default)]
        active: Option<bool>,
        #[serde(default)]
        sensor: Option<bool>,
        #[serde(default)]
        layer: Option<u32>,
        #[serde(default)]
        mask: Option<u32>,
    },
    ShapeOnly(ColliderShape2D),
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ColliderInput3D {
    Full {
        shape: ColliderShape3D,
        #[serde(default)]
        offset: Option<[f32; 3]>,
        #[serde(default, rename = "localMatrix")]
        local_matrix: Option<[f32; 16]>,
        #[serde(default)]
        active: Option<bool>,
        #[serde(default)]
        sensor: Option<bool>,
        #[serde(default)]
        layer: Option<u32>,
        #[serde(default)]
        mask: Option<u32>,
    },
    ShapeOnly(ColliderShape3D),
}

/// Creates or updates a 2D Collider attached to a logical model.
///
/// # Safety
/// `shape_json` must be a valid, null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_collider(
    realm_id: u32,
    collider_id: u32,
    model_id: u32,
    shape_json: *const c_char,
) -> i32 {
    let json_str = match unsafe { from_c_str(shape_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let input: ColliderInput2D = match serde_json::from_str(json_str) {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&format!("Invalid Collider 2D JSON: {e}"));
            return -1;
        }
    };

    let (shape, offset, local_matrix, active, sensor, layer, mask) = match input {
        ColliderInput2D::Full {
            shape,
            offset,
            local_matrix,
            active,
            sensor,
            layer,
            mask,
        } => (
            shape,
            offset.unwrap_or([0.0, 0.0]),
            local_matrix,
            active.unwrap_or(true),
            sensor.unwrap_or(false),
            layer.unwrap_or(1),
            mask.unwrap_or(u32::MAX),
        ),
        ColliderInput2D::ShapeOnly(shape) => (shape, [0.0, 0.0], None, true, false, 1, u32::MAX),
    };

    let collider = Collider2D {
        id: collider_id,
        model_id,
        shape,
        offset,
        local_matrix,
        active,
        sensor,
        layer,
        mask,
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .create_collider_2d(collider)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a 2D Collider.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_destroy_collider(realm_id: u32, collider_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .destroy_collider_2d(collider_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Creates or updates a 3D Collider attached to a logical model.
///
/// # Safety
/// `shape_json` must be a valid, null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_collider(
    realm_id: u32,
    collider_id: u32,
    model_id: u32,
    shape_json: *const c_char,
) -> i32 {
    let json_str = match unsafe { from_c_str(shape_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let input: ColliderInput3D = match serde_json::from_str(json_str) {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&format!("Invalid Collider 3D JSON: {e}"));
            return -1;
        }
    };

    let (shape, offset, local_matrix, active, sensor, layer, mask) = match input {
        ColliderInput3D::Full {
            shape,
            offset,
            local_matrix,
            active,
            sensor,
            layer,
            mask,
        } => (
            shape,
            offset.unwrap_or([0.0, 0.0, 0.0]),
            local_matrix,
            active.unwrap_or(true),
            sensor.unwrap_or(false),
            layer.unwrap_or(1),
            mask.unwrap_or(u32::MAX),
        ),
        ColliderInput3D::ShapeOnly(shape) => {
            (shape, [0.0, 0.0, 0.0], None, true, false, 1, u32::MAX)
        }
    };

    let collider = Collider3D {
        id: collider_id,
        model_id,
        shape,
        offset,
        local_matrix,
        active,
        sensor,
        layer,
        mask,
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .create_collider_3d(collider)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a 3D Collider.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_destroy_collider(realm_id: u32, collider_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .destroy_collider_3d(collider_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Submits a pointer event into the Multiverse interaction system.
///
/// # Safety
/// `event_json` must be a valid, null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_multiverse_handle_pointer_event(event_json: *const c_char) -> i32 {
    let json_str = match unsafe { from_c_str(event_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let event: InteractionPointerEvent = match serde_json::from_str(json_str) {
        Ok(ev) => ev,
        Err(e) => {
            set_last_error(&format!("Invalid InteractionPointerEvent JSON: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        mv.handle_pointer_event(&event);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Publishes a presented frame snapshot for the given window so interaction picking can resolve hits.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_multiverse_publish_interaction_frame(window_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let _ = mv.resolve();
        mv.publish_interaction_frame(&[window_id]);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Drains all accumulated interaction events from the Multiverse interaction engine,
/// returning a JSON string. The returned pointer must be freed with `galfus_string_free`.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_multiverse_poll_interaction_events() -> *mut c_char {
    let res = with_multiverse_mut(|mv| {
        let events = mv.poll_interaction_events();
        serde_json::to_string(&events).map_err(|e| e.to_string())
    });

    match res {
        Ok(json) => to_c_string(&json),
        Err(e) => {
            set_last_error(&e);
            std::ptr::null_mut()
        }
    }
}
