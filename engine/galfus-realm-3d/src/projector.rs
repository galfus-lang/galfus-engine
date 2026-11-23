//! GPU resources for Forward PBR decals and occluded texture projectors.

use std::collections::BTreeMap;

use galfus_realm_3d_resources::material::Material3D;
use galfus_realm_3d_resources::projector::{Projector3D, Projector3DUniform};
use galfus_realm_3d_resources::transform::Transform3D;
use glam::Mat4;
use wgpu::util::DeviceExt;

use crate::shadow::ShadowPipeline3D;
use crate::types::{GpuInstancedModelEntry, GpuMeshBuffers, GpuModelEntry};

/// Maximum distinct projector/decal textures stored in the shared texture array.
pub const MAX_PROJECTOR_TEXTURES: u32 = 16;
/// Resolution of each layer in the shared projector texture array.
pub const PROJECTOR_TEXTURE_SIZE: u32 = 512;
/// Maximum simultaneous projectors casting occlusion depth maps.
pub const MAX_OCCLUDED_PROJECTORS: u32 = 8;
/// Resolution of each projector occlusion depth map.
pub const PROJECTOR_DEPTH_SIZE: u32 = 512;

const BLIT_SHADER: &str = r#"
@group(0) @binding(0) var src_tex: texture_2d<f32>;
@group(0) @binding(1) var src_sampler: sampler;

struct VsOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VsOut {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(3.0, 1.0),
        vec2<f32>(-1.0, 1.0),
    );
    var uvs = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 2.0),
        vec2<f32>(2.0, 0.0),
        vec2<f32>(0.0, 0.0),
    );
    var out: VsOut;
    out.pos = vec4<f32>(positions[idx], 0.0, 1.0);
    out.uv = uvs[idx];
    return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    return textureSample(src_tex, src_sampler, in.uv);
}
"#;

/// Pending depth-pass job for an active projector with occlusion enabled.
#[derive(Debug, Clone, Copy)]
pub struct OccludedProjectorJob {
    pub layer_idx: u32,
    pub occlusion_mask: u32,
    pub view_proj: Mat4,
}

/// GPU texture array, occlusion depth array, and blit pipeline for 3D projectors/decals.
pub struct ProjectorGpuResources3D {
    pub color_texture: wgpu::Texture,
    pub color_array_view: wgpu::TextureView,
    pub color_layer_views: Vec<wgpu::TextureView>,
    pub depth_texture: wgpu::Texture,
    pub depth_array_view: wgpu::TextureView,
    pub depth_layer_views: Vec<wgpu::TextureView>,
    pub vp_buffers: Vec<wgpu::Buffer>,
    pub vp_bind_groups: Vec<wgpu::BindGroup>,
    blit_pipeline: wgpu::RenderPipeline,
    blit_layout: wgpu::BindGroupLayout,
    blit_sampler: wgpu::Sampler,
    allocated_full: bool,
    allocated_depth: bool,
    pub occlusion_jobs: Vec<OccludedProjectorJob>,
}

