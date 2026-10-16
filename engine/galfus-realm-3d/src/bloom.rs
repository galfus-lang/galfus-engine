//! Multi-scale Bloom HDR glow pipeline with 4-level progressive downsample/upsample pyramid.

use galfus_realm_3d_resources::environment::BloomConfig3D;
use glam::Vec4;

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct BloomParamsUniform {
    params0: Vec4, // threshold, knee, texel_x, texel_y
    params1: Vec4, // intensity, scatter, 0.0, 0.0
}

const BLOOM_SHADER: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

struct BloomParams {
    params0: vec4<f32>, // threshold, knee, texel_x, texel_y
    params1: vec4<f32>, // intensity, scatter, 0.0, 0.0
};

@vertex
fn vs_main(@builtin(vertex_index) id: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(id << 1u) & 2) * 2.0 - 1.0;
    let y = f32(i32(id & 2u) * -2) + 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

@group(0) @binding(0) var t_input: texture_2d<f32>;
@group(0) @binding(1) var s_input: sampler;
@group(0) @binding(2) var<uniform> bloom: BloomParams;

fn soft_threshold(color: vec3<f32>) -> vec3<f32> {
    let threshold = bloom.params0.x;
    let knee = max(bloom.params0.y, 0.0001);
    let luma = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
    let soft = clamp((luma - threshold + knee) / (2.0 * knee), 0.0, 1.0);
    let factor = max(luma - threshold, 0.0) + soft * soft * (knee * 0.25);
    if (luma > 0.0001) {
        return color * (factor / luma);
    }
    return vec3<f32>(0.0);
}

@fragment
fn fs_extract(in: VertexOutput) -> @location(0) vec4<f32> {
    let raw = textureSample(t_input, s_input, in.uv).rgb;
    let filtered = soft_threshold(raw);
    return vec4<f32>(filtered, 1.0);
}

// 13-tap Karis/Jimenez downsample with 1-texel offset (zero ghosting)
@fragment
fn fs_downsample(in: VertexOutput) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(t_input));
    let texel = 1.0 / dims;
    let a = textureSample(t_input, s_input, in.uv + texel * vec2<f32>(-0.5, -0.5)).rgb;
    let b = textureSample(t_input, s_input, in.uv + texel * vec2<f32>( 0.5, -0.5)).rgb;
    let c = textureSample(t_input, s_input, in.uv + texel * vec2<f32>(-0.5,  0.5)).rgb;
    let d = textureSample(t_input, s_input, in.uv + texel * vec2<f32>( 0.5,  0.5)).rgb;

    let e = textureSample(t_input, s_input, in.uv + texel * vec2<f32>(-1.0, -1.0)).rgb;
    let f = textureSample(t_input, s_input, in.uv + texel * vec2<f32>( 1.0, -1.0)).rgb;
    let g = textureSample(t_input, s_input, in.uv + texel * vec2<f32>(-1.0,  1.0)).rgb;
    let h = textureSample(t_input, s_input, in.uv + texel * vec2<f32>( 1.0,  1.0)).rgb;

    let i = textureSample(t_input, s_input, in.uv + texel * vec2<f32>( 0.0, -1.0)).rgb;
    let j = textureSample(t_input, s_input, in.uv + texel * vec2<f32>( 0.0,  1.0)).rgb;
    let k = textureSample(t_input, s_input, in.uv + texel * vec2<f32>(-1.0,  0.0)).rgb;
    let l = textureSample(t_input, s_input, in.uv + texel * vec2<f32>( 1.0,  0.0)).rgb;

    let m = textureSample(t_input, s_input, in.uv).rgb;

    let box = (a + b + c + d) * 0.125;
    let corners = (e + f + g + h) * 0.03125;
    let cardinals = (i + j + k + l) * 0.0625;
    let center = m * 0.125;

    return vec4<f32>(box + corners + cardinals + center, 1.0);
}

