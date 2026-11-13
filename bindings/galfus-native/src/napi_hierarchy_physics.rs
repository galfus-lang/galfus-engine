//! Node-API bindings for hierarchy, physics, and spatial queries.

use super::*;

#[napi(js_name = "realm2dBodyCommand")]
pub fn realm_2d_body_command(realm_id: u32, entity_id: u32, command: String) -> Result<String> {
    let command_c = std::ffi::CString::new(command)
        .map_err(|e| Error::new(Status::InvalidArg, e.to_string()))?;
    let result =
        unsafe { crate::galfus_realm_2d_body_command(realm_id, entity_id, command_c.as_ptr()) };
    ffi_string_result(result)
}

#[napi(js_name = "realm3dBodyCommand")]
pub fn realm_3d_body_command(realm_id: u32, entity_id: u32, command: String) -> Result<String> {
    let command_c = std::ffi::CString::new(command)
        .map_err(|e| Error::new(Status::InvalidArg, e.to_string()))?;
    let result =
        unsafe { crate::galfus_realm_3d_body_command(realm_id, entity_id, command_c.as_ptr()) };
    ffi_string_result(result)
}

#[napi(js_name = "realm2dAttach")]
pub fn realm_2d_attach(
    realm_id: u32,
    origin_id: u32,
    target_id: u32,
    constraint_json: String,
) -> Result<()> {
    let constraint_json_c = std::ffi::CString::new(constraint_json)
        .map_err(|e| Error::new(Status::InvalidArg, e.to_string()))?;
    check_ffi_res(unsafe {
        crate::galfus_realm_2d_attach(realm_id, origin_id, target_id, constraint_json_c.as_ptr())
    })
}

#[napi(js_name = "realm2dDetach")]
pub fn realm_2d_detach(realm_id: u32, origin_id: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_2d_detach(realm_id, origin_id))
}

#[napi(js_name = "realm2dEnablePhysics")]
pub fn realm_2d_enable_physics(realm_id: u32, gravity_x: f64, gravity_y: f64) -> Result<()> {
    check_ffi_res(crate::galfus_realm_2d_enable_physics(
        realm_id,
        gravity_x as f32,
        gravity_y as f32,
    ))
}

#[napi(js_name = "realm2dAttachRigidbody")]
pub fn realm_2d_attach_rigidbody(
    env: Env,
    realm_id: u32,
    entity_id: u32,
    desc: JsUnknown,
) -> Result<()> {
    let desc_json = js_to_c_string(&env, Some(desc))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "desc cannot be null"))?;
    check_ffi_res(unsafe {
        crate::galfus_realm_2d_attach_rigidbody(realm_id, entity_id, desc_json.as_ptr())
    })
}

#[napi(js_name = "realm2dRemoveRigidbody")]
pub fn realm_2d_remove_rigidbody(realm_id: u32, entity_id: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_2d_remove_rigidbody(realm_id, entity_id))
}

#[napi(js_name = "realm2dApplyImpulse")]
pub fn realm_2d_apply_impulse(
    realm_id: u32,
    entity_id: u32,
    impulse_x: f64,
    impulse_y: f64,
) -> Result<()> {
    check_ffi_res(crate::galfus_realm_2d_apply_impulse(
        realm_id,
        entity_id,
        impulse_x as f32,
        impulse_y as f32,
    ))
}

#[napi(js_name = "realm2dApplyForce")]
pub fn realm_2d_apply_force(
    realm_id: u32,
    entity_id: u32,
    force_x: f64,
    force_y: f64,
) -> Result<()> {
    check_ffi_res(crate::galfus_realm_2d_apply_force(
        realm_id,
        entity_id,
        force_x as f32,
        force_y as f32,
    ))
}

#[napi(js_name = "realm2dApplyTorque")]
pub fn realm_2d_apply_torque(realm_id: u32, entity_id: u32, torque: f64) -> Result<()> {
    check_ffi_res(crate::galfus_realm_2d_apply_torque(
        realm_id,
        entity_id,
        torque as f32,
    ))
}

#[napi(js_name = "realm2dStepPhysics")]
pub fn realm_2d_step_physics(realm_id: u32, dt: f64) -> Result<String> {
    let result = crate::galfus_realm_2d_step_physics(realm_id, dt as f32);
    ffi_string_result(result)
}

#[napi(js_name = "realm2dSetLinearVelocity")]
pub fn realm_2d_set_linear_velocity(realm_id: u32, entity_id: u32, vx: f64, vy: f64) -> Result<()> {
    check_ffi_res(crate::galfus_realm_2d_set_linear_velocity(
        realm_id, entity_id, vx as f32, vy as f32,
    ))
}

#[napi(js_name = "realm2dSetAngularVelocity")]
pub fn realm_2d_set_angular_velocity(realm_id: u32, entity_id: u32, omega: f64) -> Result<()> {
    check_ffi_res(crate::galfus_realm_2d_set_angular_velocity(
        realm_id,
        entity_id,
        omega as f32,
    ))
}

#[napi(js_name = "realm2dQueryPoint")]
pub fn realm_2d_query_point(realm_id: u32, x: f64, y: f64, mask: u32) -> Result<String> {
    let result = crate::galfus_realm_2d_query_point(realm_id, x as f32, y as f32, mask);
    ffi_string_result(result)
}

