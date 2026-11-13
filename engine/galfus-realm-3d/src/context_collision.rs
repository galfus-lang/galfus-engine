//! 3D Collider management and raycast picking for `Realm3DContext`.

use crate::collision_geometry::{
    ray_intersects_box, ray_intersects_capsule, ray_intersects_cylinder, ray_intersects_sphere,
};
use galfus_realm_core::collision::{
    Collider3D, ColliderQueryHit3D, ColliderShape3D, HitResult3D, Ray3D,
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
        if !collider.is_valid() {
            return Err(galfus_realm_core::RealmError::Internal(
                "Invalid Collider3D geometry or transform".into(),
            ));
        }
        if !self.models.contains_key(&collider.model_id)
            && !self.model_transforms.contains_key(&collider.model_id)
        {
            return Err(galfus_realm_core::RealmError::ResourceNotFound(
                self.id,
                format!("Model3D {}", collider.model_id),
            ));
        }
        let scale = self
            .model_transforms
            .get(&collider.model_id)
            .map(|tf| [tf.scale.x, tf.scale.y, tf.scale.z])
            .or_else(|| {
                self.models
                    .get(&collider.model_id)
                    .map(|m| [m.1.scale.x, m.1.scale.y, m.1.scale.z])
            })
            .unwrap_or([1.0, 1.0, 1.0]);
        if let Some(physics) = self.physics.as_mut()
            && physics.has_rigid_body(collider.model_id)
        {
            physics.sync_collider(collider.model_id, &collider, None, scale);
        }
        self.colliders.insert(collider.id, collider);
        Ok(())
    }

    /// Removes an existing 3D collider.
    pub fn destroy_collider_3d(&mut self, id: u32) -> RealmResult<()> {
        validate_id(id)?;
        if let Some(physics) = self.physics.as_mut() {
            physics.remove_collider(id);
        }
        self.colliders.remove(&id).map(|_| ()).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("Collider3D {id}"))
        })
    }

    /// Removes all 3D colliders attached to a logical model.
    pub fn destroy_colliders_by_model_3d(&mut self, model_id: u32) {
        if let Some(physics) = self.physics.as_mut() {
            for collider in self.colliders.values().filter(|c| c.model_id == model_id) {
                physics.remove_collider(collider.id);
            }
        }
        self.colliders.retain(|_, c| c.model_id != model_id);
    }

    /// Registers or updates a model transform independent of rendering.
    pub fn set_spatial_model_transform_3d(
        &mut self,
        model_id: u32,
        transform: galfus_realm_3d_resources::transform::Transform3D,
    ) -> RealmResult<()> {
        validate_id(model_id)?;
        if !transform.position.is_finite()
            || !transform.rotation.is_finite()
            || !transform.scale.is_finite()
            || !transform.rotation.is_normalized()
        {
            return Err(galfus_realm_core::RealmError::Internal(
                "Invalid Model3D transform".into(),
            ));
        }
        self.model_transforms.insert(model_id, transform);
        if let Some(model) = self.models.get_mut(&model_id) {
            model.1 = transform;
        }
        self.dirty = true;
        Ok(())
    }

    /// Removes a spatial-only model and its colliders.
    pub fn destroy_spatial_model_3d(&mut self, model_id: u32) -> RealmResult<()> {
        validate_id(model_id)?;
        self.model_transforms.remove(&model_id).ok_or_else(|| {
            galfus_realm_core::RealmError::ResourceNotFound(self.id, format!("Model3D {model_id}"))
        })?;
        self.destroy_colliders_by_model_3d(model_id);
        Ok(())
    }

    /// Evaluates a 3D raycast picking hit test against all registered colliders.
    pub(crate) fn perform_pick_3d(
        &self,
        _camera_slot: Option<u32>,
        ray: Ray3D,
    ) -> Option<HitResult3D> {
        self.raycast_colliders_3d(ray, f32::INFINITY, u32::MAX)
            .into_iter()
            .next()
    }

    /// Raycasts all active colliders and orders hits by world-space distance.
    pub fn raycast_colliders_3d(
        &self,
        ray: Ray3D,
        max_distance: f32,
        mask: u32,
    ) -> Vec<HitResult3D> {
        let mut hits = Vec::new();
        if !ray.origin.is_finite()
            || !ray.direction.is_finite()
            || ray.direction.length_squared() < 1e-12
            || max_distance.is_nan()
            || max_distance < 0.0
        {
            return hits;
        }
        let ray = Ray3D::new(ray.origin, ray.direction);

        for collider in self.colliders.values() {
            if !collider.active || collider.layer & mask == 0 {
                continue;
            }
            let Some(transform) = self
                .model_transforms
                .get(&collider.model_id)
                .copied()
                .or_else(|| self.models.get(&collider.model_id).map(|entry| entry.1))
            else {
                continue;
            };
            let matrix = transform.to_mat4()
                * collider
                    .local_matrix
                    .map_or(glam::Mat4::IDENTITY, |m| glam::Mat4::from_cols_array(&m));
            let determinant = matrix.determinant();
            if !determinant.is_finite() || determinant == 0.0 {
                continue;
            }
            let inverse = matrix.inverse();
            let local_direction = inverse.transform_vector3(ray.direction);
            let direction_scale = local_direction.length();
            if !direction_scale.is_finite() || direction_scale == 0.0 {
                continue;
            }
            let local_ray = Ray3D::new(inverse.transform_point3(ray.origin), local_direction);
            let center = Vec3::from(collider.offset);

            let hit = match &collider.shape {
                ColliderShape3D::Box { half_extents } => {
                    let half = Vec3::from(*half_extents);
                    if (local_ray.origin - center).abs().cmple(half).all() {
                        Some((0.0, Vec3::ZERO))
                    } else {
                        ray_intersects_box(local_ray, center, half)
                    }
                }
                ColliderShape3D::Sphere { radius } => {
                    if (local_ray.origin - center).length_squared() <= radius * radius {
                        Some((0.0, Vec3::ZERO))
                    } else {
                        ray_intersects_sphere(local_ray, center, *radius)
                    }
                }
                ColliderShape3D::Cylinder {
                    radius,
                    half_height,
                } => ray_intersects_cylinder(
                    Ray3D {
                        origin: local_ray.origin - center,
                        direction: local_ray.direction,
                    },
                    *radius,
                    *half_height,
                ),
                ColliderShape3D::Capsule {
                    radius,
                    half_height,
                } => ray_intersects_capsule(
                    Ray3D {
                        origin: local_ray.origin - center,
                        direction: local_ray.direction,
                    },
                    *radius,
                    *half_height,
                ),
                ColliderShape3D::Rectangle { half_extents } => {
                    if local_ray.direction.z.abs() <= 1e-6 {
                        None
                    } else {
                        let t = (center.z - local_ray.origin.z) / local_ray.direction.z;
                        let p = local_ray.at(t) - center;
                        if t >= 0.0 && p.x.abs() <= half_extents[0] && p.y.abs() <= half_extents[1]
                        {
                            Some((
                                t,
                                if local_ray.direction.z < 0.0 {
                                    Vec3::Z
                                } else {
                                    Vec3::NEG_Z
                                },
                            ))
                        } else {
                            None
                        }
                    }
                }
                ColliderShape3D::Plane { normal, distance } => {
                    let n = Vec3::from(*normal);
                    let denom = n.dot(local_ray.direction);
                    if denom.abs() > 1e-6 {
                        let t = (center.dot(n) + distance - n.dot(local_ray.origin)) / denom;
                        if t >= 0.0 { Some((t, n)) } else { None }
                    } else {
                        None
                    }
                }
            };

            let hit = hit.map(|(distance, normal)| {
                (
                    distance / direction_scale,
                    inverse
                        .transpose()
                        .transform_vector3(normal)
                        .normalize_or_zero(),
                )
            });
            if let Some((dist, normal)) = hit
                && dist <= max_distance
            {
                let point = ray.at(dist);
                let local_point = inverse.transform_point3(point) - center;
                let uv = match &collider.shape {
                    ColliderShape3D::Rectangle { half_extents } => glam::Vec2::new(
                        local_point.x / (2.0 * half_extents[0]) + 0.5,
                        0.5 - local_point.y / (2.0 * half_extents[1]),
                    ),
                    ColliderShape3D::Box { half_extents } => {
                        let n = matrix.transpose().transform_vector3(normal).abs();
                        if n.x >= n.y && n.x >= n.z {
                            glam::Vec2::new(
                                local_point.z / (2.0 * half_extents[2]) + 0.5,
                                0.5 - local_point.y / (2.0 * half_extents[1]),
                            )
                        } else if n.y >= n.z {
                            glam::Vec2::new(
                                local_point.x / (2.0 * half_extents[0]) + 0.5,
                                0.5 - local_point.z / (2.0 * half_extents[2]),
                            )
                        } else {
                            glam::Vec2::new(
                                local_point.x / (2.0 * half_extents[0]) + 0.5,
                                0.5 - local_point.y / (2.0 * half_extents[1]),
                            )
                        }
                    }
                    _ => glam::Vec2::splat(0.5),
                };
                hits.push(HitResult3D {
                    model_id: collider.model_id,
                    collider_id: collider.id,
                    point,
                    normal,
                    distance: dist,
                    uv,
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

    /// Raycasts with sensor metadata for general collision queries.
    pub fn query_ray_3d(
        &self,
        ray: Ray3D,
        max_distance: f32,
        mask: u32,
    ) -> Vec<ColliderQueryHit3D> {
        self.raycast_colliders_3d(ray, max_distance, mask)
            .into_iter()
            .map(|hit| ColliderQueryHit3D {
                model_id: hit.model_id,
                collider_id: hit.collider_id,
                point: hit.point,
                normal: hit.normal,
                distance: hit.distance,
                sensor: self.colliders[&hit.collider_id].sensor,
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_realm3d_collider_crud_and_raycast() {
        let mut realm = Realm3DContext::new(1);
        realm
            .create_model(10, Default::default(), Default::default())
            .unwrap();
        let collider = Collider3D {
            id: 1,
            model_id: 10,
            shape: ColliderShape3D::Sphere { radius: 2.0 },
            offset: [0.0, 0.0, 0.0],
            local_matrix: None,
            active: true,
            sensor: false,
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

    #[test]
    fn raycast_respects_model_rotation_and_nonuniform_scale() {
        let mut realm = Realm3DContext::new(1);
        realm
            .create_model(
                10,
                Default::default(),
                galfus_realm_3d_resources::transform::Transform3D {
                    position: Vec3::new(5.0, 0.0, 0.0),
                    rotation: glam::Quat::from_rotation_z(std::f32::consts::FRAC_PI_2),
                    scale: Vec3::new(2.0, 1.0, 1.0),
                },
            )
            .unwrap();
        realm
            .create_collider_3d(Collider3D {
                id: 1,
                model_id: 10,
                shape: ColliderShape3D::Box {
                    half_extents: [1.0, 1.0, 1.0],
                },
                offset: [1.0, 0.0, 0.0],
                local_matrix: None,
                active: true,
                sensor: false,
                layer: 1,
                mask: u32::MAX,
            })
            .unwrap();
        let ray = Ray3D::new(Vec3::new(5.0, -5.0, 0.0), Vec3::Y);
        let hit = realm.perform_pick_3d(None, ray).unwrap();
        assert!((hit.distance - 5.0).abs() < 1e-4);
        assert!((hit.normal - Vec3::NEG_Y).length() < 1e-4);
        realm.destroy_model(10).unwrap();
        assert!(realm.perform_pick_3d(None, ray).is_none());
    }

    #[test]
    fn spatial_model_colliders_follow_transform_and_are_removed_with_model() {
        let mut realm = Realm3DContext::new(1);
        let collider = Collider3D {
            id: 1,
            model_id: 10,
            shape: ColliderShape3D::Sphere { radius: 1.0 },
            offset: [0.0; 3],
            local_matrix: None,
            active: true,
            sensor: false,
            layer: 1,
            mask: u32::MAX,
        };
        assert!(realm.create_collider_3d(collider.clone()).is_err());
        realm
            .set_spatial_model_transform_3d(
                10,
                galfus_realm_3d_resources::transform::Transform3D::from_position(Vec3::new(
                    0.0, 0.0, 4.0,
                )),
            )
            .unwrap();
        realm.create_collider_3d(collider).unwrap();
        let ray = Ray3D::new(Vec3::ZERO, Vec3::Z);
        assert!((realm.perform_pick_3d(None, ray).unwrap().distance - 3.0).abs() < 1e-5);
        realm.destroy_spatial_model_3d(10).unwrap();
        assert!(realm.colliders.is_empty());
        assert!(realm.perform_pick_3d(None, ray).is_none());
    }

    #[test]
    fn spatial_query_supports_shapes_filters_and_local_transforms() {
        let mut realm = Realm3DContext::new(1);
        realm
            .set_spatial_model_transform_3d(10, Default::default())
            .unwrap();
        let mut collider = Collider3D {
            id: 1,
            model_id: 10,
            shape: ColliderShape3D::Cylinder {
                radius: 1.0,
                half_height: 2.0,
            },
            offset: [0.0; 3],
            local_matrix: Some(glam::Mat4::from_translation(Vec3::new(0., 0., 4.)).to_cols_array()),
            active: true,
            sensor: true,
            layer: 4,
            mask: u32::MAX,
        };
        realm.create_collider_3d(collider.clone()).unwrap();
        let ray = Ray3D::new(Vec3::ZERO, Vec3::Z);
        assert!(realm.query_ray_3d(ray, 10., 2).is_empty());
        let hit = &realm.query_ray_3d(ray, 10., 4)[0];
        assert!((hit.distance - 3.).abs() < 1e-5 && hit.sensor);
        collider.shape = ColliderShape3D::Capsule {
            radius: 1.,
            half_height: 2.,
        };
        realm.create_collider_3d(collider.clone()).unwrap();
        assert!((realm.query_ray_3d(ray, 10., 4)[0].distance - 3.).abs() < 1e-5);
        collider.shape = ColliderShape3D::Rectangle {
            half_extents: [2., 2.],
        };
        realm.create_collider_3d(collider.clone()).unwrap();
        assert!((realm.query_ray_3d(ray, 10., 4)[0].distance - 4.).abs() < 1e-5);
        collider.active = false;
        realm.create_collider_3d(collider).unwrap();
        assert!(realm.query_ray_3d(ray, 10., 4).is_empty());
    }

    #[test]
    fn viewport_ray_uses_camera_and_clip_planes() {
        use galfus_realm_core::Realm;
        let mut realm = Realm3DContext::new(1);
        realm
            .create_camera(
                1,
                galfus_realm_3d_resources::camera::Camera3D::perspective(60., 1., 10., 0),
                Default::default(),
            )
            .unwrap();
        let (ray, max) = realm
            .viewport_ray_3d(None, glam::Vec2::splat(50.), glam::Vec2::splat(100.))
            .unwrap();
        assert!((ray.origin.z + 1.).abs() < 1e-4);
        assert!((ray.direction - Vec3::NEG_Z).length() < 1e-5);
        assert!((max - 9.).abs() < 1e-3);
    }

    #[test]
    fn spatial_and_visual_transforms_stay_in_sync() {
        use galfus_realm_3d_resources::transform::Transform3D;
        let mut realm = Realm3DContext::new(1);
        realm
            .set_spatial_model_transform_3d(10, Transform3D::default())
            .unwrap();
        realm
            .create_model(10, Default::default(), Transform3D::from_position(Vec3::X))
            .unwrap();
        realm
            .set_spatial_model_transform_3d(10, Transform3D::from_position(Vec3::Y))
            .unwrap();
        assert_eq!(realm.get_model_transform(10).unwrap().position, Vec3::Y);
        realm
            .set_model_transform(10, Transform3D::from_position(Vec3::Z))
            .unwrap();
        assert_eq!(realm.model_transforms[&10].position, Vec3::Z);
    }

    #[test]
    fn a_model_supports_zero_and_multiple_independent_colliders() {
        let mut realm = Realm3DContext::new(1);
        realm
            .set_spatial_model_transform_3d(10, Default::default())
            .unwrap();
        let ray = Ray3D::new(Vec3::new(0.0, 0.0, -5.0), Vec3::Z);
        assert!(realm.query_ray_3d(ray, 10.0, u32::MAX).is_empty());
        for id in [1, 2] {
            realm
                .create_collider_3d(Collider3D {
                    id,
                    model_id: 10,
                    shape: ColliderShape3D::Sphere { radius: 1.0 },
                    offset: [0.0; 3],
                    local_matrix: None,
                    active: true,
                    sensor: false,
                    layer: 1,
                    mask: u32::MAX,
                })
                .unwrap();
        }
        assert_eq!(realm.query_ray_3d(ray, 10.0, u32::MAX).len(), 2);
        realm.destroy_collider_3d(1).unwrap();
        assert_eq!(realm.query_ray_3d(ray, 10.0, u32::MAX)[0].collider_id, 2);
        realm.destroy_spatial_model_3d(10).unwrap();
        assert!(realm.colliders.is_empty());
    }
}
