use bytemuck::{Pod, Zeroable};
use galfus_realm_3d_resources::srgb_to_linear_rgba;
use glam::{Vec3, Vec4};

/// Vertex representation for debug lines and wireframes.
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct GizmoVertex {
    /// World-space coordinate [x, y, z].
    pub position: [f32; 3],
    /// Alignment padding for 16-byte boundary.
    pub _pad: f32,
    /// Linear RGBA line color ready for the GPU.
    pub color: [f32; 4],
}

impl GizmoVertex {
    pub fn new(position: Vec3, color: Vec4) -> Self {
        let color = srgb_to_linear_rgba(color);
        Self {
            position: [position.x, position.y, position.z],
            _pad: 0.0,
            color: [color.x, color.y, color.z, color.w],
        }
    }
}

const GIZMO_SHADER: &str = r#"
struct Camera {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    view_projection: mat4x4<f32>,
    position: vec4<f32>,
    direction: vec4<f32>,
    up: vec4<f32>,
    near_far: vec2<f32>,
    _padding: vec2<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.clip_position = camera.view_projection * vec4<f32>(in.position, 1.0);
    out.color = in.color;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}
"#;

/// GPU rendering pipeline for debug gizmos (lines, wireframes, AABBs).
pub struct GizmoPipeline3D {
    pipeline: wgpu::RenderPipeline,
    vertex_buffer: Option<wgpu::Buffer>,
    vertex_capacity: usize,
}

impl GizmoPipeline3D {
    pub fn new(
        device: &wgpu::Device,
        scene_layout: &wgpu::BindGroupLayout,
        target_format: wgpu::TextureFormat,
    ) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Gizmo 3D Shader"),
            source: wgpu::ShaderSource::Wgsl(GIZMO_SHADER.into()),
        });

        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Gizmo 3D Pipeline Layout"),
            bind_group_layouts: &[scene_layout],
            immediate_size: 0,
        });

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Gizmo 3D Render Pipeline"),
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<GizmoVertex>() as wgpu::BufferAddress,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &[
                        // position
                        wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32x3,
                            offset: 0,
                            shader_location: 0,
                        },
                        // color
                        wgpu::VertexAttribute {
                            format: wgpu::VertexFormat::Float32x4,
                            offset: 16,
                            shader_location: 1,
                        },
                    ],
                }],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: target_format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::LineList,
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
                depth_compare: wgpu::CompareFunction::GreaterEqual, // Reverse-Z
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        Self {
            pipeline,
            vertex_buffer: None,
            vertex_capacity: 0,
        }
    }

    /// Uploads vertex data and renders the gizmo line list.
    #[allow(clippy::too_many_arguments)]
    pub fn render(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target_view: &wgpu::TextureView,
        depth_view: &wgpu::TextureView,
        scene_bind_group: &wgpu::BindGroup,
        vertices: &[GizmoVertex],
    ) {
        if vertices.is_empty() {
            return;
        }

        let needed_bytes = std::mem::size_of_val(vertices) as u64;
        if self.vertex_buffer.is_none() || self.vertex_capacity < vertices.len() {
            let buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Gizmo 3D Vertex Buffer"),
                size: needed_bytes.max(1024),
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            self.vertex_buffer = Some(buffer);
            self.vertex_capacity = vertices.len();
        }

        if let Some(buf) = &self.vertex_buffer {
            queue.write_buffer(buf, 0, bytemuck::cast_slice(vertices));

            let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Gizmo 3D Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Load,
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Load,
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });

            rpass.set_pipeline(&self.pipeline);
            rpass.set_bind_group(0, scene_bind_group, &[]);
            rpass.set_vertex_buffer(0, buf.slice(0..needed_bytes));
            rpass.draw(0..vertices.len() as u32, 0..1);
        }
    }
}

/// Accumulator and immediate generator for 3D debug gizmos.
#[derive(Debug, Default, Clone)]
pub struct GizmoSystem3D {
    vertices: Vec<GizmoVertex>,
}

impl GizmoSystem3D {
    pub fn new() -> Self {
        Self {
            vertices: Vec::new(),
        }
    }

    /// Clears all queued gizmos for the next frame.
    pub fn clear(&mut self) {
        self.vertices.clear();
    }

    /// Returns a slice of queued vertices.
    pub fn vertices(&self) -> &[GizmoVertex] {
        &self.vertices
    }

    /// Queues a single 3D line segment between `start` and `end`.
    pub fn draw_line(&mut self, start: Vec3, end: Vec3, color: Vec4) {
        self.vertices.push(GizmoVertex::new(start, color));
        self.vertices.push(GizmoVertex::new(end, color));
    }

    /// Queues a wireframe Axis-Aligned Bounding Box (AABB) between `min` and `max`.
    pub fn draw_aabb(&mut self, min: Vec3, max: Vec3, color: Vec4) {
        // Bottom rectangle (-Y)
        let b0 = Vec3::new(min.x, min.y, min.z);
        let b1 = Vec3::new(max.x, min.y, min.z);
        let b2 = Vec3::new(max.x, min.y, max.z);
        let b3 = Vec3::new(min.x, min.y, max.z);

        // Top rectangle (+Y)
        let t0 = Vec3::new(min.x, max.y, min.z);
        let t1 = Vec3::new(max.x, max.y, min.z);
        let t2 = Vec3::new(max.x, max.y, max.z);
        let t3 = Vec3::new(min.x, max.y, max.z);

        // Bottom edges
        self.draw_line(b0, b1, color);
        self.draw_line(b1, b2, color);
        self.draw_line(b2, b3, color);
        self.draw_line(b3, b0, color);

        // Top edges
        self.draw_line(t0, t1, color);
        self.draw_line(t1, t2, color);
        self.draw_line(t2, t3, color);
        self.draw_line(t3, t0, color);

        // Vertical pillars
        self.draw_line(b0, t0, color);
        self.draw_line(b1, t1, color);
        self.draw_line(b2, t2, color);
        self.draw_line(b3, t3, color);
    }

    /// Queues a sequence of connected 3D line segments.
    pub fn draw_polyline(&mut self, points: &[Vec3], color: Vec4, closed: bool) {
        if points.len() < 2 {
            return;
        }
        for i in 0..(points.len() - 1) {
            self.draw_line(points[i], points[i + 1], color);
        }
        if closed && points.len() > 2 {
            self.draw_line(points[points.len() - 1], points[0], color);
        }
    }
}
