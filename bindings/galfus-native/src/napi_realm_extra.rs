//! Node-API bindings for remaining realm and animation operations.

use super::*;

#[napi(js_name = "realmClear")]
pub fn realm_clear(realm_id: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_clear(realm_id))
}

#[napi(js_name = "realmDestroy")]
pub fn realm_destroy(realm_id: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_destroy(realm_id))
}

#[napi(js_name = "realm3dCreateInstancedModel")]
pub fn realm_3d_create_instanced_model(
    env: Env,
    realm_id: u32,
    instanced_model_id: u32,
    model: JsUnknown,
) -> Result<()> {
    let model_json = js_to_c_string(&env, Some(model))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "model cannot be null"))?;
    check_ffi_res(unsafe {
        crate::galfus_realm_3d_create_instanced_model(
            realm_id,
            instanced_model_id,
            model_json.as_ptr(),
        )
    })
}

#[napi(js_name = "realm3dDrawLine")]
#[allow(clippy::too_many_arguments)]
pub fn realm_3d_draw_line(
    realm_id: u32,
    x0: f64,
    y0: f64,
    z0: f64,
    x1: f64,
    y1: f64,
    z1: f64,
    r: f64,
    g: f64,
    b: f64,
    a: f64,
) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_draw_line(
        realm_id, x0 as f32, y0 as f32, z0 as f32, x1 as f32, y1 as f32, z1 as f32, r as f32,
        g as f32, b as f32, a as f32,
    ))
}

#[napi(js_name = "realm3dDrawAabb")]
#[allow(clippy::too_many_arguments)]
pub fn realm_3d_draw_aabb(
    realm_id: u32,
    min_x: f64,
    min_y: f64,
    min_z: f64,
    max_x: f64,
    max_y: f64,
    max_z: f64,
    r: f64,
    g: f64,
    b: f64,
    a: f64,
) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_draw_aabb(
        realm_id,
        min_x as f32,
        min_y as f32,
        min_z as f32,
        max_x as f32,
        max_y as f32,
        max_z as f32,
        r as f32,
        g as f32,
        b as f32,
        a as f32,
    ))
}

#[napi(js_name = "realm3dClearGizmos")]
pub fn realm_3d_clear_gizmos(realm_id: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_clear_gizmos(realm_id))
}

#[napi(js_name = "realm3dParticleEmitterBurst")]
pub fn realm_3d_particle_emitter_burst(realm_id: u32, emitter_id: u32, count: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_particle_emitter_burst(
        realm_id, emitter_id, count,
    ))
}

#[napi(js_name = "realm3dSetPortalActive")]
pub fn realm_3d_set_portal_active(realm_id: u32, portal_id: u32, active: bool) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_set_portal_active(
        realm_id, portal_id, active,
    ))
}

#[napi(js_name = "realm3dDestroyInstancedModel")]
pub fn realm_3d_destroy_instanced_model(realm_id: u32, instanced_model_id: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_destroy_instanced_model(
        realm_id,
        instanced_model_id,
    ))
}

#[napi(js_name = "realm3dGetModelTransform")]
pub fn realm_3d_get_model_transform(env: Env, realm_id: u32, model_id: u32) -> Result<JsUnknown> {
    let mut native_out_transform = crate::ffi_native_structs::GalfusTransform3D::from(
        galfus_realm_3d_resources::transform::Transform3D::default(),
    );
    check_ffi_res(unsafe {
        crate::galfus_realm_3d_get_model_transform(realm_id, model_id, &mut native_out_transform)
    })?;
    let tf: galfus_realm_3d_resources::transform::Transform3D = native_out_transform.into();
    env.to_js_value(&tf)
}

#[napi(js_name = "realm3dGetCameraTransform")]
pub fn realm_3d_get_camera_transform(env: Env, realm_id: u32, camera_id: u32) -> Result<JsUnknown> {
    let mut native_out_transform = crate::ffi_native_structs::GalfusTransform3D::from(
        galfus_realm_3d_resources::transform::Transform3D::default(),
    );
    check_ffi_res(unsafe {
        crate::galfus_realm_3d_get_camera_transform(realm_id, camera_id, &mut native_out_transform)
    })?;
    let tf: galfus_realm_3d_resources::transform::Transform3D = native_out_transform.into();
    env.to_js_value(&tf)
}

#[napi(js_name = "realm2dCreateMaterial")]
pub fn realm_2d_create_material(
    env: Env,
    realm_id: u32,
    material_id: u32,
    material: JsUnknown,
) -> Result<()> {
    let material_json = js_to_c_string(&env, Some(material))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "material cannot be null"))?;
    check_ffi_res(unsafe {
        crate::galfus_realm_2d_create_material(realm_id, material_id, material_json.as_ptr())
    })
}

