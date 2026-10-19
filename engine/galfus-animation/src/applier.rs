//! Dispatches and applies evaluated animated values to entities in 3D, 2D, SVG DOM, Multiverse, and Custom channels.

use std::collections::HashMap;

use galfus_multiverse::MultiverseContext;
use galfus_realm_2d::Realm2DContext;
use galfus_realm_3d::Realm3DContext;

use crate::error::{AnimationError, AnimationResult};
use crate::target::AnimationTarget;
use crate::value::AnimValue;

/// Applies an animated value to the specified target within Multiverse or custom channels.
pub fn apply_target_value(
    target: &AnimationTarget,
    value: &AnimValue,
    multiverse: &mut MultiverseContext,
    custom_channels: &mut HashMap<u32, AnimValue>,
) -> AnimationResult<()> {
    match target {
        // === Custom Channels ===
        AnimationTarget::CustomChannel { channel_id } => {
            custom_channels.insert(*channel_id, value.clone());
            Ok(())
        }

        // === Multiverse Invocations ===
        AnimationTarget::InvocationClearColor { invocation_id } => {
            let color = match value {
                AnimValue::Vec4(v) => [v.x, v.y, v.z, v.w],
                _ => {
                    return Err(AnimationError::InvalidValue(
                        "Expected Vec4 for ClearColor".into(),
                    ));
                }
            };
            multiverse
                .set_invocation_clear_color(*invocation_id, Some(color))
                .map_err(|e| AnimationError::General(e.to_string()))
        }
        AnimationTarget::InvocationZIndex { invocation_id } => {
            let z = match value {
                AnimValue::Scalar(s) => s.round() as i32,
                _ => {
                    return Err(AnimationError::InvalidValue(
                        "Expected Scalar for ZIndex".into(),
                    ));
                }
            };
            let inv = multiverse
                .get_invocation_mut(*invocation_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Invocation {invocation_id} not found"))
                })?;
            inv.z_index = z;
            Ok(())
        }
        AnimationTarget::InvocationViewportOffset { invocation_id } => {
            let offset = match value {
                AnimValue::Vec2(v) => *v,
                _ => {
                    return Err(AnimationError::InvalidValue(
                        "Expected Vec2 for ViewportOffset".into(),
                    ));
                }
            };
            let inv = multiverse
                .get_invocation_mut(*invocation_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Invocation {invocation_id} not found"))
                })?;
            inv.viewport.offset_x = galfus_multiverse::UnitValue::Px(offset.x);
            inv.viewport.offset_y = galfus_multiverse::UnitValue::Px(offset.y);
            Ok(())
        }
        AnimationTarget::InvocationViewportSize { invocation_id } => {
            let size = match value {
                AnimValue::Vec2(v) => *v,
                _ => {
                    return Err(AnimationError::InvalidValue(
                        "Expected Vec2 for ViewportSize".into(),
                    ));
                }
            };
            let inv = multiverse
                .get_invocation_mut(*invocation_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Invocation {invocation_id} not found"))
                })?;
            inv.viewport.width = galfus_multiverse::UnitValue::Px(size.x);
            inv.viewport.height = galfus_multiverse::UnitValue::Px(size.y);
            Ok(())
        }

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
            let entry = r3d
                .lights
                .get_mut(light_id)
                .ok_or_else(|| AnimationError::General(format!("Light #{light_id} not found")))?;
            entry.0.color = value.as_vec3().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec3 for Light3DColor".into())
            })?;
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::Light3DIntensity { realm_id, light_id } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let entry = r3d
                .lights
                .get_mut(light_id)
                .ok_or_else(|| AnimationError::General(format!("Light #{light_id} not found")))?;
            entry.0.intensity = value.as_scalar().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Scalar for Light3DIntensity".into())
            })?;
            r3d.dirty = true;
            Ok(())
        }
        AnimationTarget::Light3DTransform { realm_id, light_id } => {
            let r3d = multiverse
                .get_realm_mut::<Realm3DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 3D #{realm_id} not found"))
                })?;
            let entry = r3d
                .lights
                .get_mut(light_id)
                .ok_or_else(|| AnimationError::General(format!("Light #{light_id} not found")))?;
            if let Some(pos) = value.as_vec3() {
                entry.1.position = pos;
            } else {
                entry.1 = value.to_transform3d()?;
            }
            r3d.dirty = true;
            Ok(())
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

        // === Realm 2D Targets ===
        AnimationTarget::SpriteTransform2D {
            realm_id,
            sprite_id,
        } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let entry = r2d
                .sprites
                .get_mut(sprite_id)
                .ok_or_else(|| AnimationError::General(format!("Sprite #{sprite_id} not found")))?;
            if let Some(pos) = value.as_vec2() {
                entry.1.position = pos;
            } else {
                entry.1 = value.to_transform2d()?;
            }
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::SpriteColor {
            realm_id,
            sprite_id,
        } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let mat_id = {
                let entry = r2d.sprites.get(sprite_id).ok_or_else(|| {
                    AnimationError::General(format!("Sprite #{sprite_id} not found"))
                })?;
                entry.0.material_id
            };
            if let Some(mid) = mat_id {
                let mat = r2d
                    .materials
                    .get_mut(&mid)
                    .ok_or_else(|| AnimationError::General(format!("Material #{mid} not found")))?;
                mat.base_color = value.as_vec4().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec4 for SpriteColor".into())
                })?;
                r2d.dirty = true;
            }
            Ok(())
        }
        AnimationTarget::SpriteSize {
            realm_id,
            sprite_id,
        } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let entry = r2d
                .sprites
                .get_mut(sprite_id)
                .ok_or_else(|| AnimationError::General(format!("Sprite #{sprite_id} not found")))?;
            entry.0.dimensions = value.as_vec2().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec2 for SpriteSize".into())
            })?;
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::Camera2DTransform {
            realm_id,
            camera_id,
        } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let entry = r2d
                .cameras
                .get_mut(camera_id)
                .ok_or_else(|| AnimationError::General(format!("Camera #{camera_id} not found")))?;
            if let Some(pos) = value.as_vec2() {
                entry.1.position = pos;
            } else {
                entry.1 = value.to_transform2d()?;
            }
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::Camera2DZoom {
            realm_id,
            camera_id,
        } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let entry = r2d
                .cameras
                .get_mut(camera_id)
                .ok_or_else(|| AnimationError::General(format!("Camera #{camera_id} not found")))?;
            entry.0.ortho_scale = value.as_scalar().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Scalar for Camera2DZoom".into())
            })?;
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::Material2DColor {
            realm_id,
            material_id,
        } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let mat = r2d.materials.get_mut(material_id).ok_or_else(|| {
                AnimationError::General(format!("Material #{material_id} not found"))
            })?;
            mat.base_color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for Material2DColor".into())
            })?;
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::ShapeTransform2D { realm_id, shape_id } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let entry = r2d
                .shapes
                .get_mut(shape_id)
                .ok_or_else(|| AnimationError::General(format!("Shape #{shape_id} not found")))?;
            if let Some(pos) = value.as_vec2() {
                entry.1.position = pos;
            } else {
                entry.1 = value.to_transform2d()?;
            }
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::ShapeFillColor { realm_id, shape_id } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let mat_id = {
                let entry = r2d.shapes.get(shape_id).ok_or_else(|| {
                    AnimationError::General(format!("Shape #{shape_id} not found"))
                })?;
                entry.0.material_id
            };
            if let Some(mid) = mat_id {
                let mat = r2d
                    .materials
                    .get_mut(&mid)
                    .ok_or_else(|| AnimationError::General(format!("Material #{mid} not found")))?;
                mat.base_color = value.as_vec4().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec4 for ShapeFillColor".into())
                })?;
                r2d.dirty = true;
            }
            Ok(())
        }
        AnimationTarget::ShapeStrokeColor { .. } => Ok(()),
        AnimationTarget::ShapeRadius { realm_id, shape_id } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let entry = r2d
                .shapes
                .get_mut(shape_id)
                .ok_or_else(|| AnimationError::General(format!("Shape #{shape_id} not found")))?;
            if let galfus_realm_2d_resources::shape::ShapeKind2D::Circle { radius, .. } =
                &mut entry.0.kind
            {
                *radius = value.as_scalar().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Scalar for ShapeRadius".into())
                })?;
                r2d.dirty = true;
            }
            Ok(())
        }
        AnimationTarget::ShapeDimensions { realm_id, shape_id } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let entry = r2d
                .shapes
                .get_mut(shape_id)
                .ok_or_else(|| AnimationError::General(format!("Shape #{shape_id} not found")))?;
            if let galfus_realm_2d_resources::shape::ShapeKind2D::Rectangle { size } =
                &mut entry.0.kind
            {
                *size = value.as_vec2().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec2 for ShapeDimensions".into())
                })?;
                r2d.dirty = true;
            }
            Ok(())
        }
        AnimationTarget::Light2DTransform { realm_id, light_id } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let light = r2d
                .lights
                .get_mut(light_id)
                .ok_or_else(|| AnimationError::General(format!("Light #{light_id} not found")))?;
            if let Some(pos) = value.as_vec2() {
                light.position = pos;
            } else {
                light.position = value.to_transform2d()?.position;
            }
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::Light2DColor { realm_id, light_id } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let light = r2d
                .lights
                .get_mut(light_id)
                .ok_or_else(|| AnimationError::General(format!("Light #{light_id} not found")))?;
            light.color = value.as_vec3().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec3 for Light2DColor".into())
            })?;
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::Light2DIntensity { realm_id, light_id } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let light = r2d
                .lights
                .get_mut(light_id)
                .ok_or_else(|| AnimationError::General(format!("Light #{light_id} not found")))?;
            light.intensity = value.as_scalar().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Scalar for Light2DIntensity".into())
            })?;
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::Light2DRadius { realm_id, light_id } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let light = r2d
                .lights
                .get_mut(light_id)
                .ok_or_else(|| AnimationError::General(format!("Light #{light_id} not found")))?;
            light.light_radius = value.as_scalar().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Scalar for Light2DRadius".into())
            })?;
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::Particle2DTransform {
            realm_id,
            emitter_id,
        } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let entry = r2d.emitters.get_mut(emitter_id).ok_or_else(|| {
                AnimationError::General(format!("Emitter #{emitter_id} not found"))
            })?;
            entry.1 = value.to_transform2d()?;
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::Particle2DColorStart {
            realm_id,
            emitter_id,
        } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let entry = r2d.emitters.get_mut(emitter_id).ok_or_else(|| {
                AnimationError::General(format!("Emitter #{emitter_id} not found"))
            })?;
            entry.0.start_color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for Particle2DColorStart".into())
            })?;
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::Particle2DColorEnd {
            realm_id,
            emitter_id,
        } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let entry = r2d.emitters.get_mut(emitter_id).ok_or_else(|| {
                AnimationError::General(format!("Emitter #{emitter_id} not found"))
            })?;
            entry.0.end_color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for Particle2DColorEnd".into())
            })?;
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::SvgTransform2D { realm_id, svg_id } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let inst = r2d
                .svg_manager
                .instances
                .get_mut(svg_id)
                .ok_or_else(|| AnimationError::General(format!("SVG #{svg_id} not found")))?;
            inst.transform = value.to_transform2d()?;
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::SvgOpacity { realm_id, svg_id } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let inst = r2d
                .svg_manager
                .instances
                .get_mut(svg_id)
                .ok_or_else(|| AnimationError::General(format!("SVG #{svg_id} not found")))?;
            let opacity = value.as_scalar().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Scalar for SvgOpacity".into())
            })?;
            inst.svg
                .set_attribute("root", "opacity", &format!("{opacity:.4}"));
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::SvgAttributeColor {
            realm_id,
            svg_id,
            element_id,
            attribute,
        } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let inst = r2d
                .svg_manager
                .instances
                .get_mut(svg_id)
                .ok_or_else(|| AnimationError::General(format!("SVG #{svg_id} not found")))?;
            let c = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for SvgAttributeColor".into())
            })?;
            let r = (c.x.clamp(0.0, 1.0) * 255.0).round() as u8;
            let g = (c.y.clamp(0.0, 1.0) * 255.0).round() as u8;
            let b = (c.z.clamp(0.0, 1.0) * 255.0).round() as u8;
            let a = (c.w.clamp(0.0, 1.0) * 255.0).round() as u8;
            let color_str = if a == 255 {
                format!("#{r:02x}{g:02x}{b:02x}")
            } else {
                let alpha_f = c.w.clamp(0.0, 1.0);
                format!("rgba({r},{g},{b},{alpha_f:.3})")
            };
            inst.svg.set_attribute(element_id, attribute, &color_str);
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::SvgAttributeScalar {
            realm_id,
            svg_id,
            element_id,
            attribute,
        } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let inst = r2d
                .svg_manager
                .instances
                .get_mut(svg_id)
                .ok_or_else(|| AnimationError::General(format!("SVG #{svg_id} not found")))?;
            let val = value.as_scalar().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Scalar for SvgAttributeScalar".into())
            })?;
            inst.svg
                .set_attribute(element_id, attribute, &format!("{val:.4}"));
            r2d.dirty = true;
            Ok(())
        }
        AnimationTarget::SvgAttributeVec2 {
            realm_id,
            svg_id,
            element_id,
            attribute,
        } => {
            let r2d = multiverse
                .get_realm_mut::<Realm2DContext>(*realm_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Realm 2D #{realm_id} not found"))
                })?;
            let inst = r2d
                .svg_manager
                .instances
                .get_mut(svg_id)
                .ok_or_else(|| AnimationError::General(format!("SVG #{svg_id} not found")))?;
            let v = value.as_vec2().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec2 for SvgAttributeVec2".into())
            })?;
            inst.svg
                .set_attribute(element_id, attribute, &format!("{:.4} {:.4}", v.x, v.y));
            r2d.dirty = true;
            Ok(())
        }
    }
}
