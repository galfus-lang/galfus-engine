//! Applies animated values to Realm 2D and SVG targets.

use galfus_multiverse::MultiverseContext;
use galfus_realm_2d::Realm2DContext;

use crate::error::{AnimationError, AnimationResult};
use crate::target::AnimationTarget;
use crate::value::AnimValue;

pub(super) fn apply_target_value(
    target: &AnimationTarget,
    value: &AnimValue,
    multiverse: &mut MultiverseContext,
) -> AnimationResult<()> {
    match target {
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
        _ => unreachable!("Realm 2D dispatcher received a non-2D target"),
    }
}