#[napi(js_name = "realm2dCreateSprite")]
pub fn realm_2d_create_sprite(
    env: Env,
    realm_id: u32,
    sprite_id: u32,
    sprite: JsUnknown,
    transform: JsUnknown,
) -> Result<()> {
    let sprite_json = js_to_c_string(&env, Some(sprite))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "sprite cannot be null"))?;
    let transform_json = js_to_c_string(&env, Some(transform))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "transform cannot be null"))?;
    check_ffi_res(unsafe {
        crate::galfus_realm_2d_create_sprite(
            realm_id,
            sprite_id,
            sprite_json.as_ptr(),
            transform_json.as_ptr(),
        )
    })
}

#[napi(js_name = "realm2dSetSpriteTransform")]
pub fn realm_2d_set_sprite_transform(
    env: Env,
    realm_id: u32,
    sprite_id: u32,
    transform: JsUnknown,
) -> Result<()> {
    let transform_desc: crate::ffi_realm_2d_desc::Transform2DDesc = env.from_js_value(transform)?;
    let native_transform = crate::ffi_native_structs::GalfusTransform2D::from(
        galfus_realm_2d_resources::Transform2D::from(transform_desc),
    );
    check_ffi_res(unsafe {
        crate::galfus_realm_2d_set_sprite_transform(realm_id, sprite_id, &native_transform)
    })
}

#[napi(js_name = "realm2dCreateShape")]
pub fn realm_2d_create_shape(
    env: Env,
    realm_id: u32,
    shape_id: u32,
    shape: JsUnknown,
    transform: JsUnknown,
) -> Result<()> {
    let shape_json = js_to_c_string(&env, Some(shape))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "shape cannot be null"))?;
    let transform_json = js_to_c_string(&env, Some(transform))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "transform cannot be null"))?;
    check_ffi_res(unsafe {
        crate::galfus_realm_2d_create_shape(
            realm_id,
            shape_id,
            shape_json.as_ptr(),
            transform_json.as_ptr(),
        )
    })
}

#[napi(js_name = "realm2dSetShapeTransform")]
pub fn realm_2d_set_shape_transform(
    env: Env,
    realm_id: u32,
    shape_id: u32,
    transform: JsUnknown,
) -> Result<()> {
    let transform_desc: crate::ffi_realm_2d_desc::Transform2DDesc = env.from_js_value(transform)?;
    let native_transform = crate::ffi_native_structs::GalfusTransform2D::from(
        galfus_realm_2d_resources::Transform2D::from(transform_desc),
    );
    check_ffi_res(unsafe {
        crate::galfus_realm_2d_set_shape_transform(realm_id, shape_id, &native_transform)
    })
}

#[napi(js_name = "realm2dSetShadowConfig")]
pub fn realm_2d_set_shadow_config(env: Env, realm_id: u32, config: JsUnknown) -> Result<()> {
    let config_json = js_to_c_string(&env, Some(config))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "config cannot be null"))?;
    check_ffi_res(unsafe {
        crate::galfus_realm_2d_set_shadow_config(realm_id, config_json.as_ptr())
    })
}

#[napi(js_name = "realm2dCreateParticleEmitter")]
pub fn realm_2d_create_particle_emitter(
    env: Env,
    realm_id: u32,
    emitter_id: u32,
    emitter: JsUnknown,
    transform: JsUnknown,
) -> Result<()> {
    let emitter_json = js_to_c_string(&env, Some(emitter))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "emitter cannot be null"))?;
    let transform_json = js_to_c_string(&env, Some(transform))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "transform cannot be null"))?;
    check_ffi_res(unsafe {
        crate::galfus_realm_2d_create_particle_emitter(
            realm_id,
            emitter_id,
            emitter_json.as_ptr(),
            transform_json.as_ptr(),
        )
    })
}

#[napi(js_name = "realm2dSetParticleEmitterTransform")]
pub fn realm_2d_set_particle_emitter_transform(
    env: Env,
    realm_id: u32,
    emitter_id: u32,
    transform: JsUnknown,
) -> Result<()> {
    let transform_desc: crate::ffi_realm_2d_desc::Transform2DDesc = env.from_js_value(transform)?;
    let native_transform = crate::ffi_native_structs::GalfusTransform2D::from(
        galfus_realm_2d_resources::Transform2D::from(transform_desc),
    );
    check_ffi_res(unsafe {
        crate::galfus_realm_2d_set_particle_emitter_transform(
            realm_id,
            emitter_id,
            &native_transform,
        )
    })
}

#[napi(js_name = "realm2dParticleEmitterBurst")]
pub fn realm_2d_particle_emitter_burst(realm_id: u32, emitter_id: u32, count: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_2d_particle_emitter_burst(
        realm_id, emitter_id, count,
    ))
}

#[napi(js_name = "realm2dDestroyParticleEmitter")]
pub fn realm_2d_destroy_particle_emitter(realm_id: u32, emitter_id: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_2d_destroy_particle_emitter(
        realm_id, emitter_id,
    ))
}

#[napi(js_name = "realm2dDestroyMaterial")]
pub fn realm_2d_destroy_material(realm_id: u32, material_id: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_2d_destroy_material(
        realm_id,
        material_id,
    ))
}

