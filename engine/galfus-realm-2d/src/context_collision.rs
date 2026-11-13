//! 2D Collider management and spatial picking hit-testing for `Realm2DContext`.

use crate::collision_geometry::{
    point_in_circle, point_in_polygon, point_in_rectangle, raycast_shape_2d,
};
use galfus_realm_core::collision::{Collider2D, ColliderQueryHit2D, ColliderShape2D, HitResult2D};
use galfus_realm_core::error::RealmResult;
use glam::Vec2;

use crate::context::Realm2DContext;
use crate::types::Transform2D;

impl Realm2DContext {
    /// Registers or updates a 2D collider attached to a model.
    pub fn create_collider_2d(&mut self, collider: Collider2D) -> RealmResult<()> {
        self.validate_id(collider.id)?;
        self.validate_id(collider.model_id)?;
        if !collider.is_valid() {
            return Err(galfus_realm_core::RealmError::Internal(
                "Invalid Collider2D geometry or transform".into(),
            ));
        }
        if self
            .model_transform_for_collider(collider.model_id)
            .is_none()
        {
            return Err(galfus_realm_core::RealmError::ResourceNotFound(
                self.id,
                format!("Model2D {}", collider.model_id),
            ));
        }
        self.colliders.insert(collider.id, collider);
        Ok(())
    }

