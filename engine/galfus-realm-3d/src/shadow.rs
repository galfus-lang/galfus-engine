//! Shadow mapping pass and depth pipeline for Realm3D.

use bytemuck::bytes_of;
use glam::Mat4;
use wgpu::util::DeviceExt;

use galfus_realm_3d_resources::geometry::Vertex3D;

/// WGSL shader for the shadow depth pass.
pub const SHADOW_SHADER: &str = r#"
struct ShadowUniform {
    view_proj: mat4x4<f32>,
};

struct ModelUniform {
    model: mat4x4<f32>,
    normal_matrix: mat4x4<f32>,
    outline_color: vec4<f32>,
    flags: vec4<u32>,
};

@group(0) @binding(0) var<uniform> shadow: ShadowUniform;
@group(0) @binding(1) var<storage, read> bones: array<mat4x4<f32>>;
@group(1) @binding(0) var<uniform> object: ModelUniform;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) joints: vec4<u32>,
    @location(2) weights: vec4<f32>,
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

fn skin_position(position: vec3<f32>, joints: vec4<u32>, weights: vec4<f32>, bone_offset: u32, bone_count: u32) -> vec3<f32> {
    let m0 = bone_at(joints.x, bone_offset, bone_count);
    let m1 = bone_at(joints.y, bone_offset, bone_count);
    let m2 = bone_at(joints.z, bone_offset, bone_count);
    let m3 = bone_at(joints.w, bone_offset, bone_count);
    let skinned = (m0 * vec4<f32>(position, 1.0)) * weights.x
                + (m1 * vec4<f32>(position, 1.0)) * weights.y
                + (m2 * vec4<f32>(position, 1.0)) * weights.z
                + (m3 * vec4<f32>(position, 1.0)) * weights.w;
    return skinned.xyz;
}

@vertex
fn vs_main(in: VertexInput) -> @builtin(position) vec4<f32> {
    var local_pos = in.position;
    let bone_offset = object.flags.y;
    let bone_count = object.flags.z;
    if (bone_count > 0u) {
        local_pos = skin_position(in.position, in.joints, in.weights, bone_offset, bone_count);
    }
    let world_pos = object.model * vec4<f32>(local_pos, 1.0);
    return shadow.view_proj * world_pos;
}
"#;

/// Dedicated depth-only pipeline for rendering shadow maps.
pub struct ShadowPipeline3D {
    pub render_pipeline: wgpu::RenderPipeline,
    pub vp_layout: wgpu::BindGroupLayout,
}

impl ShadowPipeline3D {
    pub fn new(device: &wgpu::Device, model_layout: &wgpu::BindGroupLayout) -> Self {
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
            bind_group_layouts: &[&vp_layout, model_layout],
            immediate_size: 0,
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
                    format: wgpu::VertexFormat::Uint32x4,
                    offset: 48,
                    shader_location: 1,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Float32x4,
                    offset: 64,
                    shader_location: 2,
                },
            ],
        };

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Realm3D Shadow Render Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[vertex_buffer_layout],
                compilation_options: Default::default(),
            },
            fragment: None,
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
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        Self {
            render_pipeline,
            vp_layout,
        }
    }
}

/// Maximum number of concurrent shadow-casting lights supported by the shadow map array.
pub const MAX_SHADOW_LIGHTS: u32 = 4;

/// GPU shadow map texture array, views, comparison sampler, and uniform buffers.
pub struct ShadowMap3D {
    pub texture: wgpu::Texture,
    pub array_view: wgpu::TextureView,
    pub layer_views: Vec<wgpu::TextureView>,
    pub sampler: wgpu::Sampler,
    pub vp_buffers: Vec<wgpu::Buffer>,
    pub vp_bind_groups: Vec<wgpu::BindGroup>,
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
            let buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some(&format!("Realm3D Shadow VP Buffer {i}")),
                contents: bytes_of(&Mat4::IDENTITY),
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

        Self {
            texture,
            array_view,
            layer_views,
            sampler,
            vp_buffers,
            vp_bind_groups,
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

    /// Updates the shadow view-projection uniform buffer for a specific layer.
    pub fn update_vp(&self, queue: &wgpu::Queue, layer: u32, shadow_view_proj: &Mat4) {
        if let Some(buf) = self.vp_buffers.get(layer as usize) {
            queue.write_buffer(buf, 0, bytes_of(shadow_view_proj));
        }
    }
}

/// Executes depth passes for all shadow-casting lights applying frustum culling per light.
pub fn render_shadow_depth_pass(
    encoder: &mut wgpu::CommandEncoder,
    queue: &wgpu::Queue,
    shadow_pipe: &ShadowPipeline3D,
    shadow_map: &ShadowMap3D,
    lights: &std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::light::Light3D,
            galfus_realm_3d_resources::transform::Transform3D,
        ),
    >,
    models: &std::collections::BTreeMap<u32, crate::types::GpuModelEntry>,
    geometries: &std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::geometry::Geometry3D,
            Option<crate::types::GpuMeshBuffers>,
        ),
    >,
) {
    let mut layer_idx = 0u32;
    for (light, light_trans) in lights.values() {
        if !light.active || !light.cast_shadow || layer_idx >= MAX_SHADOW_LIGHTS {
            continue;
        }
        let light_uniform = light.build_uniform_with_layer(light_trans, layer_idx);
        shadow_map.update_vp(queue, layer_idx, &light_uniform.shadow_view_proj);

        let layer_view = &shadow_map.layer_views[layer_idx as usize];
        let vp_bg = &shadow_map.vp_bind_groups[layer_idx as usize];

        let mut s_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("Realm3D Shadow Pass"),
            color_attachments: &[],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: layer_view,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Clear(0.0),
                    store: wgpu::StoreOp::Store,
                }),
                stencil_ops: None,
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });

        s_pass.set_pipeline(&shadow_pipe.render_pipeline);
        s_pass.set_bind_group(0, vp_bg, &[]);

        let shadow_frustum = galfus_realm_3d_resources::frustum::Frustum::from_view_projection(
            light_uniform.shadow_view_proj,
        );
        for (model, model_trans, _, model_bg_opt) in models.values() {
            if !model.active || !model.cast_shadow {
                continue;
            }
            let Some(model_bg) = model_bg_opt else {
                continue;
            };
            let Some((geom, Some((v, i, count)))) = geometries.get(&model.geometry_id) else {
                continue;
            };
            let world_aabb = geom.aabb.transform(&model_trans.matrix());
            if !shadow_frustum.intersects_aabb(world_aabb.min, world_aabb.max) {
                continue;
            }
            s_pass.set_bind_group(1, model_bg, &[]);
            s_pass.set_vertex_buffer(0, v.slice(..));
            s_pass.set_index_buffer(i.slice(..), wgpu::IndexFormat::Uint32);
            s_pass.draw_indexed(0..*count, 0, 0..1);
        }

        layer_idx += 1;
    }
}
