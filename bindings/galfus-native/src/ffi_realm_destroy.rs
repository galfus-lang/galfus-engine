//! Entity destruction C-ABI bindings for Realm 2D and Realm 3D.

use galfus_realm_2d::Realm2DContext;
use galfus_realm_3d::Realm3DContext;

use crate::ffi::set_last_error;
use crate::state::with_multiverse_mut;

// --- Realm 2D Destructors ---

/// Destroys a camera in the 2D Realm.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_destroy_camera(realm_id: u32, camera_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.destroy_camera(camera_id).map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a material in the 2D Realm.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_destroy_material(realm_id: u32, material_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .destroy_material(material_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a sprite in the 2D Realm.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_destroy_sprite(realm_id: u32, sprite_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.destroy_sprite(sprite_id).map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a shape in the 2D Realm.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_destroy_shape(realm_id: u32, shape_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.destroy_shape(shape_id).map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a light in the 2D Realm.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_destroy_light(realm_id: u32, light_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.destroy_light(light_id).map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

// --- Realm 3D Destructors ---

/// Destroys a camera in the 3D Realm.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_destroy_camera(realm_id: u32, camera_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm.destroy_camera(camera_id).map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a material in the 3D Realm.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_destroy_material(realm_id: u32, material_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .destroy_material(material_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a geometry in the 3D Realm.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_destroy_geometry(realm_id: u32, geometry_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .destroy_geometry(geometry_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a model in the 3D Realm.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_destroy_model(realm_id: u32, model_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm.destroy_model(model_id).map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys an instanced model in the 3D Realm.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_destroy_instanced_model(
    realm_id: u32,
    instanced_model_id: u32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .destroy_instanced_model(instanced_model_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a light in the 3D Realm.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_destroy_light(realm_id: u32, light_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm.destroy_light(light_id).map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

// --- General Realm Lifecycle ---

/// Clears all entities and scene resources in a Realm while keeping it registered.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_clear(realm_id: u32) -> i32 {
    match with_multiverse_mut(|mv| mv.clear_realm(realm_id).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Destroys a Realm and unregisters it from the Multiverse, freeing all associated GPU resources.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_destroy(realm_id: u32) -> i32 {
    match with_multiverse_mut(|mv| mv.unregister_realm(realm_id).map_err(|e| e.to_string())) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}
