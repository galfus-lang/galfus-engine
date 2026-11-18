//! 3D collider geometry queries.

use galfus_core::collision::Ray3D;
use glam::Vec3;

/// Intersects a 3D ray with an axis-aligned box (AABB).
///
/// Returns `Some((distance, normal))` if hit.
pub fn ray_intersects_box(ray: Ray3D, center: Vec3, half_extents: Vec3) -> Option<(f32, Vec3)> {
    let min = center - half_extents;
    let max = center + half_extents;

    let mut t_enter = f32::NEG_INFINITY;
    let mut t_exit = f32::INFINITY;
    for axis in 0..3 {
        let direction = ray.direction[axis];
        if direction.abs() <= 1e-8 {
            if ray.origin[axis] < min[axis] || ray.origin[axis] > max[axis] {
                return None;
            }
            continue;
        }
        let a = (min[axis] - ray.origin[axis]) / direction;
        let b = (max[axis] - ray.origin[axis]) / direction;
        t_enter = t_enter.max(a.min(b));
        t_exit = t_exit.min(a.max(b));
    }

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

/// Intersects a local-space ray with a closed Y-aligned cylinder.
pub fn ray_intersects_cylinder(ray: Ray3D, radius: f32, half_height: f32) -> Option<(f32, Vec3)> {
    if ray.origin.x * ray.origin.x + ray.origin.z * ray.origin.z <= radius * radius
        && ray.origin.y.abs() <= half_height
    {
        return Some((0.0, Vec3::ZERO));
    }
    let mut best: Option<(f32, Vec3)> = None;
    let a = ray.direction.x * ray.direction.x + ray.direction.z * ray.direction.z;
    let b = ray.origin.x * ray.direction.x + ray.origin.z * ray.direction.z;
    let c = ray.origin.x * ray.origin.x + ray.origin.z * ray.origin.z - radius * radius;
    let disc = b * b - a * c;
    if a > 1e-12 && disc >= 0.0 {
        for t in [(-b - disc.sqrt()) / a, (-b + disc.sqrt()) / a] {
            let p = ray.at(t);
            if t >= 0.0 && p.y.abs() <= half_height && best.is_none_or(|v| t < v.0) {
                best = Some((t, Vec3::new(p.x, 0.0, p.z).normalize_or_zero()));
            }
        }
    }
    if ray.direction.y.abs() > 1e-12 {
        for sign in [-1.0, 1.0] {
            let t = (half_height * sign - ray.origin.y) / ray.direction.y;
            let p = ray.at(t);
            if t >= 0.0 && p.x * p.x + p.z * p.z <= radius * radius && best.is_none_or(|v| t < v.0)
            {
                best = Some((t, Vec3::Y * sign));
            }
        }
    }
    best
}

/// Intersects a local-space ray with a Y-aligned capsule.
pub fn ray_intersects_capsule(ray: Ray3D, radius: f32, half_height: f32) -> Option<(f32, Vec3)> {
    let closest = Vec3::new(0.0, ray.origin.y.clamp(-half_height, half_height), 0.0);
    if (ray.origin - closest).length_squared() <= radius * radius {
        return Some((0.0, Vec3::ZERO));
    }
    let mut best =
        ray_intersects_cylinder(ray, radius, half_height).filter(|(_, normal)| normal.y == 0.0);
    for sign in [-1.0, 1.0] {
        if let Some((t, normal)) =
            ray_intersects_sphere(ray, Vec3::Y * (sign * half_height), radius)
            && ray.at(t).y * sign >= half_height
            && best.is_none_or(|v| t < v.0)
        {
            best = Some((t, normal));
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

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
