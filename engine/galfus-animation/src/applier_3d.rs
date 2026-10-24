//! Applies animated values to Realm 3D targets.

use galfus_multiverse::MultiverseContext;
use galfus_realm_3d::Realm3DContext;

use crate::error::{AnimationError, AnimationResult};
use crate::target::AnimationTarget;
use crate::value::AnimValue;

pub(super) fn apply_target_value(
    target: &AnimationTarget,
    value: &AnimValue,
    multiverse: &mut MultiverseContext,
) -> AnimationResult<()> {
    match target {
        // === Realm 3D Targets ===
        AnimationTarget::ModelTransform3D { realm_id, model_id } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            if let Some(pos) = value.as_vec3() {
                let entry = r3d.models.get_mut(model_id).ok_or_else(|| {
                    AnimationError::General(format!("Model #{model_id} not found"))
                })?;
                entry.1.position = pos;
                r3d.dirty = true;
                Ok(())
            } else {
                let t = value.to_transform3d()?;
                r3d.set_model_transform(*model_id, t)
                    .map_err(|e| AnimationError::General(e.to_string()))
            }
        }
        AnimationTarget::ModelTintColor { realm_id, model_id } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let entry = r3d
                .models
                .get_mut(model_id)
                .ok_or_else(|| AnimationError::General(format!("Model #{model_id} not found")))?;
            entry.0.outline_color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for ModelTintColor".into())
            })?;
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::Camera3DTransform {
            realm_id,
            camera_id,
        } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            if let Some(pos) = value.as_vec3() {
                let entry = r3d.cameras.get_mut(camera_id).ok_or_else(|| {
                    AnimationError::General(format!("Camera #{camera_id} not found"))
                })?;
                entry.1.position = pos;
                r3d.dirty = true;
                Ok(())
            } else {
                let t = value.to_transform3d()?;
                r3d.set_camera_transform(*camera_id, t)
                    .map_err(|e| AnimationError::General(e.to_string()))
            }
        }
        AnimationTarget::Camera3DLookAt {
            realm_id,
            camera_id,
        } => {
            let target = value.as_vec3().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec3 for Camera3DLookAt".into())
            })?;
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            r3d.set_camera_look_at_target(*camera_id, target)
                .map_err(|e| AnimationError::General(e.to_string()))
        }
        AnimationTarget::Camera3DFov {
            realm_id,
            camera_id,
        } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let entry = r3d
                .cameras
                .get_mut(camera_id)
                .ok_or_else(|| AnimationError::General(format!("Camera #{camera_id} not found")))?;
            entry.0.fov_y = value.as_scalar().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Scalar for Camera3DFov".into())
            })?;
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::Material3DBaseColor {
            realm_id,
            material_id,
        } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let entry = r3d.materials.get_mut(material_id).ok_or_else(|| {
                AnimationError::General(format!("Material #{material_id} not found"))
            })?;
            entry.0.base_color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for Material3DBaseColor".into())
            })?;
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::Material3DEmissive {
            realm_id,
            material_id,
        } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let entry = r3d.materials.get_mut(material_id).ok_or_else(|| {
                AnimationError::General(format!("Material #{material_id} not found"))
            })?;
            entry.0.emissive_color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for Material3DEmissive".into())
            })?;
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::Material3DRoughness {
            realm_id,
            material_id,
        } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let entry = r3d.materials.get_mut(material_id).ok_or_else(|| {
                AnimationError::General(format!("Material #{material_id} not found"))
            })?;
            entry.0.roughness = value.as_scalar().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Scalar for Material3DRoughness".into())
            })?;
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::Material3DMetallic {
            realm_id,
            material_id,
        } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let entry = r3d.materials.get_mut(material_id).ok_or_else(|| {
                AnimationError::General(format!("Material #{material_id} not found"))
            })?;
            entry.0.metallic = value.as_scalar().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Scalar for Material3DMetallic".into())
            })?;
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::Light3DColor { realm_id, light_id } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let color = value.as_vec3().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec3 for Light3DColor".into())
            })?;
            r3d.set_light_color(*light_id, color)
                .map_err(|error| AnimationError::General(error.to_string()))
        }
        AnimationTarget::Light3DIntensity { realm_id, light_id } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let intensity = value.as_scalar().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Scalar for Light3DIntensity".into())
            })?;
            r3d.set_light_intensity(*light_id, intensity)
                .map_err(|error| AnimationError::General(error.to_string()))
        }
        AnimationTarget::Light3DTransform { realm_id, light_id } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let transform = if let Some(position) = value.as_vec3() {
                let current = r3d
                    .lights
                    .get(light_id)
                    .ok_or_else(|| AnimationError::General(format!("Light #{light_id} not found")))?
                    .1;
                galfus_realm_3d_resources::transform::Transform3D {
                    position,
                    ..current
                }
            } else {
                value.to_transform3d()?
            };
            r3d.set_light_transform(*light_id, transform)
                .map_err(|error| AnimationError::General(error.to_string()))
        }
        AnimationTarget::EnvironmentSunColor { realm_id } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            r3d.environment.skybox.sun_color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for EnvironmentSunColor".into())
            })?;
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::EnvironmentSunIntensity { realm_id } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            r3d.environment.skybox.intensity = value.as_scalar().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Scalar for EnvironmentSunIntensity".into())
            })?;
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::EnvironmentAmbientColor { realm_id } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            r3d.environment.ambient_color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for EnvironmentAmbientColor".into())
            })?;
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::Particle3DTransform {
            realm_id,
            emitter_id,
        } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let entry = r3d.emitters.get_mut(emitter_id).ok_or_else(|| {
                AnimationError::General(format!("Emitter #{emitter_id} not found"))
            })?;
            entry.1 = value.to_transform3d()?;
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::Particle3DSpeed {
            realm_id,
            emitter_id,
        } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let entry = r3d.emitters.get_mut(emitter_id).ok_or_else(|| {
                AnimationError::General(format!("Emitter #{emitter_id} not found"))
            })?;
            let s = value.as_scalar().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Scalar for Particle3DSpeed".into())
            })?;
            entry.0.speed_range = [s, s];
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::Particle3DColorStart {
            realm_id,
            emitter_id,
        } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let entry = r3d.emitters.get_mut(emitter_id).ok_or_else(|| {
                AnimationError::General(format!("Emitter #{emitter_id} not found"))
            })?;
            entry.0.start_color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for Particle3DColorStart".into())
            })?;
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::Particle3DColorEnd {
            realm_id,
            emitter_id,
        } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let entry = r3d.emitters.get_mut(emitter_id).ok_or_else(|| {
                AnimationError::General(format!("Emitter #{emitter_id} not found"))
            })?;
            entry.0.end_color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for Particle3DColorEnd".into())
            })?;
            r3d.dirty = true;
            Ok(())
        }

        _ => unreachable!("Realm 3D dispatcher received a non-3D target"),
    }
}