#[napi(js_name = "realm2dRaycast")]
pub fn realm_2d_raycast(
    realm_id: u32,
    origin_x: f64,
    origin_y: f64,
    dir_x: f64,
    dir_y: f64,
    max_dist: f64,
    mask: u32,
) -> Result<String> {
    let result = crate::galfus_realm_2d_raycast(
        realm_id,
        origin_x as f32,
        origin_y as f32,
        dir_x as f32,
        dir_y as f32,
        max_dist as f32,
        mask,
    );
    ffi_string_result(result)
}

#[napi(js_name = "realm3dAttach")]
pub fn realm_3d_attach(
    realm_id: u32,
    origin_id: u32,
    target_id: u32,
    constraint_json: String,
) -> Result<()> {
    let constraint_json_c = std::ffi::CString::new(constraint_json)
        .map_err(|e| Error::new(Status::InvalidArg, e.to_string()))?;
    check_ffi_res(unsafe {
        crate::galfus_realm_3d_attach(realm_id, origin_id, target_id, constraint_json_c.as_ptr())
    })
}

#[napi(js_name = "realm3dDetach")]
pub fn realm_3d_detach(realm_id: u32, origin_id: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_detach(realm_id, origin_id))
}

#[napi(js_name = "realm3dEnablePhysics")]
pub fn realm_3d_enable_physics(
    realm_id: u32,
    gravity_x: f64,
    gravity_y: f64,
    gravity_z: f64,
) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_enable_physics(
        realm_id,
        gravity_x as f32,
        gravity_y as f32,
        gravity_z as f32,
    ))
}

#[napi(js_name = "realm3dAttachRigidbody")]
pub fn realm_3d_attach_rigidbody(
    env: Env,
    realm_id: u32,
    entity_id: u32,
    desc: JsUnknown,
) -> Result<()> {
    let desc_json = js_to_c_string(&env, Some(desc))?
        .ok_or_else(|| Error::new(Status::InvalidArg, "desc cannot be null"))?;
    check_ffi_res(unsafe {
        crate::galfus_realm_3d_attach_rigidbody(realm_id, entity_id, desc_json.as_ptr())
    })
}

#[napi(js_name = "realm3dRemoveRigidbody")]
pub fn realm_3d_remove_rigidbody(realm_id: u32, entity_id: u32) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_remove_rigidbody(realm_id, entity_id))
}

#[napi(js_name = "realm3dApplyImpulse")]
pub fn realm_3d_apply_impulse(
    realm_id: u32,
    entity_id: u32,
    impulse_x: f64,
    impulse_y: f64,
    impulse_z: f64,
) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_apply_impulse(
        realm_id,
        entity_id,
        impulse_x as f32,
        impulse_y as f32,
        impulse_z as f32,
    ))
}

#[napi(js_name = "realm3dApplyForce")]
pub fn realm_3d_apply_force(
    realm_id: u32,
    entity_id: u32,
    force_x: f64,
    force_y: f64,
    force_z: f64,
) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_apply_force(
        realm_id,
        entity_id,
        force_x as f32,
        force_y as f32,
        force_z as f32,
    ))
}

#[napi(js_name = "realm3dApplyTorque")]
pub fn realm_3d_apply_torque(
    realm_id: u32,
    entity_id: u32,
    torque_x: f64,
    torque_y: f64,
    torque_z: f64,
) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_apply_torque(
        realm_id,
        entity_id,
        torque_x as f32,
        torque_y as f32,
        torque_z as f32,
    ))
}

#[napi(js_name = "realm3dStepPhysics")]
pub fn realm_3d_step_physics(realm_id: u32, dt: f64) -> Result<String> {
    let result = crate::galfus_realm_3d_step_physics(realm_id, dt as f32);
    ffi_string_result(result)
}

#[napi(js_name = "realm3dSetLinearVelocity")]
pub fn realm_3d_set_linear_velocity(
    realm_id: u32,
    entity_id: u32,
    vx: f64,
    vy: f64,
    vz: f64,
) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_set_linear_velocity(
        realm_id, entity_id, vx as f32, vy as f32, vz as f32,
    ))
}

#[napi(js_name = "realm3dSetAngularVelocity")]
pub fn realm_3d_set_angular_velocity(
    realm_id: u32,
    entity_id: u32,
    wx: f64,
    wy: f64,
    wz: f64,
) -> Result<()> {
    check_ffi_res(crate::galfus_realm_3d_set_angular_velocity(
        realm_id, entity_id, wx as f32, wy as f32, wz as f32,
    ))
}

#[napi(js_name = "realm3dRaycast")]
#[allow(clippy::too_many_arguments)]
pub fn realm_3d_raycast(
    realm_id: u32,
    origin_x: f64,
    origin_y: f64,
    origin_z: f64,
    dir_x: f64,
    dir_y: f64,
    dir_z: f64,
    max_dist: f64,
    mask: u32,
) -> Result<String> {
    let result = crate::galfus_realm_3d_raycast(
        realm_id,
        origin_x as f32,
        origin_y as f32,
        origin_z as f32,
        dir_x as f32,
        dir_y as f32,
        dir_z as f32,
        max_dist as f32,
        mask,
    );
    ffi_string_result(result)
}
