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
        AnimationTarget::UiElementBackgroundColor {
            realm_id,
            ui_id,
            element_id,
        } => {
            let realm = realm(multiverse, *realm_id)?;
            let (ui, _) = realm.uis.get_mut(ui_id).ok_or_else(|| {
                AnimationError::General(format!("UI #{ui_id} not found in realm #{realm_id}"))
            })?;
            let color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for UiElementBackgroundColor".into())
            })?;
            let node = ui.nodes.get_mut(element_id).ok_or_else(|| {
                AnimationError::General(format!("UI node #{element_id} not found in UI #{ui_id}"))
            })?;
            if let Some(panel) = node.kind.as_panel_mut()
                && panel.background_color != color.to_array()
            {
                panel.background_color = color.to_array();
                ui.mark_dirty(
                    *element_id,
                    galfus_realm_2d_resources::ui::UiDirtyFlags::PAINT,
                );
                realm.dirty = true;
            }
            Ok(())
        }
        AnimationTarget::UiElementBorderColor {
            realm_id,
            ui_id,
            element_id,
        } => {
            let realm = realm(multiverse, *realm_id)?;
            let (ui, _) = realm.uis.get_mut(ui_id).ok_or_else(|| {
                AnimationError::General(format!("UI #{ui_id} not found in realm #{realm_id}"))
            })?;
            let color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for UiElementBorderColor".into())
            })?;
            let node = ui.nodes.get_mut(element_id).ok_or_else(|| {
                AnimationError::General(format!("UI node #{element_id} not found in UI #{ui_id}"))
            })?;
            if let Some(panel) = node.kind.as_panel_mut()
                && (panel.border_color != color.to_array() || panel.border_colors.is_some())
            {
                panel.border_color = color.to_array();
                panel.border_colors = None;
                ui.mark_dirty(
                    *element_id,
                    galfus_realm_2d_resources::ui::UiDirtyFlags::PAINT,
                );
                realm.dirty = true;
            }
            Ok(())
        }
        AnimationTarget::UiElementBorderSideColor {
            realm_id,
            ui_id,
            element_id,
            side,
        } => {
            let color = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for UiElementBorderSideColor".into())
            })?;
            if *side >= 4 {
                return Err(AnimationError::InvalidValue(
                    "Border side must be 0..3".into(),
                ));
            }
            let realm = realm(multiverse, *realm_id)?;
            let (ui, _) = realm.uis.get_mut(ui_id).ok_or_else(|| {
                AnimationError::General(format!("UI #{ui_id} not found in realm #{realm_id}"))
            })?;
            let node = ui.nodes.get_mut(element_id).ok_or_else(|| {
                AnimationError::General(format!("UI node #{element_id} not found in UI #{ui_id}"))
            })?;
            let panel = node.kind.as_panel_mut().ok_or_else(|| {
                AnimationError::InvalidValue("Border animation requires a panel".into())
            })?;
            let mut colors = panel.border_colors.unwrap_or([panel.border_color; 4]);
            if colors[*side as usize] != color.to_array() {
                colors[*side as usize] = color.to_array();
                panel.border_colors = Some(colors);
                ui.mark_dirty(
                    *element_id,
                    galfus_realm_2d_resources::ui::UiDirtyFlags::PAINT,
                );
                realm.dirty = true;
            }
            Ok(())
        }
        AnimationTarget::UiElementBorderWidth {
            realm_id,
            ui_id,
            element_id,
        }
        | AnimationTarget::UiElementBorderRadius {
            realm_id,
            ui_id,
            element_id,
        } => {
            let values = value.as_vec4().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec4 for UI border geometry".into())
            })?;
            if !values.is_finite() {
                return Err(AnimationError::InvalidValue(
                    "UI border values must be finite".into(),
                ));
            }
            let realm = realm(multiverse, *realm_id)?;
            let (ui, _) = realm.uis.get_mut(ui_id).ok_or_else(|| {
                AnimationError::General(format!("UI #{ui_id} not found in realm #{realm_id}"))
            })?;
            let node = ui.nodes.get_mut(element_id).ok_or_else(|| {
                AnimationError::General(format!("UI node #{element_id} not found in UI #{ui_id}"))
            })?;
            let panel = node.kind.as_panel_mut().ok_or_else(|| {
                AnimationError::InvalidValue("Border animation requires a panel".into())
            })?;
            let field = if matches!(target, AnimationTarget::UiElementBorderWidth { .. }) {
                &mut panel.border_width
            } else {
                &mut panel.border_radius
            };
            let values = values.max(glam::Vec4::ZERO).to_array();
            if *field != values {
                *field = values;
                ui.mark_dirty(
                    *element_id,
                    galfus_realm_2d_resources::ui::UiDirtyFlags::PAINT,
                );
                realm.dirty = true;
            }
            Ok(())
        }
        AnimationTarget::UiElementOpacity {
            realm_id,
            ui_id,
            element_id,
        } => {
            let realm = realm(multiverse, *realm_id)?;
            let (ui, _) = realm.uis.get_mut(ui_id).ok_or_else(|| {
                AnimationError::General(format!("UI #{ui_id} not found in realm #{realm_id}"))
            })?;
            let opacity = value.as_scalar().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Scalar for UiElementOpacity".into())
            })?;
            let node = ui.nodes.get_mut(element_id).ok_or_else(|| {
                AnimationError::General(format!("UI node #{element_id} not found in UI #{ui_id}"))
            })?;
            if let Some(panel) = node.kind.as_panel_mut() {
                let opacity = opacity.clamp(0.0, 1.0);
                if panel.opacity != opacity {
                    panel.opacity = opacity;
                    ui.mark_dirty(
                        *element_id,
                        galfus_realm_2d_resources::ui::UiDirtyFlags::PAINT
                            | galfus_realm_2d_resources::ui::UiDirtyFlags::CLIP_TRANSFORM,
                    );
                    realm.dirty = true;
                }
            }
            Ok(())
        }
        AnimationTarget::UiElementPosition {
            realm_id,
            ui_id,
            element_id,
        } => {
            let realm = realm(multiverse, *realm_id)?;
            let (ui, _) = realm.uis.get_mut(ui_id).ok_or_else(|| {
                AnimationError::General(format!("UI #{ui_id} not found in realm #{realm_id}"))
            })?;
            let pos = value.as_vec2().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec2 for UiElementPosition".into())
            })?;
            let node = ui.nodes.get_mut(element_id).ok_or_else(|| {
                AnimationError::General(format!("UI node #{element_id} not found in UI #{ui_id}"))
            })?;
            let position = Some([pos.x, pos.y]);
            if node.layout.position_offset != position {
                node.layout.position_offset = position;
                ui.mark_dirty(
                    *element_id,
                    galfus_realm_2d_resources::ui::UiDirtyFlags::LAYOUT,
                );
                realm.dirty = true;
            }
            Ok(())
        }
        AnimationTarget::UiElementSize {
            realm_id,
            ui_id,
            element_id,
        } => {
            let realm = realm(multiverse, *realm_id)?;
            let (ui, _) = realm.uis.get_mut(ui_id).ok_or_else(|| {
                AnimationError::General(format!("UI #{ui_id} not found in realm #{realm_id}"))
            })?;
            let size = value.as_vec2().ok_or_else(|| {
                AnimationError::InvalidValue("Expected Vec2 for UiElementSize".into())
            })?;
            let node = ui.nodes.get_mut(element_id).ok_or_else(|| {
                AnimationError::General(format!("UI node #{element_id} not found in UI #{ui_id}"))
            })?;
            let width = galfus_realm_2d_resources::ui::UiDimension::Exact(size.x);
            let height = galfus_realm_2d_resources::ui::UiDimension::Exact(size.y);
            if node.layout.width != width || node.layout.height != height {
                node.layout.width = width;
                node.layout.height = height;
                ui.mark_dirty(
                    *element_id,
                    galfus_realm_2d_resources::ui::UiDirtyFlags::LAYOUT,
                );
                realm.dirty = true;
            }
            Ok(())
        }
        _ => unreachable!("Realm 2D dispatcher received a non-2D target"),
    }
}
