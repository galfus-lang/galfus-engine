//! 2D collider geometry queries.

use galfus_core::collision::ColliderShape2D;
use glam::Vec2;

/// Tests a point against a simple, potentially concave polygon.
pub fn point_in_polygon(point: Vec2, vertices: &[[f32; 2]]) -> bool {
    let mut inside = false;
    for i in 0..vertices.len() {
        let a = Vec2::from(vertices[i]);
        let b = Vec2::from(vertices[(i + 1) % vertices.len()]);
        let edge = b - a;
        if edge.perp_dot(point - a).abs() <= 1e-6 && (point - a).dot(point - b) <= 1e-6 {
            return true;
        }
        if (a.y > point.y) != (b.y > point.y)
            && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x
        {
            inside = !inside;
        }
    }
    inside
}

/// Raycasts a 2D local shape. Direction need not be normalized; returned t uses its parameterization.
pub fn raycast_shape_2d(
    shape: &ColliderShape2D,
    origin: Vec2,
    direction: Vec2,
) -> Option<(f32, Vec2)> {
    match shape {
        ColliderShape2D::Circle { radius } => {
            if origin.length_squared() <= radius * radius {
                return Some((0.0, Vec2::ZERO));
            }
            let a = direction.length_squared();
            let b = origin.dot(direction);
            let disc = b * b - a * (origin.length_squared() - radius * radius);
            if a <= 0.0 || disc < 0.0 {
                return None;
            }
            let t = (-b - disc.sqrt()) / a;
            if t < 0.0 {
                None
            } else {
                Some((t, (origin + direction * t).normalize_or_zero()))
            }
        }
        ColliderShape2D::Rectangle { half_extents } => {
            let [x, y] = *half_extents;
            let vertices = [[-x, -y], [x, -y], [x, y], [-x, y]];
            raycast_polygon(origin, direction, &vertices)
        }
        ColliderShape2D::Polygon { vertices } => raycast_polygon(origin, direction, vertices),
    }
}

fn raycast_polygon(origin: Vec2, direction: Vec2, vertices: &[[f32; 2]]) -> Option<(f32, Vec2)> {
    if point_in_polygon(origin, vertices) {
        return Some((0.0, Vec2::ZERO));
    }
    let mut area = 0.0;
    for i in 0..vertices.len() {
        area += Vec2::from(vertices[i]).perp_dot(Vec2::from(vertices[(i + 1) % vertices.len()]));
    }
    let mut best: Option<(f32, Vec2)> = None;
    for i in 0..vertices.len() {
        let a = Vec2::from(vertices[i]);
        let edge = Vec2::from(vertices[(i + 1) % vertices.len()]) - a;
        let denom = direction.perp_dot(edge);
        if denom.abs() <= 1e-10 {
            continue;
        }
        let delta = a - origin;
        let t = delta.perp_dot(edge) / denom;
        let u = delta.perp_dot(direction) / denom;
        if t >= 0.0 && (0.0..=1.0).contains(&u) && best.is_none_or(|hit| t < hit.0) {
            let sign = area.signum();
            best = Some((t, Vec2::new(edge.y, -edge.x).normalize_or_zero() * sign));
        }
    }
    best
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
}
