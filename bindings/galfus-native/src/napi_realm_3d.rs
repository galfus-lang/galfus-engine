//! Node-API bindings for Realm 3D.

use super::*;

// Realm 3D
#[napi(js_name = "realm3dCreate")]
pub fn realm_3d_create(realm_id: u32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_3d::galfus_realm_3d_create(realm_id))
}

#[napi(js_name = "realm3dDestroy")]
pub fn realm_3d_destroy(realm_id: u32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_3d::galfus_realm_3d_destroy(realm_id))
}

#[napi(js_name = "realm3dCreateCamera")]
pub fn realm_3d_create_camera(
    env: Env,
    realm_id: u32,
    camera_id: u32,
    camera_val: JsUnknown,
    transform_val: Option<JsUnknown>,
) -> Result<()> {
    let c_cam = js_to_c_string(&env, Some(camera_val))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "camera cannot be null"))?;
    let c_tf = js_to_c_string(&env, transform_val)?;
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_create_camera(
            realm_id,
            camera_id,
            c_cam.as_ptr(),
            c_tf.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
        )
    })
}

#[napi(js_name = "realm3dSetCameraTransform")]
pub fn realm_3d_set_camera_transform(
    env: Env,
    realm_id: u32,
    camera_id: u32,
    transform_val: JsUnknown,
) -> Result<()> {
    let desc: crate::ffi_realm_3d_desc::Transform3DDesc = env.from_js_value(transform_val)?;
    let native_tf: crate::ffi_native_structs::GalfusTransform3D =
        galfus_realm_3d_resources::transform::Transform3D::from(desc).into();
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_set_camera_transform(realm_id, camera_id, &native_tf)
    })
}

#[napi(js_name = "realm3dCreateGeometry")]
pub fn realm_3d_create_geometry(
    realm_id: u32,
    geometry_id: u32,
    topology: u32,
    vertex_data: Uint8Array,
    _vertex_data_len: Option<i64>,
    indices: Uint32Array,
    _index_count: Option<i64>,
) -> Result<()> {
    let v_slice: &[u8] = vertex_data.as_ref();
    let i_slice: &[u32] = indices.as_ref();
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_create_geometry(
            realm_id,
            geometry_id,
            topology,
            v_slice.as_ptr(),
            v_slice.len(),
            i_slice.as_ptr(),
            i_slice.len(),
        )
    })
}

#[napi(js_name = "realm3dSetGeometryMorphTargets")]
pub fn realm_3d_set_geometry_morph_targets(
    realm_id: u32,
    geometry_id: u32,
    target_data: Uint8Array,
    _target_data_len: Option<i64>,
    target_count: u32,
) -> Result<()> {
    let data: &[u8] = target_data.as_ref();
    let target_count = target_count as usize;
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_set_geometry_morph_targets(
            realm_id,
            geometry_id,
            data.as_ptr(),
            data.len(),
            target_count,
        )
    })
}

#[napi(js_name = "realm3dCreateCube")]
pub fn realm_3d_create_cube(realm_id: u32, geometry_id: u32, size: f32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_3d::galfus_realm_3d_create_cube(
        realm_id,
        geometry_id,
        size,
    ))
}

#[napi(js_name = "realm3dCreatePlane")]
pub fn realm_3d_create_plane(
    realm_id: u32,
    geometry_id: u32,
    width: f32,
    depth: f32,
) -> Result<()> {
    check_ffi_res(crate::ffi_realm_3d::galfus_realm_3d_create_plane(
        realm_id,
        geometry_id,
        width,
        depth,
    ))
}

#[napi(js_name = "realm3dCreateQuad")]
pub fn realm_3d_create_quad(
    realm_id: u32,
    geometry_id: u32,
    width: f32,
    height: f32,
) -> Result<()> {
    check_ffi_res(crate::ffi_realm_3d::galfus_realm_3d_create_quad(
        realm_id,
        geometry_id,
        width,
        height,
    ))
}

#[napi(js_name = "realm3dCreateSphere")]
pub fn realm_3d_create_sphere(
    realm_id: u32,
    geometry_id: u32,
    radius: f32,
    rings: u32,
    sectors: u32,
) -> Result<()> {
    check_ffi_res(crate::ffi_realm_3d::galfus_realm_3d_create_sphere(
        realm_id,
        geometry_id,
        radius,
        rings,
        sectors,
    ))
}

