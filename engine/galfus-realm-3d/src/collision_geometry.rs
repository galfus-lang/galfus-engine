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

/// Möller–Trumbore ray-triangle intersection (double-sided).
pub fn ray_intersects_triangle(ray: Ray3D, v0: Vec3, v1: Vec3, v2: Vec3) -> Option<(f32, Vec3)> {
    let e1 = v1 - v0;
    let e2 = v2 - v0;
    let pvec = ray.direction.cross(e2);
    let det = e1.dot(pvec);
    if det.abs() < 1e-8 {
        return None;
    }
    let inv_det = 1.0 / det;
    let tvec = ray.origin - v0;
    let u = tvec.dot(pvec) * inv_det;
    if !(0.0..=1.0).contains(&u) {
        return None;
    }
    let qvec = tvec.cross(e1);
    let v = ray.direction.dot(qvec) * inv_det;
    if v < 0.0 || u + v > 1.0 {
        return None;
    }
    let t = e2.dot(qvec) * inv_det;
    if t < 0.0 {
        return None;
    }
    let mut normal = e1.cross(e2).normalize_or_zero();
    if normal.dot(ray.direction) > 0.0 {
        normal = -normal;
    }
    Some((t, normal))
}

/// Intersects a local-space ray with an indexed triangle mesh.
pub fn ray_intersects_trimesh(
    ray: Ray3D,
    vertices: &[[f32; 3]],
    indices: &[u32],
    aabb_min: Vec3,
    aabb_max: Vec3,
) -> Option<(f32, Vec3)> {
    let center = (aabb_min + aabb_max) * 0.5;
    let half = (aabb_max - aabb_min) * 0.5 + Vec3::splat(1e-4);
    if !((ray.origin - center).abs().cmple(half).all())
        && ray_intersects_box(ray, center, half).is_none()
    {
        return None;
    }

    let mut best: Option<(f32, Vec3)> = None;
    for tri in indices.as_chunks::<3>().0 {
        let (Some(&a), Some(&b), Some(&c)) = (
            vertices.get(tri[0] as usize),
            vertices.get(tri[1] as usize),
            vertices.get(tri[2] as usize),
        ) else {
            continue;
        };
        if let Some((t, normal)) =
            ray_intersects_triangle(ray, Vec3::from(a), Vec3::from(b), Vec3::from(c))
            && best.is_none_or(|b| t < b.0)
        {
            best = Some((t, normal));
        }
    }
    best
}

/// Intersects a local-space ray with a regular centered heightfield grid.
pub fn ray_intersects_heightfield(
    ray: Ray3D,
    heights: &[f32],
    nrows: usize,
    ncols: usize,
    scale: [f32; 3],
) -> Option<(f32, Vec3)> {
    if nrows < 2 || ncols < 2 || heights.len() != nrows * ncols {
        return None;
    }
    let (mut min_y, mut max_y) = (f32::INFINITY, f32::NEG_INFINITY);
    for &h in heights {
        let y = h * scale[1];
        min_y = min_y.min(y);
        max_y = max_y.max(y);
    }
    let half_x = scale[0] * 0.5;
    let half_z = scale[2] * 0.5;
    let center = Vec3::new(0.0, (min_y + max_y) * 0.5, 0.0);
    let half = Vec3::new(half_x, (max_y - min_y) * 0.5 + 1e-3, half_z);
    if !((ray.origin - center).abs().cmple(half).all())
        && ray_intersects_box(ray, center, half).is_none()
    {
        return None;
    }

    let step_x = scale[0] / (ncols - 1) as f32;
    let step_z = scale[2] / (nrows - 1) as f32;
    let vertex = |r: usize, c: usize| -> Vec3 {
        Vec3::new(
            -half_x + c as f32 * step_x,
            heights[r * ncols + c] * scale[1],
            -half_z + r as f32 * step_z,
        )
    };

    let mut best: Option<(f32, Vec3)> = None;
    for r in 0..nrows - 1 {
        for c in 0..ncols - 1 {
            let v00 = vertex(r, c);
            let v10 = vertex(r, c + 1);
            let v01 = vertex(r + 1, c);
            let v11 = vertex(r + 1, c + 1);
            for (a, b, d) in [(v00, v01, v10), (v10, v01, v11)] {
                if let Some((t, normal)) = ray_intersects_triangle(ray, a, b, d)
                    && best.is_none_or(|hit| t < hit.0)
                {
                    best = Some((t, normal));
                }
            }
        }
    }
    best
}

