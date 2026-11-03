//! GPU particle renderer for 3D camera-facing billboards with Reverse-Z depth testing.

use bytemuck::{Pod, Zeroable};
use galfus_realm_3d_resources::material::Material3D;
use galfus_realm_3d_resources::particle::Particle3DInstance;
use wgpu::util::DeviceExt;

use crate::pipeline::Pipeline3D;
use crate::types::create_material_bind_group;

/// Base vertex for billboard quad.
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct QuadVertex {
    pos: [f32; 2],
    uv: [f32; 2],
}

const QUAD_VERTICES: [QuadVertex; 6] = [
    QuadVertex {
        pos: [-0.5, -0.5],
        uv: [0.0, 1.0],
    },
    QuadVertex {
        pos: [0.5, -0.5],
        uv: [1.0, 1.0],
    },
    QuadVertex {
        pos: [0.5, 0.5],
        uv: [1.0, 0.0],
    },
    QuadVertex {
        pos: [-0.5, -0.5],
        uv: [0.0, 1.0],
    },
    QuadVertex {
        pos: [0.5, 0.5],
        uv: [1.0, 0.0],
    },
    QuadVertex {
        pos: [-0.5, 0.5],
        uv: [0.0, 0.0],
    },
];

const PARTICLE_WGSL: &str = r#"
struct CameraUniform {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    view_projection: mat4x4<f32>,
    position: vec4<f32>,
    direction: vec4<f32>,
    up: vec4<f32>,
    near_far: vec4<f32>,
};

struct MaterialUniform {
    base_color: vec4<f32>,
    emissive_color: vec4<f32>,
    pbr_params: vec4<f32>,
    flags: vec4<u32>,
    refraction_params: vec4<f32>,
    custom_v0: vec4<f32>,
    custom_v1: vec4<f32>,
    custom_v2: vec4<f32>,
    custom_v3: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;

@group(1) @binding(0) var<uniform> material: MaterialUniform;
@group(1) @binding(1) var t_base_color: texture_2d<f32>;
@group(1) @binding(9) var s_linear_repeat: sampler;

struct VertexInput {
    @location(0) quad_pos: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) inst_pos: vec3<f32>,
    @location(3) inst_size: f32,
    @location(4) inst_color: vec4<f32>,
    @location(5) inst_rotation: f32,
    @location(6) inst_uv_rect: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) clip_pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) raw_uv: vec2<f32>,
    @location(2) color: vec4<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    // Camera billboard basis vectors extracted from view matrix rows
    let cam_right = vec3<f32>(camera.view[0][0], camera.view[1][0], camera.view[2][0]);
    let cam_up = vec3<f32>(camera.view[0][1], camera.view[1][1], camera.view[2][1]);

    let cos_r = cos(in.inst_rotation);
    let sin_r = sin(in.inst_rotation);
    let rot_x = in.quad_pos.x * cos_r - in.quad_pos.y * sin_r;
    let rot_y = in.quad_pos.x * sin_r + in.quad_pos.y * cos_r;

    let world_pos = in.inst_pos + (cam_right * rot_x + cam_up * rot_y) * in.inst_size;
    out.clip_pos = camera.view_projection * vec4<f32>(world_pos, 1.0);
    out.raw_uv = in.uv;
    out.uv = mix(in.inst_uv_rect.xy, in.inst_uv_rect.zw, in.uv);
    out.color = in.inst_color;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let tex_sample = textureSample(t_base_color, s_linear_repeat, in.uv);
    let has_base_color_tex = (material.flags.x & 16u) != 0u;

    if (has_base_color_tex) {
        let out_color = tex_sample * material.base_color * in.color;
        if (out_color.a < 0.001) {
            discard;
        }
        return out_color;
    }

    let d = length(in.raw_uv - vec2<f32>(0.5, 0.5)) * 2.0;
    if (d > 1.0) {
        discard;
    }
    let radial = 1.0 - smoothstep(0.2, 1.0, d);
    let tinted = in.color * material.base_color;
    let alpha = tinted.a * radial;
    if (alpha < 0.001) {
        discard;
    }
    return vec4<f32>(tinted.rgb, alpha);
}
"#;