#[napi(js_name = "realm3dCreateCylinder")]
pub fn realm_3d_create_cylinder(
    realm_id: u32,
    geometry_id: u32,
    radius: f32,
    height: f32,
    sectors: u32,
) -> Result<()> {
    check_ffi_res(crate::ffi_realm_3d::galfus_realm_3d_create_cylinder(
        realm_id,
        geometry_id,
        radius,
        height,
        sectors,
    ))
}

#[napi(js_name = "realm3dCreateCapsule")]
pub fn realm_3d_create_capsule(
    realm_id: u32,
    geometry_id: u32,
    radius: f32,
    cylinder_height: f32,
    rings: u32,
    sectors: u32,
) -> Result<()> {
    check_ffi_res(crate::ffi_realm_3d::galfus_realm_3d_create_capsule(
        realm_id,
        geometry_id,
        radius,
        cylinder_height,
        rings,
        sectors,
    ))
}

#[napi(js_name = "realm3dCreatePyramid")]
pub fn realm_3d_create_pyramid(
    realm_id: u32,
    geometry_id: u32,
    width: f32,
    depth: f32,
    height: f32,
) -> Result<()> {
    check_ffi_res(crate::ffi_realm_3d::galfus_realm_3d_create_pyramid(
        realm_id,
        geometry_id,
        width,
        depth,
        height,
    ))
}

#[napi(js_name = "realm3dCreateTorus")]
pub fn realm_3d_create_torus(
    realm_id: u32,
    geometry_id: u32,
    major_radius: f32,
    minor_radius: f32,
    major_segments: u32,
    minor_segments: u32,
) -> Result<()> {
    check_ffi_res(crate::ffi_realm_3d::galfus_realm_3d_create_torus(
        realm_id,
        geometry_id,
        major_radius,
        minor_radius,
        major_segments,
        minor_segments,
    ))
}

#[napi(js_name = "realm3dCreateMaterial")]
pub fn realm_3d_create_material(
    env: Env,
    realm_id: u32,
    material_id: u32,
    material_val: JsUnknown,
) -> Result<()> {
    let c_mat = js_to_c_string(&env, Some(material_val))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "material cannot be null"))?;
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_create_material(realm_id, material_id, c_mat.as_ptr())
    })
}

#[napi(js_name = "realm3dCreateModel")]
pub fn realm_3d_create_model(
    env: Env,
    realm_id: u32,
    model_id: u32,
    model_val: JsUnknown,
    transform_val: Option<JsUnknown>,
) -> Result<()> {
    let c_mod = js_to_c_string(&env, Some(model_val))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "model cannot be null"))?;
    let c_tf = js_to_c_string(&env, transform_val)?;
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_create_model(
            realm_id,
            model_id,
            c_mod.as_ptr(),
            c_tf.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
        )
    })
}

#[napi(js_name = "realm3dSetModelTransform")]
pub fn realm_3d_set_model_transform(
    env: Env,
    realm_id: u32,
    model_id: u32,
    transform_val: JsUnknown,
) -> Result<()> {
    let desc: crate::ffi_realm_3d_desc::Transform3DDesc = env.from_js_value(transform_val)?;
    let native_tf: crate::ffi_native_structs::GalfusTransform3D =
        galfus_realm_3d_resources::transform::Transform3D::from(desc).into();
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_set_model_transform(realm_id, model_id, &native_tf)
    })
}

#[napi(js_name = "realm3dSetModelMorphWeights")]
pub fn realm_3d_set_model_morph_weights(
    realm_id: u32,
    model_id: u32,
    weights: Float32Array,
    _weight_count: Option<i64>,
) -> Result<()> {
    let weights: &[f32] = weights.as_ref();
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_set_model_morph_weights(
            realm_id,
            model_id,
            weights.as_ptr(),
            weights.len(),
        )
    })
}