// 9-tap 3x3 tent filter with 1-texel offset for smooth continuous upsample
@fragment
fn fs_upsample(in: VertexOutput) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(t_input));
    let texel = (1.0 / dims) * bloom.params1.y;
    let tl = textureSample(t_input, s_input, in.uv + texel * vec2<f32>(-1.0, -1.0)).rgb;
    let tc = textureSample(t_input, s_input, in.uv + texel * vec2<f32>( 0.0, -1.0)).rgb;
    let tr = textureSample(t_input, s_input, in.uv + texel * vec2<f32>( 1.0, -1.0)).rgb;
    let ml = textureSample(t_input, s_input, in.uv + texel * vec2<f32>(-1.0,  0.0)).rgb;
    let mc = textureSample(t_input, s_input, in.uv).rgb;
    let mr = textureSample(t_input, s_input, in.uv + texel * vec2<f32>( 1.0,  0.0)).rgb;
    let bl = textureSample(t_input, s_input, in.uv + texel * vec2<f32>(-1.0,  1.0)).rgb;
    let bc = textureSample(t_input, s_input, in.uv + texel * vec2<f32>( 0.0,  1.0)).rgb;
    let br = textureSample(t_input, s_input, in.uv + texel * vec2<f32>( 1.0,  1.0)).rgb;

    let row0 = tl + tc * 2.0 + tr;
    let row1 = ml * 2.0 + mc * 4.0 + mr * 2.0;
    let row2 = bl + bc * 2.0 + br;
    return vec4<f32>((row0 + row1 + row2) * (1.0 / 16.0), 1.0);
}

// Final additive composite onto destination target
@fragment
fn fs_apply(in: VertexOutput) -> @location(0) vec4<f32> {
    let glow = textureSample(t_input, s_input, in.uv).rgb;
    let intensity = bloom.params1.x;
    return vec4<f32>(glow * intensity, 0.0);
}
"#;

struct BloomMip {
    _texture: wgpu::Texture,
    view: wgpu::TextureView,
    width: u32,
    height: u32,
}

/// Multi-scale HDR Bloom pass renderer.
pub struct BloomPipeline3D {
    extract_pipeline: wgpu::RenderPipeline,
    downsample_pipeline: wgpu::RenderPipeline,
    upsample_pipeline: wgpu::RenderPipeline,
    apply_pipeline: wgpu::RenderPipeline,
    pub layout: wgpu::BindGroupLayout,
    params_buffer: wgpu::Buffer,
    mips: Vec<BloomMip>,
    sampler: wgpu::Sampler,
    size: (u32, u32),
}

