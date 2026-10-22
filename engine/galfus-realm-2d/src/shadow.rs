use galfus_realm_2d_resources::{
    Light2D, Occluder2D, OccluderEdge2D, OccluderSilhouette2D, Shadow2DConfig,
};
use glam::Vec2;
use std::collections::HashMap;

use crate::types::ShadowSample2DRaw;

pub const SHADOW_SAMPLES_PER_DIRECTION: usize = 8;
const TAU: f32 = std::f32::consts::TAU;

#[derive(Debug, Clone, Copy)]
struct OccluderAngularVertex {
    point: Vec2,
    angle: f32,
    distance: f32,
}

#[derive(Debug, Clone, Copy)]
struct OccluderLightCone {
    support_points: [Vec2; 2],
    blocker_interval: Vec2,
    penumbra_interval: Vec2,
}

#[derive(Clone)]
struct OccluderConeCandidate<'a> {
    cone: OccluderLightCone,
    support_depth: f32,
    occluder: &'a Occluder2D,
    shadow_height: f32,
}

fn unwrap_angle_near(angle: f32, reference: f32) -> f32 {
    let mut unwrapped = angle;
    while unwrapped - reference > std::f32::consts::PI {
        unwrapped -= TAU;
    }
    while unwrapped - reference < -std::f32::consts::PI {
        unwrapped += TAU;
    }
    unwrapped
}

fn wrap_angle_positive(angle: f32) -> f32 {
    angle.rem_euclid(TAU)
}

fn smallest_angular_vertex_interval(
    vertices: [OccluderAngularVertex; 4],
    reference_angle: f32,
) -> Option<(OccluderAngularVertex, OccluderAngularVertex)> {
    let mut angular_vertices = vertices.map(|mut vertex| {
        vertex.angle = wrap_angle_positive(vertex.angle);
        vertex
    });
    angular_vertices.sort_by(|a, b| a.angle.total_cmp(&b.angle));

    let mut largest_gap_index = 0_usize;
    let mut largest_gap = -1.0_f32;
    for index in 0..angular_vertices.len() {
        let next = (index + 1) % angular_vertices.len();
        let next_angle = if next == 0 {
            angular_vertices[next].angle + TAU
        } else {
            angular_vertices[next].angle
        };
        let gap = next_angle - angular_vertices[index].angle;
        if gap > largest_gap {
            largest_gap = gap;
            largest_gap_index = index;
        }
    }

    let left_index = (largest_gap_index + 1) % angular_vertices.len();
    let right_index = largest_gap_index;
    let mut left = angular_vertices[left_index];
    let mut right = angular_vertices[right_index];
    left.angle = unwrap_angle_near(left.angle, reference_angle);
    right.angle = unwrap_angle_near(right.angle, left.angle);
    if right.angle < left.angle {
        right.angle += TAU;
    }
    (right.angle - left.angle > 1e-5).then_some((left, right))
}

fn build_occluder_light_cone(
    silhouette: &OccluderSilhouette2D,
    light_pos: Vec2,
    light_radius: f32,
) -> Option<OccluderLightCone> {
    let centroid = (silhouette.vertices[0]
        + silhouette.vertices[1]
        + silhouette.vertices[2]
        + silhouette.vertices[3])
        * 0.25;
    let centroid_delta = centroid - light_pos;
    if centroid_delta.length_squared() <= 1e-8 {
        return None;
    }
    let reference_angle = centroid_delta.y.atan2(centroid_delta.x);
    let mut angular_vertices = [OccluderAngularVertex {
        point: Vec2::ZERO,
        angle: 0.0,
        distance: 0.0,
    }; 4];
    for (vertex, point) in angular_vertices
        .iter_mut()
        .zip(silhouette.vertices.iter().copied())
    {
        let delta = point - light_pos;
        let distance = delta.length();
        if distance <= 1e-5 {
            return None;
        }
        *vertex = OccluderAngularVertex {
            point,
            angle: delta.y.atan2(delta.x),
            distance,
        };
    }
    let (left, right) = smallest_angular_vertex_interval(angular_vertices, reference_angle)?;
    let blocker_span = right.angle - left.angle;
    if blocker_span <= 1e-5 || blocker_span >= std::f32::consts::PI - 1e-4 {
        return None;
    }

    let source_radius = light_radius.max(0.0);
    if left.distance <= source_radius + 1e-5 || right.distance <= source_radius + 1e-5 {
        return None;
    }
    let left_offset = (source_radius / left.distance).clamp(0.0, 0.9999).asin();
    let right_offset = (source_radius / right.distance).clamp(0.0, 0.9999).asin();
    let penumbra_interval = Vec2::new(left.angle - left_offset, right.angle + right_offset);

    Some(OccluderLightCone {
        support_points: [left.point, right.point],
        blocker_interval: Vec2::new(left.angle, right.angle),
        penumbra_interval,
    })
}

fn cross2(a: Vec2, b: Vec2) -> f32 {
    a.x * b.y - a.y * b.x
}

fn ray_segment_hit_distance(ray_origin: Vec2, ray_dir: Vec2, segment: OccluderEdge2D) -> f32 {
    let v1 = ray_origin - segment.a;
    let v2 = segment.b - segment.a;
    let den = cross2(ray_dir, v2);
    if den.abs() <= 1e-6 {
        return -1.0;
    }
    let t = cross2(v2, v1) / den;
    let q = cross2(ray_dir, v1) / den;
    if t >= 0.0 && (0.0..=1.0).contains(&q) {
        return t;
    }
    -1.0
}

