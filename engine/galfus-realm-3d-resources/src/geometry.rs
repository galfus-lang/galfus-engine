use bytemuck::{Pod, Zeroable};
use serde::{Deserialize, Serialize};

/// Standard 3D vertex layout containing position, normal, UV coordinates, and tangent.
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
}

impl Vertex3D {
    /// Helper to construct a vertex with default tangent pointing +X.
    pub const fn new(position: [f32; 3], normal: [f32; 3], uv: [f32; 2]) -> Self {
        Self {
            position,
            normal,
            uv,
            tangent: [1.0, 0.0, 0.0, 1.0],
        }
    }
}

/// 3D Geometry asset holding vertex attributes and indexed triangle topology.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Geometry3D {
    /// Optional human-readable debug label.
    pub label: Option<String>,
    /// Array of interleaved 3D vertices.
    pub vertices: Vec<Vertex3D>,
    /// Indexed triangle list.
    pub indices: Vec<u32>,
}

impl Geometry3D {
    /// Creates a custom geometry from raw vertex and index slices.
    pub fn new(vertices: Vec<Vertex3D>, indices: Vec<u32>, label: Option<String>) -> Self {
        Self {
            label,
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

        Self {
            label: Some("Cube3D".into()),
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

        Self {
            label: Some("Plane3D".into()),
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

        Self {
            label: Some("Sphere3D".into()),
            vertices,
            indices,
        }
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
    }

    #[test]
    fn test_plane_generation() {
        let plane = Geometry3D::plane(10.0, 10.0);
        assert_eq!(plane.vertices.len(), 4);
        assert_eq!(plane.indices.len(), 6);
    }
}
