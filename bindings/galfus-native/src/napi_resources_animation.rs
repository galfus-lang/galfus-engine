//! Node-API bindings for resources and animation systems.

use super::*;

#[napi]
pub fn resource_create_texture(
    env: Env,
    texture_id: u32,
    desc_val: JsUnknown,
    data: Uint8Array,
    _data_len: Option<i64>,
) -> Result<()> {
    let desc: galfus_gpu_manager::GpuTextureDesc = env.from_js_value(desc_val)?;
    with_multiverse_mut(|mv| {
        mv.create_texture(texture_id, &desc, data.as_ref())
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn resource_update_texture(
    env: Env,
    texture_id: u32,
    rect_val: JsUnknown,
    data: Uint8Array,
    _data_len: Option<i64>,
) -> Result<()> {
    let rect: crate::ffi_resources::TextureUpdateDesc = env.from_js_value(rect_val)?;
    with_multiverse_mut(|mv| {
        mv.write_texture(
            texture_id,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            data.as_ref(),
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
pub fn resource_create_buffer(
    env: Env,
    buffer_id: u32,
    desc_val: JsUnknown,
    data: Uint8Array,
    _data_len: Option<i64>,
) -> Result<()> {
    let desc: crate::ffi_resources::BufferDesc = env.from_js_value(desc_val)?;
    with_multiverse_mut(|mv| {
        mv.create_buffer(buffer_id, desc.label.as_deref(), data.as_ref(), desc.usages)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn resource_update_buffer(
    buffer_id: u32,
    offset: i64,
    data: Uint8Array,
    _data_len: Option<i64>,
) -> Result<()> {
    with_multiverse_mut(|mv| {
        mv.write_buffer(buffer_id, offset as u64, data.as_ref())
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

#[napi]
pub fn animation_create_path_follow(
    env: Env,
    path_id: u32,
    commands_val: JsUnknown,
    config_val: Option<JsUnknown>,
) -> Result<()> {
    let commands: Vec<PathCommand> = env.from_js_value(commands_val)?;
    let config: PathFollowConfig = if let Some(cfg_val) = config_val {
        env.from_js_value(cfg_val)?
    } else {
        PathFollowConfig::default()
    };
    with_animation_mut(|anim| {
        anim.create_path_follow(path_id, commands, config)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_bind_path_follow_target(
    env: Env,
    path_id: u32,
    target_val: JsUnknown,
) -> Result<()> {
    let target: AnimationTarget = env.from_js_value(target_val)?;
    with_animation_mut(|anim| {
        anim.bind_path_follow_target(path_id, target)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_unbind_path_follow_target(path_id: u32) -> Result<()> {
    with_animation_mut(|anim| {
        anim.unbind_path_follow_target(path_id)
            .map_err(|e| e.to_string())
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_destroy_path_follow(path_id: u32) -> Result<()> {
    with_animation_mut(|anim| anim.destroy_path_follow(path_id).map_err(|e| e.to_string()))
        .map_err(|e| Error::new(Status::GenericFailure, e))
}

#[napi]
pub fn animation_get_path_follow_state(env: Env, path_id: u32) -> Result<JsUnknown> {
    let state = with_animation(|anim| {
        anim.get_path_follow_state(path_id)
            .ok_or_else(|| format!("PathFollow {path_id} not found"))
    })
    .map_err(|e| Error::new(Status::GenericFailure, e))?;
    env.to_js_value(&state)
}
