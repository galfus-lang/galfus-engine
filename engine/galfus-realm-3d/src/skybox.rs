//! Procedural and cubemap Skybox pass rendering at the Reverse-Z far plane (0.0).

use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec4};
use wgpu::util::DeviceExt;

use galfus_realm_3d_resources::environment::SkyboxConfig3D;

pub const SKYBOX_SHADER: &str = r#"
struct SkyboxUniform {
    inv_view_proj: mat4x4<f32>,
    camera_pos: vec4<f32>,
    sky_color: vec4<f32>,
    horizon_color: vec4<f32>,
    ground_color: vec4<f32>,
    sun_direction: vec4<f32>,
    sun_color: vec4<f32>,
    params: vec4<f32>, // x: intensity, y: sun_size, z: mode (0=none, 1=procedural, 2=cubemap/panoramic), w: rotation
};

@group(0) @binding(0) var<uniform> sky: SkyboxUniform;
@group(0) @binding(1) var t_sky: texture_2d<f32>;
@group(0) @binding(2) var s_sky: sampler;

struct VertexOutput {
    @builtin(position) clip_pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    let p = positions[idx];
    var out: VertexOutput;
    // In Reverse-Z, 0.0 represents the far plane at infinity.
    out.clip_pos = vec4<f32>(p, 0.0, 1.0);
    out.uv = p * 0.5 + vec2<f32>(0.5, 0.5);
    return out;
}

fn rotate_y(dir: vec3<f32>, angle: f32) -> vec3<f32> {
    let s = sin(angle);
    let c = cos(angle);
    return vec3<f32>(c * dir.x + s * dir.z, dir.y, -s * dir.x + c * dir.z);
}

fn equirect_uv(dir: vec3<f32>) -> vec2<f32> {
    let n = normalize(dir);
    let u = atan2(n.z, n.x) * 0.15915494 + 0.5; // 1 / (2 * PI)
    let v = 1.0 - (asin(clamp(n.y, -1.0, 1.0)) * 0.318309886 + 0.5); // 1 / PI
    return vec2<f32>(fract(u), clamp(v, 0.0, 1.0));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let mode = u32(round(sky.params.z));
    if (mode == 0u) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }

    // Reconstruct world-space ray direction
    let ndc = vec4<f32>(in.uv * 2.0 - vec2<f32>(1.0), 0.0, 1.0);
    let world_target = sky.inv_view_proj * ndc;
    var ray_dir = normalize((world_target.xyz / world_target.w) - sky.camera_pos.xyz);
    let rotation = sky.params.w;
    if (abs(rotation) > 1e-4) {
        ray_dir = rotate_y(ray_dir, rotation);
    }

    // Panoramic 360° Equirectangular texture mode
    if (mode == 2u) {
        let uv = equirect_uv(ray_dir);
        let tex = textureSample(t_sky, s_sky, uv);
        return vec4<f32>(tex.rgb * sky.params.x, 1.0);
    }

    let y = ray_dir.y;
    var sky_base: vec3<f32>;

    if (y >= 0.0) {
        let t = clamp(pow(y, 0.6), 0.0, 1.0);
        sky_base = mix(sky.horizon_color.rgb, sky.sky_color.rgb, t);
    } else {
        let t = clamp(pow(-y, 0.8), 0.0, 1.0);
        sky_base = mix(sky.horizon_color.rgb, sky.ground_color.rgb, t);
    }

    // Add Procedural Sun disc with soft corona
    let sun_dir = normalize(sky.sun_direction.xyz);
    let sun_dot = max(dot(ray_dir, sun_dir), 0.0);
    let sun_size = max(sky.params.y, 0.005);
    let sun_disc = smoothstep(1.0 - sun_size, 1.0, sun_dot);
    let sun_glow = pow(sun_dot, 32.0) * 0.4;
    let sun_contribution = sky.sun_color.rgb * (sun_disc * sky.sun_color.a + sun_glow);

    let final_rgb = (sky_base + sun_contribution) * sky.params.x;
    return vec4<f32>(final_rgb, 1.0);
}
"#;

/// GPU uniform block for the Skybox.
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct SkyboxUniform {
    pub inv_view_proj: Mat4,
    pub camera_pos: Vec4,
    pub sky_color: Vec4,
    pub horizon_color: Vec4,
    pub ground_color: Vec4,
    pub sun_direction: Vec4,
    pub sun_color: Vec4,
    pub params: Vec4,
}

/// Pipeline for rendering the Reverse-Z skybox.
pub struct SkyboxPipeline3D {
    pub pipeline: wgpu::RenderPipeline,
    pub layout: wgpu::BindGroupLayout,
    pub buffer: wgpu::Buffer,
    pub bind_group: wgpu::BindGroup,
    pub fallback_texture: wgpu::Texture,
    pub fallback_view: wgpu::TextureView,
    pub sampler: wgpu::Sampler,
}

impl SkyboxPipeline3D {
    pub fn new(device: &wgpu::Device, target_format: wgpu::TextureFormat) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Realm3D Skybox Shader"),
            source: wgpu::ShaderSource::Wgsl(SKYBOX_SHADER.into()),
        });

        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Realm3D Skybox Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

        let dummy_uniform = SkyboxUniform {
            inv_view_proj: Mat4::IDENTITY,
            camera_pos: Vec4::ZERO,
            sky_color: Vec4::new(0.2, 0.45, 0.8, 1.0),
            horizon_color: Vec4::new(0.65, 0.75, 0.85, 1.0),
            ground_color: Vec4::new(0.08, 0.08, 0.1, 1.0),
            sun_direction: Vec4::new(0.5, 0.75, 0.4, 0.0),
            sun_color: Vec4::new(1.0, 0.95, 0.8, 2.0),
            params: Vec4::new(1.0, 0.04, 1.0, 0.0),
        };

        let buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Realm3D Skybox Buffer"),
            contents: bytemuck::bytes_of(&dummy_uniform),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let fallback_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Realm3D Skybox Fallback Texture"),
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let fallback_view = fallback_texture.create_view(&wgpu::TextureViewDescriptor::default());

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Realm3D Skybox Sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Realm3D Skybox Bind Group"),
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&fallback_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Realm3D Skybox Pipeline Layout"),
            bind_group_layouts: &[&layout],
            immediate_size: 0,
        });

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Realm3D Skybox Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: target_format,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                polygon_mode: wgpu::PolygonMode::Fill,
                unclipped_depth: false,
                conservative: false,
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: false,
                // Reverse-Z: Far plane is 0.0. Sky draws only where depth is <= 0.0 (unoccluded background).
                depth_compare: wgpu::CompareFunction::GreaterEqual,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        Self {
            pipeline,
            layout,
            buffer,
            bind_group,
            fallback_texture,
            fallback_view,
            sampler,
        }
    }

    /// Updates the uniform buffer with camera matrices and skybox properties.
    pub fn update(
        &self,
        queue: &wgpu::Queue,
        view_proj: &Mat4,
        camera_pos: Vec4,
        config: &SkyboxConfig3D,
    ) {
        let uniform = SkyboxUniform {
            inv_view_proj: view_proj.inverse(),
            camera_pos,
            sky_color: config.sky_color,
            horizon_color: config.horizon_color,
            ground_color: config.ground_color,
            sun_direction: config.sun_direction,
            sun_color: config.sun_color,
            params: Vec4::new(
                config.intensity,
                config.sun_size,
                config.mode.to_code() as f32,
                config.rotation,
            ),
        };
        queue.write_buffer(&self.buffer, 0, bytemuck::bytes_of(&uniform));
    }
}
