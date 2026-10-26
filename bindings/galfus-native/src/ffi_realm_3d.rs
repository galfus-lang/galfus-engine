use std::os::raw::c_char;

use galfus_realm_3d::Realm3DContext;
use galfus_realm_3d_resources::model::InstanceData3D;

use crate::ffi::{from_c_str, from_c_str_optional, set_last_error};
use crate::ffi_native_structs::GalfusTransform3D;
use crate::ffi_realm_3d_desc::*;
use crate::state::with_multiverse_mut;

pub(super) unsafe fn parse_transform_3d(
    transform_json: *const c_char,
) -> Result<Transform3DDesc, String> {
    match unsafe { from_c_str_optional(transform_json) } {
        Ok(Some(s)) => serde_json::from_str(s).map_err(|e| format!("Invalid Transform3DDesc: {e}")),
        Ok(None) => Ok(Transform3DDesc::default()),
        Err(e) => Err(e),
    }
}

/// Creates and registers a new 3D Realm in the Multiverse.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_create(realm_id: u32) -> i32 {
    let realm = Box::new(Realm3DContext::new(realm_id));
    match with_multiverse_mut(|mv| mv.register_realm(realm).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys and unregisters a 3D Realm from the Multiverse.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_destroy(realm_id: u32) -> i32 {
    match with_multiverse_mut(|mv| mv.unregister_realm(realm_id).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

#[path = "ffi_realm_3d_camera.rs"]
mod ffi_realm_3d_camera;
pub use ffi_realm_3d_camera::*;
#[path = "ffi_realm_3d_geometry.rs"]
mod ffi_realm_3d_geometry;
pub use ffi_realm_3d_geometry::*;
/// Registers or updates a 3D Material in the 3D Realm.
///
/// # Safety
/// `material_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_material(
    realm_id: u32,
    material_id: u32,
    material_json: *const c_char,
) -> i32 {
    let mat_desc: Material3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(material_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Material3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_material(material_id, mat_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a 3D Model in the 3D Realm.
///
/// # Safety
/// Pointers must be valid, null-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_model(
    realm_id: u32,
    model_id: u32,
    model_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let model_desc: Model3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(model_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Model3DDesc: {e}"));
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

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_model(model_id, model_desc.into(), trans_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Model in the 3D Realm.
///
/// # Safety
/// `transform_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_model_transform(
    realm_id: u32,
    model_id: u32,
    transform: *const GalfusTransform3D,
) -> i32 {
    if transform.is_null() {
        set_last_error("Null pointer passed to set_model_transform");
        return -1;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let transform = unsafe { (*transform).into() };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
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

/// Registers or updates an Instanced Model in the 3D Realm.
///
/// # Safety
/// `model_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_instanced_model(
    realm_id: u32,
    instanced_model_id: u32,
    model_json: *const c_char,
) -> i32 {
    let model_desc: InstancedModel3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(model_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid InstancedModel3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_instanced_model(instanced_model_id, model_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Uploads 32-float instance records for an existing Instanced Model in the 3D Realm.
///
/// The layout per instance is: 16 transform floats, 4 color floats, 4 emissive floats,
/// 4 PBR floats, and 4 custom floats.
///
/// # Safety
/// `data_ptr` must be valid for reads of `float_count` f32 elements.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_instanced_model_data(
    realm_id: u32,
    instanced_model_id: u32,
    data_ptr: *const f32,
    float_count: usize,
) -> i32 {
    if float_count == 0 || !float_count.is_multiple_of(32) {
        set_last_error("Instanced raw data length must be a multiple of 32");
        return -1;
    }
    if data_ptr.is_null() {
        set_last_error("Null instanced model data pointer");
        return -1;
    }
    let floats = unsafe { std::slice::from_raw_parts(data_ptr, float_count) };

    let instances: Vec<InstanceData3D> = floats
        .as_chunks::<32>()
        .0
        .iter()
        .map(|chunk| {
            let transform = glam::Mat4::from_cols_array(&[
                chunk[0], chunk[1], chunk[2], chunk[3], chunk[4], chunk[5], chunk[6], chunk[7],
                chunk[8], chunk[9], chunk[10], chunk[11], chunk[12], chunk[13], chunk[14],
                chunk[15],
            ]);
            let color = glam::Vec4::new(chunk[16], chunk[17], chunk[18], chunk[19]);
            let emissive = glam::Vec4::new(chunk[20], chunk[21], chunk[22], chunk[23]);
            let pbr = glam::Vec4::new(chunk[24], chunk[25], chunk[26], chunk[27]);
            let custom = glam::Vec4::new(chunk[28], chunk[29], chunk[30], chunk[31]);
            InstanceData3D {
                transform,
                color,
                emissive,
                pbr,
                custom,
            }
        })
        .collect();

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .set_instanced_model_data(instanced_model_id, instances)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates blend-shape weights for one model from a contiguous f32 buffer.
///
/// # Safety
/// `weights_ptr` must be valid for `weight_count` f32 elements when the count is non-zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_model_morph_weights(
    realm_id: u32,
    model_id: u32,
    weights_ptr: *const f32,
    weight_count: usize,
) -> i32 {
    if weight_count != 0 && weights_ptr.is_null() {
        set_last_error("Null morph weight data pointer");
        return -1;
    }
    let weights = if weight_count == 0 {
        Vec::new()
    } else {
        unsafe { std::slice::from_raw_parts(weights_ptr, weight_count) }.to_vec()
    };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .set_model_morph_weights(model_id, weights)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates blend-shape weights shared by every instance in an instanced draw batch.
///
/// # Safety
/// `weights_ptr` must be valid for `weight_count` f32 elements when the count is non-zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_instanced_model_morph_weights(
    realm_id: u32,
    instanced_model_id: u32,
    weights_ptr: *const f32,
    weight_count: usize,
) -> i32 {
    if weight_count != 0 && weights_ptr.is_null() {
        set_last_error("Null morph weight data pointer");
        return -1;
    }
    let weights = if weight_count == 0 {
        Vec::new()
    } else {
        unsafe { std::slice::from_raw_parts(weights_ptr, weight_count) }.to_vec()
    };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .set_instanced_model_morph_weights(instanced_model_id, weights)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a 3D Light in the 3D Realm.
///
/// # Safety
/// Pointers must be valid, null-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_light(
    realm_id: u32,
    light_id: u32,
    light_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let light_desc: Light3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(light_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Light3DDesc: {e}"));
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

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_light(light_id, light_desc.into(), trans_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Light in the 3D Realm.
///
/// # Safety
/// `transform_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_light_transform(
    realm_id: u32,
    light_id: u32,
    transform: *const GalfusTransform3D,
) -> i32 {
    if transform.is_null() {
        set_last_error("Null pointer passed to set_light_transform");
        return -1;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let transform = unsafe { (*transform).into() };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .set_light_transform(light_id, transform)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the atmospheric Environment in the 3D Realm.
///
/// # Safety
/// `environment_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_environment(
    realm_id: u32,
    environment_json: *const c_char,
) -> i32 {
    let env_desc: EnvironmentRealm3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(environment_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid EnvironmentRealm3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm.set_environment(env_desc.into());
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Uploads contiguous 16-float matrices for skeletal skinning.
///
/// # Safety
/// `data_ptr` must be valid for reads of `float_count` f32 elements.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_update_bones(
    realm_id: u32,
    model_id: u32,
    data_ptr: *const f32,
    float_count: usize,
) -> i32 {
    if float_count == 0 || !float_count.is_multiple_of(16) {
        set_last_error("Matrices array length must be a multiple of 16");
        return -1;
    }
    if data_ptr.is_null() {
        set_last_error("Null bone matrix data pointer");
        return -1;
    }
    let floats = unsafe { std::slice::from_raw_parts(data_ptr, float_count) };

    let matrices: Vec<glam::Mat4> = floats
        .as_chunks::<16>()
        .0
        .iter()
        .map(glam::Mat4::from_cols_array)
        .collect();

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .update_model_bones(model_id, &matrices)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

#[path = "ffi_realm_3d_gizmo.rs"]
mod ffi_realm_3d_gizmo;
pub use ffi_realm_3d_gizmo::*;