    /// Removes an existing 2D collider.
    pub fn destroy_collider_2d(&mut self, id: u32) -> RealmResult<()> {
        self.validate_id(id)?;
        self.colliders.remove(&id).map(|_| ()).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("Collider2D {id}"))
        })
    }

    /// Removes all 2D colliders attached to a logical model.
    pub fn destroy_colliders_by_model_2d(&mut self, model_id: u32) {
        self.colliders.retain(|_, c| c.model_id != model_id);
    }

    pub(crate) fn remove_orphaned_model_colliders_2d(&mut self, model_id: u32) {
        if self.model_transform_for_collider(model_id).is_none() {
            self.destroy_colliders_by_model_2d(model_id);
        }
    }

    /// Explicitly updates or sets the world transform of a logical 2D model.
    pub fn set_model_transform_2d(
        &mut self,
        model_id: u32,
        transform: Transform2D,
    ) -> RealmResult<()> {
        self.validate_id(model_id)?;
        if !transform.position.is_finite()
            || !transform.rotation.is_finite()
            || !transform.scale.is_finite()
        {
            return Err(galfus_realm_core::RealmError::Internal(
                "Invalid Model2D transform".into(),
            ));
        }
        self.model_transforms.insert(model_id, transform);
        if let Some((_, tf)) = self.sprites.get_mut(&model_id) {
            *tf = transform;
        }
        if let Some((_, tf)) = self.shapes.get_mut(&model_id) {
            *tf = transform;
        }
        if let Some((_, tf)) = self.uis.get_mut(&model_id) {
            *tf = transform;
        }
        self.shadow_manager.mark_dirty();
        self.dirty = true;
        Ok(())
    }

    /// Removes a spatial-only model and all colliders attached to it.
    pub fn destroy_spatial_model_2d(&mut self, model_id: u32) -> RealmResult<()> {
        self.validate_id(model_id)?;
        self.model_transforms.remove(&model_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("Model2D {model_id}"))
        })?;
        self.destroy_colliders_by_model_2d(model_id);
        Ok(())
    }

    pub(crate) fn model_transform_for_collider(&self, model_id: u32) -> Option<Transform2D> {
        self.model_transforms
            .get(&model_id)
            .copied()
            .or_else(|| self.sprites.get(&model_id).map(|(_, tf)| *tf))
            .or_else(|| self.shapes.get(&model_id).map(|(_, tf)| *tf))
            .or_else(|| self.uis.get(&model_id).map(|(_, tf)| *tf))
    }

    /// Internal picking logic evaluating world point against all registered 2D colliders.
    pub(crate) fn perform_pick_2d(
        &self,
        camera_slot: Option<u32>,
        world_pos: Vec2,
    ) -> Option<HitResult2D> {
        let camera = if let Some(slot) = camera_slot {
            self.cameras
                .iter()
                .find(|(id, (camera, _))| {
                    camera.active && (camera.camera_slot == slot || **id == slot)
                })
                .map(|(_, pair)| pair)
        } else {
            self.cameras
                .values()
                .find(|(camera, _)| camera.active && camera.camera_slot == 0)
        };
        self.query_point_2d(
            world_pos,
            camera.map_or(u32::MAX, |(camera, _)| camera.layer_mask),
        )
        .into_iter()
        .last()
    }

    /// Finds all active colliders containing a world-space point, ordered back to front.
    pub fn query_point_2d(&self, world_pos: Vec2, mask: u32) -> Vec<HitResult2D> {
        let mut hits = Vec::new();
        if !world_pos.is_finite() {
            return Vec::new();
        }

        for collider in self.colliders.values() {
            if !collider.active || collider.layer & mask == 0 {
                continue;
            }
            // Resolve model transform
            let Some(transform) = self.model_transform_for_collider(collider.model_id) else {
                continue;
            };
            if !transform.scale.is_finite()
                || transform.scale.x == 0.0
                || transform.scale.y == 0.0
                || !transform.rotation.is_finite()
                || !transform.position.is_finite()
            {
                continue;
            }
            let model = glam::Affine2::from_scale_angle_translation(
                transform.scale,
                transform.rotation,
                transform.position,
            );
            let matrix = model
                * collider.local_matrix.map_or(glam::Affine2::IDENTITY, |m| {
                    glam::Affine2::from_cols_array(&m)
                });
            let determinant = matrix.matrix2.determinant();
            if !determinant.is_finite() || determinant == 0.0 {
                continue;
            }
            let inverse = matrix.inverse();
            let local_pos = inverse.transform_point2(world_pos);
            let center = Vec2::from(collider.offset);

            let hit = match &collider.shape {
                ColliderShape2D::Rectangle { half_extents } => {
                    point_in_rectangle(local_pos, center, Vec2::from(*half_extents))
                }
                ColliderShape2D::Circle { radius } => point_in_circle(local_pos, center, *radius),
                ColliderShape2D::Polygon { vertices } => {
                    let point = local_pos - center;
                    if !point_in_polygon(point, vertices) {
                        None
                    } else {
                        let mut min = Vec2::splat(f32::INFINITY);
                        let mut max = Vec2::splat(f32::NEG_INFINITY);
                        for vertex in vertices {
                            min = min.min(Vec2::from(*vertex));
                            max = max.max(Vec2::from(*vertex));
                        }
                        Some((Vec2::ZERO, (point - min) / (max - min)))
                    }
                }
            };

            if let Some((normal, uv)) = hit {
                let element_id = if let Some((ui, _)) = self.uis.get(&collider.model_id) {
                    let (ui_w, ui_h) = crate::context_ui::compute_ui_dimensions(ui);
                    let model_pos = model.inverse().transform_point2(world_pos);
                    let ui_point = [model_pos.x + ui_w * 0.5, ui_h * 0.5 - model_pos.y];
                    ui.pick_panel(ui_point)
                } else {
                    None
                };

                let candidate = HitResult2D {
                    model_id: collider.model_id,
                    collider_id: collider.id,
                    point: world_pos,
                    normal: (inverse.matrix2.transpose() * normal).normalize_or_zero(),
                    uv,
                    z_layer: transform.z_layer as f32,
                    element_id,
                };
                let order = (
                    transform.z_layer,
                    self.sprites
                        .get(&collider.model_id)
                        .and_then(|(sprite, _)| sprite.draw_order)
                        .or_else(|| {
                            self.shapes
                                .get(&collider.model_id)
                                .and_then(|(shape, _)| shape.draw_order)
                        })
                        .unwrap_or(transform.draw_order),
                    collider.model_id,
                    collider.id,
                );
                hits.push((order, candidate));
            }
        }
        hits.sort_by_key(|(order, _)| *order);
        hits.into_iter().map(|(_, hit)| hit).collect()
    }

    /// Queries all colliders containing a point and includes sensor metadata.
    pub fn query_colliders_point_2d(&self, point: Vec2, mask: u32) -> Vec<ColliderQueryHit2D> {
        let mut hits: Vec<_> = self
            .query_point_2d(point, mask)
            .into_iter()
            .map(|hit| ColliderQueryHit2D {
                model_id: hit.model_id,
                collider_id: hit.collider_id,
                point: hit.point,
                normal: Vec2::ZERO,
                distance: 0.0,
                sensor: self.colliders[&hit.collider_id].sensor,
            })
            .collect();
        hits.sort_by_key(|hit| hit.collider_id);
        hits
    }

    /// Casts a world-space ray against active 2D colliders.
    pub fn raycast_colliders_2d(
        &self,
        origin: Vec2,
        direction: Vec2,
        max_distance: f32,
        mask: u32,
    ) -> Vec<ColliderQueryHit2D> {
        if !origin.is_finite()
            || !direction.is_finite()
            || direction.length_squared() <= 0.0
            || !max_distance.is_finite()
            || max_distance < 0.0
        {
            return Vec::new();
        }
        let direction = direction.normalize();
        let mut hits = Vec::new();
        for collider in self.colliders.values() {
            if !collider.active || collider.layer & mask == 0 {
                continue;
            }
            let Some(transform) = self.model_transform_for_collider(collider.model_id) else {
                continue;
            };
            let model = glam::Affine2::from_scale_angle_translation(
                transform.scale,
                transform.rotation,
                transform.position,
            );
            let matrix = model
                * collider.local_matrix.map_or(glam::Affine2::IDENTITY, |m| {
                    glam::Affine2::from_cols_array(&m)
                });
            let det = matrix.matrix2.determinant();
            if !det.is_finite() || det == 0.0 {
                continue;
            }
            let inverse = matrix.inverse();
            let local_origin = inverse.transform_point2(origin) - Vec2::from(collider.offset);
            let local_direction = inverse.transform_vector2(direction);
            if let Some((distance, normal)) =
                raycast_shape_2d(&collider.shape, local_origin, local_direction)
                && distance <= max_distance
            {
                hits.push(ColliderQueryHit2D {
                    model_id: collider.model_id,
                    collider_id: collider.id,
                    point: origin + direction * distance,
                    normal: (inverse.matrix2.transpose() * normal).normalize_or_zero(),
                    distance,
                    sensor: collider.sensor,
                });
            }
        }
        hits.sort_by(|a, b| {
            a.distance
                .total_cmp(&b.distance)
                .then(a.collider_id.cmp(&b.collider_id))
        });
        hits
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use galfus_realm_core::collision::ColliderShape2D;

    #[test]
    fn test_realm2d_collider_crud_and_picking() {
        let mut realm = Realm2DContext::new(1);
        realm
            .set_model_transform_2d(
                100,
                Transform2D {
                    position: Vec2::new(50.0, 50.0),
                    scale: Vec2::ONE,
                    z_layer: 1,
                    ..Default::default()
                },
            )
            .unwrap();

        let collider = Collider2D {
            id: 1,
            model_id: 100,
            shape: ColliderShape2D::Rectangle {
                half_extents: [20.0, 10.0],
            },
            offset: [0.0, 0.0],
            local_matrix: None,
            active: true,
            sensor: false,
            layer: 1,
            mask: u32::MAX,
        };

        assert!(realm.create_collider_2d(collider).is_ok());

        // Hit inside
        let hit = realm.perform_pick_2d(None, Vec2::new(55.0, 52.0));
        assert!(hit.is_some());
        let h = hit.unwrap();
        assert_eq!(h.model_id, 100);
        assert_eq!(h.collider_id, 1);

        // Miss outside
        let miss = realm.perform_pick_2d(None, Vec2::new(80.0, 50.0));
        assert!(miss.is_none());

        // Destroy
        assert!(realm.destroy_collider_2d(1).is_ok());
        assert!(realm.perform_pick_2d(None, Vec2::new(55.0, 52.0)).is_none());
    }

    #[test]
    fn picking_uses_model_transform_and_draw_order() {
        let mut realm = Realm2DContext::new(1);
        let shape = ColliderShape2D::Rectangle {
            half_extents: [2.0, 1.0],
        };
        for (id, draw_order) in [(10, 0), (20, 1)] {
            realm
                .set_model_transform_2d(
                    id,
                    Transform2D {
                        position: Vec2::new(10.0, 10.0),
                        rotation: std::f32::consts::FRAC_PI_2,
                        scale: Vec2::new(2.0, 1.0),
                        draw_order,
                        ..Default::default()
                    },
                )
                .unwrap();
            realm
                .create_collider_2d(Collider2D {
                    id,
                    model_id: id,
                    shape: shape.clone(),
                    offset: [2.0, 0.0],
                    local_matrix: None,
                    active: true,
                    sensor: false,
                    layer: 1,
                    mask: u32::MAX,
                })
                .unwrap();
        }
        assert_eq!(
            realm
                .perform_pick_2d(None, Vec2::new(10.0, 14.0))
                .unwrap()
                .model_id,
            20
        );
        assert!(realm.perform_pick_2d(None, Vec2::new(13.0, 14.0)).is_none());
        realm.model_transforms.clear();
        assert!(realm.perform_pick_2d(None, Vec2::ZERO).is_none());
    }

    #[test]
    fn spatial_model_colliders_follow_transform_and_are_removed_with_model() {
        let mut realm = Realm2DContext::new(1);
        let collider = Collider2D {
            id: 1,
            model_id: 10,
            shape: ColliderShape2D::Circle { radius: 1.0 },
            offset: [0.0; 2],
            local_matrix: None,
            active: true,
            sensor: false,
            layer: 1,
            mask: u32::MAX,
        };
        assert!(realm.create_collider_2d(collider.clone()).is_err());
        realm
            .set_model_transform_2d(10, Transform2D::from_translation(Vec2::new(4.0, 0.0)))
            .unwrap();
        realm.create_collider_2d(collider).unwrap();
        assert!(realm.perform_pick_2d(None, Vec2::new(4.0, 0.0)).is_some());
        realm
            .set_model_transform_2d(10, Transform2D::from_translation(Vec2::new(7.0, 0.0)))
            .unwrap();
        assert!(realm.perform_pick_2d(None, Vec2::new(4.0, 0.0)).is_none());
        assert!(realm.perform_pick_2d(None, Vec2::new(7.0, 0.0)).is_some());
        realm.destroy_spatial_model_2d(10).unwrap();
        assert!(realm.colliders.is_empty());
    }

    #[test]
    fn polygon_queries_use_local_matrix_masks_and_sensor() {
        let mut realm = Realm2DContext::new(1);
        realm
            .set_model_transform_2d(10, Transform2D::default())
            .unwrap();
        let collider = Collider2D {
            id: 1,
            model_id: 10,
            shape: ColliderShape2D::Polygon {
                vertices: vec![[0., 0.], [3., 0.], [3., 1.], [1., 1.], [1., 3.], [0., 3.]],
            },
            offset: [0.0; 2],
            local_matrix: Some([1., 0., 0., 1., 4., 0.]),
            active: true,
            sensor: true,
            layer: 2,
            mask: u32::MAX,
        };
        realm.create_collider_2d(collider.clone()).unwrap();
        assert!(
            realm
                .query_colliders_point_2d(Vec2::new(6., 2.), 2)
                .is_empty()
        );
        assert!(
            realm
                .query_colliders_point_2d(Vec2::new(4.5, 2.), 1)
                .is_empty()
        );
        assert!(realm.query_colliders_point_2d(Vec2::new(4.5, 2.), 2)[0].sensor);
        let hit = &realm.raycast_colliders_2d(Vec2::new(2., 2.), Vec2::X, 10., 2)[0];
        assert!((hit.distance - 2.).abs() < 1e-5);
        assert_eq!(hit.normal, Vec2::NEG_X);
        let mut invalid = collider;
        invalid.shape = ColliderShape2D::Polygon {
            vertices: vec![[0., 0.], [1., 1.], [1., 0.], [0., 1.]],
        };
        assert!(realm.create_collider_2d(invalid).is_err());
    }

    #[test]
    fn viewport_conversion_uses_real_2d_camera() {
        use galfus_realm_core::Realm;
        let mut realm = Realm2DContext::new(1);
        realm
            .set_camera(
                1,
                galfus_realm_2d_resources::camera::Camera2D::new(10., 0),
                Transform2D::from_translation(Vec2::new(5., 3.)),
            )
            .unwrap();
        let point = realm
            .viewport_point_2d(None, Vec2::new(75., 50.), Vec2::splat(100.))
            .unwrap();
        assert!((point - Vec2::new(7.5, 3.)).length() < 1e-5);
        assert!(
            realm
                .viewport_point_2d(Some(2), Vec2::ZERO, Vec2::splat(100.))
                .is_none()
        );
    }

    #[test]
    fn spatial_and_visual_transforms_stay_in_sync() {
        let mut realm = Realm2DContext::new(1);
        realm
            .set_model_transform_2d(10, Transform2D::default())
            .unwrap();
        realm
            .set_sprite(
                10,
                Default::default(),
                Transform2D::from_translation(Vec2::X),
            )
            .unwrap();
        realm
            .set_model_transform_2d(10, Transform2D::from_translation(Vec2::Y))
            .unwrap();
        assert_eq!(realm.get_sprite_transform(10).unwrap().position, Vec2::Y);
        realm.set_sprite_transform(10, Transform2D::from_translation(Vec2::splat(2.0)));
        assert_eq!(realm.model_transforms[&10].position, Vec2::splat(2.0));
    }

    #[test]
    fn a_model_supports_zero_and_multiple_independent_colliders() {
        let mut realm = Realm2DContext::new(1);
        realm
            .set_model_transform_2d(10, Transform2D::default())
            .unwrap();
        assert!(
            realm
                .query_colliders_point_2d(Vec2::ZERO, u32::MAX)
                .is_empty()
        );
        for id in [1, 2] {
            realm
                .create_collider_2d(Collider2D {
                    id,
                    model_id: 10,
                    shape: ColliderShape2D::Circle { radius: 1.0 },
                    offset: [0.0; 2],
                    local_matrix: None,
                    active: true,
                    sensor: false,
                    layer: 1,
                    mask: u32::MAX,
                })
                .unwrap();
        }
        assert_eq!(
            realm.query_colliders_point_2d(Vec2::ZERO, u32::MAX).len(),
            2
        );
        realm.destroy_collider_2d(1).unwrap();
        assert_eq!(
            realm.query_colliders_point_2d(Vec2::ZERO, u32::MAX)[0].collider_id,
            2
        );
        realm.destroy_spatial_model_2d(10).unwrap();
        assert!(realm.colliders.is_empty());
    }
}
