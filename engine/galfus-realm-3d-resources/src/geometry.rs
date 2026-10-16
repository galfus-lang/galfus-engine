use bytemuck::{Pod, Zeroable};
use serde::{Deserialize, Serialize};

/// Standard 3D vertex layout containing position, normal, UV coordinates, tangent, and skinning weights.
#[derive(Debug, Clone, Copy, Pod, Zeroable, PartialEq, Serialize, Deserialize)]
#[repr(C)]
pub struct Vertex3D {
    /// 3D position vector in local space.
    pub position: [f32; 3],
    /// Unit surface normal vector.
    pub normal: [f32; 3],
    /// 2D texture mapping coordinate `[u, v]`.
    pub uv: [f32; 2],
    /// 4D tangent vector with sign for bitangent calculation `[x, y, z, w]`.
    pub tangent: [f32; 4],
    /// 4 bone joint indices for skeletal skinning.
    #[serde(default)]
    pub joints: [u32; 4],
    /// 4 bone influence weights summing to 1.0.
    #[serde(default)]
    pub weights: [f32; 4],
}

impl Vertex3D {
    /// Helper to construct a static vertex with default tangent and zero skinning weights.
    pub const fn new(position: [f32; 3], normal: [f32; 3], uv: [f32; 2]) -> Self {
        Self {
            position,
            normal,
            uv,
            tangent: [1.0, 0.0, 0.0, 1.0],
            joints: [0; 4],
            weights: [0.0; 4],
        }
    }

    /// Constructs a skinned vertex with explicit bone joint indices and weights.
    pub const fn skinned(
        position: [f32; 3],
        normal: [f32; 3],
        uv: [f32; 2],
        joints: [u32; 4],
        weights: [f32; 4],
    ) -> Self {
        Self {
            position,
            normal,
            uv,
            tangent: [1.0, 0.0, 0.0, 1.0],
            joints,
            weights,
        }
    }
}

use crate::aabb::Aabb;

/// 3D Geometry asset holding vertex attributes and indexed triangle topology.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Geometry3D {
    /// Optional human-readable debug label.
    pub label: Option<String>,
    /// Axis-aligned bounding box enclosing this geometry in local space.
    #[serde(default)]
    pub aabb: Aabb,
    /// Array of interleaved 3D vertices.
    pub vertices: Vec<Vertex3D>,
    /// Indexed triangle list.
    pub indices: Vec<u32>,
}

impl Geometry3D {
    /// Creates a custom geometry from raw vertex and index slices.
    pub fn new(vertices: Vec<Vertex3D>, indices: Vec<u32>, label: Option<String>) -> Self {
        let aabb = Aabb::from_vertices(&vertices);
        Self {
            label,
            aabb,
            vertices,
            indices,
        }
    }

