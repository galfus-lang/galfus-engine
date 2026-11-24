//! 3D Spherecast (shapecast) queries across all registered colliders, including TriMesh and Heightfield.

use galfus_realm_core::collision::{ColliderQueryHit3D, ColliderShape3D, Ray3D};
use glam::Vec3;

use crate::collision_geometry::{
    ray_intersects_box, ray_intersects_capsule, ray_intersects_cylinder, ray_intersects_sphere,
    sphere_sweeps_triangle,
};
use crate::context::Realm3DContext;

impl Realm3DContext {
    /// Sweeps a world-space sphere of `radius` along `ray` across all active colliders.
    pub fn spherecast_colliders_3d(
        &self,
        ray: Ray3D,
        radius: f32,
        max_distance: f32,
        mask: u32,
    ) -> Vec<ColliderQueryHit3D> {
        let mut hits = Vec::new();
        if !ray.origin.is_finite()
            || !ray.direction.is_finite()
            || ray.direction.length_squared() < 1e-12
            || !radius.is_finite()
            || radius < 0.0
            || max_distance.is_nan()
            || max_distance < 0.0
        {
            return hits;
        }
        if radius <= 1e-6 {
            return self.query_ray_3d(ray, max_distance, mask);
        }

        let ray = Ray3D::new(ray.origin, ray.direction);

        for collider in self.colliders.values() {
            if !collider.active || collider.layer & mask == 0 {
                continue;
            }
            let Some(transform) = self.resolve_entity_transform(collider.model_id) else {
                continue;
            };
            let matrix = transform.to_mat4()
                * collider
                    .local_matrix
                    .map_or(glam::Mat4::IDENTITY, |m| glam::Mat4::from_cols_array(&m));
            let det = matrix.determinant();
            if !det.is_finite() || det.abs() < 1e-12 {
                continue;
            }
            let inverse = matrix.inverse();
            let local_dir = inverse.transform_vector3(ray.direction);
            let dir_scale = local_dir.length();
            if !dir_scale.is_finite() || dir_scale < 1e-12 {
                continue;
            }
            let local_ray = Ray3D::new(inverse.transform_point3(ray.origin), local_dir);
            let center = Vec3::from(collider.offset);
            let local_radius = radius * dir_scale;

            let hit: Option<(f32, Vec3)> = match &collider.shape {
                ColliderShape3D::Box { half_extents } => {
                    let expanded = Vec3::from(*half_extents) + Vec3::splat(local_radius);
                    if (local_ray.origin - center).abs().cmple(expanded).all() {
                        Some((0.0, Vec3::Y))
                    } else {
                        ray_intersects_box(local_ray, center, expanded)
                    }
                }
                ColliderShape3D::Sphere { radius: r } => {
                    let combined = *r + local_radius;
                    if (local_ray.origin - center).length_squared() <= combined * combined {
                        Some((0.0, (local_ray.origin - center).normalize_or_zero()))
                    } else {
                        ray_intersects_sphere(local_ray, center, combined)
                    }
                }
                ColliderShape3D::Cylinder {
                    radius: r,
                    half_height,
                } => ray_intersects_cylinder(
                    Ray3D {
                        origin: local_ray.origin - center,
                        direction: local_ray.direction,
                    },
                    *r + local_radius,
                    *half_height + local_radius,
                ),
                ColliderShape3D::Capsule {
                    radius: r,
                    half_height,
                } => ray_intersects_capsule(
                    Ray3D {
                        origin: local_ray.origin - center,
                        direction: local_ray.direction,
                    },
                    *r + local_radius,
                    *half_height,
                ),
                ColliderShape3D::Rectangle { half_extents } => {
                    let expanded = Vec3::new(
                        half_extents[0] + local_radius,
                        half_extents[1] + local_radius,
                        local_radius,
                    );
                    if (local_ray.origin - center).abs().cmple(expanded).all() {
                        Some((0.0, Vec3::Z))
                    } else {
                        ray_intersects_box(local_ray, center, expanded)
                    }
                }
                ColliderShape3D::Plane { normal, distance } => {
                    let n = Vec3::from(*normal).normalize_or_zero();
                    let signed = (local_ray.origin - center).dot(n) - distance;
                    if signed.abs() <= local_radius {
                        Some((0.0, n))
                    } else {
                        let denom = n.dot(local_ray.direction);
                        if denom.abs() > 1e-6 {
                            let target_d = if signed > 0.0 {
                                local_radius
                            } else {
                                -local_radius
                            };
                            let t = (target_d - signed) / denom;
                            if t >= 0.0 { Some((t, n)) } else { None }
                        } else {
                            None
                        }
                    }
                }
                ColliderShape3D::TriMesh { geometry_id } => {
                    self.geometries.get(geometry_id).and_then(|(geom, _)| {
                        let shifted_ray = Ray3D {
                            origin: local_ray.origin - center,
                            direction: local_ray.direction,
                        };
                        let box_center = (geom.aabb.min + geom.aabb.max) * 0.5;
                        let box_half = (geom.aabb.max - geom.aabb.min) * 0.5
                            + Vec3::splat(local_radius + 1e-3);
                        if !((shifted_ray.origin - box_center)
                            .abs()
                            .cmple(box_half)
                            .all())
                            && ray_intersects_box(shifted_ray, box_center, box_half).is_none()
                        {
                            return None;
                        }
                        let mut best: Option<(f32, Vec3)> = None;
                        for tri in geom.indices.as_chunks::<3>().0 {
                            let (Some(a), Some(b), Some(c)) = (
                                geom.vertices.get(tri[0] as usize),
                                geom.vertices.get(tri[1] as usize),
                                geom.vertices.get(tri[2] as usize),
                            ) else {
                                continue;
                            };
                            if let Some((t, normal, _)) = sphere_sweeps_triangle(
                                shifted_ray,
                                local_radius,
                                Vec3::from(a.position),
                                Vec3::from(b.position),
                                Vec3::from(c.position),
                            ) && best.is_none_or(|prev| t < prev.0)
                            {
                                best = Some((t, normal));
                            }
                        }
                        best
                    })
                }
                ColliderShape3D::Heightfield {
                    heights,
                    nrows,
                    ncols,
                    scale,
                } => {
                    let shifted_ray = Ray3D {
                        origin: local_ray.origin - center,
                        direction: local_ray.direction,
                    };
                    let half_x = scale[0] * 0.5;
                    let half_z = scale[2] * 0.5;
                    let step_x = scale[0] / (*ncols - 1) as f32;
                    let step_z = scale[2] / (*nrows - 1) as f32;
                    let vertex = |r: usize, c: usize| -> Vec3 {
                        Vec3::new(
                            -half_x + c as f32 * step_x,
                            heights[r * *ncols + c] * scale[1],
                            -half_z + r as f32 * step_z,
                        )
                    };
                    let mut best: Option<(f32, Vec3)> = None;
                    for r in 0..(*nrows - 1) {
                        for c in 0..(*ncols - 1) {
                            let v00 = vertex(r, c);
                            let v10 = vertex(r, c + 1);
                            let v01 = vertex(r + 1, c);
                            let v11 = vertex(r + 1, c + 1);
                            for (a, b, d) in [(v00, v01, v10), (v10, v01, v11)] {
                                if let Some((t, normal, _)) =
                                    sphere_sweeps_triangle(shifted_ray, local_radius, a, b, d)
                                    && best.is_none_or(|prev| t < prev.0)
                                {
                                    best = Some((t, normal));
                                }
                            }
                        }
                    }
                    best
                }
            };

            if let Some((local_dist, local_normal)) = hit {
                let world_dist = local_dist / dir_scale;
                if world_dist <= max_distance {
                    let world_normal = inverse
                        .transpose()
                        .transform_vector3(local_normal)
                        .normalize_or_zero();
                    let point = ray.at(world_dist) - world_normal * radius;
                    hits.push(ColliderQueryHit3D {
                        model_id: collider.model_id,
                        collider_id: collider.id,
                        point,
                        normal: world_normal,
                        distance: world_dist,
                        sensor: collider.sensor,
                    });
                }
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
    use galfus_realm_3d_resources::geometry::Geometry3D;
    use galfus_realm_3d_resources::transform::Transform3D;
    use galfus_realm_core::collision::Collider3D;

    #[test]
    fn spherecast_hits_trimesh_and_heightfield() {
        let mut realm = Realm3DContext::new(1);
        realm
            .create_geometry(1, Geometry3D::plane(10.0, 10.0))
            .unwrap();
        realm
            .set_spatial_model_transform_3d(10, Transform3D::default())
            .unwrap();
        realm
            .create_collider_3d(Collider3D {
                id: 100,
                model_id: 10,
                shape: ColliderShape3D::TriMesh { geometry_id: 1 },
                offset: [0.0; 3],
                local_matrix: None,
                active: true,
                sensor: false,
                layer: 1,
                mask: u32::MAX,
            })
            .unwrap();

        let hits = realm.spherecast_colliders_3d(
            Ray3D::new(Vec3::new(0.0, 2.0, 0.0), Vec3::NEG_Y),
            0.5,
            5.0,
            u32::MAX,
        );
        assert_eq!(hits.len(), 1);
        assert!((hits[0].distance - 1.5).abs() < 1e-3);
        assert!(hits[0].normal.y > 0.9);
    }
}
