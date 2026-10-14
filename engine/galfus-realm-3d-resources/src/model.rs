use bytemuck::{Pod, Zeroable};
use glam::{Mat4, UVec4};
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
    /// Whether this model instance is actively drawn.
    pub active: bool,
}

impl Default for Model3D {
    fn default() -> Self {
        Self {
            geometry_id: 0,
            material_id: 0,
            cast_shadow: true,
            receive_shadow: true,
            active: true,
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

        Model3DUniform {
            model: model_matrix,
            normal_matrix,
            flags: UVec4::new(flags, 0, 0, 0),
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
    /// Bit flags: `[bit 0: receive_shadow, unused, unused, unused]`.
    pub flags: UVec4,
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
}
