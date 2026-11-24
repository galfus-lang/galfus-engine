//! Per-camera 2D viewport AABB culling and zoom-aware dynamic distance culling.

use galfus_core::{CullingMode, distance_sq_in_range};
use glam::{Vec2, Vec4};

use crate::batch::PreparedItem2D;
use crate::context::Realm2DContext;
use crate::types::{
    BatchKey2D, Camera2D, Item2DInstanceRaw, Material2D, Shape2D, ShapeKind2D, Sprite2D,
    Transform2D,
};

/// World-space 2D camera viewport bounds and zoom parameters used for culling.
#[derive(Debug, Clone, Copy)]
pub(crate) struct CameraViewportBounds2D {
    pub min: Vec2,
    pub max: Vec2,
    pub position: Vec2,
    pub ortho_scale: f32,
    pub layer_mask: u32,
}

impl CameraViewportBounds2D {
    pub(crate) fn from_camera(
        camera: &Camera2D,
        transform: &Transform2D,
        viewport_size: Vec2,
    ) -> Self {
        let aspect = (viewport_size.x / viewport_size.y.max(1.0)).max(0.0001);
        let half_h = camera.ortho_scale.abs() * 0.5;
        let half_w = half_h * aspect;
        let (eff_w, eff_h) = if transform.rotation.abs() > 1e-6 {
            let c = transform.rotation.cos().abs();
            let s = transform.rotation.sin().abs();
            (half_w * c + half_h * s, half_w * s + half_h * c)
        } else {
            (half_w, half_h)
        };
        let ext = Vec2::new(eff_w, eff_h);
        Self {
            min: transform.position - ext,
            max: transform.position + ext,
            position: transform.position,
            ortho_scale: camera.ortho_scale.abs(),
            layer_mask: camera.layer_mask,
        }
    }

    /// Computes squared effective 2D distance `dx² + dy² + ortho_scale²` so zooming out
    /// increases effective distance symmetrically with 3D camera pullback.
    #[inline]
    pub(crate) fn effective_distance_sq(&self, obj_pos: Vec2) -> f32 {
        let delta = obj_pos - self.position;
        delta.length_squared() + self.ortho_scale * self.ortho_scale
    }

    #[inline]
    pub(crate) fn intersects_aabb(&self, min: Vec2, max: Vec2, margin: f32) -> bool {
        let pad = margin.max(0.0);
        !(max.x + pad < self.min.x
            || min.x - pad > self.max.x
            || max.y + pad < self.min.y
            || min.y - pad > self.max.y)
    }
}

fn corners_aabb(corners: &[Vec2]) -> (Vec2, Vec2) {
    let mut min = Vec2::splat(f32::INFINITY);
    let mut max = Vec2::splat(f32::NEG_INFINITY);
    for &p in corners {
        min = min.min(p);
        max = max.max(p);
    }
    (min, max)
}

#[inline]
pub(crate) fn sprite_world_aabb(sprite: &Sprite2D, transform: &Transform2D) -> (Vec2, Vec2) {
    let corners = sprite.compute_world_corners(transform);
    corners_aabb(&corners)
}

pub(crate) fn shape_world_aabb(shape: &Shape2D, transform: &Transform2D) -> Option<(Vec2, Vec2)> {
    match &shape.kind {
        ShapeKind2D::Rectangle { size } => {
            let hx = size.x * 0.5;
            let hy = size.y * 0.5;
            let corners = [
                transform.transform_point(Vec2::new(-hx, -hy)),
                transform.transform_point(Vec2::new(hx, -hy)),
                transform.transform_point(Vec2::new(hx, hy)),
                transform.transform_point(Vec2::new(-hx, hy)),
            ];
            Some(corners_aabb(&corners))
        }
        ShapeKind2D::Circle { radius, .. } => {
            let r = radius.abs() * transform.scale.x.abs().max(transform.scale.y.abs());
            let ext = Vec2::splat(r);
            Some((transform.position - ext, transform.position + ext))
        }
        ShapeKind2D::Polygon { vertices } => {
            if vertices.is_empty() {
                return None;
            }
            let mut min = Vec2::splat(f32::INFINITY);
            let mut max = Vec2::splat(f32::NEG_INFINITY);
            for &v in vertices {
                let wp = transform.transform_point(v);
                min = min.min(wp);
                max = max.max(wp);
            }
            Some((min, max))
        }
    }
}

