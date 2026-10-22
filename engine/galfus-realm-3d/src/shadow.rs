//! Shadow mapping pass and depth pipeline for Realm3D.

use bytemuck::bytes_of;
use glam::Mat4;
use std::collections::HashMap;
use wgpu::util::DeviceExt;

use galfus_realm_3d_resources::geometry::{PrimitiveTopology3D, Vertex3D};

/// WGSL shader for the shadow depth pass.
pub const SHADOW_SHADER: &str = r#"
struct ShadowUniform {
    view_proj: mat4x4<f32>,
    misc: vec4<f32>,
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

struct InstanceData {
    transform: mat4x4<f32>,
    color: vec4<f32>,
    emissive: vec4<f32>,
    pbr: vec4<f32>,
    custom: vec4<f32>,
};
@group(1) @binding(1) var<storage, read> instances: array<InstanceData>;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv0: vec2<f32>,
    @location(2) joints0: vec4<u32>,
    @location(3) weights0: vec4<f32>,
    @location(4) joints1: vec4<u32>,
    @location(5) weights1: vec4<f32>,
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

fn skin_position(position: vec3<f32>, joints0: vec4<u32>, weights0: vec4<f32>, joints1: vec4<u32>, weights1: vec4<f32>, bone_offset: u32, bone_count: u32) -> vec3<f32> {
    let m0 = bone_at(joints0.x, bone_offset, bone_count);
    let m1 = bone_at(joints0.y, bone_offset, bone_count);
    let m2 = bone_at(joints0.z, bone_offset, bone_count);
    let m3 = bone_at(joints0.w, bone_offset, bone_count);
    let m4 = bone_at(joints1.x, bone_offset, bone_count);
    let m5 = bone_at(joints1.y, bone_offset, bone_count);
    let m6 = bone_at(joints1.z, bone_offset, bone_count);
    let m7 = bone_at(joints1.w, bone_offset, bone_count);
    let skinned = (m0 * vec4<f32>(position, 1.0)) * weights0.x
                + (m1 * vec4<f32>(position, 1.0)) * weights0.y
                + (m2 * vec4<f32>(position, 1.0)) * weights0.z
                + (m3 * vec4<f32>(position, 1.0)) * weights0.w
                + (m4 * vec4<f32>(position, 1.0)) * weights1.x
                + (m5 * vec4<f32>(position, 1.0)) * weights1.y
                + (m6 * vec4<f32>(position, 1.0)) * weights1.z
                + (m7 * vec4<f32>(position, 1.0)) * weights1.w;
    return skinned.xyz;
}

@vertex
fn vs_main(in: VertexInput) -> @builtin(position) vec4<f32> {
    var local_pos = in.position;
    let bone_offset = object.flags.y;
    let bone_count = object.flags.z;
    if (bone_count > 0u) {
        local_pos = skin_position(in.position, in.joints0, in.weights0, in.joints1, in.weights1, bone_offset, bone_count);
    }
    let world_pos = object.model * vec4<f32>(local_pos, 1.0);
    return shadow.view_proj * world_pos;
}

@vertex
fn vs_instanced_main(in: VertexInput, @builtin(instance_index) instance_index: u32) -> @builtin(position) vec4<f32> {
    let inst = instances[instance_index];
    var local_pos = in.position;
    let bone_offset = object.flags.y;
    let bone_count = object.flags.z;
    if (bone_count > 0u) {
        local_pos = skin_position(in.position, in.joints0, in.weights0, in.joints1, in.weights1, bone_offset, bone_count);
    }
    var world_pos4 = inst.transform * vec4<f32>(local_pos, 1.0);

    // Procedural wind vertex displacement if custom.x (amplitude) > 0.0
    let wind_amp = inst.custom.x;
    if (wind_amp > 0.0) {
        let time = shadow.misc.z;
        let wind_freq = max(inst.custom.y, 0.5);
        let height_factor = pow(clamp(in.uv0.y, 0.0, 1.0), 1.5);
        let wave = sin(time * wind_freq * 3.0 + world_pos4.x * 0.4 + world_pos4.z * 0.4);
        world_pos4.x += wave * wind_amp * height_factor;
        world_pos4.z += cos(time * wind_freq * 2.5 + world_pos4.z * 0.3) * wind_amp * 0.5 * height_factor;
    }

    return shadow.view_proj * world_pos4;
}
"#;

/// Dedicated depth-only pipeline for rendering shadow maps.
pub struct ShadowPipeline3D {
    pipelines: HashMap<(PrimitiveTopology3D, bool), wgpu::RenderPipeline>,
    pub vp_layout: wgpu::BindGroupLayout,
}

fn create_shadow_render_pipeline(
    device: &wgpu::Device,
    layout: &wgpu::PipelineLayout,
    shader: &wgpu::ShaderModule,
    vertex_buffer_layout: &wgpu::VertexBufferLayout<'_>,
    depth_stencil: &wgpu::DepthStencilState,
    topology: PrimitiveTopology3D,
    instanced: bool,
) -> wgpu::RenderPipeline {
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(if instanced {
            "Realm3D Shadow Instanced Render Pipeline"
        } else {
            "Realm3D Shadow Render Pipeline"
        }),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some(if instanced {
                "vs_instanced_main"
            } else {
                "vs_main"
            }),
            buffers: std::slice::from_ref(vertex_buffer_layout),
            compilation_options: Default::default(),
        },
        fragment: None,
        primitive: wgpu::PrimitiveState {
            topology: crate::pipeline::to_wgpu_topology(topology),
            strip_index_format: topology.is_strip().then_some(wgpu::IndexFormat::Uint32),
            front_face: wgpu::FrontFace::Ccw,
            cull_mode: None,
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
                    format: wgpu::VertexFormat::Float32x2,
                    offset: 24,
                    shader_location: 1,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Uint32x4,
                    offset: 72,
                    shader_location: 2,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Float32x4,
                    offset: 88,
                    shader_location: 3,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Uint32x4,
                    offset: 104,
                    shader_location: 4,
                },
                wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Float32x4,
                    offset: 120,
                    shader_location: 5,
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
            for &instanced in &[false, true] {
                pipelines.insert(
                    (topology, instanced),
                    create_shadow_render_pipeline(
                        device,
                        &pipeline_layout,
                        &shader,
                        &vertex_buffer_layout,
                        &depth_stencil,
                        topology,
                        instanced,
                    ),
                );
            }
        }

        Self {
            pipelines,
            vp_layout,
        }
    }

    fn pipeline(&self, topology: PrimitiveTopology3D, instanced: bool) -> &wgpu::RenderPipeline {
        self.pipelines
            .get(&(topology, instanced))
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

#[allow(clippy::too_many_arguments)]
fn render_single_shadow_layer(
    encoder: &mut wgpu::CommandEncoder,
    queue: &wgpu::Queue,
    shadow_pipe: &ShadowPipeline3D,
    shadow_map: &ShadowMap3D,
    layer_idx: u32,
    shadow_view_proj: &Mat4,
    time: f32,
    models: &std::collections::BTreeMap<u32, crate::types::GpuModelEntry>,
    instanced_models: &std::collections::BTreeMap<u32, crate::types::GpuInstancedModelEntry>,
    geometries: &std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::geometry::Geometry3D,
            Option<crate::types::GpuMeshBuffers>,
        ),
    >,
) {
    shadow_map.update_vp(queue, layer_idx, shadow_view_proj, time);
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

    s_pass.set_bind_group(0, vp_bg, &[]);

    let shadow_frustum =
        galfus_realm_3d_resources::frustum::Frustum::from_view_projection(*shadow_view_proj);
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
        s_pass.set_pipeline(shadow_pipe.pipeline(geom.topology, false));
        s_pass.set_bind_group(1, model_bg, &[]);
        s_pass.set_vertex_buffer(0, v.slice(..));
        s_pass.set_index_buffer(i.slice(..), wgpu::IndexFormat::Uint32);
        s_pass.draw_indexed(0..*count, 0, 0..1);
    }

    // Instanced models depth pass
    for (inst_model, instances, inst_buf_opt, _, model_bg_opt) in instanced_models.values() {
        if !inst_model.active || !inst_model.cast_shadow || instances.is_empty() {
            continue;
        }
        if inst_buf_opt.is_none() {
            continue;
        }
        let Some(model_bg) = model_bg_opt else {
            continue;
        };
        let Some((geom, Some((v, i, count)))) = geometries.get(&inst_model.geometry_id) else {
            continue;
        };
        s_pass.set_pipeline(shadow_pipe.pipeline(geom.topology, true));
        s_pass.set_bind_group(1, model_bg, &[]);
        s_pass.set_vertex_buffer(0, v.slice(..));
        s_pass.set_index_buffer(i.slice(..), wgpu::IndexFormat::Uint32);
        s_pass.draw_indexed(0..*count, 0, 0..instances.len() as u32);
    }
}

