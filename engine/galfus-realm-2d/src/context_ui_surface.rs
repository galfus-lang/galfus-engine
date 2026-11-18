//! Mapping of presented SpritePanel geometry to texture coordinates.
use crate::Realm2DContext;
use glam::Vec2;

impl Realm2DContext {
    pub(crate) fn interaction_ui_surface_texture(
        &self,
        model_id: u32,
        element_id: u32,
    ) -> Option<u32> {
        use galfus_realm_2d_resources::ui::{SpriteImageMode, UiNodeKind};
        let (ui, _) = self.uis.get(&model_id)?;
        let UiNodeKind::SpritePanel(sprite) = &ui.nodes.get(&element_id)?.kind else {
            return None;
        };
        (sprite.image_mode != SpriteImageMode::NineSlice)
            .then_some(sprite.texture_id)
            .flatten()
    }

    pub(crate) fn interaction_ui_surface_uv(
        &self,
        model_id: u32,
        element_id: u32,
        world_point: Vec2,
        texture_size: [u32; 2],
    ) -> Option<Vec2> {
        use galfus_realm_2d_resources::ui::UiNodeKind;
        self.interaction_ui_surface_texture(model_id, element_id)?;
        let (ui, _) = self.uis.get(&model_id)?;
        if !ui.is_interactive_panel(element_id) {
            return None;
        }
        let UiNodeKind::SpritePanel(sprite) = &ui.nodes.get(&element_id)?.kind else {
            return None;
        };
        let layout = ui.computed.get(&element_id)?;
        let transform = self.model_transform_for_collider(model_id)?;
        let matrix = glam::Affine2::from_scale_angle_translation(
            transform.scale,
            transform.rotation,
            transform.position,
        );
        if !matrix.matrix2.determinant().is_finite() || matrix.matrix2.determinant() == 0.0 {
            return None;
        }
        let local = matrix.inverse().transform_point2(world_point);
        let (width, height) = crate::context_ui::compute_ui_dimensions(ui);
        let point = [local.x + width * 0.5, height * 0.5 - local.y];
        if let Some([x, y, width, height]) = layout.clip_rect
            && (point[0] < x || point[1] < y || point[0] >= x + width || point[1] >= y + height)
        {
            return None;
        }
        let (rect, uv) = crate::context_ui::sprite_fit::fit_sprite(
            layout.absolute_rect,
            sprite.uv_rect,
            [texture_size[0] as f32, texture_size[1] as f32],
            sprite.image_mode,
        );
        if rect[2] <= 0.0
            || rect[3] <= 0.0
            || point[0] < rect[0]
            || point[1] < rect[1]
            || point[0] >= rect[0] + rect[2]
            || point[1] >= rect[1] + rect[3]
        {
            return None;
        }
        let u = (point[0] - rect[0]) / rect[2];
        let v = (point[1] - rect[1]) / rect[3];
        let mapped = Vec2::new(uv[0] + (uv[2] - uv[0]) * u, uv[1] + (uv[3] - uv[1]) * v);
        (mapped.is_finite() && (0.0..=1.0).contains(&mapped.x) && (0.0..=1.0).contains(&mapped.y))
            .then_some(mapped)
    }
}
