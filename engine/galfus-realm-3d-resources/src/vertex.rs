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

/// Per-vertex deltas for one glTF morph target.
///
/// Missing glTF `NORMAL` or `TANGENT` target attributes must be supplied as zero deltas. The
/// padded representation is directly compatible with the GPU storage-buffer layout.
#[derive(Debug, Clone, Copy, Pod, Zeroable, PartialEq)]
#[repr(C)]
pub struct MorphVertex3D {
    /// Position delta in local space.
    pub position: [f32; 4],
    /// Normal direction delta in local space.
    pub normal: [f32; 4],
    /// Tangent direction delta in local space.
    pub tangent: [f32; 4],
}

impl MorphVertex3D {
    /// Creates a target delta. The fourth component of every field is reserved GPU padding.
    pub const fn new(position: [f32; 3], normal: [f32; 3], tangent: [f32; 3]) -> Self {
        Self {
            position: [position[0], position[1], position[2], 0.0],
            normal: [normal[0], normal[1], normal[2], 0.0],
            tangent: [tangent[0], tangent[1], tangent[2], 0.0],
        }
    }
}

/// One morph target containing a delta for every vertex in its geometry.
#[derive(Debug, Clone, PartialEq)]
pub struct MorphTarget3D {
    /// Deltas in the exact same vertex order as [`crate::geometry::Geometry3D::vertices`].
    pub deltas: Vec<MorphVertex3D>,
}

impl MorphTarget3D {
    /// Creates a morph target from directly uploadable per-vertex deltas.
    pub fn new(deltas: Vec<MorphVertex3D>) -> Self {
        Self { deltas }
    }
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
