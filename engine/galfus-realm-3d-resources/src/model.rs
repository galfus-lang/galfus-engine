use bytemuck::{Pod, Zeroable};
use glam::{Mat4, UVec4, Vec4};
use serde::{Deserialize, Serialize};

use crate::transform::Transform3D;

/// 3D Model render instance binding a geometry and material to an entity.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Model3D {
    /// Logical ID of the bound `Geometry3D`.
    pub geometry_id: u32,
    /// Logical ID of the bound `Material3D`.
    pub material_id: u32,
    /// Whether this model casts shadows into shadow maps.
    pub cast_shadow: bool,
    /// Whether this model receives shadows from shadow-casting lights.
    pub receive_shadow: bool,
    /// Whether this model generates outline silhouettes.
    pub cast_outline: bool,
    /// RGBA tint for this model's outline silhouette.
    pub outline_color: Vec4,
    /// Whether this model instance is actively drawn.
    pub active: bool,
    /// Offset into the shared bones storage buffer palette.
    #[serde(default)]
    pub bone_offset: u32,
    /// Number of bones in this model's palette.
    #[serde(default)]
    pub bone_count: u32,
}

impl Default for Model3D {
    fn default() -> Self {
        Self {
            geometry_id: 0,
            material_id: 0,
            cast_shadow: true,
            receive_shadow: true,
            cast_outline: false,
            outline_color: Vec4::new(1.0, 1.0, 1.0, 1.0),
            active: true,
            bone_offset: 0,
            bone_count: 0,
        }
    }
}

impl Model3D {
    /// Creates a new model instance.
    pub fn new(geometry_id: u32, material_id: u32) -> Self {
        Self {
            geometry_id,
            material_id,
            ..Default::default()
        }
    }

    /// Converts this model and its transform into a GPU uniform layout.
    pub fn build_uniform(&self, transform: &Transform3D) -> Model3DUniform {
        let model_matrix = transform.to_mat4();
        // Compute inverse-transpose for proper lighting normal transformation
        let normal_matrix = model_matrix.inverse().transpose();

        let mut flags = 0u32;
        if self.receive_shadow {
            flags |= 1 << 0;
        }
        if self.cast_outline {
            flags |= 1 << 1;
        }

        Model3DUniform {
            model: model_matrix,
            normal_matrix,
            outline_color: self.outline_color,
            flags: UVec4::new(flags, self.bone_offset, self.bone_count, 0),
        }
    }
}

/// GPU uniform block for a 3D model instance.
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct Model3DUniform {
    /// 4x4 Model-to-world transformation matrix.
    pub model: Mat4,
    /// 4x4 Inverse-transpose matrix for normal transformation.
    pub normal_matrix: Mat4,
    /// Outline silhouette color `[r, g, b, a]`.
    pub outline_color: Vec4,
    /// Bit flags: `[bit 0: receive_shadow, bit 1: cast_outline, unused, unused]`.
    pub flags: UVec4,
}

/// Per-instance data for 3D GPU mesh instancing aligned to 128 bytes (cache-line).
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Pod, Zeroable, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceData3D {
    /// 4x4 Model-to-world transformation matrix.
    pub transform: Mat4,
    /// RGBA tint / multiplier for base albedo and alpha.
    pub color: Vec4,
    /// RGB emissive glow + emissive intensity in w.
    pub emissive: Vec4,
    /// PBR properties: [x: metallic, y: roughness, z: reflectance, w: ao].
    pub pbr: Vec4,
    /// Free custom data vectors for shaderEffect [x, y, z, w].
    pub custom: Vec4,
}

impl Default for InstanceData3D {
    fn default() -> Self {
        Self {
            transform: Mat4::IDENTITY,
            color: Vec4::ONE,
            emissive: Vec4::ZERO,
            pbr: Vec4::new(0.0, 0.5, 0.5, 1.0),
            custom: Vec4::ZERO,
        }
    }
}

/// Instanced 3D model component binding a geometry and material to an instanced GPU collection.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstancedModel3D {
    /// Logical ID of the bound `Geometry3D`.
    pub geometry_id: u32,
    /// Logical ID of the bound `Material3D`.
    pub material_id: u32,
    /// Pre-allocated GPU buffer capacity (in number of instances).
    #[serde(default)]
    pub capacity: u32,
    /// Whether this instanced model casts shadows into shadow maps.
    #[serde(default = "default_true")]
    pub cast_shadow: bool,
    /// Whether this instanced model receives shadows from shadow-casting lights.
    #[serde(default = "default_true")]
    pub receive_shadow: bool,
    /// Whether this instanced model collection is actively drawn.
    #[serde(default = "default_true")]
    pub active: bool,
}

fn default_true() -> bool {
    true
}

impl Default for InstancedModel3D {
    fn default() -> Self {
        Self {
            geometry_id: 0,
            material_id: 0,
            capacity: 0,
            cast_shadow: true,
            receive_shadow: true,
            active: true,
        }
    }
}

impl InstancedModel3D {
    /// Creates a new instanced model entity.
    pub fn new(geometry_id: u32, material_id: u32, capacity: u32) -> Self {
        Self {
            geometry_id,
            material_id,
            capacity,
            ..Default::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_uniform_alignment() {
        assert_eq!(std::mem::size_of::<Model3DUniform>() % 16, 0);
        let u = Model3DUniform::zeroed();
        let bytes = bytemuck::bytes_of(&u);
        assert_eq!(bytes.len(), std::mem::size_of::<Model3DUniform>());
    }

    #[test]
    fn test_instance_data_3d_alignment() {
        assert_eq!(std::mem::size_of::<InstanceData3D>(), 128);
        assert_eq!(std::mem::size_of::<InstanceData3D>() % 16, 0);
        let inst = InstanceData3D::default();
        let bytes = bytemuck::bytes_of(&inst);
        assert_eq!(bytes.len(), 128);
    }
}