#[napi(js_name = "realm2dDestroySprite")]
pub fn realm_2d_destroy_sprite(realm_id: u32, sprite_id: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_2d_destroy_sprite(realm_id, sprite_id))
}

#[napi(js_name = "realm2dDestroyShape")]
pub fn realm_2d_destroy_shape(realm_id: u32, shape_id: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_2d_destroy_shape(realm_id, shape_id))
}

#[napi(js_name = "realm2dGetSpriteTransform")]
pub fn realm_2d_get_sprite_transform(env: Env, realm_id: u32, sprite_id: u32) -> Result<JsUnknown> {
    let mut native_out_transform = crate::ffi_native_structs::GalfusTransform2D::default();
    check_ffi_res(unsafe {
        crate::galfus_realm_2d_get_sprite_transform(realm_id, sprite_id, &mut native_out_transform)
    })?;
    let tf: galfus_realm_2d_resources::Transform2D = native_out_transform.into();
    env.to_js_value(&tf)
}

#[napi(js_name = "realm2dGetCameraTransform")]
pub fn realm_2d_get_camera_transform(env: Env, realm_id: u32, camera_id: u32) -> Result<JsUnknown> {
    let mut native_out_transform = crate::ffi_native_structs::GalfusTransform2D::default();
    check_ffi_res(unsafe {
        crate::galfus_realm_2d_get_camera_transform(realm_id, camera_id, &mut native_out_transform)
    })?;
    let tf: galfus_realm_2d_resources::Transform2D = native_out_transform.into();
    env.to_js_value(&tf)
}

#[napi(js_name = "animationUnbindTarget")]
pub fn animation_unbind_target(transition_id: u32) -> Result<()> {
    check_ffi_res(crate::galfus_animation_unbind_target(transition_id))
}

#[napi(js_name = "getLastError")]
pub fn get_last_error() -> Result<String> {
    let ptr = crate::ffi::galfus_get_last_error();
    if ptr.is_null() {
        return Ok(String::new());
    }
    ffi_string_result(ptr)
}

#[napi(js_name = "realm2dLoadFontData")]
pub fn realm_2d_load_font_data(realm_id: u32, data: Uint8Array, data_len: f64) -> Result<String> {
    let len = data_len as usize;
    if !data_len.is_finite() || data_len < 0.0 || data_len.fract() != 0.0 || len > data.len() {
        return Err(Error::new(Status::InvalidArg, "Invalid font data length"));
    }
    let ptr = unsafe {
        crate::ffi_realm_2d_ui::galfus_realm_2d_load_font_data(realm_id, data.as_ptr(), len as u64)
    };
    ffi_string_result(ptr)
}

#[napi(js_name = "realm3dSetInstancedModelData")]
pub fn realm_3d_set_instanced_model_data(
    realm_id: u32,
    instanced_model_id: u32,
    data: Float32Array,
    float_count: f64,
) -> Result<()> {
    let count = float_count as usize;
    if !float_count.is_finite()
        || float_count < 0.0
        || float_count.fract() != 0.0
        || count > data.len()
    {
        return Err(Error::new(
            Status::InvalidArg,
            "Invalid instance data length",
        ));
    }
    check_ffi_res(unsafe {
        crate::ffi_realm_3d::galfus_realm_3d_set_instanced_model_data(
            realm_id,
            instanced_model_id,
            data.as_ptr(),
            count,
        )
    })
}

#[napi(js_name = "platformGetWindowSizeRaw")]
pub fn platform_get_window_size_raw(window_id: u32) -> Result<Vec<u32>> {
    let mut width = 0;
    let mut height = 0;
    check_ffi_res(unsafe {
        crate::ffi_transforms_getters::galfus_platform_get_window_size(
            window_id,
            &mut width,
            &mut height,
        )
    })?;
    Ok(vec![width, height])
}

#[napi(js_name = "multiverseGetTargetSizeRaw")]
pub fn multiverse_get_target_size_raw(target_id: u32) -> Result<Vec<u32>> {
    let mut width = 0;
    let mut height = 0;
    check_ffi_res(unsafe {
        crate::ffi_transforms_getters::galfus_multiverse_get_target_size(
            target_id,
            &mut width,
            &mut height,
        )
    })?;
    Ok(vec![width, height])
}

#[napi(js_name = "realm3dGetModelAabbRaw")]
pub fn realm_3d_get_model_aabb_raw(realm_id: u32, model_id: u32) -> Result<Vec<f64>> {
    let mut min = [0.0_f32; 3];
    let mut max = [0.0_f32; 3];
    check_ffi_res(unsafe {
        crate::ffi_transforms_getters::galfus_realm_3d_get_model_aabb(
            realm_id,
            model_id,
            min.as_mut_ptr(),
            max.as_mut_ptr(),
        )
    })?;
    Ok(min.into_iter().chain(max).map(f64::from).collect())
}