pub(crate) fn is_sprite_visible_2d(
    sprite: &Sprite2D,
    transform: &Transform2D,
    bounds: &CameraViewportBounds2D,
) -> bool {
    if sprite.occluder_only || (sprite.layer_mask & bounds.layer_mask) == 0 {
        return false;
    }
    if sprite.culling_mode == CullingMode::AlwaysRender {
        return true;
    }
    if !distance_sq_in_range(
        bounds.effective_distance_sq(transform.position),
        sprite.distance_range,
    ) {
        return false;
    }
    let (min, max) = sprite_world_aabb(sprite, transform);
    bounds.intersects_aabb(min, max, sprite.cull_margin)
}

pub(crate) fn is_shape_visible_2d(
    shape: &Shape2D,
    transform: &Transform2D,
    bounds: &CameraViewportBounds2D,
) -> bool {
    if shape.occluder_only || (shape.layer_mask & bounds.layer_mask) == 0 {
        return false;
    }
    if shape.culling_mode == CullingMode::AlwaysRender {
        return true;
    }
    if !distance_sq_in_range(
        bounds.effective_distance_sq(transform.position),
        shape.distance_range,
    ) {
        return false;
    }
    let Some((min, max)) = shape_world_aabb(shape, transform) else {
        return false;
    };
    bounds.intersects_aabb(min, max, shape.cull_margin)
}

impl Realm2DContext {
    /// Builds unculled batches for all scene items during `prepare()`.
    pub(crate) fn build_all_batches(&mut self) {
        self.batch_builder.clear();
        for (&id, (sprite, transform)) in &self.sprites {
            let [min_z, max_z] = sprite.height_range.unwrap_or([-10000.0, 10000.0]);
            let instance = Item2DInstanceRaw::new(
                sprite.compute_model_matrix(transform),
                Vec4::ONE,
                sprite.uv_rect,
                Vec4::new(
                    if sprite.receive_shadow { 1.0 } else { 0.0 },
                    if sprite.cast_shadow { 1.0 } else { 0.0 },
                    min_z,
                    max_z,
                ),
                sprite.layer_mask,
            );
            let draw_order = sprite.draw_order.unwrap_or(transform.draw_order);
            self.batch_builder.push(PreparedItem2D {
                order: (id, 0, 0),
                key: BatchKey2D {
                    z_layer: transform.z_layer,
                    draw_order,
                    surface_type: self
                        .materials
                        .get(&sprite.material_id.unwrap_or(0))
                        .map_or(1, Material2D::surface_type_id),
                    material_id: sprite.material_id.unwrap_or(0),
                    geometry_id: 0,
                    layer_mask: sprite.layer_mask,
                },
                instance,
                occluder_only: sprite.occluder_only,
            });
        }
        for (&id, (shape, transform)) in &self.shapes {
            let [min_z, max_z] = shape.height_range.unwrap_or([-10000.0, 10000.0]);
            let instance = Item2DInstanceRaw::new(
                shape.compute_model_matrix(transform),
                Vec4::ONE,
                Vec4::new(0.0, 0.0, 1.0, 1.0),
                Vec4::new(
                    if shape.receive_shadow { 1.0 } else { 0.0 },
                    if shape.cast_shadow { 1.0 } else { 0.0 },
                    min_z,
                    max_z,
                ),
                shape.layer_mask,
            );
            let draw_order = shape.draw_order.unwrap_or(transform.draw_order);
            self.batch_builder.push(PreparedItem2D {
                order: (id, 1, 0),
                key: BatchKey2D {
                    z_layer: transform.z_layer,
                    draw_order,
                    surface_type: self
                        .materials
                        .get(&shape.material_id.unwrap_or(0))
                        .map_or(1, Material2D::surface_type_id),
                    material_id: shape.material_id.unwrap_or(0),
                    geometry_id: 0,
                    layer_mask: shape.layer_mask,
                },
                instance,
                occluder_only: shape.occluder_only,
            });
        }
        for (&id, (cfg, transform, state)) in &self.emitters {
            let material_id = cfg.material_id.unwrap_or(0);
            let surface_type = self
                .materials
                .get(&material_id)
                .map(|m| m.surface_type_id())
                .unwrap_or(1);
            for p in &state.particles {
                let life_pct = (p.age / p.lifetime).clamp(0.0, 1.0);
                let current_size = p.start_size + (p.end_size - p.start_size) * life_pct;
                let current_color = p.start_color.lerp(p.end_color, life_pct);
                let model_matrix = crate::types::compute_particle_matrix(
                    p.position,
                    p.rotation,
                    current_size,
                    transform.z_layer,
                );
                let instance = Item2DInstanceRaw::new(
                    model_matrix,
                    current_color,
                    cfg.uv_rect,
                    Vec4::new(
                        if cfg.receive_shadow { 1.0 } else { 0.0 },
                        if cfg.cast_shadow { 1.0 } else { 0.0 },
                        -10000.0,
                        10000.0,
                    ),
                    cfg.layer_mask,
                );
                self.batch_builder.push(PreparedItem2D {
                    order: (id, 2, 0),
                    key: BatchKey2D {
                        z_layer: transform.z_layer,
                        draw_order: transform.draw_order,
                        surface_type,
                        material_id,
                        geometry_id: 0,
                        layer_mask: cfg.layer_mask,
                    },
                    instance,
                    occluder_only: false,
                });
            }
        }
        self.ui_manager
            .push_batches(&self.uis, &mut self.batch_builder);
        self.batch_builder.build();
    }