impl BloomPipeline3D {
    pub fn new(
        device: &wgpu::Device,
        target_format: wgpu::TextureFormat,
        width: u32,
        height: u32,
    ) -> Self {
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Bloom Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let params_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Bloom Params Buffer"),
            size: std::mem::size_of::<BloomParamsUniform>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Bloom Bind Group Layout"),
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

        let pipe_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Bloom Pipeline Layout"),
            bind_group_layouts: &[&layout],
            immediate_size: 0,
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Bloom Shader Module"),
            source: wgpu::ShaderSource::Wgsl(BLOOM_SHADER.into()),
        });

        // 1. Extract pipeline
        let extract_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Bloom Extract Pipeline"),
            layout: Some(&pipe_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_extract"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba16Float,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        // 2. Downsample pipeline
        let downsample_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Bloom Downsample Pipeline"),
            layout: Some(&pipe_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_downsample"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba16Float,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        // 3. Upsample pipeline (Additive accumulation)
        let upsample_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Bloom Upsample Pipeline"),
            layout: Some(&pipe_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_upsample"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba16Float,
                    blend: Some(wgpu::BlendState {
                        color: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::One,
                            dst_factor: wgpu::BlendFactor::One,
                            operation: wgpu::BlendOperation::Add,
                        },
                        alpha: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::Zero,
                            dst_factor: wgpu::BlendFactor::One,
                            operation: wgpu::BlendOperation::Add,
                        },
                    }),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        // 4. Apply pipeline (Additive blend onto target)
        let apply_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Bloom Apply Pipeline"),
            layout: Some(&pipe_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_apply"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: target_format,
                    blend: Some(wgpu::BlendState {
                        color: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::One,
                            dst_factor: wgpu::BlendFactor::One,
                            operation: wgpu::BlendOperation::Add,
                        },
                        alpha: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::Zero,
                            dst_factor: wgpu::BlendFactor::One,
                            operation: wgpu::BlendOperation::Add,
                        },
                    }),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        let mips = create_mips(device, width, height);

        Self {
            extract_pipeline,
            downsample_pipeline,
            upsample_pipeline,
            apply_pipeline,
            layout,
            params_buffer,
            mips,
            sampler,
            size: (width, height),
        }
    }

    /// Resizes bloom intermediate render targets if screen size changed.
    pub fn resize(&mut self, device: &wgpu::Device, width: u32, height: u32) {
        if self.size == (width, height) {
            return;
        }
        self.mips = create_mips(device, width, height);
        self.size = (width, height);
    }

    fn create_pass_bg(&self, device: &wgpu::Device, view: &wgpu::TextureView) -> wgpu::BindGroup {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Bloom Pass BG"),
            layout: &self.layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(view),
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
        })
    }

    /// Executes the multi-scale Bloom extraction, blur, and additive application.
    pub fn render(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        source_target_view: &wgpu::TextureView,
        destination_target_view: &wgpu::TextureView,
        config: &BloomConfig3D,
    ) {
        if !config.enabled || self.mips.len() < 2 {
            return;
        }

        let num_mips = self.mips.len();

        // 1. Extract bright areas from source into mips[0]
        {
            let uniform = BloomParamsUniform {
                params0: Vec4::new(
                    config.threshold,
                    config.knee,
                    1.0 / self.mips[0].width as f32,
                    1.0 / self.mips[0].height as f32,
                ),
                params1: Vec4::new(config.intensity, config.scatter, 0.0, 0.0),
            };
            queue.write_buffer(&self.params_buffer, 0, bytemuck::bytes_of(&uniform));

            let bg = self.create_pass_bg(device, source_target_view);
            let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Bloom Extract Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.mips[0].view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            rpass.set_pipeline(&self.extract_pipeline);
            rpass.set_bind_group(0, &bg, &[]);
            rpass.draw(0..3, 0..1);
        }

        // 2. Progressive Downsample (mips[0] -> mips[1] -> ... -> mips[num_mips - 1])
        for i in 0..(num_mips - 1) {
            let bg = self.create_pass_bg(device, &self.mips[i].view);
            let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Bloom Downsample Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.mips[i + 1].view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            rpass.set_pipeline(&self.downsample_pipeline);
            rpass.set_bind_group(0, &bg, &[]);
            rpass.draw(0..3, 0..1);
        }

        // 3. Progressive Upsample with Additive Accumulation (mips[N-1] -> ... -> mips[0])
        for i in (0..(num_mips - 1)).rev() {
            let bg = self.create_pass_bg(device, &self.mips[i + 1].view);
            let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Bloom Upsample Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.mips[i].view,
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
            rpass.set_pipeline(&self.upsample_pipeline);
            rpass.set_bind_group(0, &bg, &[]);
            rpass.draw(0..3, 0..1);
        }

        // 4. Final Additive Composite onto destination target
        {
            let bg = self.create_pass_bg(device, &self.mips[0].view);
            let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Bloom Apply Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: destination_target_view,
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
            rpass.set_pipeline(&self.apply_pipeline);
            rpass.set_bind_group(0, &bg, &[]);
            rpass.draw(0..3, 0..1);
        }
    }
}

fn create_mips(device: &wgpu::Device, width: u32, height: u32) -> Vec<BloomMip> {
    let mut mips = Vec::with_capacity(4);
    let mut cur_w = (width / 2).max(1);
    let mut cur_h = (height / 2).max(1);

    for idx in 0..4 {
        let label = format!("Bloom Mip {idx}");
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some(&label),
            size: wgpu::Extent3d {
                width: cur_w,
                height: cur_h,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        mips.push(BloomMip {
            _texture: texture,
            view,
            width: cur_w,
            height: cur_h,
        });

        if cur_w <= 2 || cur_h <= 2 {
            break;
        }
        cur_w = (cur_w / 2).max(1);
        cur_h = (cur_h / 2).max(1);
    }
    mips
}
