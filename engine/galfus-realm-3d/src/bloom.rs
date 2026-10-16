//! Multi-scale Bloom HDR glow pipeline with soft-threshold prefiltering,
//! downsampling, and additive tent filter blending.

use bytemuck::{Pod, Zeroable};
use galfus_realm_3d_resources::environment::BloomConfig3D;
use glam::Vec4;

#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
struct BloomParamsUniform {
    // x: threshold, y: knee, z: texel_x, w: texel_y
    params0: Vec4,
    // x: intensity, y: scatter, z: 0.0, w: 0.0
    params1: Vec4,
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
    let x = f32((i32(id) << 1) & 2) * 2.0 - 1.0;
    let y = f32(i32(id) & 2) * -2.0 + 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>(x * 0.5 + 0.5, 1.0 - (y * 0.5 + 0.5));
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

// 9-tap tent filter (1-2-1 kernel)
fn sample_tent(uv: vec2<f32>, texel: vec2<f32>) -> vec3<f32> {
    let tl = textureSample(t_input, s_input, uv + texel * vec2<f32>(-1.0, -1.0)).rgb;
    let tc = textureSample(t_input, s_input, uv + texel * vec2<f32>(0.0, -1.0)).rgb;
    let tr = textureSample(t_input, s_input, uv + texel * vec2<f32>(1.0, -1.0)).rgb;
    let ml = textureSample(t_input, s_input, uv + texel * vec2<f32>(-1.0, 0.0)).rgb;
    let mc = textureSample(t_input, s_input, uv).rgb;
    let mr = textureSample(t_input, s_input, uv + texel * vec2<f32>(1.0, 0.0)).rgb;
    let bl = textureSample(t_input, s_input, uv + texel * vec2<f32>(-1.0, 1.0)).rgb;
    let bc = textureSample(t_input, s_input, uv + texel * vec2<f32>(0.0, 1.0)).rgb;
    let br = textureSample(t_input, s_input, uv + texel * vec2<f32>(1.0, 1.0)).rgb;

    let row0 = tl + tc * 2.0 + tr;
    let row1 = ml * 2.0 + mc * 4.0 + mr * 2.0;
    let row2 = bl + bc * 2.0 + br;
    return (row0 + row1 + row2) * (1.0 / 16.0);
}

@fragment
fn fs_extract(in: VertexOutput) -> @location(0) vec4<f32> {
    let raw = textureSample(t_input, s_input, in.uv).rgb;
    let filtered = soft_threshold(raw);
    return vec4<f32>(filtered, 1.0);
}

@fragment
fn fs_blur(in: VertexOutput) -> @location(0) vec4<f32> {
    let texel = bloom.params0.zw;
    let color = sample_tent(in.uv, texel);
    return vec4<f32>(color, 1.0);
}

@fragment
fn fs_apply(in: VertexOutput) -> @location(0) vec4<f32> {
    let texel = bloom.params0.zw;
    let glow = sample_tent(in.uv, texel);
    let intensity = bloom.params1.x;
    return vec4<f32>(glow * intensity, 1.0);
}
"#;

/// Multi-scale HDR Bloom pass renderer.
pub struct BloomPipeline3D {
    extract_pipeline: wgpu::RenderPipeline,
    blur_pipeline: wgpu::RenderPipeline,
    apply_pipeline: wgpu::RenderPipeline,
    pub layout: wgpu::BindGroupLayout,
    params_buffer: wgpu::Buffer,
    extract_tex: wgpu::Texture,
    pub extract_view: wgpu::TextureView,
    blur_tex: wgpu::Texture,
    pub blur_view: wgpu::TextureView,
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
        let half_w = (width / 2).max(1);
        let half_h = (height / 2).max(1);
        let quarter_w = (width / 4).max(1);
        let quarter_h = (height / 4).max(1);

        let (extract_tex, extract_view) = create_target(device, half_w, half_h, "Bloom Extract");
        let (blur_tex, blur_view) = create_target(device, quarter_w, quarter_h, "Bloom Blur");

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

        // 2. Blur pipeline
        let blur_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Bloom Blur Pipeline"),
            layout: Some(&pipe_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_blur"),
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

        // 3. Apply pipeline (Additive blend onto target)
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
                        alpha: wgpu::BlendComponent::OVER,
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

        Self {
            extract_pipeline,
            blur_pipeline,
            apply_pipeline,
            layout,
            params_buffer,
            extract_tex,
            extract_view,
            blur_tex,
            blur_view,
            sampler,
            size: (width, height),
        }
    }

    /// Resizes bloom intermediate render targets if screen size changed.
    pub fn resize(&mut self, device: &wgpu::Device, width: u32, height: u32) {
        if self.size == (width, height) {
            return;
        }
        let half_w = (width / 2).max(1);
        let half_h = (height / 2).max(1);
        let quarter_w = (width / 4).max(1);
        let quarter_h = (height / 4).max(1);

        let (extract_tex, extract_view) = create_target(device, half_w, half_h, "Bloom Extract");
        let (blur_tex, blur_view) = create_target(device, quarter_w, quarter_h, "Bloom Blur");
        self.extract_tex = extract_tex;
        self.extract_view = extract_view;
        self.blur_tex = blur_tex;
        self.blur_view = blur_view;
        self.size = (width, height);
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
        if !config.enabled {
            return;
        }

        let half_w = (self.size.0 / 2).max(1);
        let half_h = (self.size.1 / 2).max(1);

        let uniform = BloomParamsUniform {
            params0: Vec4::new(
                config.threshold,
                config.knee,
                1.0 / half_w as f32,
                1.0 / half_h as f32,
            ),
            params1: Vec4::new(config.intensity, config.scatter, 0.0, 0.0),
        };
        queue.write_buffer(&self.params_buffer, 0, bytemuck::bytes_of(&uniform));

        // Step 1: Extract bright areas from source into extract_view
        let extract_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Bloom Extract Bind Group"),
            layout: &self.layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(source_target_view),
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

        {
            let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Bloom Extract Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.extract_view,
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
            rpass.set_bind_group(0, &extract_bg, &[]);
            rpass.draw(0..3, 0..1);
        }

        // Step 2: Blur extract_view into blur_view
        let blur_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Bloom Blur Bind Group"),
            layout: &self.layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&self.extract_view),
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

        {
            let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Bloom Blur Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.blur_view,
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
            rpass.set_pipeline(&self.blur_pipeline);
            rpass.set_bind_group(0, &blur_bg, &[]);
            rpass.draw(0..3, 0..1);
        }

        // Step 3: Additive blend blurred glow onto destination target
        let apply_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Bloom Apply Bind Group"),
            layout: &self.layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&self.blur_view),
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

        {
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
            rpass.set_bind_group(0, &apply_bg, &[]);
            rpass.draw(0..3, 0..1);
        }
    }
}

fn create_target(
    device: &wgpu::Device,
    width: u32,
    height: u32,
    label: &str,
) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size: wgpu::Extent3d {
            width,
            height,
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
    (texture, view)
}
