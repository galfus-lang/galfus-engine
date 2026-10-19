use std::os::raw::c_char;

use galfus_realm_3d::Realm3DContext;

use crate::ffi::{from_c_str, set_last_error};
use crate::ffi_realm_3d_desc::*;
use crate::state::with_multiverse_mut;

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

    let trans_desc: Transform3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(transform_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Transform3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_camera(camera_id, cam_desc.into(), trans_desc.into())
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
    transform_json: *const c_char,
) -> i32 {
    let trans_desc: Transform3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(transform_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Transform3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .set_camera_transform(camera_id, trans_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a 3D Geometry in the 3D Realm.
///
/// # Safety
/// `geometry_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_geometry(
    realm_id: u32,
    geometry_id: u32,
    geometry_json: *const c_char,
) -> i32 {
    let geom_desc: Geometry3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(geometry_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Geometry3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_geometry(geometry_id, geom_desc.into())
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

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

    let trans_desc: Transform3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(transform_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Transform3DDesc: {e}"));
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
    transform_json: *const c_char,
) -> i32 {
    let trans_desc: Transform3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(transform_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Transform3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .set_model_transform(model_id, trans_desc.into())
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

/// Uploads instance descriptions for an existing Instanced Model in the 3D Realm.
///
/// # Safety
/// `instances_json` must be a valid, null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_instanced_model_data(
    realm_id: u32,
    instanced_model_id: u32,
    instances_json: *const c_char,
) -> i32 {
    let desc_list: Vec<InstanceData3DDesc> =
        match serde_json::from_str(match unsafe { from_c_str(instances_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid InstanceData3DDesc list: {e}"));
                return -1;
            }
        };

    let instances: Vec<galfus_realm_3d_resources::model::InstanceData3D> =
        desc_list.into_iter().map(Into::into).collect();

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

/// Uploads raw flat floats (32 floats per instance) for an existing Instanced Model in the 3D Realm.
///
/// # Safety
/// `data_json` must be a valid, null-terminated UTF-8 string representing `number[]`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_instanced_model_raw_data(
    realm_id: u32,
    instanced_model_id: u32,
    data_json: *const c_char,
) -> i32 {
    let floats: Vec<f32> = match serde_json::from_str(match unsafe { from_c_str(data_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    }) {
        Ok(f) => f,
        Err(e) => {
            set_last_error(&format!("Invalid raw data JSON: {e}"));
            return -1;
        }
    };

    if !floats.len().is_multiple_of(32) {
        set_last_error("Instanced raw data length must be a multiple of 32");
        return -1;
    }

    let instances: Vec<galfus_realm_3d_resources::model::InstanceData3D> = floats
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
            galfus_realm_3d_resources::model::InstanceData3D {
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

    let trans_desc: Transform3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(transform_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Transform3DDesc: {e}"));
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
    transform_json: *const c_char,
) -> i32 {
    let trans_desc: Transform3DDesc =
        match serde_json::from_str(match unsafe { from_c_str(transform_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Transform3DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .set_light_transform(light_id, trans_desc.into())
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

/// Uploads bone transform matrices (array of 16-element floats) for skeletal skinning.
///
/// # Safety
/// `matrices_json` must be a valid, null-terminated UTF-8 string representing `number[]`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_update_bones(
    realm_id: u32,
    model_id: u32,
    matrices_json: *const c_char,
) -> i32 {
    let floats: Vec<f32> = match serde_json::from_str(match unsafe { from_c_str(matrices_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    }) {
        Ok(f) => f,
        Err(e) => {
            set_last_error(&format!("Invalid matrices JSON: {e}"));
            return -1;
        }
    };

    if !floats.len().is_multiple_of(16) {
        set_last_error("Matrices array length must be a multiple of 16");
        return -1;
    }

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

/// Queues a debug 3D line segment.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_draw_line(
    realm_id: u32,
    x0: f32,
    y0: f32,
    z0: f32,
    x1: f32,
    y1: f32,
    z1: f32,
    r: f32,
    g: f32,
    b: f32,
    a: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm.draw_line(
            glam::Vec3::new(x0, y0, z0),
            glam::Vec3::new(x1, y1, z1),
            glam::Vec4::new(r, g, b, a),
        );
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Queues a debug 3D Axis-Aligned Bounding Box (AABB).
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_draw_aabb(
    realm_id: u32,
    min_x: f32,
    min_y: f32,
    min_z: f32,
    max_x: f32,
    max_y: f32,
    max_z: f32,
    r: f32,
    g: f32,
    b: f32,
    a: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm.draw_aabb(
            glam::Vec3::new(min_x, min_y, min_z),
            glam::Vec3::new(max_x, max_y, max_z),
            glam::Vec4::new(r, g, b, a),
        );
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Clears any queued gizmos in Realm 3D.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_clear_gizmos(realm_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm.clear_gizmos();
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}
