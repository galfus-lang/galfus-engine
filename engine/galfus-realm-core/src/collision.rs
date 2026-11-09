//! Foundational collision geometries, raycasting, and hit testing contracts.

use glam::{Vec2, Vec3};
use serde::{Deserialize, Serialize};

/// 2D geometric shape definition for colliders.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ColliderShape2D {
    /// Axis-aligned rectangle defined by its half extents `(half_w, half_h)`.
    #[serde(rename_all = "camelCase")]
    Rectangle {
        /// Half dimensions along X and Y.
        half_extents: [f32; 2],
    },
    /// Circular boundary defined by its radius.
    #[serde(rename_all = "camelCase")]
    Circle {
        /// Radius of the circle.
        radius: f32,
    },
}

/// 3D geometric shape definition for colliders.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ColliderShape3D {
    /// Axis-aligned box defined by its half extents `(half_x, half_y, half_z)`.
    #[serde(rename_all = "camelCase")]
    Box {
        /// Half dimensions along X, Y, and Z.
        half_extents: [f32; 3],
    },
    /// Spherical boundary defined by its radius.
    #[serde(rename_all = "camelCase")]
    Sphere {
        /// Radius of the sphere.
        radius: f32,
    },
    /// Planar boundary defined by normal and distance.
    #[serde(rename_all = "camelCase")]
    Plane {
        /// Normal vector of the plane.
        normal: [f32; 3],
        /// Distance from origin along the normal.
        distance: f32,
    },
}

/// 2D collision component attached to a logical model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collider2D {
    /// Logical identifier of the collider.
    pub id: u32,
    /// Identifier of the model this collider belongs to.
    pub model_id: u32,
    /// Geometric shape of the collider.
    pub shape: ColliderShape2D,
    /// Local offset relative to model position.
    #[serde(default)]
    pub offset: [f32; 2],
    /// Collision layer bitmask.
    #[serde(default = "default_layer")]
    pub layer: u32,
    /// Collision target mask.
    #[serde(default = "default_mask")]
    pub mask: u32,
}

/// 3D collision component attached to a logical model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collider3D {
    /// Logical identifier of the collider.
    pub id: u32,
    /// Identifier of the model this collider belongs to.
    pub model_id: u32,
    /// Geometric shape of the collider.
    pub shape: ColliderShape3D,
    /// Local offset relative to model position.
    #[serde(default)]
    pub offset: [f32; 3],
    /// Collision layer bitmask.
    #[serde(default = "default_layer")]
    pub layer: u32,
    /// Collision target mask.
    #[serde(default = "default_mask")]
    pub mask: u32,
}

const fn default_layer() -> u32 {
    1
}

const fn default_mask() -> u32 {
    u32::MAX
}

/// Normalized 3D ray for raycasting and picking.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ray3D {
    /// Starting origin of the ray.
    pub origin: Vec3,
    /// Normalized direction of the ray.
    pub direction: Vec3,
}

impl Ray3D {
    /// Creates a new ray with normalized direction.
    #[inline]
    pub fn new(origin: Vec3, direction: Vec3) -> Self {
        Self {
            origin,
            direction: direction.normalize_or_zero(),
        }
    }

    /// Evaluates a point along the ray at parameter `t`.
    #[inline]
    pub fn at(self, t: f32) -> Vec3 {
        self.origin + self.direction * t
    }
}

/// Result of a successful 2D hit test.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HitResult2D {
    /// Identifier of the hit model.
    pub model_id: u32,
    /// Identifier of the hit collider.
    pub collider_id: u32,
    /// World position of the hit.
    pub point: Vec2,
    /// Surface normal vector at the hit point.
    pub normal: Vec2,
    /// Normalized UV coordinates within the shape `[0..1, 0..1]`.
    pub uv: Vec2,
    /// Z-layer for sorting (higher = closer to camera).
    pub z_layer: f32,
}

/// Result of a successful 3D hit test.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HitResult3D {
    /// Identifier of the hit model.
    pub model_id: u32,
    /// Identifier of the hit collider.
    pub collider_id: u32,
    /// World position of the hit point.
    pub point: Vec3,
    /// Surface normal vector at the hit point.
    pub normal: Vec3,
    /// Distance from ray origin to the hit point.
    pub distance: f32,
    /// Normalized UV coordinates on the hit surface.
    pub uv: Vec2,
}

/// Tests if a point is inside a 2D axis-aligned rectangle.
///
/// Returns `Some((normal, uv))` if inside, where normal is toward closest edge.
pub fn point_in_rectangle(point: Vec2, center: Vec2, half_extents: Vec2) -> Option<(Vec2, Vec2)> {
    let diff = point - center;
    if diff.x.abs() <= half_extents.x && diff.y.abs() <= half_extents.y {
        let uv = Vec2::new(
            (diff.x / (half_extents.x * 2.0) + 0.5).clamp(0.0, 1.0),
            (diff.y / (half_extents.y * 2.0) + 0.5).clamp(0.0, 1.0),
        );
        let normal = if (half_extents.x - diff.x.abs()) < (half_extents.y - diff.y.abs()) {
            Vec2::new(diff.x.signum(), 0.0)
        } else {
            Vec2::new(0.0, diff.y.signum())
        };
        Some((normal, uv))
    } else {
        None
    }
}

