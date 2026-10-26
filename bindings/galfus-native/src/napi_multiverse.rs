//! Node-API bindings for multiverse orchestration and invocation control.

use super::*;

#[napi]
pub fn multiverse_attach_window(window_id: u32) -> Result<()> {
    attach_window_to_multiverse(window_id).map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_create_target(env: Env, target_id: u32, desc_val: JsUnknown) -> Result<()> {
    let desc: galfus_multiverse::TargetDesc = env.from_js_value(desc_val)?;
    with_multiverse_mut(|mv| mv.create_target(target_id, desc).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_destroy_target(target_id: u32) -> Result<()> {
    with_multiverse_mut(|mv| mv.destroy_target(target_id).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_register_color_realm(
    realm_id: u32,
    r: f64,
    g: f64,
    b: f64,
    a: f64,
) -> Result<()> {
    with_multiverse_mut(|mv| {
        mv.register_color_realm(realm_id, [r as f32, g as f32, b as f32, a as f32])
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_unregister_realm(realm_id: u32) -> Result<()> {
    with_multiverse_mut(|mv| mv.unregister_realm(realm_id).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi(js_name = "realm3dSetCameraLookAt")]
pub fn realm3d_set_camera_look_at(
    env: Env,
    realm_id: u32,
    camera_id: u32,
    look_at_val: JsUnknown,
) -> Result<()> {
    let look_at: CameraLookAt3DDesc = env.from_js_value(look_at_val)?;
    let (target, up) = look_at.into_vectors();
    with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .set_camera_look_at(camera_id, target, up)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi(js_name = "realm3dGetCameraLookAt")]
pub fn realm3d_get_camera_look_at(env: Env, realm_id: u32, camera_id: u32) -> Result<JsUnknown> {
    let state = with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .get_camera_look_at(camera_id)
            .map(CameraLookAt3DStateDesc::from)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))?;
    env.to_js_value(&state)
}

#[napi(js_name = "realm3dClearCameraLookAt")]
pub fn realm3d_clear_camera_look_at(realm_id: u32, camera_id: u32) -> Result<()> {
    with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .clear_camera_look_at(camera_id)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_register_shader(shader_id: u32, source: String) -> Result<()> {
    with_multiverse_mut(|mv| {
        mv.register_shader(shader_id, &source)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_create_invocation(
    env: Env,
    invocation_id: u32,
    desc_val: JsUnknown,
) -> Result<()> {
    let desc: galfus_multiverse::InvocationDesc = env.from_js_value(desc_val)?;
    with_multiverse_mut(|mv| {
        mv.create_invocation(invocation_id, desc)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_destroy_invocation(invocation_id: u32) -> Result<()> {
    with_multiverse_mut(|mv| {
        mv.destroy_invocation(invocation_id)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_set_invocation_enabled(invocation_id: u32, enabled: bool) -> Result<()> {
    with_multiverse_mut(|mv| {
        mv.set_invocation_enabled(invocation_id, enabled)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_set_invocation_viewport(
    env: Env,
    invocation_id: u32,
    viewport_val: JsUnknown,
) -> Result<()> {
    let viewport: galfus_multiverse::ViewportRect = env.from_js_value(viewport_val)?;
    with_multiverse_mut(|mv| {
        mv.set_invocation_viewport(invocation_id, viewport)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_set_invocation_filters(
    env: Env,
    invocation_id: u32,
    filters_val: JsUnknown,
) -> Result<()> {
    let filters: Vec<galfus_multiverse::InvocationFilter> = env.from_js_value(filters_val)?;
    with_multiverse_mut(|mv| {
        mv.set_invocation_filters(invocation_id, filters)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_set_invocation_clear_color(
    invocation_id: u32,
    r: f64,
    g: f64,
    b: f64,
    a: f64,
    has_clear: bool,
) -> Result<()> {
    let clear_color = if has_clear {
        Some([r as f32, g as f32, b as f32, a as f32])
    } else {
        None
    };
    with_multiverse_mut(|mv| {
        mv.set_invocation_clear_color(invocation_id, clear_color)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_set_invocation_camera_slot(
    invocation_id: u32,
    camera_slot: u32,
    has_slot: bool,
) -> Result<()> {
    let slot = if has_slot { Some(camera_slot) } else { None };
    with_multiverse_mut(|mv| {
        mv.set_invocation_camera_slot(invocation_id, slot)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_update_window_size(window_id: u32, width: u32, height: u32) -> Result<()> {
    let size = glam::UVec2::new(width, height);
    with_multiverse_mut(|mv| {
        mv.update_window_size(window_id, size);
        Ok(())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_bind_target_texture(env: Env, binding_val: JsUnknown) -> Result<()> {
    let binding: galfus_multiverse::TargetTextureBinding = env.from_js_value(binding_val)?;
    with_multiverse_mut(|mv| mv.bind_target_texture(binding).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_unbind_target_texture(realm_id: u32, slot: String) -> Result<()> {
    with_multiverse_mut(|mv| {
        mv.unbind_target_texture(realm_id, &slot)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_resolve(env: Env) -> Result<JsUnknown> {
    let schedule = with_multiverse_mut(|mv| {
        let schedule = mv.resolve().map_err(|e| e.to_string())?;
        Ok(schedule.clone())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))?;

    env.to_js_value(&schedule)
}

#[napi]
pub fn multiverse_dispatch(frame_id: i64, delta_time: f64) -> Result<()> {
    with_multiverse_mut(|mv| {
        mv.dispatch(frame_id as u64, delta_time as f32)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_set_anti_aliasing(mode_str: String) -> Result<()> {
    let mode_json = format!("\"{mode_str}\"");
    let mode: galfus_multiverse::AntiAliasingMode =
        serde_json::from_str(&mode_json).map_err(|e| {
            Error::new(
                Status::GenericFailure,
                format!("Invalid AntiAliasingMode '{mode_str}': {e}"),
            )
        })?;

    with_multiverse_mut(|mv| {
        mv.set_anti_aliasing(mode);
        Ok(())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_get_anti_aliasing() -> Result<String> {
    let mode = with_multiverse_mut(|mv| Ok(mv.anti_aliasing()))
        .map_err(|e| Error::new(Status::GenericFailure, e))?;
    let s = serde_json::to_string(&mode)
        .map_err(|e| Error::new(Status::GenericFailure, e.to_string()))?;
    Ok(s.trim_matches('"').to_string())
}
