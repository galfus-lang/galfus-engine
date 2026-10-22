//! Screen-space silhouette dilation outline rendering (matching .old post-process algorithm).

use bytemuck::{Pod, Zeroable};
use galfus_realm_3d_resources::environment::OutlineConfig3D;
use galfus_realm_3d_resources::geometry::{PrimitiveTopology3D, Vertex3D};
use glam::UVec2;
use wgpu::util::DeviceExt;

pub const OUTLINE_SILHOUETTE_SHADER: &str = r#"
diagnostic(off, derivative_uniformity);
struct CameraUniform {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    view_projection: mat4x4<f32>,
    position: vec4<f32>,
    direction: vec4<f32>,
    up: vec4<f32>,
    near_far: vec4<f32>,
};

struct ModelUniform {
    model: mat4x4<f32>,
    normal_matrix: mat4x4<f32>,
    outline_color: vec4<f32>,
    flags: vec4<u32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(0) @binding(6) var<storage, read> bones: array<mat4x4<f32>>;
@group(1) @binding(0) var<uniform> object: ModelUniform;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) joints0: vec4<u32>,
    @location(2) weights0: vec4<f32>,
    @location(3) joints1: vec4<u32>,
    @location(4) weights1: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) clip_pos: vec4<f32>,
    @location(0) color: vec4<f32>,
};

fn bone_at(index: u32, bone_offset: u32, bone_count: u32) -> mat4x4<f32> {
    if (index < bone_count) {
        return bones[bone_offset + index];
    }
    return mat4x4<f32>(
        vec4<f32>(1.0, 0.0, 0.0, 0.0),
        vec4<f32>(0.0, 1.0, 0.0, 0.0),
        vec4<f32>(0.0, 0.0, 1.0, 0.0),
        vec4<f32>(0.0, 0.0, 0.0, 1.0)
    );
}

fn skin_position(position: vec3<f32>, joints0: vec4<u32>, weights0: vec4<f32>, joints1: vec4<u32>, weights1: vec4<f32>, bone_offset: u32, bone_count: u32) -> vec3<f32> {
    let m0 = bone_at(joints0.x, bone_offset, bone_count);
    let m1 = bone_at(joints0.y, bone_offset, bone_count);
    let m2 = bone_at(joints0.z, bone_offset, bone_count);
    let m3 = bone_at(joints0.w, bone_offset, bone_count);
    let m4 = bone_at(joints1.x, bone_offset, bone_count);
    let m5 = bone_at(joints1.y, bone_offset, bone_count);
    let m6 = bone_at(joints1.z, bone_offset, bone_count);
    let m7 = bone_at(joints1.w, bone_offset, bone_count);
    let skinned = (m0 * vec4<f32>(position, 1.0)) * weights0.x
                + (m1 * vec4<f32>(position, 1.0)) * weights0.y
                + (m2 * vec4<f32>(position, 1.0)) * weights0.z
                + (m3 * vec4<f32>(position, 1.0)) * weights0.w
                + (m4 * vec4<f32>(position, 1.0)) * weights1.x
                + (m5 * vec4<f32>(position, 1.0)) * weights1.y
                + (m6 * vec4<f32>(position, 1.0)) * weights1.z
                + (m7 * vec4<f32>(position, 1.0)) * weights1.w;
    return skinned.xyz;
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var local_pos = in.position;
    let bone_offset = object.flags.y;
    let bone_count = object.flags.z;
    if (bone_count > 0u) {
        local_pos = skin_position(in.position, in.joints0, in.weights0, in.joints1, in.weights1, bone_offset, bone_count);
    }
    let world_pos = object.model * vec4<f32>(local_pos, 1.0);
    var out: VertexOutput;
    out.clip_pos = camera.view_projection * world_pos;
    out.color = object.outline_color;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}
"#;

pub const OUTLINE_COMPOSITE_SHADER: &str = r#"
diagnostic(off, derivative_uniformity);
struct OutlineParams {
    params: vec4<f32>, // x: width, y: threshold, z: strength, w: unused
};

@group(0) @binding(0) var t_outline: texture_2d<f32>;
@group(0) @binding(1) var s_outline: sampler;
@group(0) @binding(2) var<uniform> params: OutlineParams;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_fullscreen(@builtin(vertex_index) id: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(id << 1u) & 2) * 2.0 - 1.0;
    let y = f32(i32(id & 2u) * -2) + 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

