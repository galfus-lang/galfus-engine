//! Node-API bindings for platform, window, gamepad, and audio services.

use super::*;

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
    close_window(window_id).map_err(|e| Error::new(Status::GenericFailure, e))
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

/// Releases a native event batch created through the C ABI.
///
/// Node-API event pumping returns JavaScript values directly, so normal Node callers never need
/// this. It remains exported to keep the generated API surface aligned with the C bindings.
#[napi]
pub fn platform_release_event_batch(batch_id: i64) -> Result<()> {
    let batch_id = u64::try_from(batch_id)
        .map_err(|_| Error::new(Status::InvalidArg, "batchId must be a non-negative u64"))?;
    crate::ffi_event_batch::release_event_batch(batch_id)
        .map_err(|error| Error::new(Status::GenericFailure, error))
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
pub fn audio_load_sound(sound_id: u32, data: Uint8Array, _data_len: Option<i64>) -> Result<()> {
    with_context_mut(|ctx| {
        ctx.load_sound_bytes(sound_id, data.as_ref())
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