/// Executes depth passes for all shadow-casting lights applying frustum culling per light.
#[allow(clippy::too_many_arguments)]
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
    instanced_models: &std::collections::BTreeMap<u32, crate::types::GpuInstancedModelEntry>,
    geometries: &std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::geometry::Geometry3D,
            Option<crate::types::GpuMeshBuffers>,
        ),
    >,
    time: f32,
) {
    let mut layer_idx = 0u32;
    for (light, light_trans) in lights.values() {
        if !light.active || !light.cast_shadow {
            continue;
        }
        if light.kind == galfus_realm_3d_resources::light::LightKind3D::Point {
            if layer_idx + 6 > MAX_SHADOW_LIGHTS {
                continue;
            }
            let pos = light_trans.position;
            let range = light.range.max(0.1);
            let fov = 90.5f32.to_radians();
            let proj = Mat4::perspective_rh(fov, 1.0, range, 0.1);
            let targets = [
                (pos + glam::Vec3::X, glam::Vec3::NEG_Y),     // +X: 0
                (pos + glam::Vec3::NEG_X, glam::Vec3::NEG_Y), // -X: 1
                (pos + glam::Vec3::Y, glam::Vec3::Z),         // +Y: 2
                (pos + glam::Vec3::NEG_Y, glam::Vec3::NEG_Z), // -Y: 3
                (pos + glam::Vec3::Z, glam::Vec3::NEG_Y),     // +Z: 4
                (pos + glam::Vec3::NEG_Z, glam::Vec3::NEG_Y), // -Z: 5
            ];
            for (face_i, (target, up)) in targets.iter().enumerate() {
                let view = Mat4::look_at_rh(pos, *target, *up);
                let vp = proj * view;
                render_single_shadow_layer(
                    encoder,
                    queue,
                    shadow_pipe,
                    shadow_map,
                    layer_idx + face_i as u32,
                    &vp,
                    time,
                    models,
                    instanced_models,
                    geometries,
                );
            }
            layer_idx += 6;
        } else {
            if layer_idx >= MAX_SHADOW_LIGHTS {
                continue;
            }
            let light_uniform = light.build_uniform_with_layer(light_trans, layer_idx);
            render_single_shadow_layer(
                encoder,
                queue,
                shadow_pipe,
                shadow_map,
                layer_idx,
                &light_uniform.shadow_view_proj,
                time,
                models,
                instanced_models,
                geometries,
            );
            layer_idx += 1;
        }
    }
}
