use bytemuck::{Pod, Zeroable};
use serde::{Deserialize, Serialize};

/// GPU primitive topology for an indexed 3D geometry.
///
/// Importers normalize glTF `LINE_LOOP` and `TRIANGLE_FAN` to one of these modes before
/// submitting a geometry to the renderer.
#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PrimitiveTopology3D {
    /// Each index addresses an independent point.
    Points = 0,
    /// Each adjacent pair of indices defines an independent line.
    Lines = 1,
    /// Consecutive indices define a connected line strip.
    LineStrip = 2,
    /// Each consecutive triplet of indices defines an independent triangle.
    #[default]
    Triangles = 3,
    /// Consecutive indices define a connected triangle strip.
    TriangleStrip = 4,
}

impl PrimitiveTopology3D {
    /// All topologies directly supported by the renderer.
    pub const ALL: [Self; 5] = [
        Self::Points,
        Self::Lines,
        Self::LineStrip,
        Self::Triangles,
        Self::TriangleStrip,
    ];

    /// Whether this topology requires a strip index format in the GPU pipeline.
    pub const fn is_strip(self) -> bool {
        matches!(self, Self::LineStrip | Self::TriangleStrip)
    }

    /// Whether this topology describes triangle surfaces.
    pub const fn is_triangle(self) -> bool {
        matches!(self, Self::Triangles | Self::TriangleStrip)
    }
}

impl TryFrom<u32> for PrimitiveTopology3D {
    type Error = &'static str;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Points),
            1 => Ok(Self::Lines),
            2 => Ok(Self::LineStrip),
            3 => Ok(Self::Triangles),
            4 => Ok(Self::TriangleStrip),
            _ => Err("Invalid PrimitiveTopology3D value"),
        }
    }
}

/// Canonical glTF-compatible 3D vertex layout.
///
/// All attributes are always present in GPU memory. Importers must use the documented defaults
/// when a source primitive omits an optional glTF attribute.
#[derive(Debug, Clone, Copy, Pod, Zeroable, PartialEq, Serialize, Deserialize)]
#[repr(C)]
pub struct Vertex3D {
    /// 3D position vector in local space.
    pub position: [f32; 3],
    /// Unit surface normal vector.
    pub normal: [f32; 3],
    /// Primary texture mapping coordinate (`TEXCOORD_0`) `[u, v]`.
    #[serde(default, alias = "uv")]
    pub uv0: [f32; 2],
    /// Secondary texture mapping coordinate (`TEXCOORD_1`) `[u, v]`.
    #[serde(default)]
    pub uv1: [f32; 2],
    /// 4D tangent vector with sign for bitangent calculation `[x, y, z, w]`.
    #[serde(default = "default_tangent")]
    pub tangent: [f32; 4],
    /// Linear RGBA vertex color (`COLOR_0`).
    #[serde(default = "default_color")]
    pub color: [f32; 4],
    /// First four bone joint indices (`JOINTS_0`).
    #[serde(default, alias = "joints")]
    pub joints0: [u32; 4],
    /// First four bone influence weights (`WEIGHTS_0`).
    #[serde(default, alias = "weights")]
    pub weights0: [f32; 4],
    /// Second four bone joint indices (`JOINTS_1`).
    #[serde(default)]
    pub joints1: [u32; 4],
    /// Second four bone influence weights (`WEIGHTS_1`).
    #[serde(default)]
    pub weights1: [f32; 4],
}

const fn default_tangent() -> [f32; 4] {
    [1.0, 0.0, 0.0, 1.0]
}

const fn default_color() -> [f32; 4] {
    [1.0; 4]
}

impl Vertex3D {
    /// Helper to construct a static vertex with default tangent and zero skinning weights.
    pub const fn new(position: [f32; 3], normal: [f32; 3], uv0: [f32; 2]) -> Self {
        Self {
            position,
            normal,
            uv0,
            uv1: [0.0; 2],
            tangent: default_tangent(),
            color: default_color(),
            joints0: [0; 4],
            weights0: [0.0; 4],
            joints1: [0; 4],
            weights1: [0.0; 4],
        }
    }

    /// Constructs a skinned vertex with explicit bone joint indices and weights.
    pub const fn skinned(
        position: [f32; 3],
        normal: [f32; 3],
        uv0: [f32; 2],
        joints0: [u32; 4],
        weights0: [f32; 4],
    ) -> Self {
        Self {
            position,
            normal,
            uv0,
            uv1: [0.0; 2],
            tangent: default_tangent(),
            color: default_color(),
            joints0,
            weights0,
            joints1: [0; 4],
            weights1: [0.0; 4],
        }
    }

    /// Constructs a skinned vertex with up to eight explicit bone influences.
    #[allow(clippy::too_many_arguments)]
    pub const fn skinned8(
        position: [f32; 3],
        normal: [f32; 3],
        uv0: [f32; 2],
        joints0: [u32; 4],
        weights0: [f32; 4],
        joints1: [u32; 4],
        weights1: [f32; 4],
    ) -> Self {
        Self {
            position,
            normal,
            uv0,
            uv1: [0.0; 2],
            tangent: default_tangent(),
            color: default_color(),
            joints0,
            weights0,
            joints1,
            weights1,
        }
    }
}

use crate::aabb::Aabb;

/// 3D Geometry asset holding vertex attributes, indices, and primitive topology.
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
    /// Indexed primitive sequence interpreted by [`Self::topology`].
    pub indices: Vec<u32>,
    /// GPU interpretation of the indexed primitive sequence.
    #[serde(default)]
    pub topology: PrimitiveTopology3D,
}

