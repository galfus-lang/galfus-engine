use glam::Vec2;
use serde::{Deserialize, Serialize};

use crate::transform::Transform2D;

/// Geometric primitives supported by 2D vector shapes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ShapeKind2D {
    /// Rectangular box with explicit width and height.
    Rectangle { size: Vec2 },
    /// Circle approximated by regular polygon segments.
    Circle { radius: f32, segments: u32 },
    /// Arbitrary 2D polygon with custom vertex chain.
    Polygon { vertices: Vec<Vec2> },
}

/// 2D Vector shape entity for rendering procedural geometry and occluders.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shape2D {
    /// Optional human-readable debug label.
    pub label: Option<String>,
    /// Primitive geometry style.
    pub kind: ShapeKind2D,
    /// Optional logical material ID.
    pub material_id: Option<u32>,
    /// Whether this shape casts 2D shadows.
    pub cast_shadow: bool,
    /// Whether this shape receives 2D shadows.
    pub receive_shadow: bool,
    /// If true, this shape is invisible and serves only to cast shadows.
    pub occluder_only: bool,
    /// Shadow projection height scalar.
    pub shadow_height: f32,
    /// Shadow layer filter mask.
    pub shadow_layer_mask: u32,
    /// Optional vertical height interval [min_z, max_z] where this occluder blocks light.
    #[serde(default)]
    pub height_range: Option<[f32; 2]>,
}

impl Default for Shape2D {
    fn default() -> Self {
        Self {
            label: None,
            kind: ShapeKind2D::Rectangle { size: Vec2::ONE },
            material_id: None,
            cast_shadow: true,
            receive_shadow: true,
            occluder_only: false,
            shadow_height: 1.0,
            shadow_layer_mask: u32::MAX,
            height_range: None,
        }
    }
}

impl Shape2D {
    /// Creates a rectangular shape.
    pub fn rectangle(size: Vec2, material_id: Option<u32>) -> Self {
        Self {
            kind: ShapeKind2D::Rectangle { size },
            material_id,
            ..Default::default()
        }
    }

    /// Creates a circle shape with specified radius and tessellation segments.
    pub fn circle(radius: f32, segments: u32, material_id: Option<u32>) -> Self {
        Self {
            kind: ShapeKind2D::Circle {
                radius,
                segments: segments.max(3),
            },
            material_id,
            ..Default::default()
        }
    }

    /// Creates an arbitrary polygon shape.
    pub fn polygon(vertices: Vec<Vec2>, material_id: Option<u32>) -> Self {
        Self {
            kind: ShapeKind2D::Polygon { vertices },
            material_id,
            ..Default::default()
        }
    }

    /// Computes local vertex perimeter for rendering and shadow silhouette generation.
    pub fn compute_local_boundary(&self) -> Vec<Vec2> {
        match &self.kind {
            ShapeKind2D::Rectangle { size } => {
                let half = *size * 0.5;
                vec![
                    Vec2::new(-half.x, -half.y),
                    Vec2::new(half.x, -half.y),
                    Vec2::new(half.x, half.y),
                    Vec2::new(-half.x, half.y),
                ]
            }
            ShapeKind2D::Circle { radius, segments } => {
                let count = (*segments).max(3) as usize;
                let step = std::f32::consts::TAU / (count as f32);
                (0..count)
                    .map(|i| {
                        let angle = (i as f32) * step;
                        Vec2::new(angle.cos() * radius, angle.sin() * radius)
                    })
                    .collect()
            }
            ShapeKind2D::Polygon { vertices } => vertices.clone(),
        }
    }

    /// Computes world space boundary transformed by the entity's transform.
    pub fn compute_world_boundary(&self, transform: &Transform2D) -> Vec<Vec2> {
        self.compute_local_boundary()
            .into_iter()
            .map(|pt| transform.transform_point(pt))
            .collect()
    }

