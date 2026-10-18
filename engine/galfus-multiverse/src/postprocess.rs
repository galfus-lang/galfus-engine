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
fn fs_grayscale(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    let gray = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    return vec4<f32>(vec3<f32>(gray), color.a);
}

@fragment
fn fs_invert(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    return vec4<f32>(1.0 - color.rgb, color.a);
}

@fragment
fn fs_vignette(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    let dist = distance(in.uv, vec2<f32>(0.5, 0.5));
    let vig = clamp(smoothstep(0.75, 0.25, dist), 0.0, 1.0);
    return vec4<f32>(color.rgb * vig, color.a);
}

@fragment
fn fs_tonemap_aces(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    let mapped = clamp((color.rgb * (a * color.rgb + b)) / (color.rgb * (c * color.rgb + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
    return vec4<f32>(mapped, color.a);
}

@fragment
fn fs_chromatic_aberration(in: VertexOutput) -> @location(0) vec4<f32> {
    let offset = vec2<f32>(0.0035, 0.0);
    let r = textureSample(t_input, s_input, in.uv + offset).r;
    let g = textureSample(t_input, s_input, in.uv).g;
    let b = textureSample(t_input, s_input, in.uv - offset).b;
    let a = textureSample(t_input, s_input, in.uv).a;
    return vec4<f32>(r, g, b, a);
}

@fragment
fn fs_film_grain(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    let noise = fract(sin(dot(in.uv, vec2<f32>(12.9898, 78.233))) * 43758.5453);
    let grain = (noise - 0.5) * 0.08;
    return vec4<f32>(clamp(color.rgb + grain, vec3<f32>(0.0), vec3<f32>(1.0)), color.a);
}

@fragment
fn fs_edge_outline(in: VertexOutput) -> @location(0) vec4<f32> {
    let tex_dim = vec2<f32>(textureDimensions(t_input));
    let texel = vec2<f32>(1.0 / max(tex_dim.x, 1.0), 1.0 / max(tex_dim.y, 1.0));
    let c = textureSample(t_input, s_input, in.uv);
    let up = textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, -texel.y));
    let down = textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, texel.y));
    let left = textureSample(t_input, s_input, in.uv + vec2<f32>(-texel.x, 0.0));
    let right = textureSample(t_input, s_input, in.uv + vec2<f32>(texel.x, 0.0));
    let diff = abs(c - up) + abs(c - down) + abs(c - left) + abs(c - right);
    let edge = length(diff.rgb);
    if (edge > 0.12) {
        return vec4<f32>(0.0, 1.0, 0.85, 1.0);
    }
    return c;
}

@fragment
fn fs_posterize(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    let steps = 6.0;
    let posterized = floor(color.rgb * steps) / steps;
    return vec4<f32>(posterized, color.a);
}

@fragment
fn fs_blur(in: VertexOutput) -> @location(0) vec4<f32> {
    let tex_dim = vec2<f32>(textureDimensions(t_input));
    let texel = vec2<f32>(1.5 / max(tex_dim.x, 1.0), 1.5 / max(tex_dim.y, 1.0));
    var sum = textureSample(t_input, s_input, in.uv) * 0.227027;
    sum += textureSample(t_input, s_input, in.uv + vec2<f32>(texel.x, 0.0)) * 0.1945946;
    sum += textureSample(t_input, s_input, in.uv - vec2<f32>(texel.x, 0.0)) * 0.1945946;
    sum += textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, texel.y)) * 0.1945946;
    sum += textureSample(t_input, s_input, in.uv - vec2<f32>(0.0, texel.y)) * 0.1945946;
    return sum;
}

