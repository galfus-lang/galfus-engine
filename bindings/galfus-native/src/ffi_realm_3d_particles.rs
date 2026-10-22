use std::os::raw::c_char;

use galfus_realm_3d::Realm3DContext;

use crate::ffi::{from_c_str, set_last_error};
use crate::ffi_native_structs::GalfusTransform3D;
use crate::ffi_realm_3d_desc::{ParticleEmitter3DDesc, Transform3DDesc};
use crate::state::with_multiverse_mut;

/// Creates or updates a 3D particle emitter entity in the 3D Realm.
///
/// # Safety
/// `emitter_json` and `transform_json` must be valid, null-terminated C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_particle_emitter(
    realm_id: u32,
    emitter_id: u32,
    emitter_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let emitter_desc: ParticleEmitter3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(emitter_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid ParticleEmitter3DDesc: {e}"));
                return -1;
            }
        };

    let transform_desc: Transform3DDesc =
        match unsafe { crate::ffi::from_c_str_optional(transform_json) } {
            Ok(Some(s)) => match serde_json::from_str(s) {
                Ok(d) => d,
                Err(e) => {
                    set_last_error(&format!("Invalid Transform3DDesc: {e}"));
                    return -1;
                }
            },
            Ok(None) => Transform3DDesc::default(),
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .create_particle_emitter(emitter_id, emitter_desc.into(), transform_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the 3D transform of an existing particle emitter.
///
/// # Safety
/// `transform_json` must be a valid, null-terminated C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_particle_emitter_transform(
    realm_id: u32,
    emitter_id: u32,
    transform: *const GalfusTransform3D,
) -> i32 {
    if transform.is_null() {
        set_last_error("Null pointer passed to set_particle_emitter_transform");
        return -1;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let transform = unsafe { (*transform).into() };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .set_particle_emitter_transform(emitter_id, transform)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Triggers an immediate burst of particles from an existing 3D emitter.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_particle_emitter_burst(
    realm_id: u32,
    emitter_id: u32,
    count: u32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .particle_emitter_burst(emitter_id, count)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a 3D particle emitter entity.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_destroy_particle_emitter(realm_id: u32, emitter_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .destroy_particle_emitter(emitter_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}
