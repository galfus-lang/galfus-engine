//! Render pipeline definition for 3D forward rendering with Reverse-Z.

use galfus_realm_3d_resources::geometry::Vertex3D;

use std::collections::HashMap;

pub struct Pipeline3D {
    pub render_pipeline: wgpu::RenderPipeline,
    pub transparent_pipeline: wgpu::RenderPipeline,
    pub instanced_render_pipeline: wgpu::RenderPipeline,
    pub instanced_transparent_pipeline: wgpu::RenderPipeline,
    pub pipeline_layout: wgpu::PipelineLayout,
    pub scene_layout: wgpu::BindGroupLayout,
    pub material_layout: wgpu::BindGroupLayout,
    pub model_layout: wgpu::BindGroupLayout,
    pub refraction_layout: wgpu::BindGroupLayout,
    pub dummy_refraction_bg: wgpu::BindGroup,
    pub samplers: galfus_gpu_manager::StandardSamplers,
    pub fallback_white_view: wgpu::TextureView,
    pub fallback_normal_view: wgpu::TextureView,
    pub fallback_black_view: wgpu::TextureView,
    _fallback_textures: (wgpu::Texture, wgpu::Texture, wgpu::Texture),
    pub target_format: wgpu::TextureFormat,
    custom_pipelines: HashMap<(u64, bool, bool), wgpu::RenderPipeline>,
}

fn create_1x1_texture(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    label: &str,
    color: [u8; 4],
) -> (wgpu::Texture, wgpu::TextureView) {
    let size = wgpu::Extent3d {
        width: 1,
        height: 1,
        depth_or_array_layers: 1,
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &color,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(4),
            rows_per_image: Some(1),
        },
        size,
    );
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    (texture, view)
}

pub(crate) fn get_instance_buffer_layout() -> wgpu::VertexBufferLayout<'static> {
    const ATTRS: &[wgpu::VertexAttribute] = &[
        // m0 (location 6)
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 0,
            shader_location: 6,
        },
        // m1 (location 7)
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 16,
            shader_location: 7,
        },
        // m2 (location 8)
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 32,
            shader_location: 8,
        },
        // m3 (location 9)
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 48,
            shader_location: 9,
        },
        // color (location 10)
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 64,
            shader_location: 10,
        },
        // emissive (location 11)
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 80,
            shader_location: 11,
        },
        // pbr (location 12)
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 96,
            shader_location: 12,
        },
        // custom (location 13)
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 112,
            shader_location: 13,
        },
    ];

    wgpu::VertexBufferLayout {
        array_stride: std::mem::size_of::<galfus_realm_3d_resources::model::InstanceData3D>()
            as wgpu::BufferAddress,
        step_mode: wgpu::VertexStepMode::Instance,
        attributes: ATTRS,
    }
}

fn create_3d_render_pipeline(
    device: &wgpu::Device,
    layout: &wgpu::PipelineLayout,
    shader: &wgpu::ShaderModule,
    target_format: wgpu::TextureFormat,
    depth_write_enabled: bool,
    instanced: bool,
) -> wgpu::RenderPipeline {
    let vertex_buffer_layout = wgpu::VertexBufferLayout {
        array_stride: std::mem::size_of::<Vertex3D>() as wgpu::BufferAddress,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &[
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x3,
                offset: 0,
                shader_location: 0,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x3,
                offset: 12,
                shader_location: 1,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x2,
                offset: 24,
                shader_location: 2,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 32,
                shader_location: 3,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Uint32x4,
                offset: 48,
                shader_location: 4,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 64,
                shader_location: 5,
            },
        ],
    };

    let instance_layout = get_instance_buffer_layout();
    let buffers: &[wgpu::VertexBufferLayout] = if instanced {
        &[vertex_buffer_layout, instance_layout]
    } else {
        std::slice::from_ref(&vertex_buffer_layout)
    };
    let entry_point = if instanced {
        "vs_instanced_main"
    } else {
        "vs_main"
    };

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(if instanced {
            "Realm3D Instanced Pipeline"
        } else {
            "Realm3D Render Pipeline"
        }),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some(entry_point),
            buffers,
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some("fs_main"),
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
            cull_mode: Some(wgpu::Face::Back),
            polygon_mode: wgpu::PolygonMode::Fill,
            unclipped_depth: false,
            conservative: false,
        },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth32Float,
            depth_write_enabled,
            depth_compare: wgpu::CompareFunction::GreaterEqual,
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState::default(),
        }),
        multisample: wgpu::MultisampleState::default(),
        multiview_mask: None,
        cache: None,
    })
}