@fragment
fn fs_sharpen(in: VertexOutput) -> @location(0) vec4<f32> {
    let tex_dim = vec2<f32>(textureDimensions(t_input));
    let texel = vec2<f32>(1.0 / max(tex_dim.x, 1.0), 1.0 / max(tex_dim.y, 1.0));
    let c = textureSample(t_input, s_input, in.uv);
    let n = textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, -texel.y));
    let s = textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, texel.y));
    let w = textureSample(t_input, s_input, in.uv + vec2<f32>(-texel.x, 0.0));
    let e = textureSample(t_input, s_input, in.uv + vec2<f32>(texel.x, 0.0));
    let edge = (n + s + w + e) * 0.25;
    let sharpened = c + (c - edge) * 0.75;
    return vec4<f32>(clamp(sharpened.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), c.a);
}

@fragment
fn fs_blit(in: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(t_input, s_input, in.uv);
}

@fragment
fn fs_fxaa(in: VertexOutput) -> @location(0) vec4<f32> {
    let tex_dim = vec2<f32>(textureDimensions(t_input));
    let inv_dim = vec2<f32>(1.0 / max(tex_dim.x, 1.0), 1.0 / max(tex_dim.y, 1.0));

    let edge_threshold_min = 0.0833;
    let edge_threshold_max = 0.166;
    let subpix_quality = 0.75;

    let rgb_m = textureSample(t_input, s_input, in.uv).rgb;
    let alpha_m = textureSample(t_input, s_input, in.uv).a;

    let luma_m = dot(rgb_m, vec3<f32>(0.299, 0.587, 0.114));
    let luma_n = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, -inv_dim.y)).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let luma_s = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, inv_dim.y)).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let luma_w = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(-inv_dim.x, 0.0)).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let luma_e = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(inv_dim.x, 0.0)).rgb, vec3<f32>(0.299, 0.587, 0.114));

    let luma_min = min(luma_m, min(min(luma_n, luma_s), min(luma_w, luma_e)));
    let luma_max = max(luma_m, max(max(luma_n, luma_s), max(luma_w, luma_e)));
    let range = luma_max - luma_min;

    if (range < max(edge_threshold_min, luma_max * edge_threshold_max)) {
        return vec4<f32>(rgb_m, alpha_m);
    }

    let luma_nw = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(-inv_dim.x, -inv_dim.y)).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let luma_ne = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(inv_dim.x, -inv_dim.y)).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let luma_sw = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(-inv_dim.x, inv_dim.y)).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let luma_se = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(inv_dim.x, inv_dim.y)).rgb, vec3<f32>(0.299, 0.587, 0.114));

    let luma_down_up = luma_s + luma_n;
    let luma_left_right = luma_w + luma_e;
    let luma_left_corners = luma_sw + luma_nw;
    let luma_down_corners = luma_sw + luma_se;
    let luma_right_corners = luma_se + luma_ne;
    let luma_up_corners = luma_ne + luma_nw;

    let edge_horz = abs(-2.0 * luma_w + luma_left_corners) + abs(-2.0 * luma_m + luma_down_up) * 2.0 + abs(-2.0 * luma_e + luma_right_corners);
    let edge_vert = abs(-2.0 * luma_n + luma_up_corners) + abs(-2.0 * luma_m + luma_left_right) * 2.0 + abs(-2.0 * luma_s + luma_down_corners);
    let is_horz = edge_horz >= edge_vert;

    let luma_neg = select(luma_w, luma_n, is_horz);
    let luma_pos = select(luma_e, luma_s, is_horz);
    let grad_neg = abs(luma_neg - luma_m);
    let grad_pos = abs(luma_pos - luma_m);

    var step_len = select(inv_dim.x, inv_dim.y, is_horz);
    if (grad_neg >= grad_pos) {
        step_len = -step_len;
    }

    let luma_avg_3x3 = (luma_down_up + luma_left_right + luma_left_corners + luma_right_corners) * (1.0 / 12.0);
    let subpix_diff = clamp(abs(luma_avg_3x3 - luma_m) / max(range, 0.001), 0.0, 1.0);
    let subpix_blend = (-2.0 * subpix_diff + 3.0) * subpix_diff * subpix_diff * subpix_quality;

    var uv_offset = in.uv;
    if (is_horz) {
        uv_offset.y += step_len * (0.5 + subpix_blend * 0.5);
    } else {
        uv_offset.x += step_len * (0.5 + subpix_blend * 0.5);
    }

    let sampled_rgb = textureSample(t_input, s_input, uv_offset).rgb;
    let result_rgb = mix(rgb_m, sampled_rgb, clamp(subpix_blend * 1.25, 0.0, 1.0));
    return vec4<f32>(result_rgb, alpha_m);
}
"#;

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