/// Range of particle instances sharing a material, split into background and foreground slices.
#[derive(Debug, Clone)]
pub struct ParticleBatch3D {
    pub material_id: Option<u32>,
    pub behind_range: std::ops::Range<u32>,
    pub front_range: std::ops::Range<u32>,
}

impl ParticleBatch3D {
    #[inline]
    pub fn slice_range(&self, slice: ParticlePassSlice) -> std::ops::Range<u32> {
        match slice {
            ParticlePassSlice::All => self.behind_range.start..self.front_range.end,
            ParticlePassSlice::BehindRefractive => self.behind_range.clone(),
            ParticlePassSlice::FrontRefractive => self.front_range.clone(),
        }
    }
}

/// Depth slice of particle instances to draw during a render pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParticlePassSlice {
    All,
    BehindRefractive,
    FrontRefractive,
}

/// GPU rendering pipeline and dynamic instance buffers for 3D particles.
pub struct ParticleRenderer3D {
    alpha_pipeline: wgpu::RenderPipeline,
    additive_pipeline: wgpu::RenderPipeline,
    quad_buffer: wgpu::Buffer,
    _default_material_buf: wgpu::Buffer,
    default_material_bg: wgpu::BindGroup,
    alpha_buffer: Option<wgpu::Buffer>,
    alpha_capacity: usize,
    additive_buffer: Option<wgpu::Buffer>,
    additive_capacity: usize,
}

