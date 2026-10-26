//! Node-API bindings for Realm 2D and entity destruction.

use super::*;

// Realm 2D
#[napi(js_name = "realm2dCreate")]
pub fn realm_2d_create(realm_id: u32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_2d::galfus_realm_2d_create(realm_id))
}

#[napi(js_name = "realm2dDestroy")]
pub fn realm_2d_destroy(realm_id: u32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_2d::galfus_realm_2d_destroy(realm_id))
}

#[napi(js_name = "realm2dCreateCamera")]
pub fn realm_2d_create_camera(
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
        crate::ffi_realm_2d::galfus_realm_2d_create_camera(
            realm_id,
            camera_id,
            c_cam.as_ptr(),
            c_tf.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
        )
    })
}

#[napi(js_name = "realm2dSetCameraTransform")]
pub fn realm_2d_set_camera_transform(
    env: Env,
    realm_id: u32,
    camera_id: u32,
    transform_val: JsUnknown,
) -> Result<()> {
    let desc: crate::ffi_realm_2d_desc::Transform2DDesc = env.from_js_value(transform_val)?;
    let native_tf: crate::ffi_native_structs::GalfusTransform2D =
        galfus_realm_2d_resources::Transform2D::from(desc).into();
    check_ffi_res(unsafe {
        crate::ffi_realm_2d::galfus_realm_2d_set_camera_transform(realm_id, camera_id, &native_tf)
    })
}

#[napi(js_name = "realm2dCreateLight")]
pub fn realm_2d_create_light(
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
        crate::ffi_realm_2d::galfus_realm_2d_create_light(
            realm_id,
            light_id,
            c_light.as_ptr(),
            c_tf.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
        )
    })
}

#[napi(js_name = "realm2dSetLightTransform")]
pub fn realm_2d_set_light_transform(
    env: Env,
    realm_id: u32,
    light_id: u32,
    transform_val: JsUnknown,
) -> Result<()> {
    let desc: crate::ffi_realm_2d_desc::Transform2DDesc = env.from_js_value(transform_val)?;
    let native_tf: crate::ffi_native_structs::GalfusTransform2D =
        galfus_realm_2d_resources::Transform2D::from(desc).into();
    check_ffi_res(unsafe {
        crate::ffi_realm_2d::galfus_realm_2d_set_light_transform(realm_id, light_id, &native_tf)
    })
}

#[napi(js_name = "realm2dCreateSvg")]
pub fn realm_2d_create_svg(
    env: Env,
    realm_id: u32,
    svg_id: u32,
    svg_val: JsUnknown,
    transform_val: Option<JsUnknown>,
) -> Result<()> {
    let c_svg = js_to_c_string(&env, Some(svg_val))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "svg cannot be null"))?;
    let c_tf = js_to_c_string(&env, transform_val)?;
    check_ffi_res(unsafe {
        crate::ffi_realm_2d_svg::galfus_realm_2d_create_svg(
            realm_id,
            svg_id,
            c_svg.as_ptr(),
            c_tf.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
        )
    })
}

#[napi(js_name = "realm2dSetSvgSource")]
pub fn realm_2d_set_svg_source(realm_id: u32, svg_id: u32, source: String) -> Result<()> {
    let c_source = std::ffi::CString::new(source)
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
    check_ffi_res(unsafe {
        crate::ffi_realm_2d_svg::galfus_realm_2d_set_svg_source(realm_id, svg_id, c_source.as_ptr())
    })
}

#[napi(js_name = "realm2dSetSvgTransform")]
pub fn realm_2d_set_svg_transform(
    env: Env,
    realm_id: u32,
    svg_id: u32,
    transform_val: JsUnknown,
) -> Result<()> {
    let desc: crate::ffi_realm_2d_desc::Transform2DDesc = env.from_js_value(transform_val)?;
    let native_tf: crate::ffi_native_structs::GalfusTransform2D =
        galfus_realm_2d_resources::Transform2D::from(desc).into();
    check_ffi_res(unsafe {
        crate::ffi_realm_2d_svg::galfus_realm_2d_set_svg_transform(realm_id, svg_id, &native_tf)
    })
}

#[napi(js_name = "realm3dDestroyCamera")]
pub fn realm_3d_destroy_camera(realm_id: u32, camera_id: u32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_destroy::galfus_realm_3d_destroy_camera(
        realm_id, camera_id,
    ))
}

#[napi(js_name = "realm3dDestroyMaterial")]
pub fn realm_3d_destroy_material(realm_id: u32, material_id: u32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_destroy::galfus_realm_3d_destroy_material(
        realm_id,
        material_id,
    ))
}

#[napi(js_name = "realm3dDestroyGeometry")]
pub fn realm_3d_destroy_geometry(realm_id: u32, geometry_id: u32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_destroy::galfus_realm_3d_destroy_geometry(
        realm_id,
        geometry_id,
    ))
}

#[napi(js_name = "realm3dDestroyModel")]
pub fn realm_3d_destroy_model(realm_id: u32, model_id: u32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_destroy::galfus_realm_3d_destroy_model(
        realm_id, model_id,
    ))
}

#[napi(js_name = "realm3dDestroyLight")]
pub fn realm_3d_destroy_light(realm_id: u32, light_id: u32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_destroy::galfus_realm_3d_destroy_light(
        realm_id, light_id,
    ))
}

#[napi(js_name = "realm3dDestroyPortal")]
pub fn realm_3d_destroy_portal(realm_id: u32, portal_id: u32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_3d_portals::galfus_realm_3d_destroy_portal(
        realm_id, portal_id,
    ))
}

#[napi(js_name = "realm3dDestroyParticleEmitter")]
pub fn realm_3d_destroy_particle_emitter(realm_id: u32, emitter_id: u32) -> Result<()> {
    check_ffi_res(
        crate::ffi_realm_3d_particles::galfus_realm_3d_destroy_particle_emitter(
            realm_id, emitter_id,
        ),
    )
}

#[napi(js_name = "realm2dDestroyCamera")]
pub fn realm_2d_destroy_camera(realm_id: u32, camera_id: u32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_destroy::galfus_realm_2d_destroy_camera(
        realm_id, camera_id,
    ))
}

#[napi(js_name = "realm2dDestroyLight")]
pub fn realm_2d_destroy_light(realm_id: u32, light_id: u32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_destroy::galfus_realm_2d_destroy_light(
        realm_id, light_id,
    ))
}

#[napi(js_name = "realm2dDestroySvg")]
pub fn realm_2d_destroy_svg(realm_id: u32, svg_id: u32) -> Result<()> {
    check_ffi_res(crate::ffi_realm_2d_svg::galfus_realm_2d_destroy_svg(
        realm_id, svg_id,
    ))
}