impl ProjectorGpuResources3D {
    pub fn new(
        device: &wgpu::Device,
        shadow_pipe: &ShadowPipeline3D,
        bones_buf: &wgpu::Buffer,
    ) -> Self {
        let (color_texture, color_array_view, color_layer_views) = create_color_array(device, 1, 1);
        let (depth_texture, depth_array_view, depth_layer_views) = create_depth_array(device, 1, 1);

        let blit_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Realm3D Projector Blit Layout"),
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
        let blit_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Realm3D Projector Blit Shader"),
            source: wgpu::ShaderSource::Wgsl(BLIT_SHADER.into()),
        });
        let blit_pipe_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Realm3D Projector Blit Pipe Layout"),
            bind_group_layouts: &[&blit_layout],
            immediate_size: 0,
        });
        let blit_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Realm3D Projector Blit Pipeline"),
            layout: Some(&blit_pipe_layout),
            vertex: wgpu::VertexState {
                module: &blit_shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &blit_shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8UnormSrgb,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });
        let blit_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Realm3D Projector Blit Sampler"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let (vp_buffers, vp_bind_groups) = create_vp_resources(device, shadow_pipe, bones_buf);

        Self {
            color_texture,
            color_array_view,
            color_layer_views,
            depth_texture,
            depth_array_view,
            depth_layer_views,
            vp_buffers,
            vp_bind_groups,
            blit_pipeline,
            blit_layout,
            blit_sampler,
            allocated_full: false,
            allocated_depth: false,
            occlusion_jobs: Vec::new(),
        }
    }

    pub fn update_bones(
        &mut self,
        device: &wgpu::Device,
        shadow_pipe: &ShadowPipeline3D,
        bones_buf: &wgpu::Buffer,
    ) {
        self.vp_bind_groups = self
            .vp_buffers
            .iter()
            .enumerate()
            .map(|(i, buf)| {
                device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some(&format!("Realm3D Projector Depth VP BG {i}")),
                    layout: &shadow_pipe.vp_layout,
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
                })
            })
            .collect();
    }

    /// Synchronizes active projectors, allocating full arrays lazily and blitting textures.
    /// Returns `(uniforms, bindings_changed)`.
    pub fn sync<'tex>(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        projectors: &BTreeMap<u32, (Projector3D, Transform3D)>,
        textures: &dyn Fn(u32) -> Option<&'tex wgpu::TextureView>,
    ) -> (Vec<Projector3DUniform>, bool) {
        let mut bindings_changed = false;
        self.occlusion_jobs.clear();

        let has_any_texture = projectors
            .values()
            .any(|(p, _)| p.active && p.texture_id.and_then(textures).is_some());
        if has_any_texture && !self.allocated_full {
            let (tex, view, layers) =
                create_color_array(device, PROJECTOR_TEXTURE_SIZE, MAX_PROJECTOR_TEXTURES);
            self.color_texture = tex;
            self.color_array_view = view;
            self.color_layer_views = layers;
            self.allocated_full = true;
            bindings_changed = true;
        }

        let has_any_occlusion = projectors
            .values()
            .any(|(p, _)| p.active && p.cast_occlusion);
        if has_any_occlusion && !self.allocated_depth {
            let (tex, view, layers) =
                create_depth_array(device, PROJECTOR_DEPTH_SIZE, MAX_OCCLUDED_PROJECTORS);
            self.depth_texture = tex;
            self.depth_array_view = view;
            self.depth_layer_views = layers;
            self.allocated_depth = true;
            bindings_changed = true;
        }

        let mut tex_id_to_layer: Vec<(u32, u32)> = Vec::new();
        let mut uniforms = Vec::new();
        let mut occ_counter = 0u32;

        for (proj, tf) in projectors.values() {
            if !proj.active {
                continue;
            }
            let texture_layer = if let Some(tid) = proj.texture_id
                && textures(tid).is_some()
            {
                if let Some(&(_, existing)) = tex_id_to_layer.iter().find(|(id, _)| *id == tid) {
                    existing
                } else if (tex_id_to_layer.len() as u32) < MAX_PROJECTOR_TEXTURES {
                    let layer = tex_id_to_layer.len() as u32;
                    tex_id_to_layer.push((tid, layer));
                    layer
                } else {
                    u32::MAX
                }
            } else {
                u32::MAX
            };

            let occlusion_layer = if proj.cast_occlusion && occ_counter < MAX_OCCLUDED_PROJECTORS {
                let layer = occ_counter;
                occ_counter += 1;
                let vp = proj.build_view_projection(tf);
                self.occlusion_jobs.push(OccludedProjectorJob {
                    layer_idx: layer,
                    occlusion_mask: proj.occlusion_mask,
                    view_proj: vp,
                });
                layer
            } else {
                u32::MAX
            };

            uniforms.push(proj.build_uniform(tf, texture_layer, occlusion_layer));
        }

        // Blit active projector textures into the array
        if !tex_id_to_layer.is_empty() && self.allocated_full {
            let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Realm3D Projector Texture Blit Encoder"),
            });
            for &(tid, layer) in &tex_id_to_layer {
                let Some(src_view) = textures(tid) else {
                    continue;
                };
                let bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("Realm3D Projector Blit BG"),
                    layout: &self.blit_layout,
                    entries: &[
                        wgpu::BindGroupEntry {
                            binding: 0,
                            resource: wgpu::BindingResource::TextureView(src_view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 1,
                            resource: wgpu::BindingResource::Sampler(&self.blit_sampler),
                        },
                    ],
                });
                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("Realm3D Projector Blit Pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &self.color_layer_views[layer as usize],
                        resolve_target: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                            store: wgpu::StoreOp::Store,
                        },
                        depth_slice: None,
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });
                pass.set_pipeline(&self.blit_pipeline);
                pass.set_bind_group(0, &bg, &[]);
                pass.draw(0..3, 0..1);
            }
            queue.submit(Some(encoder.finish()));
        }

        (uniforms, bindings_changed)
    }

    /// Executes depth passes for all active projectors with occlusion enabled.
    #[allow(clippy::too_many_arguments)]
    pub fn render_occlusion_passes(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        queue: &wgpu::Queue,
        shadow_pipe: &ShadowPipeline3D,
        models: &BTreeMap<u32, GpuModelEntry>,
        instanced_models: &BTreeMap<u32, GpuInstancedModelEntry>,
        materials: &BTreeMap<u32, (Material3D, Option<wgpu::Buffer>, Option<wgpu::BindGroup>)>,
        geometries: &BTreeMap<
            u32,
            (
                galfus_realm_3d_resources::geometry::Geometry3D,
                Option<GpuMeshBuffers>,
            ),
        >,
        time: f32,
    ) {
        if self.occlusion_jobs.is_empty() || !self.allocated_depth {
            return;
        }
        for job in &self.occlusion_jobs {
            let idx = job.layer_idx as usize;
            let mut uniform = [0.0f32; 20];
            uniform[..16].copy_from_slice(&job.view_proj.to_cols_array());
            uniform[16] = time;
            queue.write_buffer(&self.vp_buffers[idx], 0, bytemuck::cast_slice(&uniform));

            crate::shadow::render_depth_layer_target(
                encoder,
                shadow_pipe,
                &self.depth_layer_views[idx],
                &self.vp_bind_groups[idx],
                job.occlusion_mask,
                &job.view_proj,
                models,
                instanced_models,
                materials,
                geometries,
            );
        }
    }
}

