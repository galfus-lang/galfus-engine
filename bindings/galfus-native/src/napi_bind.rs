use napi::JsUnknown;
use napi::bindgen_prelude::*;
use napi_derive::napi;

use galfus_platform::{CursorGrabMode, CursorIcon, WindowConfig};

use crate::state::{
    attach_window_to_multiverse, init_context, init_context_headless, shutdown_context,
    with_animation, with_animation_mut, with_context, with_context_mut, with_multiverse_mut,
};
use galfus_animation::{AnimValue, AnimationTarget, LoopMode, TransitionConfig};

#[napi]
pub fn platform_init() -> Result<()> {
    init_context().map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn platform_init_headless() -> Result<()> {
    init_context_headless().map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn platform_shutdown() -> Result<()> {
    shutdown_context().map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn platform_get_capabilities(env: Env) -> Result<JsUnknown> {
    let caps = with_context(|ctx| Ok(ctx.capabilities()))
        .map_err(|e| Error::new(Status::GenericFailure, e))?;

    env.to_js_value(&caps)
}

#[napi]
pub fn window_create(env: Env, config_val: JsUnknown) -> Result<u32> {
    let config: WindowConfig = env.from_js_value(config_val)?;

    let id = with_context_mut(|ctx| ctx.create_window(config).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))?;

    Ok(id)
}

#[napi]
pub fn window_close(window_id: u32) -> Result<()> {
    with_context_mut(|ctx| ctx.close_window(window_id).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn window_set_title(window_id: u32, title: String) -> Result<()> {
    with_context_mut(|ctx| {
        let win = ctx.get_window_mut(window_id).map_err(|e| e.to_string())?;
        win.set_title(&title);
        Ok(())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn window_set_cursor_grab(window_id: u32, mode: u32) -> Result<()> {
    let grab_mode = match mode {
        1 => CursorGrabMode::Confined,
        2 => CursorGrabMode::Locked,
        _ => CursorGrabMode::None,
    };

    with_context_mut(|ctx| {
        let win = ctx.get_window_mut(window_id).map_err(|e| e.to_string())?;
        win.set_cursor_grab(grab_mode).map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn window_set_cursor_icon(window_id: u32, icon: u32) -> Result<()> {
    let cursor_icon = match icon {
        1 => CursorIcon::Pointer,
        2 => CursorIcon::Grab,
        3 => CursorIcon::Grabbing,
        4 => CursorIcon::Crosshair,
        5 => CursorIcon::Text,
        6 => CursorIcon::Move,
        7 => CursorIcon::Wait,
        _ => CursorIcon::Default,
    };

    with_context_mut(|ctx| {
        let win = ctx.get_window_mut(window_id).map_err(|e| e.to_string())?;
        win.set_cursor_icon(cursor_icon);
        Ok(())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn window_get_size(window_id: u32) -> Result<Vec<u32>> {
    with_context(|ctx| {
        let win = ctx.get_window(window_id).map_err(|e| e.to_string())?;
        let size = win.inner_size();
        Ok(vec![size.x, size.y])
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn platform_pump_events(env: Env) -> Result<JsUnknown> {
    let events = with_context_mut(|ctx| ctx.pump_events().map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))?;

    env.to_js_value(&events)
}

#[napi]
pub fn gamepad_get_connected(env: Env) -> Result<JsUnknown> {
    let gamepads = with_context(|ctx| Ok(ctx.connected_gamepads()))
        .map_err(|e| Error::new(Status::GenericFailure, e))?;

    env.to_js_value(&gamepads)
}

#[napi]
pub fn gamepad_set_rumble(
    gamepad_id: u32,
    strong_magnitude: f64,
    weak_magnitude: f64,
    duration_ms: u32,
) -> Result<()> {
    with_context_mut(|ctx| {
        ctx.set_gamepad_rumble(
            gamepad_id,
            strong_magnitude as f32,
            weak_magnitude as f32,
            duration_ms,
        )
        .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NapiSoundPayload {
    data_base64: String,
}

#[napi]
pub fn audio_load_sound(env: Env, sound_id: u32, payload_val: JsUnknown) -> Result<()> {
    let payload: NapiSoundPayload = env.from_js_value(payload_val)?;
    let bytes = crate::ffi_resources::decode_base64(&payload.data_base64)
        .map_err(|e| Error::new(Status::GenericFailure, e))?;
    with_context_mut(|ctx| {
        ctx.load_sound_bytes(sound_id, &bytes)
            .map(|_| ())
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn audio_play_sound(
    sound_id: u32,
    volume: f64,
    panning: f64,
    speed: f64,
    looping: bool,
) -> Result<u32> {
    let config = galfus_platform::PlaybackConfig {
        volume: volume as f32,
        panning: panning as f32,
        speed: speed as f32,
        looping,
    };

    with_context_mut(|ctx| ctx.play_sound(sound_id, config).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn audio_play_sound_spatial(
    env: Env,
    sound_id: u32,
    emitter_val: JsUnknown,
    listener_val: JsUnknown,
    config_val: JsUnknown,
) -> Result<u32> {
    let emitter: galfus_platform::SpatialTransform = env.from_js_value(emitter_val)?;
    let listener: galfus_platform::SpatialTransform = env.from_js_value(listener_val)?;
    let config: galfus_platform::SpatialAudioConfig = env.from_js_value(config_val)?;

    with_context_mut(|ctx| {
        ctx.play_sound_spatial(sound_id, emitter, listener, config)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn audio_update_sound_spatial(
    env: Env,
    voice_id: u32,
    emitter_val: JsUnknown,
    listener_val: JsUnknown,
    config_val: JsUnknown,
) -> Result<()> {
    let emitter: galfus_platform::SpatialTransform = env.from_js_value(emitter_val)?;
    let listener: galfus_platform::SpatialTransform = env.from_js_value(listener_val)?;
    let config: galfus_platform::SpatialAudioConfig = env.from_js_value(config_val)?;

    with_context_mut(|ctx| {
        ctx.update_sound_spatial(voice_id, emitter, listener, config)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn audio_pause_sound(voice_id: u32) -> Result<()> {
    with_context_mut(|ctx| ctx.pause_sound(voice_id).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn audio_resume_sound(voice_id: u32) -> Result<()> {
    with_context_mut(|ctx| ctx.resume_sound(voice_id).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn audio_stop_sound(voice_id: u32) -> Result<()> {
    with_context_mut(|ctx| ctx.stop_sound(voice_id).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn audio_set_volume(voice_id: u32, volume: f64) -> Result<()> {
    with_context_mut(|ctx| {
        ctx.set_sound_volume(voice_id, volume as f32)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn audio_set_panning(voice_id: u32, panning: f64) -> Result<()> {
    with_context_mut(|ctx| {
        ctx.set_sound_panning(voice_id, panning as f32)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn audio_unload_sound(sound_id: u32) -> Result<()> {
    with_context_mut(|ctx| ctx.unload_sound(sound_id).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))
}

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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NapiTextureCreatePayload {
    desc: galfus_gpu_manager::GpuTextureDesc,
    data_base64: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NapiTextureUpdatePayload {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    data_base64: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NapiBufferCreatePayload {
    label: Option<String>,
    usages: galfus_gpu_manager::BufferUsageFlags,
    data_base64: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NapiBufferUpdatePayload {
    offset: u64,
    data_base64: String,
}

#[napi]
pub fn resource_create_texture(env: Env, texture_id: u32, payload_val: JsUnknown) -> Result<()> {
    let payload: NapiTextureCreatePayload = env.from_js_value(payload_val)?;
    let bytes = crate::ffi_resources::decode_base64(&payload.data_base64)
        .map_err(|e| Error::new(Status::GenericFailure, e))?;
    with_multiverse_mut(|mv| {
        mv.create_texture(texture_id, &payload.desc, &bytes)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn resource_update_texture(env: Env, texture_id: u32, payload_val: JsUnknown) -> Result<()> {
    let payload: NapiTextureUpdatePayload = env.from_js_value(payload_val)?;
    let bytes = crate::ffi_resources::decode_base64(&payload.data_base64)
        .map_err(|e| Error::new(Status::GenericFailure, e))?;
    with_multiverse_mut(|mv| {
        mv.write_texture(
            texture_id,
            payload.x,
            payload.y,
            payload.width,
            payload.height,
            &bytes,
        )
        .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn resource_dispose_texture(texture_id: u32) -> Result<()> {
    with_multiverse_mut(|mv| mv.dispose_texture(texture_id).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn resource_create_buffer(env: Env, buffer_id: u32, payload_val: JsUnknown) -> Result<()> {
    let payload: NapiBufferCreatePayload = env.from_js_value(payload_val)?;
    let bytes = crate::ffi_resources::decode_base64(&payload.data_base64)
        .map_err(|e| Error::new(Status::GenericFailure, e))?;
    with_multiverse_mut(|mv| {
        mv.create_buffer(buffer_id, payload.label.as_deref(), &bytes, payload.usages)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn resource_update_buffer(env: Env, buffer_id: u32, payload_val: JsUnknown) -> Result<()> {
    let payload: NapiBufferUpdatePayload = env.from_js_value(payload_val)?;
    let bytes = crate::ffi_resources::decode_base64(&payload.data_base64)
        .map_err(|e| Error::new(Status::GenericFailure, e))?;
    with_multiverse_mut(|mv| {
        mv.write_buffer(buffer_id, payload.offset, &bytes)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn resource_dispose_buffer(buffer_id: u32) -> Result<()> {
    with_multiverse_mut(|mv| mv.dispose_buffer(buffer_id).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_create_transition(
    env: Env,
    transition_id: u32,
    initial_value_val: JsUnknown,
    config_val: Option<JsUnknown>,
) -> Result<()> {
    let initial_val: AnimValue = env.from_js_value(initial_value_val)?;
    let config: TransitionConfig = if let Some(cfg_val) = config_val {
        env.from_js_value(cfg_val)?
    } else {
        TransitionConfig::default()
    };
    with_animation_mut(|anim| {
        anim.create_transition(transition_id, initial_val, config)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_bind_target(env: Env, transition_id: u32, target_val: JsUnknown) -> Result<()> {
    let target: AnimationTarget = env.from_js_value(target_val)?;
    with_animation_mut(|anim| {
        anim.bind_target(transition_id, target)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_transition_to(
    env: Env,
    transition_id: u32,
    target_value_val: JsUnknown,
    config_val: Option<JsUnknown>,
) -> Result<()> {
    let target_val: AnimValue = env.from_js_value(target_value_val)?;
    let config: Option<TransitionConfig> = if let Some(cfg_val) = config_val {
        Some(env.from_js_value(cfg_val)?)
    } else {
        None
    };
    with_animation_mut(|anim| {
        anim.transition_to(transition_id, target_val, config)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_create_scalar_transition(
    transition_id: u32,
    initial_scalar: f64,
    duration: f64,
    delay: f64,
    easing_id: u32,
) -> Result<()> {
    let config = TransitionConfig {
        duration: duration as f32,
        delay: delay as f32,
        easing: crate::ffi_animation::parse_easing_id(easing_id),
        loop_mode: LoopMode::Once,
    };
    with_animation_mut(|anim| {
        anim.create_transition(
            transition_id,
            AnimValue::Scalar(initial_scalar as f32),
            config,
        )
        .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_transition_to_scalar(
    transition_id: u32,
    target_scalar: f64,
    duration: f64,
    delay: f64,
    easing_id: u32,
) -> Result<()> {
    let config = if duration > 0.0 || delay > 0.0 || easing_id > 0 {
        Some(TransitionConfig {
            duration: duration as f32,
            delay: delay as f32,
            easing: crate::ffi_animation::parse_easing_id(easing_id),
            loop_mode: LoopMode::Once,
        })
    } else {
        None
    };
    with_animation_mut(|anim| {
        anim.transition_to(
            transition_id,
            AnimValue::Scalar(target_scalar as f32),
            config,
        )
        .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_transition_to_transform3d(
    transition_id: u32,
    floats: Float32Array,
    duration: f64,
    delay: f64,
    easing_id: u32,
) -> Result<()> {
    if floats.len() < 10 {
        return Err(Error::new(
            Status::InvalidArg,
            "Expected at least 10 floats for Transform3D",
        ));
    }
    let mut arr = [0.0f32; 10];
    arr.copy_from_slice(&floats[0..10]);
    let config = if duration > 0.0 || delay > 0.0 || easing_id > 0 {
        Some(TransitionConfig {
            duration: duration as f32,
            delay: delay as f32,
            easing: crate::ffi_animation::parse_easing_id(easing_id),
            loop_mode: LoopMode::Once,
        })
    } else {
        None
    };
    with_animation_mut(|anim| {
        anim.transition_to(transition_id, AnimValue::Transform3D(arr), config)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_transition_to_transform2d(
    transition_id: u32,
    floats: Float32Array,
    duration: f64,
    delay: f64,
    easing_id: u32,
) -> Result<()> {
    if floats.len() < 6 {
        return Err(Error::new(
            Status::InvalidArg,
            "Expected at least 6 floats for Transform2D",
        ));
    }
    let mut arr = [0.0f32; 6];
    arr.copy_from_slice(&floats[0..6]);
    let config = if duration > 0.0 || delay > 0.0 || easing_id > 0 {
        Some(TransitionConfig {
            duration: duration as f32,
            delay: delay as f32,
            easing: crate::ffi_animation::parse_easing_id(easing_id),
            loop_mode: LoopMode::Once,
        })
    } else {
        None
    };
    with_animation_mut(|anim| {
        anim.transition_to(transition_id, AnimValue::Transform2D(arr), config)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_get_state(env: Env, transition_id: u32) -> Result<JsUnknown> {
    let state = with_animation(|anim| {
        anim.get_state(transition_id)
            .ok_or_else(|| format!("Transition {transition_id} not found"))
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))?;
    env.to_js_value(&state)
}

#[napi]
pub fn animation_get_value(env: Env, transition_id: u32) -> Result<JsUnknown> {
    let val = with_animation(|anim| {
        anim.get_value(transition_id)
            .ok_or_else(|| format!("Transition {transition_id} not found"))
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))?;
    env.to_js_value(&val)
}

#[napi]
pub fn animation_destroy_transition(transition_id: u32) -> Result<()> {
    with_animation_mut(|anim| {
        anim.destroy_transition(transition_id)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_step(dt: f64) -> Result<()> {
    with_animation_mut(|anim| {
        anim.step(dt as f32);
        Ok(())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))?;

    with_multiverse_mut(|mv| {
        with_animation_mut(|anim| anim.apply_to_multiverse(mv).map_err(|e| e.to_string()))
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))?;

    Ok(())
}

#[napi]
pub fn animation_pump_events(env: Env) -> Result<JsUnknown> {
    let events = with_animation_mut(|anim| Ok(anim.pump_events()))
        .map_err(|e: String| Error::new(Status::GenericFailure, e))?;
    env.to_js_value(&events)
}

#[napi]
pub fn animation_set_custom_channel(env: Env, channel_id: u32, value_val: JsUnknown) -> Result<()> {
    let val: AnimValue = env.from_js_value(value_val)?;
    with_animation_mut(|anim| {
        anim.set_custom_channel(channel_id, val);
        Ok(())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_get_custom_channel(env: Env, channel_id: u32) -> Result<JsUnknown> {
    let val = with_animation(|anim| {
        anim.get_custom_channel(channel_id)
            .cloned()
            .ok_or_else(|| format!("Channel {channel_id} not found"))
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))?;
    env.to_js_value(&val)
}
