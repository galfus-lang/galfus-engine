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
