//! FFI bindings for Native Hierarchy and Rapier Physics in 2D Realms.

use std::os::raw::c_char;

use galfus_physics::types::RigidBodyDesc2D;
use galfus_realm_2d::Realm2DContext;
use galfus_realm_core::hierarchy::HierarchyConstraint2D;
use glam::Vec2;

use crate::ffi::{from_c_str, set_last_error, to_c_string};
use crate::state::with_multiverse_mut;

/// Attaches an origin 2D entity to a target entity with a constraint descriptor JSON.
///
/// # Safety
/// `constraint_json` must be a valid, null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_attach(
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

    let constraint: HierarchyConstraint2D = match serde_json::from_str(json_str) {
        Ok(c) => c,
        Err(e) => {
            set_last_error(&format!("Invalid HierarchyConstraint2D JSON: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .attach_2d(origin_id, target_id, constraint)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Detaches a 2D entity from its anchor parent.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_detach(realm_id: u32, origin_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm.detach_2d(origin_id).map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Enables the native 2D Rapier physics simulation.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_enable_physics(
    realm_id: u32,
    gravity_x: f32,
    gravity_y: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .enable_physics_2d([gravity_x, gravity_y])
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Attaches or updates a 2D rigid body.
///
/// # Safety
/// `desc_json` must be a valid, null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_2d_attach_rigidbody(
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

    let desc: RigidBodyDesc2D = match serde_json::from_str(json_str) {
        Ok(d) => d,
        Err(e) => {
            set_last_error(&format!("Invalid RigidBodyDesc2D JSON: {e}"));
            return -1;
        }
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .attach_rigid_body_2d(entity_id, desc)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Removes a 2D rigid body from an entity.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_remove_rigidbody(realm_id: u32, entity_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .remove_rigid_body_2d(entity_id)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Steps the 2D physics simulation by `dt` seconds on fixed tick and returns step result JSON.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_step_physics(realm_id: u32, dt: f32) -> *mut c_char {
    let res = with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
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

/// Sets the linear velocity of a 2D rigid body.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_set_linear_velocity(
    realm_id: u32,
    entity_id: u32,
    vx: f32,
    vy: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_linear_velocity_2d(entity_id, [vx, vy])
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Sets the angular velocity of a 2D rigid body.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_set_angular_velocity(
    realm_id: u32,
    entity_id: u32,
    omega: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .set_angular_velocity_2d(entity_id, omega)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Applies an impulse to an entity's 2D rigid body.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_apply_impulse(
    realm_id: u32,
    entity_id: u32,
    impulse_x: f32,
    impulse_y: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .apply_impulse_2d(entity_id, [impulse_x, impulse_y])
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Applies a continuous force to an entity's 2D rigid body.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_apply_force(
    realm_id: u32,
    entity_id: u32,
    force_x: f32,
    force_y: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .apply_force_2d(entity_id, [force_x, force_y])
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Applies torque to an entity's 2D rigid body.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_apply_torque(realm_id: u32, entity_id: u32, torque: f32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        realm
            .apply_torque_2d(entity_id, torque)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Queries 2D colliders containing a world position. Returns JSON array of hits.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_query_point(
    realm_id: u32,
    x: f32,
    y: f32,
    mask: u32,
) -> *mut c_char {
    let res = with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        let hits = realm.query_point_2d(Vec2::new(x, y), mask);
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

/// Casts a ray across 2D colliders. Returns JSON array of hits.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_2d_raycast(
    realm_id: u32,
    origin_x: f32,
    origin_y: f32,
    dir_x: f32,
    dir_y: f32,
    max_dist: f32,
    mask: u32,
) -> *mut c_char {
    let res = with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm2DContext>(realm_id)
            .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
        let hits = realm.raycast_colliders_2d(
            Vec2::new(origin_x, origin_y),
            Vec2::new(dir_x, dir_y),
            max_dist,
            mask,
        );
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
pub unsafe extern "C" fn galfus_realm_2d_body_command(
    realm_id: u32,
    entity_id: u32,
    command_json: *const c_char,
) -> *mut c_char {
    let result = (|| {
        let json = unsafe { from_c_str(command_json) }?;
        let command = serde_json::from_str::<galfus_physics::types::BodyCommand2D>(json)
            .map_err(|e| e.to_string())?;
        with_multiverse_mut(|mv| {
            let realm = mv
                .get_realm_mut::<Realm2DContext>(realm_id)
                .ok_or_else(|| format!("Realm2D #{realm_id} not found"))?;
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
