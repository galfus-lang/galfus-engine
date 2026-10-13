use std::collections::HashMap;
use std::sync::Arc;

use crate::error::{MultiverseError, MultiverseResult};
use crate::screen_effect::compose_screen_effect;
use crate::types::InvocationFilter;
use glam::{UVec2, UVec4};

const WGSL_POSTPROCESS: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) id: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(id << 1u) & 2) * 2.0 - 1.0;
    let y = f32(i32(id & 2u) * -2) + 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

@group(0) @binding(0) var t_input: texture_2d<f32>;
@group(0) @binding(1) var s_input: sampler;

@fragment
fn fs_sepia(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    let r = dot(color.rgb, vec3<f32>(0.393, 0.769, 0.189));
    let g = dot(color.rgb, vec3<f32>(0.349, 0.686, 0.168));
    let b = dot(color.rgb, vec3<f32>(0.272, 0.534, 0.131));
    let sepia = min(vec3<f32>(1.0), vec3<f32>(r, g, b));
    return vec4<f32>(sepia, color.a);
}

@fragment
fn fs_blit(in: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(t_input, s_input, in.uv);
}
"#;

/// Internal post-processing coordinator for invocation filter passes.
pub(crate) struct PostProcessor {
    bind_group_layout: Arc<wgpu::BindGroupLayout>,
    pipeline_layout: Arc<wgpu::PipelineLayout>,
    shader_module: wgpu::ShaderModule,
    sampler: wgpu::Sampler,
    pipelines: HashMap<(String, wgpu::TextureFormat), wgpu::RenderPipeline>,
    custom_shaders: HashMap<u32, wgpu::ShaderModule>,
}

/// Parameters defining source texture, destination target view, and optional viewport for a filter pass.
pub struct FilterPassDesc<'a> {
    pub src_view: &'a wgpu::TextureView,
    pub dst_view: &'a wgpu::TextureView,
    pub dst_format: wgpu::TextureFormat,
    pub dst_size: UVec2,
    pub viewport: Option<UVec4>,
}

impl PostProcessor {
    pub fn new(device: &wgpu::Device) -> Self {
        let bind_group_layout = Arc::new(device.create_bind_group_layout(
            &wgpu::BindGroupLayoutDescriptor {
                label: Some("PostProcess BGL"),
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
            },
        ));

        let pipeline_layout = Arc::new(device.create_pipeline_layout(
            &wgpu::PipelineLayoutDescriptor {
                label: Some("PostProcess Pipeline Layout"),
                bind_group_layouts: &[&bind_group_layout],
                immediate_size: 0,
            },
        ));

        let shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("PostProcess Builtin Shaders"),
            source: wgpu::ShaderSource::Wgsl(WGSL_POSTPROCESS.into()),
        });

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("PostProcess Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });

        Self {
            bind_group_layout,
            pipeline_layout,
            shader_module,
            sampler,
            pipelines: HashMap::new(),
            custom_shaders: HashMap::new(),
        }
    }

    /// Registers a custom shader snippet by composing it against the multiverse screen template.
    pub fn register_custom_shader(
        &mut self,
        device: &wgpu::Device,
        id: u32,
        source: &str,
    ) -> MultiverseResult<()> {
        let composed = compose_screen_effect(source)?;
        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some(&format!("Custom Screen Effect {}", id)),
            source: wgpu::ShaderSource::Wgsl(composed.source.into()),
        });
        self.custom_shaders.insert(id, module);
        Ok(())
    }

    fn ensure_pipeline(
        &mut self,
        device: &wgpu::Device,
        effect_name: &str,
        format: wgpu::TextureFormat,
    ) -> MultiverseResult<()> {
        let key = (effect_name.to_string(), format);
        if !self.pipelines.contains_key(&key) {
            let (module, entry_point) = if let Some(id_str) = effect_name.strip_prefix("custom:") {
                let shader_id: u32 = id_str
                    .parse()
                    .map_err(|_| MultiverseError::InvalidConfig("Invalid shader ID".into()))?;
                let custom_mod = self
                    .custom_shaders
                    .get(&shader_id)
                    .ok_or_else(|| MultiverseError::InvalidConfig(format!("Shader ID {shader_id} not found")))?;
                (custom_mod, "fs_main")
            } else if effect_name == "sepia" {
                (&self.shader_module, "fs_sepia")
            } else {
                (&self.shader_module, "fs_blit")
            };

            let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("PostProcess Render Pipeline"),
                layout: Some(&self.pipeline_layout),
                vertex: wgpu::VertexState {
                    module,
                    entry_point: Some("vs_main"),
                    buffers: &[],
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module,
                    entry_point: Some(entry_point),
                    targets: &[Some(wgpu::ColorTargetState {
                        format,
                        blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                    compilation_options: wgpu::PipelineCompilationOptions::default(),
                }),
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::TriangleList,
                    strip_index_format: None,
                    front_face: wgpu::FrontFace::Ccw,
                    cull_mode: None,
                    unclipped_depth: false,
                    polygon_mode: wgpu::PolygonMode::Fill,
                    conservative: false,
                },
                depth_stencil: None,
                multisample: wgpu::MultisampleState::default(),
                multiview_mask: None,
                cache: None,
            });

            self.pipelines.insert(key, pipeline);
        }

        Ok(())
    }

    pub fn render_filter(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        filter: Option<&InvocationFilter>,
        pass_desc: &FilterPassDesc<'_>,
    ) -> MultiverseResult<()> {
        let effect_key = match filter {
            Some(InvocationFilter::Sepia) => "sepia".to_string(),
            Some(InvocationFilter::Custom { shader_id }) => format!("custom:{shader_id}"),
            _ => "blit".to_string(),
        };

        self.ensure_pipeline(device, &effect_key, pass_desc.dst_format)?;

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("PostProcess Pass BindGroup"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(pass_desc.src_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
            ],
        });

        let pipeline = self
            .pipelines
            .get(&(effect_key, pass_desc.dst_format))
            .expect("Pipeline must exist");

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("PostProcess Encoder"),
        });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("PostProcess RenderPass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: pass_desc.dst_view,
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

            if let Some(vp) = pass_desc.viewport {
                let x = vp.x.min(pass_desc.dst_size.x);
                let y = vp.y.min(pass_desc.dst_size.y);
                let w = vp.z.min(pass_desc.dst_size.x.saturating_sub(x)).max(1);
                let h = vp.w.min(pass_desc.dst_size.y.saturating_sub(y)).max(1);
                pass.set_viewport(x as f32, y as f32, w as f32, h as f32, 0.0, 1.0);
                pass.set_scissor_rect(x, y, w, h);
            }

            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1);
        }

        queue.submit(Some(encoder.finish()));
        Ok(())
    }
}
