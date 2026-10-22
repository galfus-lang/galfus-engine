//! Render pipeline definition for 3D forward rendering with Reverse-Z.

use galfus_realm_3d_resources::geometry::{PrimitiveTopology3D, Vertex3D};
use galfus_realm_3d_resources::material::{MaterialSide3D, SurfaceType3D};

use std::collections::HashMap;

/// GPU raster state selected by a material surface classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum SurfacePipelineState {
    Opaque,
    AlphaBlend,
    Additive,
}

impl SurfacePipelineState {
    pub(crate) const fn from_surface_type(surface_type: SurfaceType3D) -> Self {
        match surface_type {
            SurfaceType3D::Transparent | SurfaceType3D::Refractive => Self::AlphaBlend,
            SurfaceType3D::Additive => Self::Additive,
            SurfaceType3D::Opaque
            | SurfaceType3D::Masked
            | SurfaceType3D::Mirror
            | SurfaceType3D::Portal => Self::Opaque,
        }
    }

    const fn depth_write_enabled(self) -> bool {
        matches!(self, Self::Opaque)
    }

    fn blend_state(self) -> Option<wgpu::BlendState> {
        match self {
            Self::Opaque => None,
            Self::AlphaBlend => Some(wgpu::BlendState::ALPHA_BLENDING),
            Self::Additive => Some(wgpu::BlendState {
                color: wgpu::BlendComponent {
                    src_factor: wgpu::BlendFactor::One,
                    dst_factor: wgpu::BlendFactor::One,
                    operation: wgpu::BlendOperation::Add,
                },
                alpha: wgpu::BlendComponent {
                    src_factor: wgpu::BlendFactor::One,
                    dst_factor: wgpu::BlendFactor::One,
                    operation: wgpu::BlendOperation::Add,
                },
            }),
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct RenderPipelineOptions3D {
    topology: PrimitiveTopology3D,
    surface_state: SurfacePipelineState,
    side: MaterialSide3D,
    instanced: bool,
}

pub struct Pipeline3D {
    pub pipeline_layout: wgpu::PipelineLayout,
    pub scene_layout: wgpu::BindGroupLayout,
    pub material_layout: wgpu::BindGroupLayout,
    pub model_layout: wgpu::BindGroupLayout,
    pub refraction_layout: wgpu::BindGroupLayout,
    pub dummy_instance_buffer: wgpu::Buffer,
    pub dummy_refraction_bg: wgpu::BindGroup,
    pub samplers: galfus_gpu_manager::StandardSamplers,
    pub fallback_white_view: wgpu::TextureView,
    pub fallback_normal_view: wgpu::TextureView,
    pub fallback_black_view: wgpu::TextureView,
    _fallback_textures: (wgpu::Texture, wgpu::Texture, wgpu::Texture),
    pub target_format: wgpu::TextureFormat,
    standard_pipelines: HashMap<
        (
            PrimitiveTopology3D,
            SurfacePipelineState,
            MaterialSide3D,
            bool,
        ),
        wgpu::RenderPipeline,
    >,
    custom_pipelines: HashMap<
        (
            u64,
            PrimitiveTopology3D,
            SurfacePipelineState,
            MaterialSide3D,
            bool,
        ),
        wgpu::RenderPipeline,
    >,
}

pub(crate) fn to_wgpu_topology(topology: PrimitiveTopology3D) -> wgpu::PrimitiveTopology {
    match topology {
        PrimitiveTopology3D::Points => wgpu::PrimitiveTopology::PointList,
        PrimitiveTopology3D::Lines => wgpu::PrimitiveTopology::LineList,
        PrimitiveTopology3D::LineStrip => wgpu::PrimitiveTopology::LineStrip,
        PrimitiveTopology3D::Triangles => wgpu::PrimitiveTopology::TriangleList,
        PrimitiveTopology3D::TriangleStrip => wgpu::PrimitiveTopology::TriangleStrip,
    }
}

fn effective_side(topology: PrimitiveTopology3D, side: MaterialSide3D) -> MaterialSide3D {
    if topology.is_triangle() {
        side
    } else {
        MaterialSide3D::Front
    }
}

fn cull_mode(topology: PrimitiveTopology3D, side: MaterialSide3D) -> Option<wgpu::Face> {
    if !topology.is_triangle() {
        return None;
    }
    match side {
        MaterialSide3D::Front => Some(wgpu::Face::Back),
        MaterialSide3D::Back => Some(wgpu::Face::Front),
        MaterialSide3D::Double => None,
    }
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

fn create_3d_render_pipeline(
    device: &wgpu::Device,
    layout: &wgpu::PipelineLayout,
    shader: &wgpu::ShaderModule,
    target_format: wgpu::TextureFormat,
    options: RenderPipelineOptions3D,
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
                format: wgpu::VertexFormat::Float32x2,
                offset: 32,
                shader_location: 3,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 40,
                shader_location: 4,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 56,
                shader_location: 5,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Uint32x4,
                offset: 72,
                shader_location: 6,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 88,
                shader_location: 7,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Uint32x4,
                offset: 104,
                shader_location: 8,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 120,
                shader_location: 9,
            },
        ],
    };

    let buffers = std::slice::from_ref(&vertex_buffer_layout);
    let entry_point = if options.instanced {
        "vs_instanced_main"
    } else {
        "vs_main"
    };

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(if options.instanced {
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
                blend: options.surface_state.blend_state(),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: to_wgpu_topology(options.topology),
            strip_index_format: options
                .topology
                .is_strip()
                .then_some(wgpu::IndexFormat::Uint32),
            front_face: wgpu::FrontFace::Ccw,
            cull_mode: cull_mode(options.topology, options.side),
            polygon_mode: wgpu::PolygonMode::Fill,
            unclipped_depth: false,
            conservative: false,
        },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth32Float,
            depth_write_enabled: options.surface_state.depth_write_enabled(),
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
                    visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
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

        let dummy_instance_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Realm3D Dummy Instance Storage Buffer"),
            size: std::mem::size_of::<galfus_realm_3d_resources::model::InstanceData3D>() as u64,
            usage: wgpu::BufferUsages::STORAGE,
            mapped_at_creation: false,
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

        let mut standard_pipelines = HashMap::new();
        for topology in PrimitiveTopology3D::ALL {
            for surface_state in [
                SurfacePipelineState::Opaque,
                SurfacePipelineState::AlphaBlend,
                SurfacePipelineState::Additive,
            ] {
                for side in MaterialSide3D::ALL {
                    if effective_side(topology, side) != side {
                        continue;
                    }
                    for &instanced in &[false, true] {
                        standard_pipelines.insert(
                            (topology, surface_state, side, instanced),
                            create_3d_render_pipeline(
                                device,
                                &pipeline_layout,
                                &shader,
                                target_format,
                                RenderPipelineOptions3D {
                                    topology,
                                    surface_state,
                                    side,
                                    instanced,
                                },
                            ),
                        );
                    }
                }
            }
        }

        Self {
            pipeline_layout,
            scene_layout,
            material_layout,
            model_layout,
            refraction_layout,
            dummy_instance_buffer,
            dummy_refraction_bg,
            samplers,
            fallback_white_view,
            fallback_normal_view,
            fallback_black_view,
            _fallback_textures: (white_tex, normal_tex, black_tex),
            target_format,
            standard_pipelines,
            custom_pipelines: HashMap::new(),
        }
    }

    /// Pre-compiles and caches custom surface shader pipelines (both standard and instanced).
    pub(crate) fn ensure_pipeline(
        &mut self,
        device: &wgpu::Device,
        snippet: Option<&str>,
        surface_state: SurfacePipelineState,
        side: MaterialSide3D,
    ) {
        let Some(snippet) = snippet else { return };
        let Ok(composed) = crate::surface_effect::compose_surface_shader(
            crate::shader::REALM_3D_SHADER_TEMPLATE,
            Some(snippet),
        ) else {
            return;
        };
        let hash = composed.content_id.as_u64();
        for topology in PrimitiveTopology3D::ALL {
            let side = effective_side(topology, side);
            for &instanced in &[false, true] {
                let key = (hash, topology, surface_state, side, instanced);
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
                        RenderPipelineOptions3D {
                            topology,
                            surface_state,
                            side,
                            instanced,
                        },
                    )
                });
            }
        }
    }

    /// Retrieves an existing custom surface pipeline or falls back to the default pipeline.
    pub(crate) fn get_pipeline(
        &self,
        snippet: Option<&str>,
        topology: PrimitiveTopology3D,
        surface_state: SurfacePipelineState,
        side: MaterialSide3D,
        instanced: bool,
    ) -> &wgpu::RenderPipeline {
        let side = effective_side(topology, side);
        let fallback = self.get_standard_pipeline(topology, surface_state, side, instanced);
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
            .get(&(
                composed.content_id.as_u64(),
                topology,
                surface_state,
                side,
                instanced,
            ))
            .unwrap_or(fallback)
    }

    fn get_standard_pipeline(
        &self,
        topology: PrimitiveTopology3D,
        surface_state: SurfacePipelineState,
        side: MaterialSide3D,
        instanced: bool,
    ) -> &wgpu::RenderPipeline {
        self.standard_pipelines
            .get(&(topology, surface_state, side, instanced))
            .expect("all standard primitive topologies are precompiled")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn surface_types_select_the_expected_raster_state() {
        assert_eq!(
            SurfacePipelineState::from_surface_type(SurfaceType3D::Opaque),
            SurfacePipelineState::Opaque
        );
        assert_eq!(
            SurfacePipelineState::from_surface_type(SurfaceType3D::Masked),
            SurfacePipelineState::Opaque
        );
        assert_eq!(
            SurfacePipelineState::from_surface_type(SurfaceType3D::Transparent),
            SurfacePipelineState::AlphaBlend
        );
        assert_eq!(
            SurfacePipelineState::from_surface_type(SurfaceType3D::Additive),
            SurfacePipelineState::Additive
        );
        assert!(SurfacePipelineState::Opaque.depth_write_enabled());
        assert!(!SurfacePipelineState::AlphaBlend.depth_write_enabled());
        assert!(!SurfacePipelineState::Additive.depth_write_enabled());
    }

    #[test]
    fn material_sides_select_the_expected_culling() {
        assert_eq!(
            cull_mode(PrimitiveTopology3D::Triangles, MaterialSide3D::Front),
            Some(wgpu::Face::Back)
        );
        assert_eq!(
            cull_mode(PrimitiveTopology3D::Triangles, MaterialSide3D::Back),
            Some(wgpu::Face::Front)
        );
        assert_eq!(
            cull_mode(PrimitiveTopology3D::Triangles, MaterialSide3D::Double),
            None
        );
        assert_eq!(
            cull_mode(PrimitiveTopology3D::Lines, MaterialSide3D::Back),
            None
        );
    }
}