impl ParticleRenderer3D {
    pub fn new(
        device: &wgpu::Device,
        target_format: wgpu::TextureFormat,
        pipeline: &Pipeline3D,
    ) -> Self {
        let quad_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Particle3D Quad Buffer"),
            contents: bytemuck::cast_slice(&QUAD_VERTICES),
            usage: wgpu::BufferUsages::VERTEX,
        });

        let default_mat_uniform = Material3D::default().build_uniform();
        let default_material_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Particle3D Default Material Uniform"),
            contents: bytemuck::bytes_of(&default_mat_uniform),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let default_material_bg = create_material_bind_group(
            device,
            pipeline,
            &default_material_buf,
            &[None; 8],
            &|_| None,
        );

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Particle3D Shader Module"),
            source: wgpu::ShaderSource::Wgsl(PARTICLE_WGSL.into()),
        });

        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Particle3D Pipeline Layout"),
            bind_group_layouts: &[&pipeline.scene_layout, &pipeline.material_layout],
            immediate_size: 0,
        });

        const QUAD_ATTRS: [wgpu::VertexAttribute; 2] =
            wgpu::vertex_attr_array![0 => Float32x2, 1 => Float32x2];
        const INST_ATTRS: [wgpu::VertexAttribute; 5] = [
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x3,
                offset: 0,
                shader_location: 2,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32,
                offset: 12,
                shader_location: 3,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 16,
                shader_location: 4,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32,
                offset: 32,
                shader_location: 5,
            },
            wgpu::VertexAttribute {
                format: wgpu::VertexFormat::Float32x4,
                offset: 48,
                shader_location: 6,
            },
        ];
        let vertex_buffers = [
            wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<QuadVertex>() as u64,
                step_mode: wgpu::VertexStepMode::Vertex,
                attributes: &QUAD_ATTRS,
            },
            wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<Particle3DInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &INST_ATTRS,
            },
        ];

        let create_pipe = |blend: wgpu::BlendState, label: &'static str| {
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(label),
                layout: Some(&layout),
                vertex: wgpu::VertexState {
                    module: &shader,
                    entry_point: Some("vs_main"),
                    buffers: &vertex_buffers,
                    compilation_options: Default::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: &shader,
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
                depth_stencil: Some(wgpu::DepthStencilState {
                    format: wgpu::TextureFormat::Depth32Float,
                    depth_write_enabled: false,
                    depth_compare: wgpu::CompareFunction::GreaterEqual,
                    stencil: wgpu::StencilState::default(),
                    bias: wgpu::DepthBiasState::default(),
                }),
                multisample: wgpu::MultisampleState::default(),
                multiview_mask: None,
                cache: None,
            })
        };

        let alpha_pipeline = create_pipe(
            wgpu::BlendState::ALPHA_BLENDING,
            "Particle3D Alpha Pipeline",
        );
        let additive_pipeline = create_pipe(
            wgpu::BlendState {
                color: wgpu::BlendComponent {
                    src_factor: wgpu::BlendFactor::SrcAlpha,
                    dst_factor: wgpu::BlendFactor::One,
                    operation: wgpu::BlendOperation::Add,
                },
                alpha: wgpu::BlendComponent {
                    src_factor: wgpu::BlendFactor::One,
                    dst_factor: wgpu::BlendFactor::One,
                    operation: wgpu::BlendOperation::Add,
                },
            },
            "Particle3D Additive Pipeline",
        );

        Self {
            alpha_pipeline,
            additive_pipeline,
            quad_buffer,
            _default_material_buf: default_material_buf,
            default_material_bg,
            alpha_buffer: None,
            alpha_capacity: 0,
            additive_buffer: None,
            additive_capacity: 0,
        }
    }

    fn upload_buffer(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        buf_opt: &mut Option<wgpu::Buffer>,
        capacity: &mut usize,
        instances: &[Particle3DInstance],
        label: &'static str,
    ) {
        let needed = instances.len();
        if needed == 0 {
            return;
        }
        if *capacity < needed || buf_opt.is_none() {
            *capacity = (needed * 2).max(128);
            *buf_opt = Some(device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(label),
                size: (*capacity * std::mem::size_of::<Particle3DInstance>()) as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }));
        }
        if let Some(buf) = buf_opt {
            queue.write_buffer(buf, 0, bytemuck::cast_slice(instances));
        }
    }

    /// Uploads all active particle instances before render pass submission.
    pub fn upload(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        alpha_instances: &[Particle3DInstance],
        additive_instances: &[Particle3DInstance],
    ) {
        Self::upload_buffer(
            device,
            queue,
            &mut self.alpha_buffer,
            &mut self.alpha_capacity,
            alpha_instances,
            "Particle3D Alpha Instances",
        );
        Self::upload_buffer(
            device,
            queue,
            &mut self.additive_buffer,
            &mut self.additive_capacity,
            additive_instances,
            "Particle3D Additive Instances",
        );
    }

    fn render_batch_list<'a>(
        &'a self,
        pass: &mut wgpu::RenderPass<'a>,
        pipeline: &'a wgpu::RenderPipeline,
        instance_buf: &'a wgpu::Buffer,
        materials: &'a std::collections::BTreeMap<
            u32,
            (Material3D, Option<wgpu::Buffer>, Option<wgpu::BindGroup>),
        >,
        batches: &[ParticleBatch3D],
        slice: ParticlePassSlice,
    ) {
        if !batches.iter().any(|b| !b.slice_range(slice).is_empty()) {
            return;
        }
        pass.set_pipeline(pipeline);
        pass.set_vertex_buffer(0, self.quad_buffer.slice(..));
        pass.set_vertex_buffer(1, instance_buf.slice(..));

        for batch in batches {
            let range = batch.slice_range(slice);
            if range.is_empty() {
                continue;
            }
            let mat_bg = batch
                .material_id
                .and_then(|id| materials.get(&id))
                .and_then(|m| m.2.as_ref())
                .unwrap_or(&self.default_material_bg);
            pass.set_bind_group(1, mat_bg, &[]);
            pass.draw(0..6, range);
        }
    }

    /// Submits draw calls for batched 3D particles across the requested depth slice.
    pub fn render<'a>(
        &'a self,
        pass: &mut wgpu::RenderPass<'a>,
        materials: &'a std::collections::BTreeMap<
            u32,
            (Material3D, Option<wgpu::Buffer>, Option<wgpu::BindGroup>),
        >,
        alpha_batches: &[ParticleBatch3D],
        additive_batches: &[ParticleBatch3D],
        slice: ParticlePassSlice,
    ) {
        if let Some(buf) = &self.alpha_buffer {
            self.render_batch_list(
                pass,
                &self.alpha_pipeline,
                buf,
                materials,
                alpha_batches,
                slice,
            );
        }
        if let Some(buf) = &self.additive_buffer {
            self.render_batch_list(
                pass,
                &self.additive_pipeline,
                buf,
                materials,
                additive_batches,
                slice,
            );
        }
    }
}