    /// Computes world-space occluder silhouettes for 2D polar shadow projection.
    /// Polygons with >4 vertices are automatically decomposed into convex triangles.
    pub fn compute_world_silhouettes(
        &self,
        transform: &Transform2D,
    ) -> Vec<crate::shadow::OccluderSilhouette2D> {
        match &self.kind {
            ShapeKind2D::Rectangle { size } => {
                let half = *size * 0.5;
                let quad = [
                    transform.transform_point(Vec2::new(-half.x, -half.y)),
                    transform.transform_point(Vec2::new(half.x, -half.y)),
                    transform.transform_point(Vec2::new(half.x, half.y)),
                    transform.transform_point(Vec2::new(-half.x, half.y)),
                ];
                vec![crate::shadow::OccluderSilhouette2D::from_quad(quad)]
            }
            ShapeKind2D::Circle { radius, .. } => {
                let r = *radius;
                let quad = [
                    transform.transform_point(Vec2::new(-r, -r)),
                    transform.transform_point(Vec2::new(r, -r)),
                    transform.transform_point(Vec2::new(r, r)),
                    transform.transform_point(Vec2::new(-r, r)),
                ];
                vec![crate::shadow::OccluderSilhouette2D::from_quad(quad)]
            }
            ShapeKind2D::Polygon { vertices } => {
                let count = vertices.len();
                if count == 3 {
                    let v0 = transform.transform_point(vertices[0]);
                    let v1 = transform.transform_point(vertices[1]);
                    let v2 = transform.transform_point(vertices[2]);
                    vec![crate::shadow::OccluderSilhouette2D::from_quad([
                        v0, v1, v2, v0,
                    ])]
                } else if count == 4 {
                    let quad = [
                        transform.transform_point(vertices[0]),
                        transform.transform_point(vertices[1]),
                        transform.transform_point(vertices[2]),
                        transform.transform_point(vertices[3]),
                    ];
                    vec![crate::shadow::OccluderSilhouette2D::from_quad(quad)]
                } else if count > 4 {
                    let v0 = transform.transform_point(vertices[0]);
                    let mut silhouettes = Vec::with_capacity(count - 2);
                    for i in 1..(count - 1) {
                        let vi = transform.transform_point(vertices[i]);
                        let vnext = transform.transform_point(vertices[i + 1]);
                        silhouettes.push(crate::shadow::OccluderSilhouette2D::from_quad([
                            v0, vi, vnext, v0,
                        ]));
                    }
                    silhouettes
                } else {
                    Vec::new()
                }
            }
        }
    }

    /// Computes the GPU model matrix transforming the [-0.5, 0.5] unit quad to the shape's dimensions and world transform.
    pub fn compute_model_matrix(&self, transform: &Transform2D) -> glam::Mat4 {
        let size = match &self.kind {
            ShapeKind2D::Rectangle { size } => *size,
            ShapeKind2D::Circle { radius, .. } => Vec2::splat(radius * 2.0),
            ShapeKind2D::Polygon { vertices } => {
                let mut min = Vec2::splat(f32::MAX);
                let mut max = Vec2::splat(f32::MIN);
                for v in vertices {
                    min = min.min(*v);
                    max = max.max(*v);
                }
                if min.x <= max.x && min.y <= max.y {
                    (max - min).max(Vec2::splat(0.001))
                } else {
                    Vec2::ONE
                }
            }
        } * transform.scale;

        glam::Mat4::from_scale_rotation_translation(
            glam::Vec3::new(size.x, size.y, 1.0),
            glam::Quat::from_rotation_z(transform.rotation),
            glam::Vec3::new(
                transform.position.x,
                transform.position.y,
                transform.z_layer as f32,
            ),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shape_2d_rectangle_boundary() {
        let rect = Shape2D::rectangle(Vec2::new(4.0, 6.0), None);
        let b = rect.compute_local_boundary();
        assert_eq!(b.len(), 4);
        assert_eq!(b[0], Vec2::new(-2.0, -3.0));
        assert_eq!(b[2], Vec2::new(2.0, 3.0));
    }
}
