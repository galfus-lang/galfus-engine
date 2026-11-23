use std::os::raw::c_char;

use galfus_realm_3d::Realm3DContext;

use crate::ffi::{from_c_str, set_last_error};
use crate::ffi_realm_3d_desc::Portal3DDesc;
use crate::state::with_multiverse_mut;

/// Registers or updates a 3D optical portal or planar mirror in the 3D Realm.
///
/// # Safety
/// `portal_json` must be a valid, null-terminated C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_portal(
    realm_id: u32,
    portal_id: u32,
    portal_json: *const c_char,
) -> i32 {
    let portal_desc: Portal3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(portal_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Portal3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .create_portal(portal_id, portal_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Sets whether an existing 3D portal or planar mirror is active.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_set_portal_active(
    realm_id: u32,
    portal_id: u32,
    active: bool,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .set_portal_active(portal_id, active)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys an existing 3D portal or mirror entity.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_destroy_portal(realm_id: u32, portal_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm.destroy_portal(portal_id).map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a 3D decal or texture projector.
///
/// # Safety
/// `projector_json` and `transform_json` must be valid, null-terminated C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_projector(
    realm_id: u32,
    projector_id: u32,
    projector_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let proj_str = match unsafe { from_c_str(projector_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    let projector: galfus_realm_3d_resources::projector::Projector3D =
        match serde_json::from_str(proj_str) {
            Ok(p) => p,
            Err(e) => {
                set_last_error(&format!("Invalid Projector3DDesc: {e}"));
                return -1;
            }
        };
    let transform = match unsafe { crate::parse_transform_3d(transform_json) } {
        Ok(t) => t,
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
            .create_projector(projector_id, projector, transform.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Fast-path transform update for an existing 3D projector.
///
/// # Safety
/// `transform` must be a valid non-null pointer to `GalfusTransform3D`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_projector_transform(
    realm_id: u32,
    projector_id: u32,
    transform: *const crate::ffi_native_structs::GalfusTransform3D,
) -> i32 {
    if transform.is_null() {
        set_last_error("Null transform pointer");
        return -1;
    }
    let tf: galfus_realm_3d_resources::transform::Transform3D = unsafe { (*transform).into() };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .set_projector_transform(projector_id, tf)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys an existing 3D projector or decal.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_destroy_projector(realm_id: u32, projector_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .destroy_projector(projector_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Queues a one-shot UV-space decal bake onto a model's target texture (tattoos / body paint).
///
/// # Safety
/// `bake_json` and `transform_json` must be valid null-terminated UTF-8 C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_bake_uv_decal(
    realm_id: u32,
    bake_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let bake_str = match unsafe { from_c_str(bake_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    let bake: galfus_realm_3d_resources::uv_decal::UvDecalBake3D =
        match serde_json::from_str(bake_str) {
            Ok(b) => b,
            Err(e) => {
                set_last_error(&format!("Invalid UvDecalBake3DDesc: {e}"));
                return -1;
            }
        };
    let transform = match unsafe { crate::parse_transform_3d(transform_json) } {
        Ok(t) => t,
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
            .bake_uv_decal(bake, transform.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}
