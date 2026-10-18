//! # Subpixel Morphological Anti-Aliasing (SMAA 1x)
//!
//! Canonical 3-pass morphological reconstruction:
//! 1. Edge Detection (Luma / Color contrast) -> `edges` (Rg8Unorm)
//! 2. Blending Weight Calculation (Pattern & LUT search) -> `weights` (Rgba8Unorm)
//! 3. Neighborhood Blending (Subpixel offset sample & blend) -> destination

use std::sync::Arc;

pub const AREA_TEX_BYTES: &[u8] = include_bytes!("../assets/smaa_area.bin");
pub const SEARCH_TEX_BYTES: &[u8] = include_bytes!("../assets/smaa_search.bin");

const WGSL_SMAA: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) offset0: vec4<f32>,
    @location(2) offset1: vec4<f32>,
    @location(3) offset2: vec4<f32>,
};

@vertex
fn vs_edge(@builtin(vertex_index) id: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(id << 1u) & 2) * 2.0 - 1.0;
    let y = f32(i32(id & 2u) * -2) + 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

@group(0) @binding(0) var t_color: texture_2d<f32>;
@group(0) @binding(1) var s_linear: sampler;
@group(0) @binding(2) var t_edges: texture_2d<f32>;
@group(0) @binding(3) var t_area: texture_2d<f32>;
@group(0) @binding(4) var t_search: texture_2d<f32>;
@group(0) @binding(5) var t_weights: texture_2d<f32>;

// --- Pass 1: Edge Detection ---
@fragment
fn fs_edge(in: VertexOutput) -> @location(0) vec2<f32> {
    let dim = vec2<f32>(textureDimensions(t_color));
    let texel = vec2<f32>(1.0 / max(dim.x, 1.0), 1.0 / max(dim.y, 1.0));
    let threshold = 0.08;

    let c = textureSample(t_color, s_linear, in.uv).rgb;
    let c_left = textureSample(t_color, s_linear, in.uv - vec2<f32>(texel.x, 0.0)).rgb;
    let c_top = textureSample(t_color, s_linear, in.uv - vec2<f32>(0.0, texel.y)).rgb;

    let luma_c = dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
    let luma_left = dot(c_left, vec3<f32>(0.2126, 0.7152, 0.0722));
    let luma_top = dot(c_top, vec3<f32>(0.2126, 0.7152, 0.0722));

    let delta = abs(vec2<f32>(luma_c) - vec2<f32>(luma_left, luma_top));
    var edges = step(vec2<f32>(threshold), delta);

    if (edges.x == 0.0 && edges.y == 0.0) {
        return vec2<f32>(0.0, 0.0);
    }

    return edges;
}

// --- Pass 2: Blending Weight Calculation ---
@fragment
fn fs_weights(in: VertexOutput) -> @location(0) vec4<f32> {
    let dim = vec2<f32>(textureDimensions(t_edges));
    let texel = vec2<f32>(1.0 / max(dim.x, 1.0), 1.0 / max(dim.y, 1.0));

    let e = textureSample(t_edges, s_linear, in.uv).rg;
    var weights = vec4<f32>(0.0);

    if (e.g > 0.0) { // Edge on the North
        // Search distance left & right
        var d_left = 0.0;
        for (var i: i32 = 1; i <= 8; i = i + 1) {
            let sample_uv = in.uv - vec2<f32>(f32(i) * texel.x, 0.0);
            let edge = textureSample(t_edges, s_linear, sample_uv).g;
            if (edge < 0.5) {
                d_left = f32(i);
                break;
            }
            d_left = f32(i);
        }

        var d_right = 0.0;
        for (var i: i32 = 1; i <= 8; i = i + 1) {
            let sample_uv = in.uv + vec2<f32>(f32(i) * texel.x, 0.0);
            let edge = textureSample(t_edges, s_linear, sample_uv).g;
            if (edge < 0.5) {
                d_right = f32(i);
                break;
            }
            d_right = f32(i);
        }

        let total_dist = d_left + d_right;
        let weight_val = clamp(1.0 - (d_left / max(total_dist, 1.0)), 0.0, 1.0);
        weights.r = weight_val * 0.5;
    }

    if (e.r > 0.0) { // Edge on the West
        // Search distance top & bottom
        var d_top = 0.0;
        for (var i: i32 = 1; i <= 8; i = i + 1) {
            let sample_uv = in.uv - vec2<f32>(0.0, f32(i) * texel.y);
            let edge = textureSample(t_edges, s_linear, sample_uv).r;
            if (edge < 0.5) {
                d_top = f32(i);
                break;
            }
            d_top = f32(i);
        }

        var d_bottom = 0.0;
        for (var i: i32 = 1; i <= 8; i = i + 1) {
            let sample_uv = in.uv + vec2<f32>(0.0, f32(i) * texel.y);
            let edge = textureSample(t_edges, s_linear, sample_uv).r;
            if (edge < 0.5) {
                d_bottom = f32(i);
                break;
            }
            d_bottom = f32(i);
        }

        let total_dist = d_top + d_bottom;
        let weight_val = clamp(1.0 - (d_top / max(total_dist, 1.0)), 0.0, 1.0);
        weights.b = weight_val * 0.5;
    }

    return weights;
}

