//! 2D Collider management and spatial picking hit-testing for `Realm2DContext`.

use galfus_realm_core::collision::{
    Collider2D, ColliderShape2D, HitResult2D, point_in_circle, point_in_rectangle,
};
use galfus_realm_core::error::RealmResult;
use glam::Vec2;

use crate::context::Realm2DContext;
use crate::types::Transform2D;

impl Realm2DContext {
    /// Registers or updates a 2D collider attached to a model.
    pub fn create_collider_2d(&mut self, collider: Collider2D) -> RealmResult<()> {
        self.validate_id(collider.id)?;
        self.validate_id(collider.model_id)?;
        self.colliders.insert(collider.id, collider);
        Ok(())
    }

    /// Removes an existing 2D collider.
    pub fn destroy_collider_2d(&mut self, id: u32) -> RealmResult<()> {
        self.colliders.remove(&id).map(|_| ()).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("Collider2D {id}"))
        })
    }

    /// Removes all 2D colliders attached to a logical model.
    pub fn destroy_colliders_by_model_2d(&mut self, model_id: u32) {
        self.colliders.retain(|_, c| c.model_id != model_id);
    }

    /// Explicitly updates or sets the world transform of a logical 2D model.
    pub fn set_model_transform_2d(&mut self, model_id: u32, transform: Transform2D) {
        self.model_transforms.insert(model_id, transform);
    }

    /// Internal picking logic evaluating world point against all registered 2D colliders.
    pub(crate) fn perform_pick_2d(
        &self,
        _camera_slot: Option<u32>,
        world_pos: Vec2,
    ) -> Option<HitResult2D> {
        let mut best_hit: Option<HitResult2D> = None;

        for collider in self.colliders.values() {
            // Resolve model transform
            let (model_pos, model_scale, z_layer) =
                if let Some(tf) = self.model_transforms.get(&collider.model_id) {
                    (tf.position, tf.scale, tf.z_layer as f32)
                } else if let Some((_, tf)) = self.sprites.get(&collider.model_id) {
                    (tf.position, tf.scale, tf.z_layer as f32)
                } else if let Some((_, tf)) = self.shapes.get(&collider.model_id) {
                    (tf.position, tf.scale, tf.z_layer as f32)
                } else if let Some(svg) = self.svg_manager.get(collider.model_id) {
                    (
                        svg.transform.position,
                        svg.transform.scale,
                        svg.transform.z_layer as f32,
                    )
                } else {
                    (Vec2::ZERO, Vec2::ONE, 0.0)
                };

            let center = model_pos + Vec2::from(collider.offset);

            let hit = match &collider.shape {
                ColliderShape2D::Rectangle { half_extents } => {
                    let scaled_half = Vec2::from(*half_extents) * model_scale.abs();
                    point_in_rectangle(world_pos, center, scaled_half)
                }
                ColliderShape2D::Circle { radius } => {
                    let scaled_r = *radius * model_scale.x.abs().max(model_scale.y.abs());
                    point_in_circle(world_pos, center, scaled_r)
                }
            };

            if let Some((normal, uv)) = hit {
                let candidate = HitResult2D {
                    model_id: collider.model_id,
                    collider_id: collider.id,
                    point: world_pos,
                    normal,
                    uv,
                    z_layer,
                };

                match &best_hit {
                    None => best_hit = Some(candidate),
                    Some(current) => {
                        if candidate.z_layer > current.z_layer {
                            best_hit = Some(candidate);
                        }
                    }
                }
            }
        }

        best_hit
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use galfus_realm_core::collision::ColliderShape2D;

    #[test]
    fn test_realm2d_collider_crud_and_picking() {
        let mut realm = Realm2DContext::new(1);
        realm.set_model_transform_2d(
            100,
            Transform2D {
                position: Vec2::new(50.0, 50.0),
                scale: Vec2::ONE,
                z_layer: 1,
                ..Default::default()
            },
        );

        let collider = Collider2D {
            id: 1,
            model_id: 100,
            shape: ColliderShape2D::Rectangle {
                half_extents: [20.0, 10.0],
            },
            offset: [0.0, 0.0],
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
}