fn ray_hit_distance_for_occluder(
    light_pos: Vec2,
    ray_dir: Vec2,
    occluder: &Occluder2D,
) -> Option<f32> {
    let mut min_t = f32::INFINITY;
    for edge in &occluder.silhouette.edges {
        let t = ray_segment_hit_distance(light_pos, ray_dir, *edge);
        if t >= 0.0 && t < min_t {
            min_t = t;
        }
    }
    (min_t.is_finite()).then_some(min_t)
}

/// Rasterizes polar shadow samples for a single light given a list of candidate occluders.
pub fn rasterize_shadow_samples_for_light(
    angular_resolution: u32,
    light: &Light2D,
    occluders: &[&Occluder2D],
) -> Vec<ShadowSample2DRaw> {
    let resolution = angular_resolution.max(1) as usize;
    let mut samples = vec![ShadowSample2DRaw::default(); resolution * SHADOW_SAMPLES_PER_DIRECTION];
    let light_pos = light.position;
    let light_range = light.range.max(0.0001);
    let light_radius = light.light_radius.max(0.0);

    let mut cones = Vec::with_capacity(occluders.len());
    for occluder in occluders {
        if let Some([min_z, max_z]) = occluder.height_range
            && (light.z < min_z || light.z > max_z)
        {
            continue;
        }
        if let Some(cone) = build_occluder_light_cone(&occluder.silhouette, light_pos, light_radius)
        {
            let support_depth = cone
                .support_points
                .iter()
                .map(|point| point.distance(light_pos))
                .fold(f32::INFINITY, f32::min)
                + occluder.shadow_height * 1e-4;
            cones.push(OccluderConeCandidate {
                cone,
                support_depth,
                occluder,
                shadow_height: occluder.shadow_height,
            });
        }
    }

    for x in 0..resolution {
        let u = (x as f32 + 0.5) / angular_resolution.max(1) as f32;
        let angle = u * TAU;
        let reference = angle;
        let ray_dir = Vec2::new(angle.cos(), angle.sin());

        let mut candidates: Vec<(f32, f32, OccluderLightCone, &OccluderConeCandidate)> =
            Vec::with_capacity(SHADOW_SAMPLES_PER_DIRECTION);

        for candidate in &cones {
            let cone = candidate.cone;
            let ray_hit_depth =
                ray_hit_distance_for_occluder(light_pos, ray_dir, candidate.occluder);
            let blocker_depth = ray_hit_depth.unwrap_or(candidate.support_depth);
            let only_penumbra = ray_hit_depth.is_none();
            let precedence_depth = blocker_depth
                + candidate.shadow_height * 1e-4
                + if only_penumbra {
                    light_range * 2.0
                } else {
                    0.0
                };
            candidates.push((precedence_depth, blocker_depth, cone, candidate));
        }

        candidates.sort_by(|a, b| a.0.total_cmp(&b.0));

        for (slot, (_, blocker_depth, cone, candidate)) in candidates
            .into_iter()
            .take(SHADOW_SAMPLES_PER_DIRECTION)
            .enumerate()
        {
            let sample = &mut samples[x * SHADOW_SAMPLES_PER_DIRECTION + slot];
            sample.flags = 1.0;
            sample.blocker_distance = (blocker_depth / light_range).clamp(0.0, 1.0);
            sample.blocker_left = unwrap_angle_near(cone.blocker_interval.x, reference);
            sample.blocker_right = unwrap_angle_near(cone.blocker_interval.y, reference);
            sample.penumbra_left = unwrap_angle_near(cone.penumbra_interval.x, reference);
            sample.penumbra_right = unwrap_angle_near(cone.penumbra_interval.y, reference);
            sample.support_left_distance =
                (cone.support_points[0].distance(light_pos) / light_range).clamp(0.0, 1.0);
            sample.support_right_distance =
                (cone.support_points[1].distance(light_pos) / light_range).clamp(0.0, 1.0);
            sample.occluder_v0 = candidate.occluder.silhouette.vertices[0];
            sample.occluder_v1 = candidate.occluder.silhouette.vertices[1];
            sample.occluder_v2 = candidate.occluder.silhouette.vertices[2];
            sample.occluder_v3 = candidate.occluder.silhouette.vertices[3];
        }
    }

    samples
}

/// Runtime manager for 2D soft shadows.
#[derive(Debug, Clone)]
pub struct ShadowManager2D {
    pub config: Shadow2DConfig,
    pub is_dirty: bool,
    pub camera_light_hashes: HashMap<u32, Vec<u64>>,
}

impl Default for ShadowManager2D {
    fn default() -> Self {
        Self {
            config: Shadow2DConfig::default(),
            is_dirty: true,
            camera_light_hashes: HashMap::new(),
        }
    }
}

impl ShadowManager2D {
    pub fn new(config: Shadow2DConfig) -> Self {
        Self {
            config: config.sanitized(),
            is_dirty: true,
            camera_light_hashes: HashMap::new(),
        }
    }

    pub fn mark_dirty(&mut self) {
        self.is_dirty = true;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cone_generation_and_penumbra() {
        let quad = [
            Vec2::new(10.0, -1.0),
            Vec2::new(12.0, -1.0),
            Vec2::new(12.0, 1.0),
            Vec2::new(10.0, 1.0),
        ];
        let sil = OccluderSilhouette2D::from_quad(quad);
        let cone = build_occluder_light_cone(&sil, Vec2::ZERO, 0.5);
        assert!(cone.is_some());
        let cone = cone.unwrap();
        assert!(cone.penumbra_interval.x < cone.blocker_interval.x);
        assert!(cone.penumbra_interval.y > cone.blocker_interval.y);
    }
}
