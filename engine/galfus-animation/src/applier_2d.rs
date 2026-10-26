//! Applies animated values through the Realm 2D mutation API.

use galfus_multiverse::MultiverseContext;
use galfus_realm_2d::Realm2DContext;

use crate::error::{AnimationError, AnimationResult};
use crate::target::AnimationTarget;
use crate::value::AnimValue;

fn realm(
    multiverse: &mut MultiverseContext,
    realm_id: u32,
) -> AnimationResult<&mut Realm2DContext> {
    multiverse
        .get_realm_mut::<Realm2DContext>(realm_id)
        .ok_or_else(|| AnimationError::General(format!("Realm 2D #{realm_id} not found")))
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
        AnimationTarget::SpriteTransform2D {
            realm_id,
            sprite_id,
        } => {
            let realm = realm(multiverse, *realm_id)?;
            if let Some(position) = value.as_vec2() {
                realm
                    .set_sprite_position(*sprite_id, position)
                    .map_err(realm_error)
            } else {
                realm
                    .set_sprite_transform_checked(*sprite_id, value.to_transform2d()?)
                    .map_err(realm_error)
            }
        }
        AnimationTarget::SpriteColor {
            realm_id,
            sprite_id,
        } => realm(multiverse, *realm_id)?
            .set_sprite_color(
                *sprite_id,
                value.as_vec4().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec4 for SpriteColor".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::SpriteSize {
            realm_id,
            sprite_id,
        } => realm(multiverse, *realm_id)?
            .set_sprite_dimensions(
                *sprite_id,
                value.as_vec2().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec2 for SpriteSize".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Camera2DTransform {
            realm_id,
            camera_id,
        } => {
            let realm = realm(multiverse, *realm_id)?;
            if let Some(position) = value.as_vec2() {
                realm
                    .set_camera_position(*camera_id, position)
                    .map_err(realm_error)
            } else {
                realm
                    .set_camera_transform_checked(*camera_id, value.to_transform2d()?)
                    .map_err(realm_error)
            }
        }
        AnimationTarget::Camera2DZoom {
            realm_id,
            camera_id,
        } => realm(multiverse, *realm_id)?
            .set_camera_ortho_scale(
                *camera_id,
                value.as_scalar().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Scalar for Camera2DZoom".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Material2DColor {
            realm_id,
            material_id,
        } => realm(multiverse, *realm_id)?
            .set_material_base_color(
                *material_id,
                value.as_vec4().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec4 for Material2DColor".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::ShapeTransform2D { realm_id, shape_id } => {
            let realm = realm(multiverse, *realm_id)?;
            if let Some(position) = value.as_vec2() {
                realm
                    .set_shape_position(*shape_id, position)
                    .map_err(realm_error)
            } else {
                realm
                    .set_shape_transform_checked(*shape_id, value.to_transform2d()?)
                    .map_err(realm_error)
            }
        }
        AnimationTarget::ShapeFillColor { realm_id, shape_id } => realm(multiverse, *realm_id)?
            .set_shape_fill_color(
                *shape_id,
                value.as_vec4().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec4 for ShapeFillColor".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::ShapeStrokeColor { .. } => Ok(()),
        AnimationTarget::ShapeRadius { realm_id, shape_id } => realm(multiverse, *realm_id)?
            .set_shape_radius(
                *shape_id,
                value.as_scalar().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Scalar for ShapeRadius".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::ShapeDimensions { realm_id, shape_id } => realm(multiverse, *realm_id)?
            .set_shape_dimensions(
                *shape_id,
                value.as_vec2().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec2 for ShapeDimensions".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Light2DTransform { realm_id, light_id } => {
            let realm = realm(multiverse, *realm_id)?;
            let position = value
                .as_vec2()
                .map(Ok)
                .unwrap_or_else(|| value.to_transform2d().map(|transform| transform.position))?;
            realm
                .set_light_position(*light_id, position)
                .map_err(realm_error)
        }
        AnimationTarget::Light2DColor { realm_id, light_id } => realm(multiverse, *realm_id)?
            .set_light_color(
                *light_id,
                value.as_vec3().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec3 for Light2DColor".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Light2DIntensity { realm_id, light_id } => realm(multiverse, *realm_id)?
            .set_light_intensity(
                *light_id,
                value.as_scalar().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Scalar for Light2DIntensity".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Light2DRadius { realm_id, light_id } => realm(multiverse, *realm_id)?
            .set_light_radius(
                *light_id,
                value.as_scalar().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Scalar for Light2DRadius".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Particle2DTransform {
            realm_id,
            emitter_id,
        } => realm(multiverse, *realm_id)?
            .set_particle_emitter_transform_checked(*emitter_id, value.to_transform2d()?)
            .map_err(realm_error),
        AnimationTarget::Particle2DColorStart {
            realm_id,
            emitter_id,
        } => realm(multiverse, *realm_id)?
            .set_particle_emitter_start_color(
                *emitter_id,
                value.as_vec4().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec4 for Particle2DColorStart".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::Particle2DColorEnd {
            realm_id,
            emitter_id,
        } => realm(multiverse, *realm_id)?
            .set_particle_emitter_end_color(
                *emitter_id,
                value.as_vec4().ok_or_else(|| {
                    AnimationError::InvalidValue("Expected Vec4 for Particle2DColorEnd".into())
                })?,
            )
            .map_err(realm_error),
        AnimationTarget::SvgTransform2D { realm_id, svg_id } => realm(multiverse, *realm_id)?
            .set_svg_transform(*svg_id, value.to_transform2d()?)
            .map_err(realm_error),
        AnimationTarget::SvgOpacity { realm_id, svg_id } => realm(multiverse, *realm_id)?
            .set_svg_attribute(
                *svg_id,
                "root",
                "opacity",
                &format!(
                    "{:.4}",
                    value.as_scalar().ok_or_else(|| {
                        AnimationError::InvalidValue("Expected Scalar for SvgOpacity".into())
                    })?
                ),
            )
            .map_err(realm_error),
        AnimationTarget::SvgAttributeColor {
            realm_id,
            svg_id,
            element_id,
            attribute,
        } => {
            let color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for SvgAttributeColor".into())
            })?;
            let red = (color.x.clamp(0.0, 1.0) * 255.0).round() as u8;
            let green = (color.y.clamp(0.0, 1.0) * 255.0).round() as u8;
            let blue = (color.z.clamp(0.0, 1.0) * 255.0).round() as u8;
            let value = if color.w >= 1.0 {
                format!("#{red:02x}{green:02x}{blue:02x}")
            } else {
                format!("rgba({red},{green},{blue},{:.3})", color.w.clamp(0.0, 1.0))
            };
            realm(multiverse, *realm_id)?
                .set_svg_attribute(*svg_id, element_id, attribute, &value)
                .map_err(realm_error)
        }
        AnimationTarget::SvgAttributeScalar {
            realm_id,
            svg_id,
            element_id,
            attribute,
        } => realm(multiverse, *realm_id)?
            .set_svg_attribute(
                *svg_id,
                element_id,
                attribute,
                &format!(
                    "{:.4}",
                    value.as_scalar().ok_or_else(|| {
                        AnimationError::InvalidValue(
                            "Expected Scalar for SvgAttributeScalar".into(),
                        )
                    })?
                ),
            )
            .map_err(realm_error),
        AnimationTarget::SvgAttributeVec2 {
            realm_id,
            svg_id,
            element_id,
            attribute,
        } => {
            let vector = value.as_vec2().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec2 for SvgAttributeVec2".into())
            })?;
            realm(multiverse, *realm_id)?
                .set_svg_attribute(
                    *svg_id,
                    element_id,
                    attribute,
                    &format!("{:.4} {:.4}", vector.x, vector.y),
                )
                .map_err(realm_error)
        }
        _ => unreachable!("Realm 2D dispatcher received a non-2D target"),
    }
}