@fragment
fn fs_composite(in: VertexOutput) -> @location(0) vec4<f32> {
    let width = clamp(params.params.x, 0.5, 8.0);
    let threshold = clamp(params.params.y, 0.0, 0.999);
    let strength = clamp(params.params.z, 0.0, 1.0);

    let tex_dim = vec2<f32>(textureDimensions(t_outline));
    let texel = 1.0 / max(tex_dim, vec2<f32>(1.0));
    let step = texel * width;

    let center = textureSample(t_outline, s_outline, in.uv);
    let center_alpha = center.a;

    var max_alpha = center_alpha;
    var max_color = center.rgb;

    for (var y: i32 = -2; y <= 2; y = y + 1) {
        for (var x: i32 = -2; x <= 2; x = x + 1) {
            if (x == 0 && y == 0) {
                continue;
            }
            let offset = vec2<f32>(f32(x), f32(y)) * step;
            let sample = textureSample(t_outline, s_outline, in.uv + offset);
            if (sample.a > max_alpha) {
                max_alpha = sample.a;
                max_color = sample.rgb;
            }
        }
    }

    let outline_edge = clamp(max_alpha - center_alpha, 0.0, 1.0);
    let outline_mask = smoothstep(threshold, threshold + 0.15, outline_edge);

    return vec4<f32>(max_color, outline_mask * strength);
}
"#;

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct OutlineParamsUniform {
    params: [f32; 4],
}

/// Pipeline for rendering screen-space model outline silhouettes and dilation.
pub struct OutlinePipeline3D {
    silhouette_pipeline: wgpu::RenderPipeline,
    triangle_strip_silhouette_pipeline: wgpu::RenderPipeline,
    composite_pipeline: wgpu::RenderPipeline,
    composite_bgl: wgpu::BindGroupLayout,
    params_buffer: wgpu::Buffer,
    sampler: wgpu::Sampler,
    texture: Option<(wgpu::Texture, wgpu::TextureView, UVec2)>,
    bind_group: Option<wgpu::BindGroup>,
}

impl OutlinePipeline3D {
    pub fn new(
        device: &wgpu::Device,
        scene_layout: &wgpu::BindGroupLayout,
        model_layout: &wgpu::BindGroupLayout,
        target_format: wgpu::TextureFormat,
    ) -> Self {
        let sil_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Realm3D Outline Silhouette Shader"),
            source: wgpu::ShaderSource::Wgsl(OUTLINE_SILHOUETTE_SHADER.into()),
        });

        let sil_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Realm3D Outline Silhouette Pipeline Layout"),
            bind_group_layouts: &[scene_layout, model_layout],
            immediate_size: 0,
        });

        let vertex_layout = wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<Vertex3D>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Float32x3,
                    offset: 0,
                    shader_location: 0,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Uint32x4,
                    offset: 72,
                    shader_location: 1,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Float32x4,
                    offset: 88,
                    shader_location: 2,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Uint32x4,
                    offset: 104,
                    shader_location: 3,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Float32x4,
                    offset: 120,
                    shader_location: 4,
                },
            ],
        };

        let silhouette_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Realm3D Outline Silhouette Pipeline"),
            layout: Some(&sil_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &sil_shader,
                entry_point: Some("vs_main"),
                buffers: std::slice::from_ref(&vertex_layout),
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &sil_shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8Unorm,
                    blend: None,
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
        });

        let triangle_strip_silhouette_pipeline =
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("Realm3D Triangle Strip Outline Silhouette Pipeline"),
                layout: Some(&sil_pipeline_layout),
                vertex: wgpu::VertexState {
                    module: &sil_shader,
                    entry_point: Some("vs_main"),
                    buffers: std::slice::from_ref(&vertex_layout),
                    compilation_options: Default::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: &sil_shader,
                    entry_point: Some("fs_main"),
                    targets: &[Some(wgpu::ColorTargetState {
                        format: wgpu::TextureFormat::Rgba8Unorm,
                        blend: None,
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                    compilation_options: Default::default(),
                }),
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::TriangleStrip,
                    strip_index_format: Some(wgpu::IndexFormat::Uint32),
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
            });

        let comp_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Realm3D Outline Composite Shader"),
            source: wgpu::ShaderSource::Wgsl(OUTLINE_COMPOSITE_SHADER.into()),
        });

        let composite_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Realm3D Outline Composite BGL"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let comp_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Realm3D Outline Composite Pipeline Layout"),
            bind_group_layouts: &[&composite_bgl],
            immediate_size: 0,
        });

        let composite_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Realm3D Outline Composite Pipeline"),
            layout: Some(&comp_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &comp_shader,
                entry_point: Some("vs_fullscreen"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &comp_shader,
                entry_point: Some("fs_composite"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: target_format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
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
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        let params_uniform = OutlineParamsUniform {
            params: [1.5, 0.2, 1.0, 0.0],
        };
        let params_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Realm3D Outline Params Buffer"),
            contents: bytemuck::bytes_of(&params_uniform),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Realm3D Outline Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        Self {
            silhouette_pipeline,
            triangle_strip_silhouette_pipeline,
            composite_pipeline,
            composite_bgl,
            params_buffer,
            sampler,
            texture: None,
            bind_group: None,
        }
    }
}

/// Execution parameters for outline silhouette dilation pass.
pub struct OutlineRenderDesc<'a> {
    pub device: &'a wgpu::Device,
    pub queue: &'a wgpu::Queue,
    pub encoder: &'a mut wgpu::CommandEncoder,
    pub size: UVec2,
    pub scene_bind_group: &'a wgpu::BindGroup,
    pub depth_view: &'a wgpu::TextureView,
    pub target_view: &'a wgpu::TextureView,
    pub config: &'a OutlineConfig3D,
}

