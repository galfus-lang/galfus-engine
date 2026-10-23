//! Dispatches evaluated animation values to their target-specific applicators.

#[path = "applier_2d.rs"]
mod applier_2d;
#[path = "applier_3d.rs"]
mod applier_3d;

use std::collections::HashMap;

use galfus_multiverse::MultiverseContext;

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
        AnimationTarget::CustomChannel { channel_id } => {
            custom_channels.insert(*channel_id, value.clone());
            Ok(())
        }
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
                .map_err(|error| AnimationError::General(error.to_string()))
        }
        AnimationTarget::InvocationZIndex { invocation_id } => {
            let z_index = match value {
                AnimValue::Scalar(value) => value.round() as i32,
                _ => {
                    return Err(AnimationError::InvalidValue(
                        "Expected Scalar for ZIndex".into(),
                    ));
                }
            };
            let invocation = multiverse
                .get_invocation_mut(*invocation_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Invocation {invocation_id} not found"))
                })?;
            invocation.z_index = z_index;
            Ok(())
        }
        AnimationTarget::InvocationViewportOffset { invocation_id } => {
            let offset = value.as_vec2().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec2 for ViewportOffset".into())
            })?;
            let invocation = multiverse
                .get_invocation_mut(*invocation_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Invocation {invocation_id} not found"))
                })?;
            invocation.viewport.offset_x = galfus_multiverse::UnitValue::Px(offset.x);
            invocation.viewport.offset_y = galfus_multiverse::UnitValue::Px(offset.y);
            Ok(())
        }
        AnimationTarget::InvocationViewportSize { invocation_id } => {
            let size = value.as_vec2().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec2 for ViewportSize".into())
            })?;
            let invocation = multiverse
                .get_invocation_mut(*invocation_id)
                .ok_or_else(|| {
                    AnimationError::General(format!("Invocation {invocation_id} not found"))
                })?;
            invocation.viewport.width = galfus_multiverse::UnitValue::Px(size.x);
            invocation.viewport.height = galfus_multiverse::UnitValue::Px(size.y);
            Ok(())
        }
        AnimationTarget::ModelTransform3D { .. }
        | AnimationTarget::ModelTintColor { .. }
        | AnimationTarget::Camera3DTransform { .. }
        | AnimationTarget::Camera3DLookAt { .. }
        | AnimationTarget::Camera3DFov { .. }
        | AnimationTarget::Material3DBaseColor { .. }
        | AnimationTarget::Material3DEmissive { .. }
        | AnimationTarget::Material3DRoughness { .. }
        | AnimationTarget::Material3DMetallic { .. }
        | AnimationTarget::Light3DColor { .. }
        | AnimationTarget::Light3DIntensity { .. }
        | AnimationTarget::Light3DTransform { .. }
        | AnimationTarget::EnvironmentSunColor { .. }
        | AnimationTarget::EnvironmentSunIntensity { .. }
        | AnimationTarget::EnvironmentAmbientColor { .. }
        | AnimationTarget::Particle3DTransform { .. }
        | AnimationTarget::Particle3DSpeed { .. }
        | AnimationTarget::Particle3DColorStart { .. }
        | AnimationTarget::Particle3DColorEnd { .. } => {
            applier_3d::apply_target_value(target, value, multiverse)
        }
        AnimationTarget::SpriteTransform2D { .. }
        | AnimationTarget::SpriteColor { .. }
        | AnimationTarget::SpriteSize { .. }
        | AnimationTarget::Camera2DTransform { .. }
        | AnimationTarget::Camera2DZoom { .. }
        | AnimationTarget::Material2DColor { .. }
        | AnimationTarget::ShapeTransform2D { .. }
        | AnimationTarget::ShapeFillColor { .. }
        | AnimationTarget::ShapeStrokeColor { .. }
        | AnimationTarget::ShapeRadius { .. }
        | AnimationTarget::ShapeDimensions { .. }
        | AnimationTarget::Light2DTransform { .. }
        | AnimationTarget::Light2DColor { .. }
        | AnimationTarget::Light2DIntensity { .. }
        | AnimationTarget::Light2DRadius { .. }
        | AnimationTarget::Particle2DTransform { .. }
        | AnimationTarget::Particle2DColorStart { .. }
        | AnimationTarget::Particle2DColorEnd { .. }
        | AnimationTarget::SvgTransform2D { .. }
        | AnimationTarget::SvgOpacity { .. }
        | AnimationTarget::SvgAttributeColor { .. }
        | AnimationTarget::SvgAttributeScalar { .. }
        | AnimationTarget::SvgAttributeVec2 { .. } => {
            applier_2d::apply_target_value(target, value, multiverse)
        }
    }
}
