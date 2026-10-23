//! Shadow mapping pass and depth pipeline for Realm3D.

use bytemuck::bytes_of;
use glam::Mat4;
use std::collections::HashMap;
use wgpu::util::DeviceExt;

use galfus_realm_3d_resources::geometry::{PrimitiveTopology3D, Vertex3D};
use galfus_realm_3d_resources::material::{MaterialSide3D, SurfaceType3D};

/// WGSL shader for the shadow depth pass.
pub const SHADOW_SHADER: &str = include_str!("shadow.wgsl");

/// Dedicated depth-only pipeline for rendering shadow maps.
pub struct ShadowPipeline3D {
    pipelines: HashMap<
        (PrimitiveTopology3D, MaterialSide3D, bool, ShadowSurfaceMode),
        wgpu::RenderPipeline,
    >,
    pub vp_layout: wgpu::BindGroupLayout,
    fallback_material_bg: wgpu::BindGroup,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum ShadowSurfaceMode {
    Solid,
    AlphaMask,
}

impl ShadowSurfaceMode {
    const fn from_surface_type(surface_type: SurfaceType3D) -> Option<Self> {
        match surface_type {
            SurfaceType3D::Additive => None,
            SurfaceType3D::Masked | SurfaceType3D::Transparent | SurfaceType3D::Refractive => {
                Some(Self::AlphaMask)
            }
            SurfaceType3D::Opaque | SurfaceType3D::Mirror | SurfaceType3D::Portal => {
                Some(Self::Solid)
            }
        }
    }
}

#[derive(Clone, Copy)]
struct ShadowPipelineOptions {
    topology: PrimitiveTopology3D,
    side: MaterialSide3D,
    instanced: bool,
    surface_mode: ShadowSurfaceMode,
}

fn effective_side(topology: PrimitiveTopology3D, side: MaterialSide3D) -> MaterialSide3D {
    if topology.is_triangle() {
        side
    } else {
        MaterialSide3D::Front
    }
}

fn shadow_cull_mode(topology: PrimitiveTopology3D, side: MaterialSide3D) -> Option<wgpu::Face> {
    if !topology.is_triangle() {
        return None;
    }
    match side {
        MaterialSide3D::Front => Some(wgpu::Face::Back),
        MaterialSide3D::Back => Some(wgpu::Face::Front),
        MaterialSide3D::Double => None,
    }
}

fn create_shadow_render_pipeline(
    device: &wgpu::Device,
    layout: &wgpu::PipelineLayout,
    shader: &wgpu::ShaderModule,
    vertex_buffer_layout: &wgpu::VertexBufferLayout<'_>,
    depth_stencil: &wgpu::DepthStencilState,
    options: ShadowPipelineOptions,
) -> wgpu::RenderPipeline {
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(if options.instanced {
            "Realm3D Shadow Instanced Render Pipeline"
        } else {
            "Realm3D Shadow Render Pipeline"
        }),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some(if options.instanced {
                "vs_instanced_main"
            } else {
                "vs_main"
            }),
            buffers: std::slice::from_ref(vertex_buffer_layout),
            compilation_options: Default::default(),
        },
        fragment: matches!(options.surface_mode, ShadowSurfaceMode::AlphaMask).then_some(
            wgpu::FragmentState {
                module: shader,
                entry_point: Some("fs_alpha_mask"),
                targets: &[],
                compilation_options: Default::default(),
            },
        ),
        primitive: wgpu::PrimitiveState {
            topology: crate::pipeline::to_wgpu_topology(options.topology),
            strip_index_format: options
                .topology
                .is_strip()
                .then_some(wgpu::IndexFormat::Uint32),
            front_face: wgpu::FrontFace::Ccw,
            cull_mode: shadow_cull_mode(options.topology, options.side),
            polygon_mode: wgpu::PolygonMode::Fill,
            unclipped_depth: false,
            conservative: false,
        },
        depth_stencil: Some(depth_stencil.clone()),
        multisample: wgpu::MultisampleState::default(),
        multiview_mask: None,
        cache: None,
    })
}