/// Closest point on a triangle to an arbitrary 3D point.
pub fn closest_point_on_triangle(p: Vec3, a: Vec3, b: Vec3, c: Vec3) -> Vec3 {
    let ab = b - a;
    let ac = c - a;
    let ap = p - a;
    let d1 = ab.dot(ap);
    let d2 = ac.dot(ap);
    if d1 <= 0.0 && d2 <= 0.0 {
        return a;
    }
    let bp = p - b;
    let d3 = ab.dot(bp);
    let d4 = ac.dot(bp);
    if d3 >= 0.0 && d4 <= d3 {
        return b;
    }
    let vc = d1 * d4 - d3 * d2;
    if vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0 {
        let v = d1 / (d1 - d3);
        return a + ab * v;
    }
    let cp = p - c;
    let d5 = ab.dot(cp);
    let d6 = ac.dot(cp);
    if d6 >= 0.0 && d5 <= d6 {
        return c;
    }
    let vb = d5 * d2 - d1 * d6;
    if vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0 {
        let w = d2 / (d2 - d6);
        return a + ac * w;
    }
    let va = d3 * d6 - d5 * d4;
    if va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0 {
        let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return b + (c - b) * w;
    }
    let denom = 1.0 / (va + vb + vc);
    let v = vb * denom;
    let w = vc * denom;
    a + ab * v + ac * w
}

/// Sweeps a sphere of `radius` along `ray` against a triangle, returning `(t, normal, contact_point)`.
pub fn sphere_sweeps_triangle(
    ray: Ray3D,
    radius: f32,
    v0: Vec3,
    v1: Vec3,
    v2: Vec3,
) -> Option<(f32, Vec3, Vec3)> {
    let e1 = v1 - v0;
    let e2 = v2 - v0;
    let raw_n = e1.cross(e2);
    let n_len_sq = raw_n.length_squared();
    if n_len_sq < 1e-12 {
        return None;
    }
    let mut n = raw_n / n_len_sq.sqrt();
    if n.dot(ray.direction) > 0.0 {
        n = -n;
    }

    // Check initial overlap at t = 0
    let closest0 = closest_point_on_triangle(ray.origin, v0, v1, v2);
    let diff0 = ray.origin - closest0;
    if diff0.length_squared() <= radius * radius {
        let normal = diff0.try_normalize().unwrap_or(n);
        return Some((0.0, normal, closest0));
    }

    // Plane intersection with sphere shifted by -n * radius
    let denom = n.dot(ray.direction);
    if denom.abs() > 1e-8 {
        let signed_dist = (ray.origin - v0).dot(n);
        let t_plane = (radius - signed_dist) / denom;
        if t_plane >= 0.0 {
            let contact = ray.at(t_plane) - n * radius;
            let closest = closest_point_on_triangle(contact, v0, v1, v2);
            if (closest - contact).length_squared() < 1e-6 {
                return Some((t_plane, n, contact));
            }
        }
    }

    // Fallback: sweep against triangle edges & vertices (capsules of radius)
    let mut best: Option<(f32, Vec3, Vec3)> = None;
    let verts = [v0, v1, v2];
    for &v in &verts {
        if let Some((t, _)) = ray_intersects_sphere(ray, v, radius)
            && best.is_none_or(|b| t < b.0)
        {
            let normal = (ray.at(t) - v).normalize_or_zero();
            best = Some((t, normal, v));
        }
    }
    for (a, b) in [(v0, v1), (v1, v2), (v2, v0)] {
        let seg = b - a;
        let seg_len_sq = seg.length_squared();
        if seg_len_sq < 1e-10 {
            continue;
        }
        let d_cross_s = ray.direction.cross(seg);
        let a_coef = d_cross_s.length_squared();
        if a_coef < 1e-10 {
            continue;
        }
        let oa = ray.origin - a;
        let oa_cross_s = oa.cross(seg);
        let b_coef = 2.0 * d_cross_s.dot(oa_cross_s);
        let c_coef = oa_cross_s.length_squared() - radius * radius * seg_len_sq;
        let disc = b_coef * b_coef - 4.0 * a_coef * c_coef;
        if disc >= 0.0 {
            let t = (-b_coef - disc.sqrt()) / (2.0 * a_coef);
            if t >= 0.0 && best.is_none_or(|hit| t < hit.0) {
                let p = ray.at(t);
                let s = (p - a).dot(seg) / seg_len_sq;
                if (0.0..=1.0).contains(&s) {
                    let contact = a + seg * s;
                    let normal = (p - contact).normalize_or_zero();
                    best = Some((t, normal, contact));
                }
            }
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
