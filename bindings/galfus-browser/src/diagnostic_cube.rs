use std::cell::RefCell;

use wasm_bindgen::{JsCast, JsValue};
use wgpu::util::DeviceExt;

const CUBE_SHADER: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
}

const POSITIONS: array<vec3<f32>, 36> = array<vec3<f32>, 36>(
    vec3(-1.0, -1.0,  1.0), vec3( 1.0, -1.0,  1.0), vec3( 1.0,  1.0,  1.0),
    vec3(-1.0, -1.0,  1.0), vec3( 1.0,  1.0,  1.0), vec3(-1.0,  1.0,  1.0),
    vec3( 1.0, -1.0, -1.0), vec3(-1.0, -1.0, -1.0), vec3(-1.0, 1.0, -1.0),
    vec3( 1.0, -1.0, -1.0), vec3(-1.0,  1.0, -1.0), vec3( 1.0, 1.0, -1.0),
    vec3(-1.0, -1.0, -1.0), vec3(-1.0, -1.0,  1.0), vec3(-1.0, 1.0,  1.0),
    vec3(-1.0, -1.0, -1.0), vec3(-1.0,  1.0,  1.0), vec3(-1.0, 1.0, -1.0),
    vec3( 1.0, -1.0,  1.0), vec3( 1.0, -1.0, -1.0), vec3( 1.0, 1.0, -1.0),
    vec3( 1.0, -1.0,  1.0), vec3( 1.0,  1.0, -1.0), vec3( 1.0, 1.0,  1.0),
    vec3(-1.0,  1.0,  1.0), vec3( 1.0,  1.0,  1.0), vec3( 1.0, 1.0, -1.0),
    vec3(-1.0,  1.0,  1.0), vec3( 1.0,  1.0, -1.0), vec3(-1.0, 1.0, -1.0),
    vec3(-1.0, -1.0, -1.0), vec3( 1.0, -1.0, -1.0), vec3( 1.0, -1.0, 1.0),
    vec3(-1.0, -1.0, -1.0), vec3( 1.0, -1.0,  1.0), vec3(-1.0, -1.0, 1.0)
);

@group(0) @binding(0) var<uniform> animation: vec4<f32>;

fn project(point: vec3<f32>) -> vec4<f32> {
    let yaw = 0.72 + animation.x;
    let pitch = -0.48 + sin(animation.x * 0.7) * 0.25;
    let yawed = vec3(
        cos(yaw) * point.x + sin(yaw) * point.z,
        point.y,
        -sin(yaw) * point.x + cos(yaw) * point.z
    );
    let rotated = vec3(
        yawed.x,
        cos(pitch) * yawed.y - sin(pitch) * yawed.z,
        sin(pitch) * yawed.y + cos(pitch) * yawed.z
    );
    let depth = rotated.z + 4.5;
    return vec4(
        rotated.x * 1.7 / depth,
        rotated.y * 1.7 / depth,
        (depth - 0.1) / 10.0,
        1.0
    );
}

fn face_color(face: u32) -> vec3<f32> {
    if (face == 0u) { return vec3(0.96, 0.58, 0.18); }
    if (face == 1u) { return vec3(0.41, 0.12, 0.56); }
    if (face == 2u) { return vec3(0.12, 0.72, 0.78); }
    if (face == 3u) { return vec3(0.08, 0.39, 0.62); }
    if (face == 4u) { return vec3(0.96, 0.80, 0.22); }
    return vec3(0.18, 0.26, 0.45);
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var output: VertexOutput;
    output.position = project(POSITIONS[vertex_index]);
    output.color = face_color(vertex_index / 6u);
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4(input.color, 1.0);
}
"#;

/// Retained GPU state for the browser diagnostic cube.
pub struct DiagnosticCubeRenderer {
    canvas_id: String,
    canvas: web_sys::HtmlCanvasElement,
    _instance: wgpu::Instance,
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    pipeline: wgpu::RenderPipeline,
    animation_buffer: wgpu::Buffer,
    animation_bind_group: wgpu::BindGroup,
}