impl Geometry3D {
    /// Creates a custom geometry from raw vertex and index slices.
    pub fn new(vertices: Vec<Vertex3D>, indices: Vec<u32>, label: Option<String>) -> Self {
        Self::new_with_topology(vertices, indices, PrimitiveTopology3D::Triangles, label)
    }

    /// Creates custom geometry using an explicit primitive topology.
    pub fn new_with_topology(
        vertices: Vec<Vertex3D>,
        indices: Vec<u32>,
        topology: PrimitiveTopology3D,
        label: Option<String>,
    ) -> Self {
        let aabb = Aabb::from_vertices(&vertices);
        Self {
            label,
            aabb,
            vertices,
            indices,
            topology,
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
            topology: PrimitiveTopology3D::Triangles,
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
            topology: PrimitiveTopology3D::Triangles,
        }
    }

    /// Generates a vertical quad centered on the origin in the XY plane facing +Z.
    pub fn quad(width: f32, height: f32) -> Self {
        let hw = width * 0.5;
        let hh = height * 0.5;

        let vertices = vec![
            Vertex3D::new([-hw, -hh, 0.0], [0.0, 0.0, 1.0], [0.0, 1.0]),
            Vertex3D::new([hw, -hh, 0.0], [0.0, 0.0, 1.0], [1.0, 1.0]),
            Vertex3D::new([hw, hh, 0.0], [0.0, 0.0, 1.0], [1.0, 0.0]),
            Vertex3D::new([-hw, hh, 0.0], [0.0, 0.0, 1.0], [0.0, 0.0]),
        ];

        let indices = vec![0, 1, 2, 0, 2, 3];
        let aabb = Aabb::from_vertices(&vertices);

        Self {
            label: Some("Quad3D".into()),
            aabb,
            vertices,
            indices,
            topology: PrimitiveTopology3D::Triangles,
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
                indices.push(next);
                indices.push(cur + 1);

                indices.push(cur + 1);
                indices.push(next);
                indices.push(next + 1);
            }
        }

        let aabb = Aabb::from_vertices(&vertices);
        Self {
            label: Some("Sphere3D".into()),
            aabb,
            vertices,
            indices,
            topology: PrimitiveTopology3D::Triangles,
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

    fn assert_outward_winding(geometry: &Geometry3D) {
        let (triangles, _) = geometry.indices.as_chunks::<3>();
        for triangle in triangles {
            let vertices = [
                geometry.vertices[triangle[0] as usize],
                geometry.vertices[triangle[1] as usize],
                geometry.vertices[triangle[2] as usize],
            ];
            let positions = vertices.map(|vertex| glam::Vec3::from(vertex.position));
            let face_normal = (positions[1] - positions[0]).cross(positions[2] - positions[0]);
            if face_normal.length_squared() <= f32::EPSILON {
                continue;
            }
            let vertex_normal = vertices
                .map(|vertex| glam::Vec3::from(vertex.normal))
                .into_iter()
                .sum::<glam::Vec3>();
            assert!(
                face_normal.dot(vertex_normal) > 0.0,
                "triangle {triangle:?} has winding opposite to its vertex normal"
            );
        }
    }

    #[test]
    fn canonical_layout_and_defaults_are_stable() {
        assert_eq!(std::mem::size_of::<Vertex3D>(), 136);
        let vertex = Vertex3D::new([0.0; 3], [0.0, 1.0, 0.0], [0.0; 2]);
        assert_eq!(vertex.color, [1.0; 4]);
        assert_eq!(vertex.uv1, [0.0; 2]);
        assert_eq!(vertex.tangent, [1.0, 0.0, 0.0, 1.0]);
        assert_eq!(vertex.weights0, [0.0; 4]);
        assert_eq!(vertex.weights1, [0.0; 4]);
    }

    #[test]
    fn skinned8_preserves_both_joint_sets() {
        let vertex = Vertex3D::skinned8(
            [0.0; 3],
            [0.0, 1.0, 0.0],
            [0.0; 2],
            [1, 2, 3, 4],
            [0.4, 0.3, 0.2, 0.1],
            [5, 6, 7, 8],
            [0.05, 0.05, 0.05, 0.05],
        );
        assert_eq!(vertex.joints0, [1, 2, 3, 4]);
        assert_eq!(vertex.joints1, [5, 6, 7, 8]);
        assert_eq!(vertex.weights1, [0.05; 4]);
    }

    #[test]
    fn primitive_topology_codes_and_helpers_are_stable() {
        assert_eq!(
            PrimitiveTopology3D::try_from(0),
            Ok(PrimitiveTopology3D::Points)
        );
        assert_eq!(
            PrimitiveTopology3D::try_from(4),
            Ok(PrimitiveTopology3D::TriangleStrip)
        );
        assert!(PrimitiveTopology3D::LineStrip.is_strip());
        assert!(PrimitiveTopology3D::TriangleStrip.is_triangle());
        assert!(PrimitiveTopology3D::try_from(5).is_err());

        let geometry = Geometry3D::new(Vec::new(), Vec::new(), None);
        assert_eq!(geometry.topology, PrimitiveTopology3D::Triangles);
    }

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

    #[test]
    fn primitive_face_winding_matches_vertex_normals() {
        for geometry in [
            Geometry3D::cube(2.0),
            Geometry3D::plane(2.0, 2.0),
            Geometry3D::quad(2.0, 2.0),
            Geometry3D::sphere(1.0, 8, 16),
            Geometry3D::cylinder(1.0, 2.0, 16),
            Geometry3D::capsule(1.0, 2.0, 4, 16),
            Geometry3D::pyramid(2.0, 2.0, 3.0),
            Geometry3D::torus(3.0, 1.0, 16, 8),
        ] {
            assert_outward_winding(&geometry);
        }
    }
}
