//! Internal types and GPU buffer helper utilities for Realm3D.

use galfus_core::id::validate_host_logical_id;
use galfus_realm_3d_resources::model::Model3D;
use galfus_realm_3d_resources::transform::Transform3D;
use galfus_realm_core::error::{RealmError, RealmResult};
use wgpu::util::DeviceExt;

/// Creates a GPU uniform buffer with its single-binding bind group.
pub fn create_uniform_bg(
    device: &wgpu::Device,
    label: &str,
    layout: &wgpu::BindGroupLayout,
    contents: &[u8],
) -> (wgpu::Buffer, wgpu::BindGroup) {
    let buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some(label),
        contents,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    });
    let bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some(label),
        layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: buf.as_entire_binding(),
        }],
    });
    (buf, bg)
}

/// Validates a host logical identifier against core engine policy.
pub fn validate_id(id: u32) -> RealmResult<()> {
    validate_host_logical_id(id)
        .map(|_| ())
        .map_err(|e| RealmError::Internal(e.to_string()))
}

/// GPU uniform buffers and bind group for common scene-wide data.
pub struct SceneGpuBuffers {
    pub camera_buf: wgpu::Buffer,
    pub env_buf: wgpu::Buffer,
    pub _lights_buf: wgpu::Buffer,
    pub _lights_header_buf: wgpu::Buffer,
    pub bind_group: wgpu::BindGroup,
}

/// Vertex buffer, index buffer, and index count tuple for GPU meshes.
pub type GpuMeshBuffers = (wgpu::Buffer, wgpu::Buffer, u32);

/// Model entity state tuple: model, transform, uniform buffer, and bind group.
pub type GpuModelEntry = (
    Model3D,
    Transform3D,
    Option<wgpu::Buffer>,
    Option<wgpu::BindGroup>,
);
