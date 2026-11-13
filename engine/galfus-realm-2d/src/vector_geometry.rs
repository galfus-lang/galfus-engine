//! Shared 2D vector vertex and GPU buffer representations.

/// Position, UV and color in the standard 2D vertex format.
pub type VectorVertex = [f32; 9];

/// GPU buffers for a 2D vector mesh.
pub struct GpuVectorGeometry {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: wgpu::Buffer,
    pub vertex_capacity: u64,
    pub index_capacity: u64,
    pub index_count: u32,
    pub dimensions: glam::Vec2,
}