fn create_color_array(
    device: &wgpu::Device,
    size: u32,
    layers: u32,
) -> (wgpu::Texture, wgpu::TextureView, Vec<wgpu::TextureView>) {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("Realm3D Projector Color Array"),
        size: wgpu::Extent3d {
            width: size,
            height: size,
            depth_or_array_layers: layers,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let array_view = texture.create_view(&wgpu::TextureViewDescriptor {
        dimension: Some(wgpu::TextureViewDimension::D2Array),
        ..Default::default()
    });
    let layer_views = (0..layers)
        .map(|i| {
            texture.create_view(&wgpu::TextureViewDescriptor {
                dimension: Some(wgpu::TextureViewDimension::D2),
                base_array_layer: i,
                array_layer_count: Some(1),
                ..Default::default()
            })
        })
        .collect();
    (texture, array_view, layer_views)
}

fn create_depth_array(
    device: &wgpu::Device,
    size: u32,
    layers: u32,
) -> (wgpu::Texture, wgpu::TextureView, Vec<wgpu::TextureView>) {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("Realm3D Projector Occlusion Depth Array"),
        size: wgpu::Extent3d {
            width: size,
            height: size,
            depth_or_array_layers: layers,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Depth32Float,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let array_view = texture.create_view(&wgpu::TextureViewDescriptor {
        dimension: Some(wgpu::TextureViewDimension::D2Array),
        ..Default::default()
    });
    let layer_views = (0..layers)
        .map(|i| {
            texture.create_view(&wgpu::TextureViewDescriptor {
                dimension: Some(wgpu::TextureViewDimension::D2),
                base_array_layer: i,
                array_layer_count: Some(1),
                ..Default::default()
            })
        })
        .collect();
    (texture, array_view, layer_views)
}

fn create_vp_resources(
    device: &wgpu::Device,
    shadow_pipe: &ShadowPipeline3D,
    bones_buf: &wgpu::Buffer,
) -> (Vec<wgpu::Buffer>, Vec<wgpu::BindGroup>) {
    let mut buffers = Vec::with_capacity(MAX_OCCLUDED_PROJECTORS as usize);
    let mut bind_groups = Vec::with_capacity(MAX_OCCLUDED_PROJECTORS as usize);
    for i in 0..MAX_OCCLUDED_PROJECTORS {
        let buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some(&format!("Realm3D Projector Depth VP Buffer {i}")),
            contents: bytemuck::cast_slice(&[0.0f32; 20]),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some(&format!("Realm3D Projector Depth VP BG {i}")),
            layout: &shadow_pipe.vp_layout,
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
        buffers.push(buf);
        bind_groups.push(bg);
    }
    (buffers, bind_groups)
}

/// Returns the 3 `@group(0)` bind group layout entries for projectors (bindings 8..=10).
pub fn scene_layout_entries() -> [wgpu::BindGroupLayoutEntry; 3] {
    [
        wgpu::BindGroupLayoutEntry {
            binding: 8,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Storage { read_only: true },
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        },
        wgpu::BindGroupLayoutEntry {
            binding: 9,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2Array,
                multisampled: false,
            },
            count: None,
        },
        wgpu::BindGroupLayoutEntry {
            binding: 10,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Depth,
                view_dimension: wgpu::TextureViewDimension::D2Array,
                multisampled: false,
            },
            count: None,
        },
    ]
}

impl crate::context::Realm3DContext {
    /// Registers or replaces a 3D decal or texture projector.
    pub fn create_projector(
        &mut self,
        id: u32,
        projector: Projector3D,
        transform: Transform3D,
    ) -> galfus_realm_core::error::RealmResult<()> {
        crate::types::validate_id(id)?;
        self.projectors.insert(id, (projector, transform));
        self.projectors_dirty = true;
        self.dirty = true;
        Ok(())
    }

    /// Updates the world transform of an existing 3D projector.
    pub fn set_projector_transform(
        &mut self,
        id: u32,
        transform: Transform3D,
    ) -> galfus_realm_core::error::RealmResult<()> {
        crate::types::validate_id(id)?;
        let Some(entry) = self.projectors.get_mut(&id) else {
            return Err(crate::context::not_found(self.id, "Projector", id));
        };
        entry.1 = transform;
        self.projectors_dirty = true;
        self.dirty = true;
        Ok(())
    }

    /// Removes an existing 3D projector.
    pub fn destroy_projector(&mut self, id: u32) -> galfus_realm_core::error::RealmResult<()> {
        crate::types::validate_id(id)?;
        self.projectors
            .remove(&id)
            .map(|_| {
                self.projectors_dirty = true;
                self.dirty = true;
            })
            .ok_or_else(|| crate::context::not_found(self.id, "Projector", id))
    }
}
