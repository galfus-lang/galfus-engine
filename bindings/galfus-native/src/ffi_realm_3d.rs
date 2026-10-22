use std::os::raw::c_char;

use galfus_realm_3d::Realm3DContext;
use galfus_realm_3d_resources::camera::Camera3D;
use galfus_realm_3d_resources::geometry::{Geometry3D, Vertex3D};
use galfus_realm_3d_resources::model::InstanceData3D;

use crate::ffi::{from_c_str, from_c_str_optional, set_last_error};
use crate::ffi_native_structs::GalfusTransform3D;
use crate::ffi_realm_3d_desc::*;
use crate::state::with_multiverse_mut;

unsafe fn parse_transform_3d(transform_json: *const c_char) -> Result<Transform3DDesc, String> {
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

    if geom_desc.primitive.is_none() || geom_desc.primitive.as_deref() == Some("custom") {
        set_last_error("Custom geometry must be uploaded with galfus_realm_3d_create_geometry_raw");
        return -1;
    }

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

/// Registers or updates custom 3D geometry from interleaved binary vertex data and u32 indices.
///
/// Vertex data uses the 136-byte canonical `Vertex3D` C layout: position, normal, `uv0`, `uv1`,
/// tangent, color, `joints0`, `weights0`, `joints1`, and `weights1`.
/// Indices must reference an existing vertex.
///
/// # Safety
/// `vertices_ptr` must be valid for `vertices_len` bytes and `indices_ptr` must be valid for
/// `indices_len` u32 elements when their respective lengths are non-zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_geometry_raw(
    realm_id: u32,
    geometry_id: u32,
    vertices_ptr: *const u8,
    vertices_len: usize,
    indices_ptr: *const u32,
    indices_len: usize,
) -> i32 {
    const VERTEX3D_BYTES: usize = std::mem::size_of::<Vertex3D>();

    if vertices_len == 0 || !vertices_len.is_multiple_of(VERTEX3D_BYTES) {
        set_last_error("Vertex data length must be a non-zero multiple of 136 bytes");
        return -1;
    }
    if vertices_ptr.is_null() || (indices_len != 0 && indices_ptr.is_null()) {
        set_last_error("Null custom geometry data pointer");
        return -1;
    }

    let vertex_bytes = unsafe { std::slice::from_raw_parts(vertices_ptr, vertices_len) };
    let vertices = vertex_bytes
        .as_chunks::<VERTEX3D_BYTES>()
        .0
        .iter()
        .map(|chunk| unsafe { std::ptr::read_unaligned(chunk.as_ptr().cast::<Vertex3D>()) })
        .collect::<Vec<_>>();
    let indices = if indices_len == 0 {
        Vec::new()
    } else {
        unsafe { std::slice::from_raw_parts(indices_ptr, indices_len) }.to_vec()
    };

    if indices
        .iter()
        .any(|&index| index as usize >= vertices.len())
    {
        set_last_error("Custom geometry index is outside the vertex buffer");
        return -1;
    }

    let geometry = Geometry3D::new(vertices, indices, None);
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_geometry(geometry_id, geometry)
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
