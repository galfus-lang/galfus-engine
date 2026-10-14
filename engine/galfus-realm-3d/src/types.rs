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
    pub _bones_buf: wgpu::Buffer,
    pub bind_group: wgpu::BindGroup,
}

impl SceneGpuBuffers {
    pub fn build(
        device: &wgpu::Device,
        pipeline: &crate::pipeline::Pipeline3D,
        shadow_map: &crate::shadow::ShadowMap3D,
        env_uniform: &galfus_realm_3d_resources::environment::Environment3DUniform,
        lights_data: &[galfus_realm_3d_resources::light::Light3DUniform],
        light_count: u32,
        bones_buf: wgpu::Buffer,
    ) -> Self {
        let camera_buf = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Camera Uniform Buffer"),
            size: std::mem::size_of::<galfus_realm_3d_resources::camera::Camera3DUniform>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let env_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Environment Uniform Buffer"),
            contents: bytemuck::bytes_of(env_uniform),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let lights_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Lights Storage Buffer"),
            contents: bytemuck::cast_slice(lights_data),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        });

        let header = [light_count, 0, 0, 0];
        let lights_header_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Lights Header Buffer"),
            contents: bytemuck::cast_slice(&header),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let b_entry = |binding, resource| wgpu::BindGroupEntry { binding, resource };
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Scene Bind Group"),
            layout: &pipeline.scene_layout,
            entries: &[
                b_entry(0, camera_buf.as_entire_binding()),
                b_entry(1, env_buf.as_entire_binding()),
                b_entry(2, lights_buf.as_entire_binding()),
                b_entry(3, lights_header_buf.as_entire_binding()),
                b_entry(
                    4,
                    wgpu::BindingResource::TextureView(&shadow_map.array_view),
                ),
                b_entry(5, wgpu::BindingResource::Sampler(&shadow_map.sampler)),
                b_entry(6, bones_buf.as_entire_binding()),
            ],
        });

        Self {
            camera_buf,
            env_buf,
            _lights_buf: lights_buf,
            _lights_header_buf: lights_header_buf,
            _bones_buf: bones_buf,
            bind_group,
        }
    }
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
