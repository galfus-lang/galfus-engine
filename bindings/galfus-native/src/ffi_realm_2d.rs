#![allow(clippy::missing_safety_doc)]

use std::ffi::c_char;

use galfus_realm_2d::Realm2DContext;
use galfus_realm_2d_resources::{Light2D, Transform2D};

use crate::ffi::{from_c_str, set_last_error};
use crate::ffi_native_structs::GalfusTransform2D;
use crate::ffi_realm_2d_desc::*;
use crate::state::with_multiverse_mut;

/// Creates and registers a new 2D Realm in the Multiverse.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_create(realm_id: u32) -> i32 {
    let realm = Box::new(Realm2DContext::new(realm_id));
    match with_multiverse_mut(|mv| mv.register_realm(realm).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys and unregisters a 2D Realm from the Multiverse.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_destroy(realm_id: u32) -> i32 {
    match with_multiverse_mut(|mv| mv.unregister_realm(realm_id).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

unsafe fn parse_transform_2d(transform_json: *const c_char) -> Result<Transform2D, String> {
    if transform_json.is_null() {
        return Err("Transform JSON pointer is null".to_string());
    }
    let s = unsafe { from_c_str(transform_json) }.map_err(|e| e.to_string())?;
    let d: Transform2DDesc =
        serde_json::from_str(s).map_err(|e| format!("Invalid Transform2DDesc: {e}"))?;
    Ok(d.into())
}

/// Registers or updates a 2D Camera in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_camera(
    realm_id: u32,
    camera_id: u32,
    camera_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let cam_desc: Camera2DDesc =
        match serde_json::from_str(match unsafe { from_c_str(camera_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Camera2DDesc: {e}"));
                return -1;
            }
        };
    let trans = match unsafe { parse_transform_2d(transform_json) } {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_camera(camera_id, cam_desc.into(), trans)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Camera in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_camera_transform(
    realm_id: u32,
    camera_id: u32,
    transform: *const GalfusTransform2D,
) -> i32 {
    if transform.is_null() {
        set_last_error("Null pointer passed to set_camera_transform");
        return -1;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let trans = unsafe { (*transform).into() };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_camera_transform(camera_id, trans);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a Material in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_material(
    realm_id: u32,
    material_id: u32,
    material_json: *const c_char,
) -> i32 {
    let mat_desc: Material2DDesc =
        match serde_json::from_str(match unsafe { from_c_str(material_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Material2DDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_material(material_id, mat_desc.into())
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a Sprite in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_sprite(
    realm_id: u32,
    sprite_id: u32,
    sprite_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let sprite_desc: Sprite2DDesc =
        match serde_json::from_str(match unsafe { from_c_str(sprite_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Sprite2DDesc: {e}"));
                return -1;
            }
        };
    let trans = match unsafe { parse_transform_2d(transform_json) } {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_sprite(sprite_id, sprite_desc.into(), trans)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Sprite in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_sprite_transform(
    realm_id: u32,
    sprite_id: u32,
    transform: *const GalfusTransform2D,
) -> i32 {
    if transform.is_null() {
        set_last_error("Null pointer passed to set_sprite_transform");
        return -1;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let trans = unsafe { (*transform).into() };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_sprite_transform(sprite_id, trans);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a Vector Shape in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_shape(
    realm_id: u32,
    shape_id: u32,
    shape_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let shape_desc: Shape2DDesc =
        match serde_json::from_str(match unsafe { from_c_str(shape_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Shape2DDesc: {e}"));
                return -1;
            }
        };
    let trans = match unsafe { parse_transform_2d(transform_json) } {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_shape(shape_id, shape_desc.into(), trans)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Shape in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_shape_transform(
    realm_id: u32,
    shape_id: u32,
    transform: *const GalfusTransform2D,
) -> i32 {
    if transform.is_null() {
        set_last_error("Null pointer passed to set_shape_transform");
        return -1;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let trans = unsafe { (*transform).into() };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_shape_transform(shape_id, trans);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Registers or updates a 2D Light in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_light(
    realm_id: u32,
    light_id: u32,
    light_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let light_desc: Light2DDesc =
        match serde_json::from_str(match unsafe { from_c_str(light_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Light2DDesc: {e}"));
                return -1;
            }
        };
    let mut light: Light2D = light_desc.into();
    if let Ok(trans) = unsafe { parse_transform_2d(transform_json) } {
        light.position = trans.position;
        light.z = trans.z_layer as f32;
    }

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_light(light_id, light)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the transform of an existing Light in the 2D Realm.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_light_transform(
    realm_id: u32,
    light_id: u32,
    transform: *const GalfusTransform2D,
) -> i32 {
    if transform.is_null() {
        set_last_error("Null pointer passed to set_light_transform");
        return -1;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let trans = unsafe { (*transform).into() };
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_light_transform(light_id, trans);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Configures global 2D soft shadow parameters.
///
/// # Safety
/// `config_json` must be a valid, null-terminated C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_shadow_config(
    realm_id: u32,
    config_json: *const c_char,
) -> i32 {
    let cfg_desc: Shadow2DConfigDesc =
        match serde_json::from_str(match unsafe { from_c_str(config_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid Shadow2DConfigDesc: {e}"));
                return -1;
            }
        };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_shadow_config(cfg_desc.into());
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Creates or updates a 2D particle emitter entity in the 2D Realm.
///
/// # Safety
/// `emitter_json` and `transform_json` must be valid, null-terminated C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_create_particle_emitter(
    realm_id: u32,
    emitter_id: u32,
    emitter_json: *const c_char,
    transform_json: *const c_char,
) -> i32 {
    let emitter_desc: ParticleEmitter2DDesc =
        match serde_json::from_str(match unsafe { from_c_str(emitter_json) } {
            Ok(s) => s,
            Err(e) => {
                set_last_error(&e);
                return -1;
            }
        }) {
            Ok(d) => d,
            Err(e) => {
                set_last_error(&format!("Invalid ParticleEmitter2DDesc: {e}"));
                return -1;
            }
        };

    let transform = match unsafe { parse_transform_2d(transform_json) } {
        Ok(t) => t,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_particle_emitter(emitter_id, emitter_desc.into(), transform)
            .map_err(|e| e.to_string())?;
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the 2D transform of an existing particle emitter.
///
/// # Safety
/// `transform_json` must be a valid, null-terminated C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_set_particle_emitter_transform(
    realm_id: u32,
    emitter_id: u32,
    transform: *const GalfusTransform2D,
) -> i32 {
    if transform.is_null() {
        set_last_error("Null pointer passed to set_particle_emitter_transform");
        return -1;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let transform = unsafe { (*transform).into() };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.set_particle_emitter_transform(emitter_id, transform);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Triggers an immediate burst of particles from an existing 2D emitter.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_particle_emitter_burst(
    realm_id: u32,
    emitter_id: u32,
    count: u32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.particle_emitter_burst(emitter_id, count);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a 2D particle emitter entity.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_destroy_particle_emitter(realm_id: u32, emitter_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.remove_particle_emitter(emitter_id);
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}