impl DiagnosticCubeRenderer {
    async fn new(canvas_id: &str) -> Result<Self, JsValue> {
        let window = web_sys::window().ok_or_else(|| JsValue::from_str("Window is unavailable"))?;
        let document = window
            .document()
            .ok_or_else(|| JsValue::from_str("Document is unavailable"))?;
        let element = document
            .get_element_by_id(canvas_id)
            .ok_or_else(|| JsValue::from_str("Canvas element was not found"))?;
        let canvas = element
            .dyn_into::<web_sys::HtmlCanvasElement>()
            .map_err(|_| JsValue::from_str("Configured element is not a canvas"))?;
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::GL,
            ..Default::default()
        });
        let surface = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas.clone()))
            .map_err(|error| {
                JsValue::from_str(&format!("Failed to create GPU surface: {error}"))
            })?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                compatible_surface: Some(&surface),
                ..Default::default()
            })
            .await
            .map_err(|error| {
                JsValue::from_str(&format!("Failed to request GPU adapter: {error}"))
            })?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("Galfus browser diagnostic device"),
                required_limits: wgpu::Limits::downlevel_webgl2_defaults(),
                ..Default::default()
            })
            .await
            .map_err(|error| {
                JsValue::from_str(&format!("Failed to request GPU device: {error}"))
            })?;
        let config = surface
            .get_default_config(&adapter, canvas.width().max(1), canvas.height().max(1))
            .ok_or_else(|| JsValue::from_str("GPU surface configuration is unsupported"))?;
        surface.configure(&device, &config);

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Galfus browser diagnostic cube shader"),
            source: wgpu::ShaderSource::Wgsl(CUBE_SHADER.into()),
        });
        let animation_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Galfus browser diagnostic cube animation layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let animation_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Galfus browser diagnostic cube animation buffer"),
            contents: bytemuck::cast_slice(&[0.0_f32, 0.0, 0.0, 0.0]),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let animation_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Galfus browser diagnostic cube animation bind group"),
            layout: &animation_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: animation_buffer.as_entire_binding(),
            }],
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Galfus browser diagnostic cube pipeline layout"),
            bind_group_layouts: &[&animation_layout],
            immediate_size: 0,
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Galfus browser diagnostic cube pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: config.format,
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

        Ok(Self {
            canvas_id: canvas_id.to_string(),
            canvas,
            _instance: instance,
            surface,
            device,
            queue,
            config,
            pipeline,
            animation_buffer,
            animation_bind_group,
        })
    }

    fn render(&mut self, elapsed_seconds: f32) -> Result<(), JsValue> {
        let width = self.canvas.client_width().max(1) as u32;
        let height = self.canvas.client_height().max(1) as u32;
        if self.config.width != width || self.config.height != height {
            self.config.width = width;
            self.config.height = height;
            self.surface.configure(&self.device, &self.config);
        }
        self.queue.write_buffer(
            &self.animation_buffer,
            0,
            bytemuck::cast_slice(&[elapsed_seconds, 0.0_f32, 0.0, 0.0]),
        );

        let output = self.surface.get_current_texture().map_err(|error| {
            JsValue::from_str(&format!("Failed to acquire GPU surface texture: {error}"))
        })?;
        let view = output
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Galfus browser diagnostic cube commands"),
            });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Galfus browser diagnostic cube pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.015,
                            g: 0.025,
                            b: 0.055,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.animation_bind_group, &[]);
            pass.draw(0..36, 0..1);
        }

        self.queue.submit(Some(encoder.finish()));
        output.present();
        Ok(())
    }
}

/// Renders an animated GPU diagnostic cube to the canvas identified by `canvas_id`.
pub async fn render(
    renderer: &RefCell<Option<DiagnosticCubeRenderer>>,
    canvas_id: &str,
    elapsed_seconds: f32,
) -> Result<(), JsValue> {
    let requires_new_renderer = renderer
        .borrow()
        .as_ref()
        .is_none_or(|current| current.canvas_id != canvas_id);
    if requires_new_renderer {
        renderer.replace(Some(DiagnosticCubeRenderer::new(canvas_id).await?));
    }

    renderer
        .borrow_mut()
        .as_mut()
        .expect("diagnostic cube renderer is initialized")
        .render(elapsed_seconds)
}