    /// Generates a centered unit cube with the specified side length.
    pub fn cube(size: f32) -> Self {
        let h = size * 0.5;

        #[rustfmt::skip]
        let vertices = vec![
            // Front face (+Z)
            Vertex3D::new([-h, -h,  h], [ 0.0,  0.0,  1.0], [0.0, 1.0]),
            Vertex3D::new([ h, -h,  h], [ 0.0,  0.0,  1.0], [1.0, 1.0]),
            Vertex3D::new([ h,  h,  h], [ 0.0,  0.0,  1.0], [1.0, 0.0]),
            Vertex3D::new([-h,  h,  h], [ 0.0,  0.0,  1.0], [0.0, 0.0]),
            // Back face (-Z)
            Vertex3D::new([ h, -h, -h], [ 0.0,  0.0, -1.0], [0.0, 1.0]),
            Vertex3D::new([-h, -h, -h], [ 0.0,  0.0, -1.0], [1.0, 1.0]),
            Vertex3D::new([-h,  h, -h], [ 0.0,  0.0, -1.0], [1.0, 0.0]),
            Vertex3D::new([ h,  h, -h], [ 0.0,  0.0, -1.0], [0.0, 0.0]),
            // Left face (-X)
            Vertex3D::new([-h, -h, -h], [-1.0,  0.0,  0.0], [0.0, 1.0]),
            Vertex3D::new([-h, -h,  h], [-1.0,  0.0,  0.0], [1.0, 1.0]),
            Vertex3D::new([-h,  h,  h], [-1.0,  0.0,  0.0], [1.0, 0.0]),
            Vertex3D::new([-h,  h, -h], [-1.0,  0.0,  0.0], [0.0, 0.0]),
            // Right face (+X)
            Vertex3D::new([ h, -h,  h], [ 1.0,  0.0,  0.0], [0.0, 1.0]),
            Vertex3D::new([ h, -h, -h], [ 1.0,  0.0,  0.0], [1.0, 1.0]),
            Vertex3D::new([ h,  h, -h], [ 1.0,  0.0,  0.0], [1.0, 0.0]),
            Vertex3D::new([ h,  h,  h], [ 1.0,  0.0,  0.0], [0.0, 0.0]),
            // Top face (+Y)
            Vertex3D::new([-h,  h,  h], [ 0.0,  1.0,  0.0], [0.0, 1.0]),
            Vertex3D::new([ h,  h,  h], [ 0.0,  1.0,  0.0], [1.0, 1.0]),
            Vertex3D::new([ h,  h, -h], [ 0.0,  1.0,  0.0], [1.0, 0.0]),
            Vertex3D::new([-h,  h, -h], [ 0.0,  1.0,  0.0], [0.0, 0.0]),
            // Bottom face (-Y)
            Vertex3D::new([-h, -h, -h], [ 0.0, -1.0,  0.0], [0.0, 1.0]),
            Vertex3D::new([ h, -h, -h], [ 0.0, -1.0,  0.0], [1.0, 1.0]),
            Vertex3D::new([ h, -h,  h], [ 0.0, -1.0,  0.0], [1.0, 0.0]),
            Vertex3D::new([-h, -h,  h], [ 0.0, -1.0,  0.0], [0.0, 0.0]),
        ];

        let mut indices = Vec::with_capacity(36);
        for face in 0..6 {
            let offset = face * 4;
            indices.extend_from_slice(&[
                offset,
                offset + 1,
                offset + 2,
                offset,
                offset + 2,
                offset + 3,
            ]);
        }

        let aabb = Aabb::from_vertices(&vertices);
        Self {
            label: Some("Cube3D".into()),
            aabb,
            vertices,
            indices,
        }
    }

    /// Generates a horizontal flat plane/quad centered at the origin on the XZ plane.
    pub fn plane(width: f32, depth: f32) -> Self {
        let hw = width * 0.5;
        let hd = depth * 0.5;

        let vertices = vec![
            Vertex3D::new([-hw, 0.0, hd], [0.0, 1.0, 0.0], [0.0, 1.0]),
            Vertex3D::new([hw, 0.0, hd], [0.0, 1.0, 0.0], [1.0, 1.0]),
            Vertex3D::new([hw, 0.0, -hd], [0.0, 1.0, 0.0], [1.0, 0.0]),
            Vertex3D::new([-hw, 0.0, -hd], [0.0, 1.0, 0.0], [0.0, 0.0]),
        ];

        let indices = vec![0, 1, 2, 0, 2, 3];
        let aabb = Aabb::from_vertices(&vertices);

        Self {
            label: Some("Plane3D".into()),
            aabb,
            vertices,
            indices,
        }
    }

    /// Generates a UV sphere with a given radius and tessellation subdivisions.
    pub fn sphere(radius: f32, rings: u32, sectors: u32) -> Self {
        let rings = rings.max(3);
        let sectors = sectors.max(3);
        let mut vertices = Vec::new();
        let mut indices = Vec::new();

        let r_step = 1.0 / rings as f32;
        let s_step = 1.0 / sectors as f32;

        for r in 0..=rings {
            let phi = std::f32::consts::PI * (r as f32 * r_step);
            for s in 0..=sectors {
                let theta = 2.0 * std::f32::consts::PI * (s as f32 * s_step);

                let x = theta.sin() * phi.sin();
                let y = phi.cos();
                let z = theta.cos() * phi.sin();

                vertices.push(Vertex3D::new(
                    [x * radius, y * radius, z * radius],
                    [x, y, z],
                    [s as f32 * s_step, r as f32 * r_step],
                ));
            }
        }

        for r in 0..rings {
            for s in 0..sectors {
                let cur = r * (sectors + 1) + s;
                let next = (r + 1) * (sectors + 1) + s;

                indices.push(cur);
                indices.push(cur + 1);
                indices.push(next);

                indices.push(cur + 1);
                indices.push(next + 1);
                indices.push(next);
            }
        }

        let aabb = Aabb::from_vertices(&vertices);
        Self {
            label: Some("Sphere3D".into()),
            aabb,
            vertices,
            indices,
        }
    }