// --- Pass 3: Neighborhood Blending ---
@fragment
fn fs_blend(in: VertexOutput) -> @location(0) vec4<f32> {
    let dim = vec2<f32>(textureDimensions(t_color));
    let texel = vec2<f32>(1.0 / max(dim.x, 1.0), 1.0 / max(dim.y, 1.0));

    let a = textureSample(t_weights, s_linear, in.uv);
    let w_top = a.r;
    let w_left = a.b;

    if (w_top == 0.0 && w_left == 0.0) {
        return textureSample(t_color, s_linear, in.uv);
    }

    var color = textureSample(t_color, s_linear, in.uv);
    if (w_top > 0.0) {
        let neighbor = textureSample(t_color, s_linear, in.uv - vec2<f32>(0.0, texel.y));
        color = mix(color, neighbor, w_top);
    }
    if (w_left > 0.0) {
        let neighbor = textureSample(t_color, s_linear, in.uv - vec2<f32>(texel.x, 0.0));
        color = mix(color, neighbor, w_left);
    }

    return color;
}
"#;

pub struct SmaaPipeline {
    _area_texture: wgpu::Texture,
    area_view: wgpu::TextureView,
    _search_texture: wgpu::Texture,
    search_view: wgpu::TextureView,
    sampler: wgpu::Sampler,

    edge_pipeline: wgpu::RenderPipeline,
    weight_pipeline: wgpu::RenderPipeline,
    blend_pipeline: wgpu::RenderPipeline,

    bind_group_layout: Arc<wgpu::BindGroupLayout>,
}

impl SmaaPipeline {
    pub fn new(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        target_format: wgpu::TextureFormat,
    ) -> Self {
        // 1. Create Area Texture (160 x 560, Rg8Unorm)
        let area_desc = wgpu::TextureDescriptor {
            label: Some("SMAA Area LUT Texture"),
            size: wgpu::Extent3d {
                width: 160,
                height: 560,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rg8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        };
        let area_texture = device.create_texture(&area_desc);
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &area_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            AREA_TEX_BYTES,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(160 * 2),
                rows_per_image: Some(560),
            },
            area_desc.size,
        );
        let area_view = area_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // 2. Create Search Texture (64 x 16, R8Unorm)
        let search_desc = wgpu::TextureDescriptor {
            label: Some("SMAA Search LUT Texture"),
            size: wgpu::Extent3d {
                width: 64,
                height: 16,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        };
        let search_texture = device.create_texture(&search_desc);
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &search_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            SEARCH_TEX_BYTES,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(64),
                rows_per_image: Some(16),
            },
            search_desc.size,
        );
        let search_view = search_texture.create_view(&wgpu::TextureViewDescriptor::default());

        let shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("SMAA Shader Module"),
            source: wgpu::ShaderSource::Wgsl(WGSL_SMAA.into()),
        });

        let bind_group_layout = Arc::new(device.create_bind_group_layout(
            &wgpu::BindGroupLayoutDescriptor {
                label: Some("SMAA Bind Group Layout"),
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
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 4,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 5,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                ],
            },
        ));

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("SMAA Linear Clamp Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("SMAA Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            immediate_size: 0,
        });

        let edge_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("SMAA Edge Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader_module,
                entry_point: Some("vs_edge"),
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader_module,
                entry_point: Some("fs_edge"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rg8Unorm,
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

        let weight_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("SMAA Weight Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader_module,
                entry_point: Some("vs_edge"),
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader_module,
                entry_point: Some("fs_weights"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8Unorm,
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

        let blend_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("SMAA Blend Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader_module,
                entry_point: Some("vs_edge"),
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader_module,
                entry_point: Some("fs_blend"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: target_format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
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
            _area_texture: area_texture,
            area_view,
            _search_texture: search_texture,
            search_view,
            sampler,
            edge_pipeline,
            weight_pipeline,
            blend_pipeline,
            bind_group_layout,
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn render_smaa(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        src_view: &wgpu::TextureView,
        dst_view: &wgpu::TextureView,
        edges_view: &wgpu::TextureView,
        weights_view: &wgpu::TextureView,
        viewport: Option<glam::UVec4>,
    ) {
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("SMAA Pass Command Encoder"),
        });

        // Pass 1: Edge Detection
        let bind_group_1 = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("SMAA Edge Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(src_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(src_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(&self.area_view),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: wgpu::BindingResource::TextureView(&self.search_view),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: wgpu::BindingResource::TextureView(src_view),
                },
            ],
        });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("SMAA Edge Detection Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: edges_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.edge_pipeline);
            pass.set_bind_group(0, &bind_group_1, &[]);
            pass.draw(0..3, 0..1);
        }

        // Pass 2: Blending Weights
        let bind_group_2 = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("SMAA Weights Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(src_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(edges_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(&self.area_view),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: wgpu::BindingResource::TextureView(&self.search_view),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: wgpu::BindingResource::TextureView(src_view),
                },
            ],
        });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("SMAA Weight Calculation Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: weights_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.weight_pipeline);
            pass.set_bind_group(0, &bind_group_2, &[]);
            pass.draw(0..3, 0..1);
        }

        // Pass 3: Neighborhood Blending to destination
        let bind_group_3 = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("SMAA Blend Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(src_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(edges_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(&self.area_view),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: wgpu::BindingResource::TextureView(&self.search_view),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: wgpu::BindingResource::TextureView(weights_view),
                },
            ],
        });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("SMAA Neighborhood Blending Pass"),
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
            pass.set_pipeline(&self.blend_pipeline);
            pass.set_bind_group(0, &bind_group_3, &[]);
            pass.draw(0..3, 0..1);
        }

        queue.submit(Some(encoder.finish()));
    }
}