#[napi(js_name = "realm3dSetInstancedModelMorphWeights")]
pub fn realm_3d_set_instanced_model_morph_weights(
    realm_id: u32,
    instanced_model_id: u32,
    weights: Float32Array,
    _weight_count: Option<i64>,
) -> Result<()> {
    let weights: &[f32] = weights.as_ref();
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_set_instanced_model_morph_weights(
            realm_id,
            instanced_model_id,
            weights.as_ptr(),
            weights.len(),
        )
    })
}

#[napi(js_name = "realm3dCreateLight")]
pub fn realm_3d_create_light(
    env: Env,
    realm_id: u32,
    light_id: u32,
    light_val: JsUnknown,
    transform_val: Option<JsUnknown>,
) -> Result<()> {
    let c_light = js_to_c_string(&env, Some(light_val))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "light cannot be null"))?;
    let c_tf = js_to_c_string(&env, transform_val)?;
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_create_light(
            realm_id,
            light_id,
            c_light.as_ptr(),
            c_tf.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
        )
    })
}

#[napi(js_name = "realm3dSetLightTransform")]
pub fn realm_3d_set_light_transform(
    env: Env,
    realm_id: u32,
    light_id: u32,
    transform_val: JsUnknown,
) -> Result<()> {
    let desc: crate::ffi_realm_3d_desc::Transform3DDesc = env.from_js_value(transform_val)?;
    let native_tf: crate::ffi_native_structs::GalfusTransform3D =
        galfus_realm_3d_resources::transform::Transform3D::from(desc).into();
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_set_light_transform(realm_id, light_id, &native_tf)
    })
}

#[napi(js_name = "realm3dSetEnvironment")]
pub fn realm_3d_set_environment(env: Env, realm_id: u32, environment_val: JsUnknown) -> Result<()> {
    let c_env = js_to_c_string(&env, Some(environment_val))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "environment cannot be null"))?;
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_set_environment(realm_id, c_env.as_ptr())
    })
}

#[napi(js_name = "realm3dUpdateBones")]
pub fn realm_3d_update_bones(
    realm_id: u32,
    model_id: u32,
    data: Float32Array,
    _float_count: Option<i64>,
) -> Result<()> {
    let f_slice: &[f32] = data.as_ref();
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_update_bones(
            realm_id,
            model_id,
            f_slice.as_ptr(),
            f_slice.len(),
        )
    })
}

#[napi(js_name = "realm3dCreateParticleEmitter")]
pub fn realm_3d_create_particle_emitter(
    env: Env,
    realm_id: u32,
    emitter_id: u32,
    emitter_val: JsUnknown,
    transform_val: Option<JsUnknown>,
) -> Result<()> {
    let c_emitter = js_to_c_string(&env, Some(emitter_val))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "emitter cannot be null"))?;
    let c_tf = js_to_c_string(&env, transform_val)?;
    check_ffi_res(unsafe {
        crate::ffi_realm_3d_particles::galfus_realm_3d_create_particle_emitter(
            realm_id,
            emitter_id,
            c_emitter.as_ptr(),
            c_tf.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
        )
    })
}

#[napi(js_name = "realm3dSetParticleEmitterTransform")]
pub fn realm_3d_set_particle_emitter_transform(
    env: Env,
    realm_id: u32,
    emitter_id: u32,
    transform_val: JsUnknown,
) -> Result<()> {
    let desc: crate::ffi_realm_3d_desc::Transform3DDesc = env.from_js_value(transform_val)?;
    let native_tf: crate::ffi_native_structs::GalfusTransform3D =
        galfus_realm_3d_resources::transform::Transform3D::from(desc).into();
    check_ffi_res(unsafe {
        crate::ffi_realm_3d_particles::galfus_realm_3d_set_particle_emitter_transform(
            realm_id, emitter_id, &native_tf,
        )
    })
}

#[napi(js_name = "realm3dCreatePortal")]
pub fn realm_3d_create_portal(
    env: Env,
    realm_id: u32,
    portal_id: u32,
    portal_val: JsUnknown,
) -> Result<()> {
    let c_portal = js_to_c_string(&env, Some(portal_val))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "portal cannot be null"))?;
    check_ffi_res(unsafe {
        crate::ffi_realm_3d_portals::galfus_realm_3d_create_portal(
            realm_id,
            portal_id,
            c_portal.as_ptr(),
        )
    })
}
