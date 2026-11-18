//! FFI bindings for Native Hierarchy and Rapier Physics in 3D Realms.

use std::os::raw::c_char;

use galfus_physics::types::RigidBodyDesc3D;
use galfus_realm_3d::Realm3DContext;
use galfus_realm_core::collision::Ray3D;
use galfus_realm_core::hierarchy::HierarchyConstraint3D;
use glam::Vec3;

use crate::ffi::{from_c_str, set_last_error, to_c_string};
use crate::state::with_multiverse_mut;

/// Attaches an origin 3D entity to a target entity with a constraint descriptor JSON.
///
/// # Safety
/// `constraint_json` must be a valid, null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_attach(
    realm_id: u32,
    origin_id: u32,
    target_id: u32,
    constraint_json: *const c_char,
) -> i32 {
    let json_str = match unsafe { from_c_str(constraint_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let constraint: HierarchyConstraint3D = match serde_json::from_str(json_str) {
        Ok(c) => c,
        Err(e) => {
            set_last_error(&format!("Invalid HierarchyConstraint3D JSON: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .attach_3d(origin_id, target_id, constraint)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Detaches a 3D entity from its anchor parent.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_detach(realm_id: u32, origin_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm.detach_3d(origin_id).map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Enables the native 3D Rapier physics simulation.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_enable_physics(
    realm_id: u32,
    gravity_x: f32,
    gravity_y: f32,
    gravity_z: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .enable_physics_3d([gravity_x, gravity_y, gravity_z])
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Attaches or updates a 3D rigid body.
///
/// # Safety
/// `desc_json` must be a valid, null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_attach_rigidbody(
    realm_id: u32,
    entity_id: u32,
    desc_json: *const c_char,
) -> i32 {
    let json_str = match unsafe { from_c_str(desc_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let desc: RigidBodyDesc3D = match serde_json::from_str(json_str) {
        Ok(d) => d,
        Err(e) => {
            set_last_error(&format!("Invalid RigidBodyDesc3D JSON: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .attach_rigid_body_3d(entity_id, desc)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Removes a 3D rigid body from an entity.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_remove_rigidbody(realm_id: u32, entity_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .remove_rigid_body_3d(entity_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Steps the 3D physics simulation by `dt` seconds on fixed tick and returns step result JSON.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_step_physics(realm_id: u32, dt: f32) -> *mut c_char {
    let res = with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        let step_res = realm.step_physics(dt);
        serde_json::to_string(&step_res).map_err(|e| e.to_string())
    });

    match res {
        Ok(json) => to_c_string(&json),
        Err(e) => {
            set_last_error(&e);
            std::ptr::null_mut()
        }
    }
}

/// Sets the linear velocity of a 3D rigid body.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_set_linear_velocity(
    realm_id: u32,
    entity_id: u32,
    vx: f32,
    vy: f32,
    vz: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .set_linear_velocity_3d(entity_id, [vx, vy, vz])
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Sets the angular velocity of a 3D rigid body.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_set_angular_velocity(
    realm_id: u32,
    entity_id: u32,
    wx: f32,
    wy: f32,
    wz: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .set_angular_velocity_3d(entity_id, [wx, wy, wz])
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Applies an impulse to an entity's 3D rigid body.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_apply_impulse(
    realm_id: u32,
    entity_id: u32,
    impulse_x: f32,
    impulse_y: f32,
    impulse_z: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .apply_impulse_3d(entity_id, [impulse_x, impulse_y, impulse_z])
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Applies a force to an entity's 3D rigid body.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_apply_force(
    realm_id: u32,
    entity_id: u32,
    force_x: f32,
    force_y: f32,
    force_z: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .apply_force_3d(entity_id, [force_x, force_y, force_z])
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Applies torque to an entity's 3D rigid body.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_apply_torque(
    realm_id: u32,
    entity_id: u32,
    torque_x: f32,
    torque_y: f32,
    torque_z: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        realm
            .apply_torque_3d(entity_id, [torque_x, torque_y, torque_z])
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Casts a ray across 3D colliders. Returns JSON array of hits.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_raycast(
    realm_id: u32,
    origin_x: f32,
    origin_y: f32,
    origin_z: f32,
    dir_x: f32,
    dir_y: f32,
    dir_z: f32,
    max_dist: f32,
    mask: u32,
) -> *mut c_char {
    let res = with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
        let ray = Ray3D {
            origin: Vec3::new(origin_x, origin_y, origin_z),
            direction: Vec3::new(dir_x, dir_y, dir_z).normalize_or_zero(),
        };
        let hits = realm.query_ray_3d(ray, max_dist, mask);
        serde_json::to_string(&hits).map_err(|e| e.to_string())
    });

    match res {
        Ok(json) => to_c_string(&json),
        Err(e) => {
            set_last_error(&e);
            std::ptr::null_mut()
        }
    }
}

/// Applies a physics body command and returns its JSON result.
///
/// # Safety
/// `command_json` must point to a null-terminated UTF-8 string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_body_command(
    realm_id: u32,
    entity_id: u32,
    command_json: *const c_char,
) -> *mut c_char {
    let result = (|| {
        let json = unsafe { from_c_str(command_json) }?;
        let command = serde_json::from_str::<galfus_physics::types::BodyCommand3D>(json)
            .map_err(|e| e.to_string())?;
        with_multiverse_mut(|mv| {
            let realm = mv
                .get_realm_mut::<Realm3DContext>(realm_id)
                .ok_or_else(|| format!("Realm3D #{realm_id} not found"))?;
            let world = realm
                .physics
                .as_mut()
                .ok_or_else(|| "Physics is not enabled".to_string())?;
            let value = world
                .command(entity_id, command)
                .ok_or_else(|| format!("Body #{entity_id} not found"))?;
            serde_json::to_string(&value).map_err(|e| e.to_string())
        })
    })();
    match result {
        Ok(json) => to_c_string(&json),
        Err(error) => {
            set_last_error(&error);
            std::ptr::null_mut()
        }
    }
}
