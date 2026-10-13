use napi::JsUnknown;
use napi::bindgen_prelude::*;
use napi_derive::napi;

use galfus_platform::{CursorGrabMode, CursorIcon, WindowConfig};

use crate::state::{
    init_context, init_context_headless, shutdown_context, with_context, with_context_mut,
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
