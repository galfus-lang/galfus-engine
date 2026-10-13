use napi::JsUnknown;
use napi::bindgen_prelude::*;
use napi_derive::napi;

use galfus_platform::{CursorGrabMode, CursorIcon, WindowConfig};

use crate::state::{
    attach_window_to_multiverse, init_context, init_context_headless, shutdown_context,
    with_context, with_context_mut, with_multiverse_mut,
};

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
pub fn multiverse_create_connector(env: Env, connector_id: u32, desc_val: JsUnknown) -> Result<()> {
    let desc: galfus_multiverse::ConnectorDesc = env.from_js_value(desc_val)?;
    with_multiverse_mut(|mv| {
        mv.create_connector(connector_id, desc)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_destroy_connector(connector_id: u32) -> Result<()> {
    with_multiverse_mut(|mv| {
        mv.destroy_connector(connector_id)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn multiverse_set_connector_enabled(connector_id: u32, enabled: bool) -> Result<()> {
    with_multiverse_mut(|mv| {
        mv.set_connector_enabled(connector_id, enabled)
            .map_err(|e| e.to_string())
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
