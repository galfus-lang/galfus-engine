//! Applies animated values through the Realm 3D mutation API.

use galfus_multiverse::MultiverseContext;
use galfus_realm_3d::Realm3DContext;

use crate::error::{AnimationError, AnimationResult};
use crate::target::AnimationTarget;
use crate::value::AnimValue;

fn realm(
    multiverse: &mut MultiverseContext,
    realm_id: u32,
) -> AnimationResult<&mut Realm3DContext> {
    multiverse
        .get_realm_mut::<Realm3DContext>(realm_id)
        .ok_or_else(|| AnimationError::General(format!("Realm 3D #{realm_id} not found")))
}

fn realm_error(error: impl std::fmt::Display) -> AnimationError {
    AnimationError::General(error.to_string())
}

pub(super) fn apply_target_value(
    target: &AnimationTarget,
    value: &AnimValue,
    multiverse: &mut MultiverseContext,
) -> AnimationResult<()> {
    match target {
        AnimationTarget::ModelTransform3D { realm_id, model_id } => {
            let realm = realm(multiverse, *realm_id)?;
            if let Some(position) = value.as_vec3() {
                realm
                    .set_model_position(*model_id, position)
                    .map_err(realm_error)
            } else {
                realm
                    .set_model_transform(*model_id, value.to_transform3d()?)
                    .map_err(realm_error)
            }
        }
        AnimationTarget::ModelTintColor { realm_id, model_id } => realm(multiverse, *realm_id)?
            .set_model_tint_color(
                *model_id,
                value.as_vec4().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec4 for ModelTintColor".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Camera3DTransform {
            realm_id,
            camera_id,
        } => {
            let realm = realm(multiverse, *realm_id)?;
            if let Some(position) = value.as_vec3() {
                realm
                    .set_camera_position(*camera_id, position)
                    .map_err(realm_error)
            } else {
                realm
                    .set_camera_transform(*camera_id, value.to_transform3d()?)
                    .map_err(realm_error)
            }
        }
        AnimationTarget::Camera3DLookAt {
            realm_id,
            camera_id,
        } => realm(multiverse, *realm_id)?
            .set_camera_look_at_target(
                *camera_id,
                value.as_vec3().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec3 for Camera3DLookAt".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Camera3DFov {
            realm_id,
            camera_id,
        } => realm(multiverse, *realm_id)?
            .set_camera_fov(
                *camera_id,
                value.as_scalar().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Scalar for Camera3DFov".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Material3DBaseColor {
            realm_id,
            material_id,
        } => realm(multiverse, *realm_id)?
            .set_material_base_color(
                *material_id,
                value.as_vec4().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec4 for Material3DBaseColor".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Material3DEmissive {
            realm_id,
            material_id,
        } => realm(multiverse, *realm_id)?
            .set_material_emissive_color(
                *material_id,
                value.as_vec4().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec4 for Material3DEmissive".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Material3DRoughness {
            realm_id,
            material_id,
        } => realm(multiverse, *realm_id)?
            .set_material_roughness(
                *material_id,
                value.as_scalar().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Scalar for Material3DRoughness".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Material3DMetallic {
            realm_id,
            material_id,
        } => realm(multiverse, *realm_id)?
            .set_material_metallic(
                *material_id,
                value.as_scalar().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Scalar for Material3DMetallic".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Light3DColor { realm_id, light_id } => realm(multiverse, *realm_id)?
            .set_light_color(
                *light_id,
                value.as_vec3().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec3 for Light3DColor".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Light3DIntensity { realm_id, light_id } => realm(multiverse, *realm_id)?
            .set_light_intensity(
                *light_id,
                value.as_scalar().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Scalar for Light3DIntensity".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Light3DTransform { realm_id, light_id } => {
            let realm = realm(multiverse, *realm_id)?;
            if let Some(position) = value.as_vec3() {
                realm
                    .set_light_position(*light_id, position)
                    .map_err(realm_error)
            } else {
                realm
                    .set_light_transform(*light_id, value.to_transform3d()?)
                    .map_err(realm_error)
            }
        }
        AnimationTarget::EnvironmentSunColor { realm_id } => {
            realm(multiverse, *realm_id)?.set_environment_sun_color(value.as_vec4().ok_or_else(
                || AnimationError::InvalidValue("Expected Vec4 for EnvironmentSunColor".into()),
            )?);
            Ok(())
        }
        AnimationTarget::EnvironmentSunIntensity { realm_id } => {
            realm(multiverse, *realm_id)?.set_environment_sun_intensity(
                value.as_scalar().ok_or_else(|| {
                    AnimationError::InvalidValue(
                        "Expected Scalar for EnvironmentSunIntensity".into(),
                    )
                })?,
            );
            Ok(())
        }
        AnimationTarget::EnvironmentAmbientColor { realm_id } => {
            realm(multiverse, *realm_id)?.set_environment_ambient_color(
                value.as_vec4().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec4 for EnvironmentAmbientColor".into())
                })?,
            );
            Ok(())
        }
        AnimationTarget::Particle3DTransform {
            realm_id,
            emitter_id,
        } => {
            let realm = realm(multiverse, *realm_id)?;
            if let Some(position) = value.as_vec3() {
                realm
                    .set_particle_emitter_position(*emitter_id, position)
                    .map_err(realm_error)
            } else {
                realm
                    .set_particle_emitter_transform(*emitter_id, value.to_transform3d()?)
                    .map_err(realm_error)
            }
        }
        AnimationTarget::Particle3DSpeed {
            realm_id,
            emitter_id,
        } => realm(multiverse, *realm_id)?
            .set_particle_emitter_speed(
                *emitter_id,
                value.as_scalar().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Scalar for Particle3DSpeed".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Particle3DColorStart {
            realm_id,
            emitter_id,
        } => realm(multiverse, *realm_id)?
            .set_particle_emitter_start_color(
                *emitter_id,
                value.as_vec4().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec4 for Particle3DColorStart".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Particle3DColorEnd {
            realm_id,
            emitter_id,
        } => realm(multiverse, *realm_id)?
            .set_particle_emitter_end_color(
                *emitter_id,
                value.as_vec4().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec4 for Particle3DColorEnd".into())
                })?,
            )
            .map_err(realm_error),
        _ => unreachable!("Realm 3D dispatcher received a non-3D target"),
    }
}
