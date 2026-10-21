//! # Temporal Anti-Aliasing (TAA)
//!
//! Subpixel camera jittering combined with temporal history reprojection
//! and YCoCg neighborhood bounding box color clamping to eliminate edge aliasing
//! and specular crawling without ghosting artifacts.

use galfus_gpu_manager::GpuShared;

use bytemuck::{Pod, Zeroable};
use glam::Vec2;

const WGSL_TAA: &str = r#"
diagnostic(off, derivative_uniformity);
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

struct TaaParams {
    blend_factor: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
};

@group(0) @binding(0) var t_current: texture_2d<f32>;
@group(0) @binding(1) var s_sampler: sampler;
@group(0) @binding(2) var t_history: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u_params: TaaParams;

fn rgb_to_ycocg(c: vec3<f32>) -> vec3<f32> {
    let y = dot(c, vec3<f32>(0.25, 0.5, 0.25));
    let co = dot(c, vec3<f32>(0.5, 0.0, -0.5));
    let cg = dot(c, vec3<f32>(-0.25, 0.5, -0.25));
    return vec3<f32>(y, co, cg);
}

fn ycocg_to_rgb(c: vec3<f32>) -> vec3<f32> {
    let r = c.x + c.y - c.z;
    let g = c.x + c.z;
    let b = c.x - c.y - c.z;
    return vec3<f32>(r, g, b);
}

@vertex
fn vs_screen(@builtin(vertex_index) id: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(id << 1u) & 2) * 2.0 - 1.0;
    let y = f32(i32(id & 2u) * -2) + 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

@fragment
fn fs_taa(in: VertexOutput) -> @location(0) vec4<f32> {
    let dim = vec2<f32>(textureDimensions(t_current));
    let texel = vec2<f32>(1.0 / max(dim.x, 1.0), 1.0 / max(dim.y, 1.0));

    let current_sample = textureSample(t_current, s_sampler, in.uv);
    if (u_params.blend_factor <= 0.001) {
        return current_sample;
    }

    // 3x3 Neighborhood in YCoCg with statistical variance clipping (Karis / Epic TAA)
    var m1 = vec3<f32>(0.0);
    var m2 = vec3<f32>(0.0);
    var min_c = rgb_to_ycocg(current_sample.rgb);
    var max_c = min_c;

    for (var y: i32 = -1; y <= 1; y = y + 1) {
        for (var x: i32 = -1; x <= 1; x = x + 1) {
            let offset_uv = in.uv + vec2<f32>(f32(x) * texel.x, f32(y) * texel.y);
            let s = textureSample(t_current, s_sampler, offset_uv).rgb;
            let c_ycocg = rgb_to_ycocg(s);
            m1 += c_ycocg;
            m2 += c_ycocg * c_ycocg;
            min_c = min(min_c, c_ycocg);
            max_c = max(max_c, c_ycocg);
        }
    }

    // Mean and standard deviation
    let mean = m1 / 9.0;
    let variance = max(m2 / 9.0 - mean * mean, vec3<f32>(0.0));
    let std_dev = sqrt(variance);

    // Tight variance box clamped within absolute min/max
    let gamma = 1.25;
    let box_min = max(min_c, mean - gamma * std_dev);
    let box_max = min(max_c, mean + gamma * std_dev);

    let history_sample = textureSample(t_history, s_sampler, in.uv);
    let history_ycocg = rgb_to_ycocg(history_sample.rgb);

    // Variance Clamping
    let clamped_ycocg = clamp(history_ycocg, box_min, box_max);
    let clamped_history = clamp(ycocg_to_rgb(clamped_ycocg), vec3<f32>(0.0), vec3<f32>(1.0));

    // Dynamic blend weight based on luminance difference (eliminates ghosting on moving edges)
    let current_ycocg = rgb_to_ycocg(current_sample.rgb);
    let luma_diff = abs(history_ycocg.x - current_ycocg.x);
    let max_luma = max(history_ycocg.x, current_ycocg.x);
    let luma_contrast = luma_diff / max(max_luma + 0.1, 0.001);

    // If luminance changed significantly (e.g. object moved across background), reduce history weight
    let responsive_blend = mix(u_params.blend_factor, 0.0, clamp(luma_contrast * 2.5, 0.0, 1.0));

    let blended_rgb = mix(current_sample.rgb, clamped_history, responsive_blend);
    let blended_alpha = current_sample.a;

    return vec4<f32>(blended_rgb, blended_alpha);
}
"#;

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct TaaParamsUniform {
    pub blend_factor: f32,
    pub _pad0: f32,
    pub _pad1: f32,
    pub _pad2: f32,
}

pub struct TaaPipeline {
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: GpuShared<wgpu::BindGroupLayout>,
    sampler: wgpu::Sampler,
    param_buffer: wgpu::Buffer,
}

impl TaaPipeline {
    pub fn new(device: &wgpu::Device, target_format: wgpu::TextureFormat) -> Self {
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("TAA Linear Clamp Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });

        let param_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("TAA Param Uniform Buffer"),
            size: std::mem::size_of::<TaaParamsUniform>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let bind_group_layout = GpuShared::new(device.create_bind_group_layout(
            &wgpu::BindGroupLayoutDescriptor {
                label: Some("TAA Bind Group Layout"),
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
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 3,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                ],
            },
        ));

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("TAA Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            immediate_size: 0,
        });

        let shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("TAA Shader Module"),
            source: wgpu::ShaderSource::Wgsl(WGSL_TAA.into()),
        });

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("TAA Render Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader_module,
                entry_point: Some("vs_screen"),
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader_module,
                entry_point: Some("fs_taa"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: target_format,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        Self {
            pipeline,
            bind_group_layout,
            sampler,
            param_buffer,
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn render_taa(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        current_view: &wgpu::TextureView,
        history_view: &wgpu::TextureView,
        dst_view: &wgpu::TextureView,
        blend_factor: f32,
        viewport: Option<glam::UVec4>,
    ) {
        let params = TaaParamsUniform {
            blend_factor,
            _pad0: 0.0,
            _pad1: 0.0,
            _pad2: 0.0,
        };
        queue.write_buffer(&self.param_buffer, 0, bytemuck::bytes_of(&params));

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("TAA Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(current_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(history_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: self.param_buffer.as_entire_binding(),
                },
            ],
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("TAA Command Encoder"),
        });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("TAA Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: dst_view,
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

            if let Some(vp) = viewport {
                pass.set_viewport(vp.x as f32, vp.y as f32, vp.z as f32, vp.w as f32, 0.0, 1.0);
            }

            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1);
        }

        queue.submit(Some(encoder.finish()));
    }
}

/// Computes the 16-phase Halton sequence radical inverse.
pub fn halton(mut index: u32, base: u32) -> f32 {
    let mut f = 1.0;
    let mut r = 0.0;
    let base_f = base as f32;
    while index > 0 {
        f /= base_f;
        r += f * (index % base) as f32;
        index /= base;
    }
    r
}

/// Computes subpixel jitter offset in clip-space NDC `[-1, 1]` for a given frame and viewport dimension.
pub fn compute_subpixel_jitter(frame_id: u64, width: u32, height: u32) -> Vec2 {
    let phase = ((frame_id % 16) + 1) as u32;
    let hx = halton(phase, 2);
    let hy = halton(phase, 3);
    let jx = (hx - 0.5) * (2.0 / width.max(1) as f32);
    let jy = (hy - 0.5) * (2.0 / height.max(1) as f32);
    Vec2::new(jx, jy)
}
