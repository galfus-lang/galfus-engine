#![allow(clippy::missing_safety_doc)]

//! C-ABI exports for 2D UI models (`Model2DUI`).

use std::ffi::{c_char, c_int};

use galfus_realm_2d::context::Realm2DContext;
use galfus_realm_2d::types::Model2DUI;

use crate::ffi::{from_c_str, set_last_error};
use crate::ffi_native_structs::GalfusTransform2D;
use crate::ffi_realm_2d_desc::parse_transform_2d;
use crate::state::with_multiverse_mut;

/// Creates or updates a 2D UI model with initial quads, texts, and transform.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_ui(
    realm_id: u32,
    ui_id: u32,
    desc_json: *const c_char,
    transform_json: *const c_char,
) -> c_int {
    let ui_desc: Model2DUI = match serde_json::from_str(match unsafe { from_c_str(desc_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    }) {
        Ok(d) => d,
        Err(e) => {
            set_last_error(&format!("Invalid Model2DUIDesc: {e}"));
            return -1;
        }
    };

    let trans = match unsafe { parse_transform_2d(transform_json) } {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .create_ui(ui_id, ui_desc, trans)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the visual content (quads and text batches) of an existing 2D UI model.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_ui_content(
    realm_id: u32,
    ui_id: u32,
    desc_json: *const c_char,
) -> c_int {
    let ui_desc: Model2DUI = match serde_json::from_str(match unsafe { from_c_str(desc_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    }) {
        Ok(d) => d,
        Err(e) => {
            set_last_error(&format!("Invalid Model2DUIDesc: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_ui_content(ui_id, ui_desc)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Applies an atomic batch of core-owned UI tree mutations.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_apply_ui_commands(
    realm_id: u32,
    ui_id: u32,
    commands_json: *const c_char,
) -> c_int {
    let commands: Vec<galfus_realm_2d_resources::ui::UiCommand> =
        match unsafe { from_c_str(commands_json) }.and_then(|json| {
            serde_json::from_str(json).map_err(|error| format!("Invalid UI commands: {error}"))
        }) {
            Ok(commands) => commands,
            Err(error) => {
                set_last_error(&error);
                return -1;
            }
        };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .apply_ui_commands(ui_id, &commands)
            .map_err(|error| error.to_string())
    }) {
        Ok(()) => 0,
        Err(error) => {
            set_last_error(&error);
            -1
        }
    }
}

/// Updates the spatial transform of an existing 2D UI model.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_ui_transform(
    realm_id: u32,
    ui_id: u32,
    transform: *const GalfusTransform2D,
) -> c_int {
    if transform.is_null() {
        set_last_error("Null pointer passed to set_ui_transform");
        return -1;
    }
    let trans = unsafe { (*transform).into() };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_ui_transform(ui_id, trans)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Reads the transform of an existing 2D UI model.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_get_ui_transform(
    realm_id: u32,
    ui_id: u32,
    out_transform: *mut GalfusTransform2D,
) -> c_int {
    if out_transform.is_null() {
        set_last_error("Null pointer passed to get_ui_transform");
        return -1;
    }

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        let trans = realm
            .get_ui_transform(ui_id)
            .ok_or_else(|| format!("UI #{ui_id} not found"))?;
        unsafe {
            *out_transform = trans.into();
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

/// Destroys an existing 2D UI model.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_destroy_ui(realm_id: u32, ui_id: u32) -> c_int {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.destroy_ui(ui_id).map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers raw TTF/OTF font binary data from memory (zero filesystem access).
///
/// Returns the detected font family name on success, or null on failure.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_load_font_data(
    realm_id: u32,
    data: *const u8,
    data_len: u64,
) -> *mut c_char {
    if data.is_null() || data_len == 0 {
        set_last_error("Font data pointer is null or length is zero");
        return std::ptr::null_mut();
    }
    let slice = unsafe { std::slice::from_raw_parts(data, data_len as usize) };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        let family = realm.load_font_data(slice).map_err(|e| e.to_string())?;
        Ok(family)
    }) {
        Ok(family) => crate::ffi::to_c_string(&family),
        Err(e) => {
            set_last_error(&e);
            std::ptr::null_mut()
        }
    }
}