impl Pipeline3D {
    pub fn new(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        target_format: wgpu::TextureFormat,
    ) -> Self {
        let samplers = galfus_gpu_manager::StandardSamplers::new(device);
        let (white_tex, fallback_white_view) =
            create_1x1_texture(device, queue, "Fallback White", [255, 255, 255, 255]);
        let (normal_tex, fallback_normal_view) =
            create_1x1_texture(device, queue, "Fallback Normal", [128, 128, 255, 255]);
        let (black_tex, fallback_black_view) =
            create_1x1_texture(device, queue, "Fallback Black", [0, 0, 0, 0]);

        let default_source = crate::shader::get_default_realm_3d_shader();
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Realm3D Default Shader"),
            source: wgpu::ShaderSource::Wgsl(default_source.into()),
        });

        // Group 0: Scene (Camera, Environment, Lights buffer, Lights header)
        let scene_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Realm3D Scene Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
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
                // Shadow depth texture
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Depth,
                        view_dimension: wgpu::TextureViewDimension::D2Array,
                        multisampled: false,
                    },
                    count: None,
                },
                // Shadow comparison sampler
                wgpu::BindGroupLayoutEntry {
                    binding: 5,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Comparison),
                    count: None,
                },
                // Skeletal bones palette buffer
                wgpu::BindGroupLayoutEntry {
                    binding: 6,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Shadow matrices buffer (one mat4 per shadow layer)
                wgpu::BindGroupLayoutEntry {
                    binding: 7,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        // Group 1: Material (Uniform + 8 Textures + 4 Standard Samplers)
        let mut material_entries = Vec::with_capacity(13);
        material_entries.push(wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        });
        for i in 1..=8 {
            material_entries.push(wgpu::BindGroupLayoutEntry {
                binding: i,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            });
        }
        for i in 9..=12 {
            material_entries.push(wgpu::BindGroupLayoutEntry {
                binding: i,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                count: None,
            });
        }
        let material_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Realm3D Material Layout"),
            entries: &material_entries,
        });

        // Group 2: Model
        let model_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Realm3D Model Layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        // Group 3: Refraction (Opaque screen texture + sampler)
        let refraction_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Realm3D Refraction Layout"),
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

        let dummy_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Dummy Refraction Texture"),
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: target_format,
            usage: wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let dummy_view = dummy_tex.create_view(&wgpu::TextureViewDescriptor::default());
        let dummy_sampler = device.create_sampler(&wgpu::SamplerDescriptor::default());
        let dummy_refraction_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Dummy Refraction BG"),
            layout: &refraction_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&dummy_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&dummy_sampler),
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Realm3D Pipeline Layout"),
            bind_group_layouts: &[
                &scene_layout,
                &material_layout,
                &model_layout,
                &refraction_layout,
            ],
            immediate_size: 0,
        });

        let render_pipeline = create_3d_render_pipeline(
            device,
            &pipeline_layout,
            &shader,
            target_format,
            true,
            false,
        );
        let transparent_pipeline = create_3d_render_pipeline(
            device,
            &pipeline_layout,
            &shader,
            target_format,
            false,
            false,
        );
        let instanced_render_pipeline =
            create_3d_render_pipeline(device, &pipeline_layout, &shader, target_format, true, true);
        let instanced_transparent_pipeline = create_3d_render_pipeline(
            device,
            &pipeline_layout,
            &shader,
            target_format,
            false,
            true,
        );

        Self {
            render_pipeline,
            transparent_pipeline,
            instanced_render_pipeline,
            instanced_transparent_pipeline,
            pipeline_layout,
            scene_layout,
            material_layout,
            model_layout,
            refraction_layout,
            dummy_refraction_bg,
            samplers,
            fallback_white_view,
            fallback_normal_view,
            fallback_black_view,
            _fallback_textures: (white_tex, normal_tex, black_tex),
            target_format,
            custom_pipelines: HashMap::new(),
        }
    }

    /// Pre-compiles and caches custom surface shader pipelines (both standard and instanced).
    pub fn ensure_pipeline(
        &mut self,
        device: &wgpu::Device,
        snippet: Option<&str>,
        transparent: bool,
    ) {
        let Some(snippet) = snippet else { return };
        let Ok(composed) = crate::surface_effect::compose_surface_shader(
            crate::shader::REALM_3D_SHADER_TEMPLATE,
            Some(snippet),
        ) else {
            return;
        };
        let hash = composed.content_id.as_u64();
        for &instanced in &[false, true] {
            let key = (hash, transparent, instanced);
            self.custom_pipelines.entry(key).or_insert_with(|| {
                let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("Realm3D Custom Surface Shader"),
                    source: wgpu::ShaderSource::Wgsl(composed.source.clone().into()),
                });
                create_3d_render_pipeline(
                    device,
                    &self.pipeline_layout,
                    &shader,
                    self.target_format,
                    !transparent,
                    instanced,
                )
            });
        }
    }

    /// Retrieves an existing custom surface pipeline or falls back to the default pipeline.
    pub fn get_pipeline(
        &self,
        snippet: Option<&str>,
        transparent: bool,
        instanced: bool,
    ) -> &wgpu::RenderPipeline {
        let fallback = match (transparent, instanced) {
            (false, false) => &self.render_pipeline,
            (true, false) => &self.transparent_pipeline,
            (false, true) => &self.instanced_render_pipeline,
            (true, true) => &self.instanced_transparent_pipeline,
        };
        let Some(snippet) = snippet else {
            return fallback;
        };
        let Ok(composed) = crate::surface_effect::compose_surface_shader(
            crate::shader::REALM_3D_SHADER_TEMPLATE,
            Some(snippet),
        ) else {
            return fallback;
        };
        self.custom_pipelines
            .get(&(composed.content_id.as_u64(), transparent, instanced))
            .unwrap_or(fallback)
    }
}
