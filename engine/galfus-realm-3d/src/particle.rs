//! GPU particle renderer for 3D camera-facing billboards with Reverse-Z depth testing.

use bytemuck::{Pod, Zeroable};
use galfus_realm_3d_resources::particle::Particle3DInstance;
use wgpu::util::DeviceExt;

/// Base vertex for billboard quad.
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct QuadVertex {
    pos: [f32; 2],
    uv: [f32; 2],
}

const QUAD_VERTICES: [QuadVertex; 6] = [
    QuadVertex {
        pos: [-0.5, -0.5],
        uv: [0.0, 1.0],
    },
    QuadVertex {
        pos: [0.5, -0.5],
        uv: [1.0, 1.0],
    },
    QuadVertex {
        pos: [0.5, 0.5],
        uv: [1.0, 0.0],
    },
    QuadVertex {
        pos: [-0.5, -0.5],
        uv: [0.0, 1.0],
    },
    QuadVertex {
        pos: [0.5, 0.5],
        uv: [1.0, 0.0],
    },
    QuadVertex {
        pos: [-0.5, 0.5],
        uv: [0.0, 0.0],
    },
];

const PARTICLE_WGSL: &str = r#"
struct CameraUniform {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    view_projection: mat4x4<f32>,
    position: vec4<f32>,
    direction: vec4<f32>,
    up: vec4<f32>,
    near_far: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;

struct VertexInput {
    @location(0) quad_pos: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) inst_pos: vec3<f32>,
    @location(3) inst_size: f32,
    @location(4) inst_color: vec4<f32>,
    @location(5) inst_rotation: f32,
};

struct VertexOutput {
    @builtin(position) clip_pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    // Camera billboard basis vectors extracted from view matrix rows
    let cam_right = vec3<f32>(camera.view[0][0], camera.view[1][0], camera.view[2][0]);
    let cam_up = vec3<f32>(camera.view[0][1], camera.view[1][1], camera.view[2][1]);

    let cos_r = cos(in.inst_rotation);
    let sin_r = sin(in.inst_rotation);
    let rot_x = in.quad_pos.x * cos_r - in.quad_pos.y * sin_r;
    let rot_y = in.quad_pos.x * sin_r + in.quad_pos.y * cos_r;

    let world_pos = in.inst_pos + (cam_right * rot_x + cam_up * rot_y) * in.inst_size;
    out.clip_pos = camera.view_projection * vec4<f32>(world_pos, 1.0);
    out.uv = in.uv;
    out.color = in.inst_color;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let d = length(in.uv - vec2<f32>(0.5, 0.5)) * 2.0;
    if (d > 1.0) {
        discard;
    }
    let radial = 1.0 - smoothstep(0.2, 1.0, d);
    let alpha = in.color.a * radial;
    return vec4<f32>(in.color.rgb, alpha);
}
"#;

/// GPU rendering pipeline and dynamic instance buffers for 3D particles.
pub struct ParticleRenderer3D {
    alpha_pipeline: wgpu::RenderPipeline,
    additive_pipeline: wgpu::RenderPipeline,
    quad_buffer: wgpu::Buffer,
    alpha_buffer: Option<wgpu::Buffer>,
    alpha_capacity: usize,
    additive_buffer: Option<wgpu::Buffer>,
    additive_capacity: usize,
}