impl ShadowPipeline3D {
    pub fn new(
        device: &wgpu::Device,
        material_layout: &wgpu::BindGroupLayout,
        model_layout: &wgpu::BindGroupLayout,
    ) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Realm3D Shadow Shader"),
            source: wgpu::ShaderSource::Wgsl(SHADOW_SHADER.into()),
        });

        let vp_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Realm3D Shadow VP Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Realm3D Shadow Pipeline Layout"),
            bind_group_layouts: &[&vp_layout, material_layout, model_layout],
            immediate_size: 0,
        });

        let fallback_material_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Realm3D Shadow Fallback Material Buffer"),
            size: std::mem::size_of::<galfus_realm_3d_resources::material::Material3DUniform>()
                as u64,
            usage: wgpu::BufferUsages::UNIFORM,
            mapped_at_creation: false,
        });
        let fallback_material_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Realm3D Shadow Fallback Material Texture"),
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let fallback_material_view =
            fallback_material_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let fallback_material_sampler = device.create_sampler(&wgpu::SamplerDescriptor::default());
        let mut fallback_material_entries = vec![wgpu::BindGroupEntry {
            binding: 0,
            resource: fallback_material_buffer.as_entire_binding(),
        }];
        for binding in 1..=8 {
            fallback_material_entries.push(wgpu::BindGroupEntry {
                binding,
                resource: wgpu::BindingResource::TextureView(&fallback_material_view),
            });
        }
        for binding in 9..=12 {
            fallback_material_entries.push(wgpu::BindGroupEntry {
                binding,
                resource: wgpu::BindingResource::Sampler(&fallback_material_sampler),
            });
        }
        let fallback_material_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Realm3D Shadow Fallback Material Bind Group"),
            layout: material_layout,
            entries: &fallback_material_entries,
        });

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
                    format: wgpu::VertexFormat::Float32x2,
                    offset: 24,
                    shader_location: 1,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Float32x2,
                    offset: 32,
                    shader_location: 2,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Float32x4,
                    offset: 56,
                    shader_location: 3,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Uint32x4,
                    offset: 72,
                    shader_location: 4,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Float32x4,
                    offset: 88,
                    shader_location: 5,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Uint32x4,
                    offset: 104,
                    shader_location: 6,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Float32x4,
                    offset: 120,
                    shader_location: 7,
                },
            ],
        };

        let depth_stencil = wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth32Float,
            depth_write_enabled: true,
            // Reverse-Z: greater depth is closer to the light source.
            depth_compare: wgpu::CompareFunction::GreaterEqual,
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState {
                // Reverse-Z: negative bias pushes occluder farther (closer to 0.0)
                constant: -2,
                slope_scale: -2.0,
                clamp: 0.0,
            },
        };

        let mut pipelines = HashMap::new();
        for topology in PrimitiveTopology3D::ALL {
            for side in MaterialSide3D::ALL {
                if effective_side(topology, side) != side {
                    continue;
                }
                for &instanced in &[false, true] {
                    for surface_mode in [ShadowSurfaceMode::Solid, ShadowSurfaceMode::AlphaMask] {
                        pipelines.insert(
                            (topology, side, instanced, surface_mode),
                            create_shadow_render_pipeline(
                                device,
                                &pipeline_layout,
                                &shader,
                                &vertex_buffer_layout,
                                &depth_stencil,
                                ShadowPipelineOptions {
                                    topology,
                                    side,
                                    instanced,
                                    surface_mode,
                                },
                            ),
                        );
                    }
                }
            }
        }

        Self {
            pipelines,
            vp_layout,
            fallback_material_bg,
        }
    }

    fn pipeline(
        &self,
        topology: PrimitiveTopology3D,
        side: MaterialSide3D,
        instanced: bool,
        surface_mode: ShadowSurfaceMode,
    ) -> &wgpu::RenderPipeline {
        let side = effective_side(topology, side);
        self.pipelines
            .get(&(topology, side, instanced, surface_mode))
            .expect("all shadow primitive topologies are precompiled")
    }
}

/// Maximum number of concurrent shadow-casting layers supported by the shadow map array.
pub const MAX_SHADOW_LIGHTS: u32 = 16;

/// GPU shadow map texture array, views, comparison sampler, uniform and matrices buffers.
pub struct ShadowMap3D {
    pub texture: wgpu::Texture,
    pub array_view: wgpu::TextureView,
    pub layer_views: Vec<wgpu::TextureView>,
    pub sampler: wgpu::Sampler,
    pub vp_buffers: Vec<wgpu::Buffer>,
    pub vp_bind_groups: Vec<wgpu::BindGroup>,
    pub matrices_buffer: wgpu::Buffer,
    pub resolution: u32,
}

impl ShadowMap3D {
    pub const DEFAULT_RESOLUTION: u32 = 2048;

    pub fn new(
        device: &wgpu::Device,
        shadow_pipeline: &ShadowPipeline3D,
        bones_buf: &wgpu::Buffer,
    ) -> Self {
        let resolution = Self::DEFAULT_RESOLUTION;

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Realm3D Shadow Map Array Texture"),
            size: wgpu::Extent3d {
                width: resolution,
                height: resolution,
                depth_or_array_layers: MAX_SHADOW_LIGHTS,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });

        let array_view = texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some("Realm3D Shadow Map Array View"),
            dimension: Some(wgpu::TextureViewDimension::D2Array),
            base_array_layer: 0,
            array_layer_count: Some(MAX_SHADOW_LIGHTS),
            ..Default::default()
        });

        let layer_views: Vec<wgpu::TextureView> = (0..MAX_SHADOW_LIGHTS)
            .map(|i| {
                texture.create_view(&wgpu::TextureViewDescriptor {
                    label: Some(&format!("Realm3D Shadow Layer View {i}")),
                    dimension: Some(wgpu::TextureViewDimension::D2),
                    base_array_layer: i,
                    array_layer_count: Some(1),
                    ..Default::default()
                })
            })
            .collect();

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Realm3D Shadow Comparison Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            // Reverse-Z: GreaterEqual comparison for hardware PCF
            compare: Some(wgpu::CompareFunction::GreaterEqual),
            ..Default::default()
        });

        let mut vp_buffers = Vec::with_capacity(MAX_SHADOW_LIGHTS as usize);
        let mut vp_bind_groups = Vec::with_capacity(MAX_SHADOW_LIGHTS as usize);
        for i in 0..MAX_SHADOW_LIGHTS {
            let initial_uniform = [0.0f32; 20];
            let buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some(&format!("Realm3D Shadow VP Buffer {i}")),
                contents: bytemuck::cast_slice(&initial_uniform),
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            });
            let bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some(&format!("Realm3D Shadow VP Bind Group {i}")),
                layout: &shadow_pipeline.vp_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: buf.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: bones_buf.as_entire_binding(),
                    },
                ],
            });
            vp_buffers.push(buf);
            vp_bind_groups.push(bg);
        }

        let initial_matrices = vec![Mat4::IDENTITY; MAX_SHADOW_LIGHTS as usize];
        let matrices_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Realm3D Shadow Matrices Storage Buffer"),
            contents: bytemuck::cast_slice(&initial_matrices),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        });

        Self {
            texture,
            array_view,
            layer_views,
            sampler,
            vp_buffers,
            vp_bind_groups,
            matrices_buffer,
            resolution,
        }
    }

    /// Rebinds the skeletal bone storage buffer to all shadow view-projection bind groups.
    pub fn update_bones(
        &mut self,
        device: &wgpu::Device,
        shadow_pipeline: &ShadowPipeline3D,
        bones_buf: &wgpu::Buffer,
    ) {
        self.vp_bind_groups = (0..MAX_SHADOW_LIGHTS)
            .map(|i| {
                device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some(&format!("Realm3D Shadow VP Bind Group {i}")),
                    layout: &shadow_pipeline.vp_layout,
                    entries: &[
                        wgpu::BindGroupEntry {
                            binding: 0,
                            resource: self.vp_buffers[i as usize].as_entire_binding(),
                        },
                        wgpu::BindGroupEntry {
                            binding: 1,
                            resource: bones_buf.as_entire_binding(),
                        },
                    ],
                })
            })
            .collect();
    }

    /// Updates the shadow view-projection uniform buffer and time parameter for a specific layer.
    pub fn update_vp(&self, queue: &wgpu::Queue, layer: u32, shadow_view_proj: &Mat4, time: f32) {
        if let Some(buf) = self.vp_buffers.get(layer as usize) {
            queue.write_buffer(buf, 0, bytes_of(shadow_view_proj));
            let misc = [0.0f32, 0.0, time, 0.0];
            queue.write_buffer(buf, 64, bytemuck::cast_slice(&misc));
            queue.write_buffer(
                &self.matrices_buffer,
                layer as u64 * std::mem::size_of::<Mat4>() as u64,
                bytes_of(shadow_view_proj),
            );
        }
    }
}

#[path = "shadow_render.rs"]
mod shadow_render;
pub use shadow_render::render_shadow_depth_pass;
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn surface_types_select_the_expected_shadow_mode() {
        assert_eq!(
            ShadowSurfaceMode::from_surface_type(SurfaceType3D::Opaque),
            Some(ShadowSurfaceMode::Solid)
        );
        assert_eq!(
            ShadowSurfaceMode::from_surface_type(SurfaceType3D::Mirror),
            Some(ShadowSurfaceMode::Solid)
        );
        assert_eq!(
            ShadowSurfaceMode::from_surface_type(SurfaceType3D::Masked),
            Some(ShadowSurfaceMode::AlphaMask)
        );
        assert_eq!(
            ShadowSurfaceMode::from_surface_type(SurfaceType3D::Transparent),
            Some(ShadowSurfaceMode::AlphaMask)
        );
        assert_eq!(
            ShadowSurfaceMode::from_surface_type(SurfaceType3D::Refractive),
            Some(ShadowSurfaceMode::AlphaMask)
        );
        assert_eq!(
            ShadowSurfaceMode::from_surface_type(SurfaceType3D::Additive),
            None
        );
    }

    #[test]
    fn alpha_shadow_shader_uses_the_material_alpha_contract() {
        assert!(SHADOW_SHADER.contains("@group(1) @binding(1) var mat_tex_0"));
        assert!(SHADOW_SHADER.contains("material.flags.y & 0x3u"));
        assert!(SHADOW_SHADER.contains("material.flags.z & 1u"));
        assert!(SHADOW_SHADER.contains(
            "material.base_color.a * sample_albedo(uv).a * in.vertex_alpha * in.instance_alpha"
        ));
        assert!(SHADOW_SHADER.contains("material.pbr_params.w"));
    }

    #[test]
    fn shadow_shader_applies_morphs_before_skinning() {
        assert!(SHADOW_SHADER.contains("@group(2) @binding(2) var<storage, read> morph_weights"));
        assert!(SHADOW_SHADER.contains("apply_morph_position(vertex_index, &local_pos)"));
        assert!(SHADOW_SHADER.contains("if (bone_count > 0u)"));
    }
}