    /// Collects visible 2D batches for a specific camera invocation with spatial-grid broad-phase,
    /// viewport AABB culling, zoom-aware distance culling, CPU opaque occlusion culling, and Reverse-Z Early-Z ordering.
    pub(crate) fn build_batches_for_camera(
        &mut self,
        camera: &Camera2D,
        camera_transform: &Transform2D,
        viewport_size: Vec2,
    ) {
        let bounds = CameraViewportBounds2D::from_camera(camera, camera_transform, viewport_size);
        self.batch_builder.clear();

        if self.spatial_grid.is_populated() {
            self.spatial_grid.query_into_scratch(bounds.min, bounds.max);
        } else {
            self.spatial_grid.scratch_sprites.clear();
            self.spatial_grid
                .scratch_sprites
                .extend(self.sprites.keys().copied());
            self.spatial_grid.scratch_shapes.clear();
            self.spatial_grid
                .scratch_shapes
                .extend(self.shapes.keys().copied());
        }

        // Pass 1: collect unrotated, fully opaque visible rectangles as CPU 2D occluders.
        self.spatial_grid.scratch_occluders.clear();
        for &id in &self.spatial_grid.scratch_sprites {
            let Some((sprite, transform)) = self.sprites.get(&id) else {
                continue;
            };
            if transform.rotation.abs() > 1e-4 || !is_sprite_visible_2d(sprite, transform, &bounds)
            {
                continue;
            }
            let mat = sprite.material_id.and_then(|mid| self.materials.get(&mid));
            let is_solid_opaque =
                mat.is_some_and(|m| m.surface_type_id() == 0 && m.base_color.w >= 0.999);
            if is_solid_opaque {
                let (min, max) = sprite_world_aabb(sprite, transform);
                let draw_order = sprite.draw_order.unwrap_or(transform.draw_order);
                self.spatial_grid
                    .scratch_occluders
                    .push(crate::occlusion_2d::OpaqueOccluder2D {
                        min,
                        max,
                        z_layer: transform.z_layer,
                        draw_order,
                    });
            }
        }

        let occluders = &self.spatial_grid.scratch_occluders;
        for &id in &self.spatial_grid.scratch_sprites {
            let Some((sprite, transform)) = self.sprites.get(&id) else {
                continue;
            };
            if !is_sprite_visible_2d(sprite, transform, &bounds) {
                continue;
            }
            let draw_order = sprite.draw_order.unwrap_or(transform.draw_order);
            if !occluders.is_empty() && sprite.culling_mode == CullingMode::Auto {
                let (min, max) = sprite_world_aabb(sprite, transform);
                if crate::occlusion_2d::is_occluded_by_opaque_2d(
                    min,
                    max,
                    transform.z_layer,
                    draw_order,
                    occluders,
                ) {
                    continue;
                }
            }
            let [min_z, max_z] = sprite.height_range.unwrap_or([-10000.0, 10000.0]);
            let instance = Item2DInstanceRaw::new(
                sprite.compute_model_matrix(transform),
                Vec4::ONE,
                sprite.uv_rect,
                Vec4::new(
                    if sprite.receive_shadow { 1.0 } else { 0.0 },
                    if sprite.cast_shadow { 1.0 } else { 0.0 },
                    min_z,
                    max_z,
                ),
                sprite.layer_mask,
            );
            self.batch_builder.push(PreparedItem2D {
                order: (id, 0, 0),
                key: BatchKey2D {
                    z_layer: transform.z_layer,
                    draw_order,
                    surface_type: self
                        .materials
                        .get(&sprite.material_id.unwrap_or(0))
                        .map_or(1, Material2D::surface_type_id),
                    material_id: sprite.material_id.unwrap_or(0),
                    geometry_id: 0,
                    layer_mask: sprite.layer_mask,
                },
                instance,
                occluder_only: false,
            });
        }

        for &id in &self.spatial_grid.scratch_shapes {
            let Some((shape, transform)) = self.shapes.get(&id) else {
                continue;
            };
            if !is_shape_visible_2d(shape, transform, &bounds) {
                continue;
            }
            let draw_order = shape.draw_order.unwrap_or(transform.draw_order);
            if !occluders.is_empty()
                && shape.culling_mode == CullingMode::Auto
                && let Some((min, max)) = shape_world_aabb(shape, transform)
                && crate::occlusion_2d::is_occluded_by_opaque_2d(
                    min,
                    max,
                    transform.z_layer,
                    draw_order,
                    occluders,
                )
            {
                continue;
            }
            let [min_z, max_z] = shape.height_range.unwrap_or([-10000.0, 10000.0]);
            let instance = Item2DInstanceRaw::new(
                shape.compute_model_matrix(transform),
                Vec4::ONE,
                Vec4::new(0.0, 0.0, 1.0, 1.0),
                Vec4::new(
                    if shape.receive_shadow { 1.0 } else { 0.0 },
                    if shape.cast_shadow { 1.0 } else { 0.0 },
                    min_z,
                    max_z,
                ),
                shape.layer_mask,
            );
            self.batch_builder.push(PreparedItem2D {
                order: (id, 1, 0),
                key: BatchKey2D {
                    z_layer: transform.z_layer,
                    draw_order,
                    surface_type: self
                        .materials
                        .get(&shape.material_id.unwrap_or(0))
                        .map_or(1, Material2D::surface_type_id),
                    material_id: shape.material_id.unwrap_or(0),
                    geometry_id: 0,
                    layer_mask: shape.layer_mask,
                },
                instance,
                occluder_only: false,
            });
        }

        for (&id, (cfg, transform, state)) in &self.emitters {
            if (cfg.layer_mask & bounds.layer_mask) == 0 {
                continue;
            }
            let material_id = cfg.material_id.unwrap_or(0);
            let surface_type = self
                .materials
                .get(&material_id)
                .map(|m| m.surface_type_id())
                .unwrap_or(1);

            for p in &state.particles {
                let life_pct = (p.age / p.lifetime).clamp(0.0, 1.0);
                let current_size = p.start_size + (p.end_size - p.start_size) * life_pct;
                let half = Vec2::splat(current_size.abs() * 0.75);
                if !bounds.intersects_aabb(p.position - half, p.position + half, 0.0) {
                    continue;
                }
                let current_color = p.start_color.lerp(p.end_color, life_pct);
                let model_matrix = crate::types::compute_particle_matrix(
                    p.position,
                    p.rotation,
                    current_size,
                    transform.z_layer,
                );
                let instance = Item2DInstanceRaw::new(
                    model_matrix,
                    current_color,
                    cfg.uv_rect,
                    Vec4::new(
                        if cfg.receive_shadow { 1.0 } else { 0.0 },
                        if cfg.cast_shadow { 1.0 } else { 0.0 },
                        -10000.0,
                        10000.0,
                    ),
                    cfg.layer_mask,
                );
                self.batch_builder.push(PreparedItem2D {
                    order: (id, 2, 0),
                    key: BatchKey2D {
                        z_layer: transform.z_layer,
                        draw_order: transform.draw_order,
                        surface_type,
                        material_id,
                        geometry_id: 0,
                        layer_mask: cfg.layer_mask,
                    },
                    instance,
                    occluder_only: false,
                });
            }
        }

        self.ui_manager
            .push_batches(&self.uis, &mut self.batch_builder);
        self.batch_builder.build_for_early_z();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn viewport_culling_respects_margin_and_always_render() {
        let cam = Camera2D::new(10.0, 0);
        let cam_tf = Transform2D::default();
        let bounds = CameraViewportBounds2D::from_camera(&cam, &cam_tf, Vec2::new(1000.0, 1000.0));
        // Visible X/Y is [-5, 5]

        let mut sprite = Sprite2D::new(Vec2::new(2.0, 2.0), None);
        let offscreen_tf = Transform2D::from_translation(Vec2::new(8.0, 0.0));
        // Sprite spans [7, 9] -> outside [-5, 5]
        assert!(!is_sprite_visible_2d(&sprite, &offscreen_tf, &bounds));

        // Margin of 2.5 expands sprite to [4.5, 11.5] -> now intersects [-5, 5]
        sprite.cull_margin = 2.5;
        assert!(is_sprite_visible_2d(&sprite, &offscreen_tf, &bounds));

        // AlwaysRender bypasses viewport & distance culling
        sprite.cull_margin = 0.0;
        sprite.distance_range = Some([0.0, 1.0]);
        sprite.culling_mode = CullingMode::AlwaysRender;
        assert!(is_sprite_visible_2d(&sprite, &offscreen_tf, &bounds));
    }

    #[test]
    fn dynamic_2d_distance_combines_position_and_ortho_scale() {
        let sprite_lod0 = Sprite2D {
            distance_range: Some([0.0, 20.0]),
            ..Default::default()
        };
        let sprite_lod1 = Sprite2D {
            distance_range: Some([20.0, 100.0]),
            ..Default::default()
        };
        let center_tf = Transform2D::default();

        // Zoomed in (ortho_scale = 10 -> effective dist at center = 10 < 20)
        let cam_near = Camera2D::new(10.0, 0);
        let bounds_near = CameraViewportBounds2D::from_camera(
            &cam_near,
            &Transform2D::default(),
            Vec2::new(800.0, 600.0),
        );
        assert!(is_sprite_visible_2d(&sprite_lod0, &center_tf, &bounds_near));
        assert!(!is_sprite_visible_2d(
            &sprite_lod1,
            &center_tf,
            &bounds_near
        ));

        // Zoomed out (ortho_scale = 25 -> effective dist at center = 25 in [20, 100))
        let cam_far = Camera2D::new(25.0, 0);
        let bounds_far = CameraViewportBounds2D::from_camera(
            &cam_far,
            &Transform2D::default(),
            Vec2::new(800.0, 600.0),
        );
        assert!(!is_sprite_visible_2d(&sprite_lod0, &center_tf, &bounds_far));
        assert!(is_sprite_visible_2d(&sprite_lod1, &center_tf, &bounds_far));
    }
}
