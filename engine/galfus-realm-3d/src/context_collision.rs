//! 3D Collider management and raycast picking for `Realm3DContext`.

use galfus_realm_core::collision::{
    Collider3D, ColliderShape3D, HitResult3D, Ray3D, ray_intersects_box, ray_intersects_sphere,
};
use galfus_realm_core::error::RealmResult;
use glam::Vec3;

use crate::context::Realm3DContext;
use crate::types::validate_id;

impl Realm3DContext {
    /// Registers or updates a 3D collider attached to a model.
    pub fn create_collider_3d(&mut self, collider: Collider3D) -> RealmResult<()> {
        validate_id(collider.id)?;
        validate_id(collider.model_id)?;
        self.colliders.insert(collider.id, collider);
        Ok(())
    }

    /// Removes an existing 3D collider.
    pub fn destroy_collider_3d(&mut self, id: u32) -> RealmResult<()> {
        validate_id(id)?;
        self.colliders.remove(&id).map(|_| ()).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("Collider3D {id}"))
        })
    }

    /// Removes all 3D colliders attached to a logical model.
    pub fn destroy_colliders_by_model_3d(&mut self, model_id: u32) {
        self.colliders.retain(|_, c| c.model_id != model_id);
    }

    /// Evaluates a 3D raycast picking hit test against all registered colliders.
    pub(crate) fn perform_pick_3d(
        &self,
        _camera_slot: Option<u32>,
        ray: Ray3D,
    ) -> Option<HitResult3D> {
        let mut best_hit: Option<HitResult3D> = None;
        let mut closest_distance = f32::INFINITY;

        for collider in self.colliders.values() {
            let (model_pos, model_scale) =
                if let Some(model_entry) = self.models.get(&collider.model_id) {
                    (model_entry.1.position, model_entry.1.scale)
                } else {
                    (Vec3::ZERO, Vec3::ONE)
                };

            let center = model_pos + Vec3::from(collider.offset);

            let hit = match &collider.shape {
                ColliderShape3D::Box { half_extents } => {
                    let scaled_half = Vec3::from(*half_extents) * model_scale.abs();
                    ray_intersects_box(ray, center, scaled_half)
                }
                ColliderShape3D::Sphere { radius } => {
                    let scaled_r = *radius * model_scale.abs().max_element();
                    ray_intersects_sphere(ray, center, scaled_r)
                }
                ColliderShape3D::Plane { normal, distance } => {
                    let n = Vec3::from(*normal);
                    let denom = n.dot(ray.direction);
                    if denom.abs() > 1e-6 {
                        let t = (center.dot(n) + distance - n.dot(ray.origin)) / denom;
                        if t >= 0.0 { Some((t, n)) } else { None }
                    } else {
                        None
                    }
                }
            };

            if let Some((dist, normal)) = hit
                && dist < closest_distance
            {
                closest_distance = dist;
                let point = ray.at(dist);
                best_hit = Some(HitResult3D {
                    model_id: collider.model_id,
                    collider_id: collider.id,
                    point,
                    normal,
                    distance: dist,
                    uv: glam::Vec2::new(0.5, 0.5),
                });
            }
        }

        best_hit
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_realm3d_collider_crud_and_raycast() {
        let mut realm = Realm3DContext::new(1);
        let collider = Collider3D {
            id: 1,
            model_id: 10,
            shape: ColliderShape3D::Sphere { radius: 2.0 },
            offset: [0.0, 0.0, 0.0],
            layer: 1,
            mask: u32::MAX,
        };

        assert!(realm.create_collider_3d(collider).is_ok());

        // Hit
        let ray = Ray3D::new(Vec3::new(0.0, 0.0, -10.0), Vec3::new(0.0, 0.0, 1.0));
        let hit = realm.perform_pick_3d(None, ray);
        assert!(hit.is_some());
        let h = hit.unwrap();
        assert_eq!(h.model_id, 10);
        assert_eq!(h.collider_id, 1);
        assert!((h.distance - 8.0).abs() < 1e-4);

        // Destroy
        assert!(realm.destroy_collider_3d(1).is_ok());
        assert!(realm.perform_pick_3d(None, ray).is_none());
    }
}