/// Partitions particle instances in-place around a squared camera distance threshold.
/// Returns the count of instances that are at or beyond the threshold (behind the refractive plane).
pub fn partition_by_depth(
    instances: &mut [Particle3DInstance],
    camera_pos: glam::Vec3,
    threshold_sq: f32,
) -> u32 {
    let (mut i, mut j) = (0, instances.len());
    while i < j {
        if (glam::Vec3::from(instances[i].position) - camera_pos).length_squared() >= threshold_sq {
            i += 1;
        } else {
            j -= 1;
            instances.swap(i, j);
        }
    }
    i as u32
}

/// Collects and segregates active particle instances into reusable alpha and additive staging buffers
/// while recording per-emitter material batches and optional depth splits around refractive geometry.
#[allow(clippy::too_many_arguments)]
pub fn collect_emitter_instances(
    emitters: &std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::particle::ParticleEmitter3D,
            galfus_realm_3d_resources::transform::Transform3D,
            galfus_realm_3d_resources::particle::ParticleEmitterState3D,
        ),
    >,
    materials: &std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::material::Material3D,
            Option<wgpu::Buffer>,
            Option<wgpu::BindGroup>,
        ),
    >,
    refraction_threshold: Option<(glam::Vec3, f32)>,
    alpha: &mut Vec<Particle3DInstance>,
    additive: &mut Vec<Particle3DInstance>,
    alpha_batches: &mut Vec<ParticleBatch3D>,
    additive_batches: &mut Vec<ParticleBatch3D>,
) {
    alpha.clear();
    additive.clear();
    alpha_batches.clear();
    additive_batches.clear();

    for (emitter, _, state) in emitters.values() {
        let is_add = emitter
            .material_id
            .and_then(|mid| materials.get(&mid))
            .map(|m| {
                m.0.surface_type == galfus_realm_3d_resources::material::SurfaceType3D::Additive
            })
            .unwrap_or(true);
        let (target_instances, target_batches) = if is_add {
            (&mut *additive, &mut *additive_batches)
        } else {
            (&mut *alpha, &mut *alpha_batches)
        };

        let start = target_instances.len() as u32;
        state.append_instances_with_uv(emitter.uv_rect.to_array(), target_instances);
        let end = target_instances.len() as u32;
        if start == end {
            continue;
        }

        let behind_count = if let Some((cam_pos, threshold_sq)) = refraction_threshold {
            partition_by_depth(
                &mut target_instances[start as usize..end as usize],
                cam_pos,
                threshold_sq,
            )
        } else {
            0
        };
        let split = start + behind_count;
        target_batches.push(ParticleBatch3D {
            material_id: emitter.material_id,
            behind_range: start..split,
            front_range: split..end,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use galfus_realm_3d_resources::material::SurfaceType3D;
    use galfus_realm_3d_resources::particle::{ParticleEmitter3D, ParticleEmitterState3D};
    use galfus_realm_3d_resources::transform::Transform3D;
    use glam::{Quat, Vec3, Vec4};
    use std::collections::BTreeMap;

    #[test]
    fn collect_emitter_instances_propagates_uv_rect_and_material_batches() {
        let mut emitters = BTreeMap::new();
        let emitter = ParticleEmitter3D {
            material_id: Some(7),
            uv_rect: Vec4::new(0.25, 0.5, 0.75, 1.0),
            ..Default::default()
        };
        let mut state = ParticleEmitterState3D::new();
        state.burst(&emitter, 4, Vec3::ZERO, Quat::IDENTITY);
        emitters.insert(1, (emitter, Transform3D::default(), state));

        let mut materials = BTreeMap::new();
        let mat = Material3D {
            surface_type: SurfaceType3D::Transparent,
            albedo_texture_id: Some(42),
            ..Default::default()
        };
        materials.insert(7, (mat, None, None));

        let mut alpha = Vec::new();
        let mut additive = Vec::new();
        let mut alpha_batches = Vec::new();
        let mut additive_batches = Vec::new();

        collect_emitter_instances(
            &emitters,
            &materials,
            None,
            &mut alpha,
            &mut additive,
            &mut alpha_batches,
            &mut additive_batches,
        );

        assert_eq!(alpha.len(), 4);
        assert!(additive.is_empty());
        assert_eq!(alpha_batches.len(), 1);
        assert_eq!(alpha_batches[0].material_id, Some(7));
        assert_eq!(alpha_batches[0].front_range, 0..4);
        assert_eq!(alpha[0].uv_rect, [0.25, 0.5, 0.75, 1.0]);
    }
}
