//! GPU compute shader pipeline for parallel light frustum culling.

use bytemuck::{Pod, Zeroable};
use glam::Vec4;

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct LightCullParamsUniform {
    pub light_count: u32,
    pub _pad0: u32,
    pub _pad1: u32,
    pub _pad2: u32,
}

const LIGHT_CULL_SHADER: &str = r#"
struct LightRaw {
    position: vec4<f32>,
    color: vec4<f32>,
    direction: vec4<f32>,
    spot_inner_outer: vec4<f32>,
    view_proj: mat4x4<f32>,
    kind_flags: vec4<u32>,
};

struct LightCullParams {
    light_count: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(0) @binding(0) var<storage, read> lights: array<LightRaw>;
@group(0) @binding(1) var<storage, read_write> visible_indices: array<u32>;
@group(0) @binding(2) var<storage, read_write> visible_count: atomic<u32>;
@group(0) @binding(3) var<uniform> params: LightCullParams;
@group(0) @binding(4) var<storage, read> frustum_planes: array<vec4<f32>, 6>;

fn is_light_visible(light: LightRaw) -> bool {
    let kind = light.kind_flags.x;
    // Directional (0) and Ambient (3) lights are always visible
    if (kind == 0u || kind == 3u) {
        return true;
    }

    let radius = light.position.w;
    if (radius <= 0.0) {
        return false;
    }

    let center = light.position.xyz;
    for (var i = 0u; i < 6u; i = i + 1u) {
        let plane = frustum_planes[i];
        let dist = dot(plane.xyz, center) + plane.w;
        if (dist < -radius) {
            return false;
        }
    }
    return true;
}

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.light_count) {
        return;
    }

    if (is_light_visible(lights[idx])) {
        let slot = atomicAdd(&visible_count, 1u);
        visible_indices[slot] = idx;
    }
}
"#;

/// Parallel GPU light culling pipeline.
pub struct LightCullingPipeline3D {
    pipeline: wgpu::ComputePipeline,
    layout: wgpu::BindGroupLayout,
    params_buffer: wgpu::Buffer,
    planes_buffer: wgpu::Buffer,
    visible_indices_buffer: wgpu::Buffer,
    visible_count_buffer: wgpu::Buffer,
    _max_lights: usize,
}

impl LightCullingPipeline3D {
    pub fn new(device: &wgpu::Device, max_lights: usize) -> Self {
        let max_lights = max_lights.max(64);

        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Light Cull Bind Group Layout"),
            entries: &[
                // 0: Lights storage
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // 1: Visible indices storage
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // 2: Atomic count storage
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // 3: Params uniform
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // 4: Frustum planes storage
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let pipe_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Light Cull Pipeline Layout"),
            bind_group_layouts: &[&layout],
            immediate_size: 0,
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Light Cull Shader"),
            source: wgpu::ShaderSource::Wgsl(LIGHT_CULL_SHADER.into()),
        });

        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Light Cull Compute Pipeline"),
            layout: Some(&pipe_layout),
            module: &shader,
            entry_point: Some("cs_main"),
            compilation_options: Default::default(),
            cache: None,
        });

        let params_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Light Cull Params Buffer"),
            size: std::mem::size_of::<LightCullParamsUniform>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let planes_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Light Cull Planes Buffer"),
            size: (std::mem::size_of::<Vec4>() * 6) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let visible_indices_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Light Cull Visible Indices Buffer"),
            size: (max_lights * std::mem::size_of::<u32>()) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });

        let visible_count_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Light Cull Visible Count Buffer"),
            size: 16,
            usage: wgpu::BufferUsages::STORAGE
                | wgpu::BufferUsages::COPY_DST
                | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });

        Self {
            pipeline,
            layout,
            params_buffer,
            planes_buffer,
            visible_indices_buffer,
            visible_count_buffer,
            _max_lights: max_lights,
        }
    }

    /// Returns a reference to the GPU buffer storing visible light indices.
    pub fn visible_indices_buffer(&self) -> &wgpu::Buffer {
        &self.visible_indices_buffer
    }

    /// Returns a reference to the GPU buffer storing the atomic count of visible lights.
    pub fn visible_count_buffer(&self) -> &wgpu::Buffer {
        &self.visible_count_buffer
    }

    /// Dispatches compute culling against the camera's 6 frustum planes.
    pub fn dispatch(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        lights_buffer: &wgpu::Buffer,
        light_count: u32,
        frustum_planes: &[Vec4; 6],
    ) {
        if light_count == 0 {
            return;
        }

        // Reset visible count to 0
        queue.write_buffer(&self.visible_count_buffer, 0, bytemuck::bytes_of(&0u32));

        // Upload params
        let params = LightCullParamsUniform {
            light_count,
            _pad0: 0,
            _pad1: 0,
            _pad2: 0,
        };
        queue.write_buffer(&self.params_buffer, 0, bytemuck::bytes_of(&params));

        // Upload 6 frustum planes
        queue.write_buffer(&self.planes_buffer, 0, bytemuck::cast_slice(frustum_planes));

        let bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Light Cull Bind Group"),
            layout: &self.layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: lights_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: self.visible_indices_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: self.visible_count_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: self.params_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: self.planes_buffer.as_entire_binding(),
                },
            ],
        });

        let workgroups = light_count.div_ceil(64);
        let mut cpass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("Light Cull Compute Pass"),
            timestamp_writes: None,
        });
        cpass.set_pipeline(&self.pipeline);
        cpass.set_bind_group(0, &bg, &[]);
        cpass.dispatch_workgroups(workgroups, 1, 1);
    }
}