impl OutlinePipeline3D {
    /// Renders screen-space outline: Pass 1 draws silhouettes, Pass 2 dilates outline over target.
    pub fn render<'a>(
        &'a mut self,
        desc: OutlineRenderDesc<'a>,
        models: impl Iterator<
            Item = (
                &'a wgpu::BindGroup,
                &'a wgpu::Buffer,
                &'a wgpu::Buffer,
                u32,
                PrimitiveTopology3D,
            ),
        > + Clone,
    ) {
        if !desc.config.enabled || desc.config.strength <= 0.001 {
            return;
        }

        let uniform = OutlineParamsUniform {
            params: [
                desc.config.width,
                desc.config.threshold,
                desc.config.strength,
                0.0,
            ],
        };
        desc.queue
            .write_buffer(&self.params_buffer, 0, bytemuck::bytes_of(&uniform));

        let width = desc.size.x.max(1);
        let height = desc.size.y.max(1);
        if let Some((_, _, tex_size)) = &self.texture
            && *tex_size != desc.size
        {
            self.texture = None;
            self.bind_group = None;
        }

        if self.texture.is_none() {
            let tex = desc.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("Realm3D Outline Texture"),
                size: wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                    | wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            });
            let view = tex.create_view(&wgpu::TextureViewDescriptor::default());
            let bg = desc.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Realm3D Outline Composite BindGroup"),
                layout: &self.composite_bgl,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&self.sampler),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: self.params_buffer.as_entire_binding(),
                    },
                ],
            });
            self.texture = Some((tex, view, desc.size));
            self.bind_group = Some(bg);
        }

        let (_, outline_view, _) = self.texture.as_ref().unwrap();
        let composite_bg = self.bind_group.as_ref().unwrap();

        // 1. Draw solid silhouettes into outline_view with depth occlusion test
        {
            let mut sil_pass = desc.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Realm3D Outline Silhouette Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: outline_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: desc.depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Load,
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });

            sil_pass.set_bind_group(0, desc.scene_bind_group, &[]);
            for (model_bg, v_buf, i_buf, idx_count, topology) in models {
                let silhouette_pipeline = match topology {
                    PrimitiveTopology3D::Triangles => &self.silhouette_pipeline,
                    PrimitiveTopology3D::TriangleStrip => &self.triangle_strip_silhouette_pipeline,
                    _ => continue,
                };
                sil_pass.set_pipeline(silhouette_pipeline);
                sil_pass.set_bind_group(1, model_bg, &[]);
                sil_pass.set_vertex_buffer(0, v_buf.slice(..));
                sil_pass.set_index_buffer(i_buf.slice(..), wgpu::IndexFormat::Uint32);
                sil_pass.draw_indexed(0..idx_count, 0, 0..1);
            }
        }

        // 2. Composite dilation outline over target_view with alpha blending
        {
            let mut comp_pass = desc.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Realm3D Outline Composite Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: desc.target_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Load,
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });

            comp_pass.set_pipeline(&self.composite_pipeline);
            comp_pass.set_bind_group(0, composite_bg, &[]);
            comp_pass.draw(0..3, 0..1);
        }
    }
}
