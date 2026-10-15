//! Screen-Space Ambient Occlusion (SSAO) pass with Reverse-Z depth reconstruction,
//! bilateral edge-preserving blur, and multiplicative screen blending.

use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec4};
use wgpu::util::DeviceExt;

use galfus_realm_3d_resources::environment::SsaoConfig3D;

pub use crate::ssao_shader::{SSAO_APPLY_SHADER, SSAO_BLUR_SHADER, SSAO_SHADER};

#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
struct SsaoParamsUniform {
    proj: Mat4,
    inv_proj: Mat4,
    params0: Vec4,
    params1: Vec4,
}

#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
struct BlurParamsUniform {
    params: Vec4,
}

/// Pipeline and textures managing SSAO computation, bilateral blur, and multiplicative apply.
pub struct SsaoPipeline3D {
    pub ssao_pipeline: wgpu::RenderPipeline,
    pub blur_pipeline: wgpu::RenderPipeline,
    pub apply_pipeline: wgpu::RenderPipeline,
    pub ssao_layout: wgpu::BindGroupLayout,
    pub blur_layout: wgpu::BindGroupLayout,
    pub apply_layout: wgpu::BindGroupLayout,
    pub ssao_params_buf: wgpu::Buffer,
    pub blur_params_buf: wgpu::Buffer,
    pub raw_texture: wgpu::Texture,
    pub raw_view: wgpu::TextureView,
    pub blurred_texture: wgpu::Texture,
    pub blurred_view: wgpu::TextureView,
    pub sampler: wgpu::Sampler,
    pub size: (u32, u32),
}