impl ParticleRenderer3D {
    pub fn new(
        device: &wgpu::Device,
        target_format: wgpu::TextureFormat,
        scene_bind_group_layout: &wgpu::BindGroupLayout,
    ) -> Self {
        let quad_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Particle3D Quad Buffer"),
            contents: bytemuck::cast_slice(&QUAD_VERTICES),
            usage: wgpu::BufferUsages::VERTEX,
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Particle3D Shader Module"),
            source: wgpu::ShaderSource::Wgsl(PARTICLE_WGSL.into()),
        });

        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Particle3D Pipeline Layout"),
            bind_group_layouts: &[scene_bind_group_layout],
            immediate_size: 0,
        });

        let vertex_buffers = [
            // Quad Vertex
            wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<QuadVertex>() as u64,
                step_mode: wgpu::VertexStepMode::Vertex,
                attributes: &[
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x2,
                        offset: 0,
                        shader_location: 0,
                    },
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x2,
                        offset: 8,
                        shader_location: 1,
                    },
                ],
            },
            // Instance Data
            wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<Particle3DInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x3,
                        offset: 0,
                        shader_location: 2,
                    },
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32,
                        offset: 12,
                        shader_location: 3,
                    },
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x4,
                        offset: 16,
                        shader_location: 4,
                    },
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32,
                        offset: 32,
                        shader_location: 5,
                    },
                ],
            },
        ];

        let create_pipe = |blend: wgpu::BlendState, label: &'static str| {
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(label),
                layout: Some(&layout),
                vertex: wgpu::VertexState {
                    module: &shader,
                    entry_point: Some("vs_main"),
                    buffers: &vertex_buffers,
                    compilation_options: Default::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: &shader,
                    entry_point: Some("fs_main"),
                    targets: &[Some(wgpu::ColorTargetState {
                        format: target_format,
                        blend: Some(blend),
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
                    depth_compare: wgpu::CompareFunction::GreaterEqual,
                    stencil: wgpu::StencilState::default(),
                    bias: wgpu::DepthBiasState::default(),
                }),
                multisample: wgpu::MultisampleState::default(),
                multiview_mask: None,
                cache: None,
            })
        };

        let alpha_pipeline = create_pipe(
            wgpu::BlendState::ALPHA_BLENDING,
            "Particle3D Alpha Pipeline",
        );
        let additive_pipeline = create_pipe(
            wgpu::BlendState {
                color: wgpu::BlendComponent {
                    src_factor: wgpu::BlendFactor::SrcAlpha,
                    dst_factor: wgpu::BlendFactor::One,
                    operation: wgpu::BlendOperation::Add,
                },
                alpha: wgpu::BlendComponent {
                    src_factor: wgpu::BlendFactor::One,
                    dst_factor: wgpu::BlendFactor::One,
                    operation: wgpu::BlendOperation::Add,
                },
            },
            "Particle3D Additive Pipeline",
        );

        Self {
            alpha_pipeline,
            additive_pipeline,
            quad_buffer,
            alpha_buffer: None,
            alpha_capacity: 0,
            additive_buffer: None,
            additive_capacity: 0,
        }
    }

    fn upload_buffer(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        buf_opt: &mut Option<wgpu::Buffer>,
        capacity: &mut usize,
        instances: &[Particle3DInstance],
        label: &'static str,
    ) {
        let needed = instances.len();
        if needed == 0 {
            return;
        }
        if *capacity < needed || buf_opt.is_none() {
            *capacity = (needed * 2).max(128);
            *buf_opt = Some(device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(label),
                size: (*capacity * std::mem::size_of::<Particle3DInstance>()) as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }));
        }
        if let Some(buf) = buf_opt {
            queue.write_buffer(buf, 0, bytemuck::cast_slice(instances));
        }
    }

    /// Uploads all active particle instances before render pass submission.
    pub fn upload(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        alpha_instances: &[Particle3DInstance],
        additive_instances: &[Particle3DInstance],
    ) {
        Self::upload_buffer(
            device,
            queue,
            &mut self.alpha_buffer,
            &mut self.alpha_capacity,
            alpha_instances,
            "Particle3D Alpha Instances",
        );
        Self::upload_buffer(
            device,
            queue,
            &mut self.additive_buffer,
            &mut self.additive_capacity,
            additive_instances,
            "Particle3D Additive Instances",
        );
    }

    /// Submits draw calls for batched 3D particles across an instance range.
    pub fn render<'a>(
        &'a self,
        pass: &mut wgpu::RenderPass<'a>,
        alpha_instances: std::ops::Range<u32>,
        additive_instances: std::ops::Range<u32>,
    ) {
        if !alpha_instances.is_empty()
            && let Some(buf) = &self.alpha_buffer
        {
            pass.set_pipeline(&self.alpha_pipeline);
            pass.set_vertex_buffer(0, self.quad_buffer.slice(..));
            pass.set_vertex_buffer(1, buf.slice(..));
            pass.draw(0..6, alpha_instances);
        }

        if !additive_instances.is_empty()
            && let Some(buf) = &self.additive_buffer
        {
            pass.set_pipeline(&self.additive_pipeline);
            pass.set_vertex_buffer(0, self.quad_buffer.slice(..));
            pass.set_vertex_buffer(1, buf.slice(..));
            pass.draw(0..6, additive_instances);
        }
    }
}

/// Partitions particle instances in-place around a squared camera distance threshold.
/// Returns the count of instances that are at or beyond the threshold (behind the refractive plane).
pub fn partition_by_depth(
    instances: &mut [Particle3DInstance],
    camera_pos: glam::Vec3,
    threshold_sq: f32,
) -> u32 {
    let (mut i, mut j) = (0, instances.len());
    while i < j {
        if (glam::Vec3::from(instances[i].position) - camera_pos).length_squared() >= threshold_sq {
            i += 1;
        } else {
            j -= 1;
            instances.swap(i, j);
        }
    }
    i as u32
}

/// Collects and segregates active particle instances into reusable alpha and additive staging buffers.
pub fn collect_emitter_instances(
    emitters: &std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::particle::ParticleEmitter3D,
            galfus_realm_3d_resources::transform::Transform3D,
            galfus_realm_3d_resources::particle::ParticleEmitterState3D,
        ),
    >,
    materials: &std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::material::Material3D,
            Option<wgpu::Buffer>,
            Option<wgpu::BindGroup>,
        ),
    >,
    alpha: &mut Vec<Particle3DInstance>,
    additive: &mut Vec<Particle3DInstance>,
) {
    alpha.clear();
    additive.clear();
    for (emitter, _, state) in emitters.values() {
        let is_add = emitter
            .material_id
            .and_then(|mid| materials.get(&mid))
            .map(|m| {
                m.0.surface_type == galfus_realm_3d_resources::material::SurfaceType3D::Additive
            })
            .unwrap_or(true);
        if is_add {
            state.append_instances(additive);
        } else {
            state.append_instances(alpha);
        }
    }
}
