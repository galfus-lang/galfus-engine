use std::collections::HashMap;

/// Cache identifier for 2D render pipelines.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PipelineKey2D {
    pub effect_id: u64,
    pub surface_type: u32,
    pub target_format: wgpu::TextureFormat,
    pub sample_count: u32,
}

/// Pipeline manager and layout descriptors for the 2D renderer.
pub struct PipelineManager2D {
    pub global_bind_group_layout: wgpu::BindGroupLayout,
    pub material_bind_group_layout: wgpu::BindGroupLayout,
    pub pipeline_layout: wgpu::PipelineLayout,
    pub default_shader_module: wgpu::ShaderModule,
    custom_shader_modules: HashMap<u64, wgpu::ShaderModule>,
    pipelines: HashMap<PipelineKey2D, wgpu::RenderPipeline>,
}

impl PipelineManager2D {
    pub fn new(device: &wgpu::Device) -> Self {
        let global_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("galfus_2d_global_bgl"),
                entries: &[
                    // Camera uniform
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
                    // Point sampler
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::NonFiltering),
                        count: None,
                    },
                    // Linear sampler
                    wgpu::BindGroupLayoutEntry {
                        binding: 2,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                    // Lights storage buffer
                    wgpu::BindGroupLayoutEntry {
                        binding: 3,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Storage { read_only: true },
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                    // Shadow samples storage buffer
                    wgpu::BindGroupLayoutEntry {
                        binding: 4,
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

        let material_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("galfus_2d_material_bgl"),
                entries: &[
                    // Material uniform
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
                    // Diffuse texture
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
                    // Texture sampler
                    wgpu::BindGroupLayoutEntry {
                        binding: 2,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("galfus_2d_pipeline_layout"),
            bind_group_layouts: &[&global_bind_group_layout, &material_bind_group_layout],
            immediate_size: 0,
        });

        let default_source = crate::shader::compile_2d_shader(None);
        let default_shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("galfus_2d_standard_shader"),
            source: wgpu::ShaderSource::Wgsl(default_source.into()),
        });

        Self {
            global_bind_group_layout,
            material_bind_group_layout,
            pipeline_layout,
            default_shader_module,
            custom_shader_modules: HashMap::new(),
            pipelines: HashMap::new(),
        }
    }

    /// Computes the deterministic 64-bit content hash of a custom 2D surface effect snippet.
    pub fn compute_effect_id(snippet: Option<&str>) -> u64 {
        let Some(snippet) = snippet else { return 0 };
        let with_prelude = crate::shader::SHADER_2D_TEMPLATE.replace(
            "{{EFFECT_PRELUDE}}",
            crate::surface_effect::SURFACE_EFFECT_PRELUDE_2D,
        );
        match crate::surface_effect::compose_surface_shader_2d(&with_prelude, Some(snippet)) {
            Ok(composed) => composed.content_id.as_u64(),
            Err(e) => {
                eprintln!("[galfus-realm-2d] Failed to compose 2D surface effect: {e}");
                0
            }
        }
    }

    /// Obtains or creates a cached 2D render pipeline for the specified key.
    pub fn get_or_create_pipeline(
        &mut self,
        device: &wgpu::Device,
        key: PipelineKey2D,
        snippet: Option<&str>,
    ) -> &wgpu::RenderPipeline {
        if !self.pipelines.contains_key(&key) {
            if key.effect_id != 0 && !self.custom_shader_modules.contains_key(&key.effect_id) {
                let with_prelude = crate::shader::SHADER_2D_TEMPLATE.replace(
                    "{{EFFECT_PRELUDE}}",
                    crate::surface_effect::SURFACE_EFFECT_PRELUDE_2D,
                );
                let source =
                    crate::surface_effect::compose_surface_shader_2d(&with_prelude, snippet)
                        .map(|c| c.source)
                        .unwrap_or_else(|_| crate::shader::compile_2d_shader(None));

                let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("galfus_2d_custom_shader"),
                    source: wgpu::ShaderSource::Wgsl(source.into()),
                });
                self.custom_shader_modules.insert(key.effect_id, module);
            }

            let shader_module = if key.effect_id == 0 {
                &self.default_shader_module
            } else {
                &self.custom_shader_modules[&key.effect_id]
            };

            let blend = match key.surface_type {
                0 => None,                                   // Opaque
                1 => Some(wgpu::BlendState::ALPHA_BLENDING), // Transparent
                2 => Some(wgpu::BlendState::ALPHA_BLENDING), // Masked
                _ => Some(wgpu::BlendState::ALPHA_BLENDING),
            };

            // Quad mesh vertex buffer layout (Location 0..2)
            let vertex_layout = wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<[f32; 9]>() as u64, // Pos(3) + UV(2) + Col(4)
                step_mode: wgpu::VertexStepMode::Vertex,
                attributes: &[
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x3,
                        offset: 0,
                        shader_location: 0,
                    },
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x2,
                        offset: std::mem::size_of::<[f32; 3]>() as u64,
                        shader_location: 1,
                    },
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x4,
                        offset: std::mem::size_of::<[f32; 5]>() as u64,
                        shader_location: 2,
                    },
                ],
            };

            // Per-instance item layout (Location 3..9)
            let instance_layout = wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<crate::types::Item2DInstanceRaw>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    // model_matrix (4 columns)
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x4,
                        offset: 0,
                        shader_location: 3,
                    },
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x4,
                        offset: 16,
                        shader_location: 4,
                    },
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x4,
                        offset: 32,
                        shader_location: 5,
                    },
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x4,
                        offset: 48,
                        shader_location: 6,
                    },
                    // instance_tint
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x4,
                        offset: 64,
                        shader_location: 7,
                    },
                    // uv_rect
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x4,
                        offset: 80,
                        shader_location: 8,
                    },
                    // shadow_params
                    wgpu::VertexAttribute {
                        format: wgpu::VertexFormat::Float32x4,
                        offset: 96,
                        shader_location: 9,
                    },
                ],
            };

            let pipe = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("galfus_2d_render_pipeline"),
                layout: Some(&self.pipeline_layout),
                vertex: wgpu::VertexState {
                    module: shader_module,
                    entry_point: Some("vs_main"),
                    buffers: &[vertex_layout, instance_layout],
                    compilation_options: Default::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: shader_module,
                    entry_point: Some("fs_main"),
                    targets: &[Some(wgpu::ColorTargetState {
                        format: key.target_format,
                        blend,
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                    compilation_options: Default::default(),
                }),
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::TriangleList,
                    strip_index_format: None,
                    front_face: wgpu::FrontFace::Ccw,
                    cull_mode: None, // 2D sprites are visible both sides
                    polygon_mode: wgpu::PolygonMode::Fill,
                    unclipped_depth: false,
                    conservative: false,
                },
                depth_stencil: None,
                multisample: wgpu::MultisampleState {
                    count: key.sample_count,
                    mask: !0,
                    alpha_to_coverage_enabled: false,
                },
                multiview_mask: None,
                cache: None,
            });

            self.pipelines.insert(key, pipe);
        }

        &self.pipelines[&key]
    }
}