/// Internal post-processing coordinator for invocation filter passes.
pub(crate) struct PostProcessor {
    bind_group_layout: Arc<wgpu::BindGroupLayout>,
    pipeline_layout: Arc<wgpu::PipelineLayout>,
    shader_module: wgpu::ShaderModule,
    sampler: wgpu::Sampler,
    samplers: galfus_gpu_manager::StandardSamplers,
    fallback_white_view: wgpu::TextureView,
    fallback_normal_view: wgpu::TextureView,
    fallback_black_view: wgpu::TextureView,
    _fallback_textures: (wgpu::Texture, wgpu::Texture, wgpu::Texture),
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
    pub fn new(device: &wgpu::Device, queue: &wgpu::Queue) -> Self {
        let samplers = galfus_gpu_manager::StandardSamplers::new(device);
        let (white_tex, fallback_white_view) = create_1x1_texture(
            device,
            queue,
            "PostProcess White Fallback",
            [255, 255, 255, 255],
        );
        let (normal_tex, fallback_normal_view) = create_1x1_texture(
            device,
            queue,
            "PostProcess Normal Fallback",
            [128, 128, 255, 255],
        );
        let (black_tex, fallback_black_view) =
            create_1x1_texture(device, queue, "PostProcess Black Fallback", [0, 0, 0, 0]);

        let mut entries = Vec::with_capacity(14);
        // Binding 0: Main screen texture
        entries.push(wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        });
        // Binding 1: Screen sampler
        entries.push(wgpu::BindGroupLayoutEntry {
            binding: 1,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
            count: None,
        });
        // Bindings 2..=9: 8 Auxiliary textures
        for i in 2..=9 {
            entries.push(wgpu::BindGroupLayoutEntry {
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
        // Bindings 10..=13: 4 Standard samplers
        for i in 10..=13 {
            entries.push(wgpu::BindGroupLayoutEntry {
                binding: i,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                count: None,
            });
        }

        let bind_group_layout = Arc::new(device.create_bind_group_layout(
            &wgpu::BindGroupLayoutDescriptor {
                label: Some("PostProcess BGL"),
                entries: &entries,
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
            samplers,
            fallback_white_view,
            fallback_normal_view,
            fallback_black_view,
            _fallback_textures: (white_tex, normal_tex, black_tex),
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
                let custom_mod = self.custom_shaders.get(&shader_id).ok_or_else(|| {
                    MultiverseError::InvalidConfig(format!("Shader ID {shader_id} not found"))
                })?;
                (custom_mod, "fs_main")
            } else if effect_name == "sepia" {
                (&self.shader_module, "fs_sepia")
            } else if effect_name == "grayscale" {
                (&self.shader_module, "fs_grayscale")
            } else if effect_name == "invert" {
                (&self.shader_module, "fs_invert")
            } else if effect_name == "vignette" {
                (&self.shader_module, "fs_vignette")
            } else if effect_name == "tonemap_aces" {
                (&self.shader_module, "fs_tonemap_aces")
            } else if effect_name == "chromatic_aberration" {
                (&self.shader_module, "fs_chromatic_aberration")
            } else if effect_name == "film_grain" {
                (&self.shader_module, "fs_film_grain")
            } else if effect_name == "edge_outline" {
                (&self.shader_module, "fs_edge_outline")
            } else if effect_name == "posterize" {
                (&self.shader_module, "fs_posterize")
            } else if effect_name == "blur" {
                (&self.shader_module, "fs_blur")
            } else if effect_name == "sharpen" {
                (&self.shader_module, "fs_sharpen")
            } else if effect_name == "fxaa" {
                (&self.shader_module, "fs_fxaa")
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

    pub fn render_filter<'tex>(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        filter: Option<&InvocationFilter>,
        textures: &dyn Fn(u32) -> Option<&'tex wgpu::TextureView>,
        pass_desc: &FilterPassDesc<'_>,
    ) -> MultiverseResult<()> {
        let (effect_key, aux_slots, _sampler_idx) = match filter {
            Some(InvocationFilter::Sepia) => ("sepia".to_string(), &[None; 8], 0),
            Some(InvocationFilter::Grayscale) => ("grayscale".to_string(), &[None; 8], 0),
            Some(InvocationFilter::Invert) => ("invert".to_string(), &[None; 8], 0),
            Some(InvocationFilter::Vignette) => ("vignette".to_string(), &[None; 8], 0),
            Some(InvocationFilter::TonemapAces) => ("tonemap_aces".to_string(), &[None; 8], 0),
            Some(InvocationFilter::ChromaticAberration) => {
                ("chromatic_aberration".to_string(), &[None; 8], 0)
            }
            Some(InvocationFilter::FilmGrain) => ("film_grain".to_string(), &[None; 8], 0),
            Some(InvocationFilter::EdgeOutline) => ("edge_outline".to_string(), &[None; 8], 0),
            Some(InvocationFilter::Posterize) => ("posterize".to_string(), &[None; 8], 0),
            Some(InvocationFilter::Blur) => ("blur".to_string(), &[None; 8], 0),
            Some(InvocationFilter::Sharpen) => ("sharpen".to_string(), &[None; 8], 0),
            Some(InvocationFilter::Fxaa) => ("fxaa".to_string(), &[None; 8], 0),
            Some(InvocationFilter::Custom {
                shader_id,
                textures,
                sampler_index,
            }) => (format!("custom:{shader_id}"), textures, *sampler_index),
            _ => ("blit".to_string(), &[None; 8], 0),
        };

        self.ensure_pipeline(device, &effect_key, pass_desc.dst_format)?;

        let mut views: [&wgpu::TextureView; 8] = [&self.fallback_white_view; 8];
        views[1] = &self.fallback_normal_view;
        views[4] = &self.fallback_black_view;

        for (i, slot) in aux_slots.iter().enumerate() {
            if let Some(view) = slot.and_then(textures) {
                views[i] = view;
            }
        }

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
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(views[0]),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(views[1]),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: wgpu::BindingResource::TextureView(views[2]),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: wgpu::BindingResource::TextureView(views[3]),
                },
                wgpu::BindGroupEntry {
                    binding: 6,
                    resource: wgpu::BindingResource::TextureView(views[4]),
                },
                wgpu::BindGroupEntry {
                    binding: 7,
                    resource: wgpu::BindingResource::TextureView(views[5]),
                },
                wgpu::BindGroupEntry {
                    binding: 8,
                    resource: wgpu::BindingResource::TextureView(views[6]),
                },
                wgpu::BindGroupEntry {
                    binding: 9,
                    resource: wgpu::BindingResource::TextureView(views[7]),
                },
                wgpu::BindGroupEntry {
                    binding: 10,
                    resource: wgpu::BindingResource::Sampler(&self.samplers.linear_repeat),
                },
                wgpu::BindGroupEntry {
                    binding: 11,
                    resource: wgpu::BindingResource::Sampler(&self.samplers.linear_clamp),
                },
                wgpu::BindGroupEntry {
                    binding: 12,
                    resource: wgpu::BindingResource::Sampler(&self.samplers.nearest_repeat),
                },
                wgpu::BindGroupEntry {
                    binding: 13,
                    resource: wgpu::BindingResource::Sampler(&self.samplers.nearest_clamp),
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