/// Tests if a point is inside a 2D circle.
pub fn point_in_circle(point: Vec2, center: Vec2, radius: f32) -> Option<(Vec2, Vec2)> {
    let diff = point - center;
    let dist_sq = diff.length_squared();
    if dist_sq <= radius * radius {
        let dist = dist_sq.sqrt();
        let normal = if dist > 1e-6 { diff / dist } else { Vec2::Y };
        let uv = Vec2::new(
            (diff.x / (radius * 2.0) + 0.5).clamp(0.0, 1.0),
            (diff.y / (radius * 2.0) + 0.5).clamp(0.0, 1.0),
        );
        Some((normal, uv))
    } else {
        None
    }
}

/// Intersects a 3D ray with an axis-aligned box (AABB).
///
/// Returns `Some((distance, normal))` if hit.
pub fn ray_intersects_box(ray: Ray3D, center: Vec3, half_extents: Vec3) -> Option<(f32, Vec3)> {
    let min = center - half_extents;
    let max = center + half_extents;

    let inv_d = Vec3::new(
        if ray.direction.x.abs() > 1e-8 {
            1.0 / ray.direction.x
        } else {
            f32::INFINITY
        },
        if ray.direction.y.abs() > 1e-8 {
            1.0 / ray.direction.y
        } else {
            f32::INFINITY
        },
        if ray.direction.z.abs() > 1e-8 {
            1.0 / ray.direction.z
        } else {
            f32::INFINITY
        },
    );

    let t1 = (min - ray.origin) * inv_d;
    let t2 = (max - ray.origin) * inv_d;

    let tmin_v = t1.min(t2);
    let tmax_v = t1.max(t2);

    let t_enter = tmin_v.x.max(tmin_v.y).max(tmin_v.z);
    let t_exit = tmax_v.x.min(tmax_v.y).min(tmax_v.z);

    if t_exit >= t_enter.max(0.0) {
        let t = if t_enter >= 0.0 { t_enter } else { t_exit };
        if t < 0.0 {
            return None;
        }
        let hit_pt = ray.at(t) - center;
        let d = hit_pt.abs() / half_extents;
        let normal = if d.x >= d.y && d.x >= d.z {
            Vec3::new(hit_pt.x.signum(), 0.0, 0.0)
        } else if d.y >= d.x && d.y >= d.z {
            Vec3::new(0.0, hit_pt.y.signum(), 0.0)
        } else {
            Vec3::new(0.0, 0.0, hit_pt.z.signum())
        };
        Some((t, normal))
    } else {
        None
    }
}

/// Intersects a 3D ray with a sphere.
pub fn ray_intersects_sphere(ray: Ray3D, center: Vec3, radius: f32) -> Option<(f32, Vec3)> {
    let oc = ray.origin - center;
    let b = oc.dot(ray.direction);
    let c = oc.length_squared() - radius * radius;
    let discriminant = b * b - c;
    if discriminant < 0.0 {
        return None;
    }
    let sqrt_d = discriminant.sqrt();
    let t0 = -b - sqrt_d;
    let t1 = -b + sqrt_d;
    let t = if t0 >= 0.0 {
        t0
    } else if t1 >= 0.0 {
        t1
    } else {
        return None;
    };
    let normal = (ray.at(t) - center) / radius;
    Some((t, normal))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_point_in_rectangle() {
        let center = Vec2::new(10.0, 20.0);
        let half = Vec2::new(5.0, 10.0);

        assert!(point_in_rectangle(Vec2::new(10.0, 20.0), center, half).is_some());
        assert!(point_in_rectangle(Vec2::new(14.9, 29.9), center, half).is_some());
        assert!(point_in_rectangle(Vec2::new(16.0, 20.0), center, half).is_none());
    }

    #[test]
    fn test_point_in_circle() {
        let center = Vec2::new(0.0, 0.0);
        let radius = 10.0;

        assert!(point_in_circle(Vec2::new(0.0, 0.0), center, radius).is_some());
        assert!(point_in_circle(Vec2::new(6.0, 8.0), center, radius).is_some());
        assert!(point_in_circle(Vec2::new(8.0, 8.0), center, radius).is_none());
    }

    #[test]
    fn test_ray_intersects_box() {
        let ray = Ray3D::new(Vec3::new(0.0, 0.0, -10.0), Vec3::new(0.0, 0.0, 1.0));
        let center = Vec3::ZERO;
        let half = Vec3::splat(2.0);

        let hit = ray_intersects_box(ray, center, half);
        assert!(hit.is_some());
        let (dist, normal) = hit.unwrap();
        assert!((dist - 8.0).abs() < 1e-4);
        assert_eq!(normal, Vec3::new(0.0, 0.0, -1.0));
    }

    #[test]
    fn test_ray_intersects_sphere() {
        let ray = Ray3D::new(Vec3::new(0.0, 0.0, -10.0), Vec3::new(0.0, 0.0, 1.0));
        let center = Vec3::ZERO;
        let radius = 3.0;

        let hit = ray_intersects_sphere(ray, center, radius);
        assert!(hit.is_some());
        let (dist, normal) = hit.unwrap();
        assert!((dist - 7.0).abs() < 1e-4);
        assert_eq!(normal, Vec3::new(0.0, 0.0, -1.0));
    }
}
