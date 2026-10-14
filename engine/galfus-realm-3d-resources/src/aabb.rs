use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3};
use serde::{Deserialize, Serialize};

use crate::geometry::Vertex3D;

/// Axis-Aligned Bounding Box (AABB) in 3D space.
#[derive(Debug, Clone, Copy, PartialEq, Pod, Zeroable, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[repr(C)]
pub struct Aabb {
    /// Minimum coordinates (lower corner).
    pub min: Vec3,
    /// Maximum coordinates (upper corner).
    pub max: Vec3,
}

impl Default for Aabb {
    fn default() -> Self {
        Self {
            min: Vec3::splat(f32::INFINITY),
            max: Vec3::splat(f32::NEG_INFINITY),
        }
    }
}

impl Aabb {
    /// Constructs an AABB from explicit min and max points.
    #[inline]
    pub const fn new(min: Vec3, max: Vec3) -> Self {
        Self { min, max }
    }

    /// Computes the bounding box enclosing a slice of `Vertex3D`.
    pub fn from_vertices(vertices: &[Vertex3D]) -> Self {
        let mut min = Vec3::splat(f32::INFINITY);
        let mut max = Vec3::splat(f32::NEG_INFINITY);

        for v in vertices {
            let p = Vec3::from_array(v.position);
            min = min.min(p);
            max = max.max(p);
        }

        if vertices.is_empty() {
            Self::default()
        } else {
            Self { min, max }
        }
    }

    /// Computes the bounding box enclosing an iterator of 3D points.
    pub fn from_points(points: impl IntoIterator<Item = Vec3>) -> Self {
        let mut min = Vec3::splat(f32::INFINITY);
        let mut max = Vec3::splat(f32::NEG_INFINITY);
        let mut has_points = false;

        for p in points {
            has_points = true;
            min = min.min(p);
            max = max.max(p);
        }

        if !has_points {
            Self::default()
        } else {
            Self { min, max }
        }
    }

    /// Returns the center point of the bounding box.
    #[inline]
    pub fn center(&self) -> Vec3 {
        (self.min + self.max) * 0.5
    }

    /// Returns the half-extents of the bounding box.
    #[inline]
    pub fn extents(&self) -> Vec3 {
        (self.max - self.min) * 0.5
    }

    /// Transforms this AABB by an affine transformation matrix, generating a new enclosing AABB.
    pub fn transform(&self, matrix: &Mat4) -> Self {
        let corners = [
            Vec3::new(self.min.x, self.min.y, self.min.z),
            Vec3::new(self.min.x, self.min.y, self.max.z),
            Vec3::new(self.min.x, self.max.y, self.min.z),
            Vec3::new(self.min.x, self.max.y, self.max.z),
            Vec3::new(self.max.x, self.min.y, self.min.z),
            Vec3::new(self.max.x, self.min.y, self.max.z),
            Vec3::new(self.max.x, self.max.y, self.min.z),
            Vec3::new(self.max.x, self.max.y, self.max.z),
        ];

        let mut new_min = Vec3::splat(f32::INFINITY);
        let mut new_max = Vec3::splat(f32::NEG_INFINITY);

        for &c in &corners {
            let p = matrix.transform_point3(c);
            new_min = new_min.min(p);
            new_max = new_max.max(p);
        }

        Self {
            min: new_min,
            max: new_max,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aabb_from_vertices() {
        let verts = vec![
            Vertex3D::new([-1.0, -2.0, -3.0], [0.0, 1.0, 0.0], [0.0, 0.0]),
            Vertex3D::new([4.0, 5.0, 6.0], [0.0, 1.0, 0.0], [1.0, 1.0]),
        ];
        let aabb = Aabb::from_vertices(&verts);
        assert_eq!(aabb.min, Vec3::new(-1.0, -2.0, -3.0));
        assert_eq!(aabb.max, Vec3::new(4.0, 5.0, 6.0));
        assert_eq!(aabb.center(), Vec3::new(1.5, 1.5, 1.5));
    }

    #[test]
    fn test_aabb_transform() {
        let aabb = Aabb::new(Vec3::splat(-1.0), Vec3::splat(1.0));
        let translation = Mat4::from_translation(Vec3::new(10.0, 0.0, 0.0));
        let transformed = aabb.transform(&translation);
        assert_eq!(transformed.min, Vec3::new(9.0, -1.0, -1.0));
        assert_eq!(transformed.max, Vec3::new(11.0, 1.0, 1.0));
    }
}