    /// Generates a cylinder with circular caps centered at the origin along the Y axis.
    pub fn cylinder(radius: f32, height: f32, sectors: u32) -> Self {
        crate::primitives::cylinder(radius, height, sectors)
    }

    /// Generates a capsule (pill) with hemispherical caps along the Y axis.
    pub fn capsule(radius: f32, cylinder_height: f32, rings: u32, sectors: u32) -> Self {
        crate::primitives::capsule(radius, cylinder_height, rings, sectors)
    }

    /// Generates a pyramid with a rectangular base on the XZ plane and an apex at `+height/2`.
    pub fn pyramid(width: f32, depth: f32, height: f32) -> Self {
        crate::primitives::pyramid(width, depth, height)
    }

    /// Generates a torus (doughnut) centered on the origin in the XZ plane.
    pub fn torus(
        major_radius: f32,
        minor_radius: f32,
        major_segments: u32,
        minor_segments: u32,
    ) -> Self {
        crate::primitives::torus(major_radius, minor_radius, major_segments, minor_segments)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cube_generation() {
        let cube = Geometry3D::cube(2.0);
        assert_eq!(cube.vertices.len(), 24);
        assert_eq!(cube.indices.len(), 36);
        assert_eq!(cube.aabb.min, glam::Vec3::splat(-1.0));
        assert_eq!(cube.aabb.max, glam::Vec3::splat(1.0));
    }

    #[test]
    fn test_plane_generation() {
        let plane = Geometry3D::plane(10.0, 10.0);
        assert_eq!(plane.vertices.len(), 4);
        assert_eq!(plane.indices.len(), 6);
        assert_eq!(plane.aabb.min, glam::Vec3::new(-5.0, 0.0, -5.0));
        assert_eq!(plane.aabb.max, glam::Vec3::new(5.0, 0.0, 5.0));
    }

    #[test]
    fn test_cylinder_generation() {
        let cyl = Geometry3D::cylinder(1.0, 4.0, 16);
        assert!(!cyl.vertices.is_empty());
        assert!(!cyl.indices.is_empty());
        assert_eq!(cyl.aabb.min.y, -2.0);
        assert_eq!(cyl.aabb.max.y, 2.0);

        // Verify top cap triangle face normal points in +Y
        let top_i0 = cyl.indices[96] as usize;
        let top_i1 = cyl.indices[97] as usize;
        let top_i2 = cyl.indices[98] as usize;
        let v0 = glam::Vec3::from(cyl.vertices[top_i0].position);
        let v1 = glam::Vec3::from(cyl.vertices[top_i1].position);
        let v2 = glam::Vec3::from(cyl.vertices[top_i2].position);
        let top_n = (v1 - v0).cross(v2 - v0);
        assert!(top_n.y > 0.0, "Top cap normal must point outwards (+Y)");

        // Verify bottom cap triangle face normal points in -Y
        let bot_i0 = cyl.indices[144] as usize;
        let bot_i1 = cyl.indices[145] as usize;
        let bot_i2 = cyl.indices[146] as usize;
        let bv0 = glam::Vec3::from(cyl.vertices[bot_i0].position);
        let bv1 = glam::Vec3::from(cyl.vertices[bot_i1].position);
        let bv2 = glam::Vec3::from(cyl.vertices[bot_i2].position);
        let bot_n = (bv1 - bv0).cross(bv2 - bv0);
        assert!(bot_n.y < 0.0, "Bottom cap normal must point outwards (-Y)");
    }

    #[test]
    fn test_capsule_generation() {
        let cap = Geometry3D::capsule(1.0, 2.0, 4, 16);
        assert!(!cap.vertices.is_empty());
        assert!(!cap.indices.is_empty());
        assert_eq!(cap.aabb.min.y, -2.0);
        assert_eq!(cap.aabb.max.y, 2.0);
    }

    #[test]
    fn test_pyramid_generation() {
        let pyr = Geometry3D::pyramid(2.0, 2.0, 3.0);
        assert!(!pyr.vertices.is_empty());
        assert!(!pyr.indices.is_empty());
        assert_eq!(pyr.aabb.min.y, -1.5);
        assert_eq!(pyr.aabb.max.y, 1.5);
    }

    #[test]
    fn test_torus_generation() {
        let tor = Geometry3D::torus(3.0, 1.0, 16, 8);
        assert!(!tor.vertices.is_empty());
        assert!(!tor.indices.is_empty());
        assert!(tor.aabb.max.x > 3.9);
        assert!(tor.aabb.min.x < -3.9);
    }
}