impl SsaoPipeline3D {
    pub fn new(
        device: &wgpu::Device,
        target_format: wgpu::TextureFormat,
        width: u32,
        height: u32,
    ) -> Self {
        let (raw_texture, raw_view) = create_target(device, width, height, "SSAO Raw");
        let (blurred_texture, blurred_view) = create_target(device, width, height, "SSAO Blurred");

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("SSAO Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        // 1. SSAO Layout & Pipeline
        let ssao_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("SSAO Compute Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Depth,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
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

        let dummy_ssao_params = SsaoParamsUniform {
            proj: Mat4::IDENTITY,
            inv_proj: Mat4::IDENTITY,
            params0: Vec4::new(0.5, 0.025, 1.5, 1.0),
            params1: Vec4::new(1.0 / width as f32, 1.0 / height as f32, 0.0, 1.0),
        };
        let ssao_params_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("SSAO Params Buffer"),
            contents: bytemuck::bytes_of(&dummy_ssao_params),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let ssao_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("SSAO Shader"),
            source: wgpu::ShaderSource::Wgsl(SSAO_SHADER.into()),
        });
        let ssao_pipe_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("SSAO Pipeline Layout"),
            bind_group_layouts: &[&ssao_layout],
            immediate_size: 0,
        });
        let ssao_pipeline = create_fullscreen_pipeline(
            device,
            &ssao_pipe_layout,
            &ssao_shader,
            wgpu::TextureFormat::Rgba8Unorm,
            wgpu::BlendState::REPLACE,
        );

        // 2. Blur Layout & Pipeline
        let blur_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("SSAO Blur Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Depth,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
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
        let dummy_blur_params = BlurParamsUniform {
            params: Vec4::new(1.0 / width as f32, 1.0 / height as f32, 0.05, 2.0),
        };
        let blur_params_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("SSAO Blur Params Buffer"),
            contents: bytemuck::bytes_of(&dummy_blur_params),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let blur_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("SSAO Blur Shader"),
            source: wgpu::ShaderSource::Wgsl(SSAO_BLUR_SHADER.into()),
        });
        let blur_pipe_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("SSAO Blur Pipeline Layout"),
            bind_group_layouts: &[&blur_layout],
            immediate_size: 0,
        });
        let blur_pipeline = create_fullscreen_pipeline(
            device,
            &blur_pipe_layout,
            &blur_shader,
            wgpu::TextureFormat::Rgba8Unorm,
            wgpu::BlendState::REPLACE,
        );

        // 3. Apply Multiplicative Overlay Pipeline
        let apply_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("SSAO Apply Layout"),
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
            ],
        });
        let apply_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("SSAO Apply Shader"),
            source: wgpu::ShaderSource::Wgsl(SSAO_APPLY_SHADER.into()),
        });
        let apply_pipe_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("SSAO Apply Pipeline Layout"),
            bind_group_layouts: &[&apply_layout],
            immediate_size: 0,
        });

        // Multiplicative blend: dest = dest * src
        let mult_blend = wgpu::BlendState {
            color: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::Zero,
                dst_factor: wgpu::BlendFactor::Src,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: wgpu::BlendComponent::OVER,
        };
        let apply_pipeline = create_fullscreen_pipeline(
            device,
            &apply_pipe_layout,
            &apply_shader,
            target_format,
            mult_blend,
        );

        Self {
            ssao_pipeline,
            blur_pipeline,
            apply_pipeline,
            ssao_layout,
            blur_layout,
            apply_layout,
            ssao_params_buf,
            blur_params_buf,
            raw_texture,
            raw_view,
            blurred_texture,
            blurred_view,
            sampler,
            size: (width, height),
        }
    }

    /// Resizes internal SSAO render targets if the window dimensions have changed.
    pub fn resize(&mut self, device: &wgpu::Device, width: u32, height: u32) {
        if self.size != (width, height) && width > 0 && height > 0 {
            let (raw_texture, raw_view) = create_target(device, width, height, "SSAO Raw");
            let (blurred_texture, blurred_view) =
                create_target(device, width, height, "SSAO Blurred");
            self.raw_texture = raw_texture;
            self.raw_view = raw_view;
            self.blurred_texture = blurred_texture;
            self.blurred_view = blurred_view;
            self.size = (width, height);
        }
    }

    /// Renders SSAO raw generation, bilateral blur, and multiplicative overlay onto `target_view`.
    #[allow(clippy::too_many_arguments)]
    pub fn render(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        depth_view: &wgpu::TextureView,
        target_view: &wgpu::TextureView,
        proj: &Mat4,
        inv_proj: &Mat4,
        config: &SsaoConfig3D,
    ) {
        let (width, height) = self.size;
        let ssao_params = SsaoParamsUniform {
            proj: *proj,
            inv_proj: *inv_proj,
            params0: Vec4::new(config.radius, config.bias, config.power, config.intensity),
            params1: Vec4::new(1.0 / width as f32, 1.0 / height as f32, 0.0, 1.0),
        };
        queue.write_buffer(&self.ssao_params_buf, 0, bytemuck::bytes_of(&ssao_params));

        let blur_params = BlurParamsUniform {
            params: Vec4::new(
                1.0 / width as f32,
                1.0 / height as f32,
                0.05,
                config.blur_radius as f32,
            ),
        };
        queue.write_buffer(&self.blur_params_buf, 0, bytemuck::bytes_of(&blur_params));

        // Pass 1: SSAO Compute
        let ssao_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("SSAO Bind Group"),
            layout: &self.ssao_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(depth_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: self.ssao_params_buf.as_entire_binding(),
                },
            ],
        });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("SSAO Compute Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.raw_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::WHITE),
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.ssao_pipeline);
            pass.set_bind_group(0, &ssao_bg, &[]);
            pass.draw(0..3, 0..1);
        }

        // Pass 2: Bilateral Blur
        let blur_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("SSAO Blur Bind Group"),
            layout: &self.blur_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&self.raw_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(depth_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: self.blur_params_buf.as_entire_binding(),
                },
            ],
        });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("SSAO Blur Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.blurred_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::WHITE),
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.blur_pipeline);
            pass.set_bind_group(0, &blur_bg, &[]);
            pass.draw(0..3, 0..1);
        }

        // Pass 3: Multiplicative Apply onto Scene Color
        let apply_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("SSAO Apply Bind Group"),
            layout: &self.apply_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&self.blurred_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
            ],
        });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("SSAO Apply Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target_view,
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
            pass.set_pipeline(&self.apply_pipeline);
            pass.set_bind_group(0, &apply_bg, &[]);
            pass.draw(0..3, 0..1);
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
            width: width.max(1),
            height: height.max(1),
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    (texture, view)
}

fn create_fullscreen_pipeline(
    device: &wgpu::Device,
    layout: &wgpu::PipelineLayout,
    shader: &wgpu::ShaderModule,
    target_format: wgpu::TextureFormat,
    blend: wgpu::BlendState,
) -> wgpu::RenderPipeline {
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("Fullscreen Pipeline"),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some("vs_main"),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: shader,
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
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview_mask: None,
        cache: None,
    })
}
