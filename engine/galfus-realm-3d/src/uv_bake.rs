//! GPU UV-space decal baking pipeline (tattoos, scars, body paint, permanent surface stamps).

use std::collections::HashMap;

use galfus_realm_3d_resources::geometry::{PrimitiveTopology3D, Vertex3D};
use galfus_realm_3d_resources::projector::ProjectorBlendMode3D;
use galfus_realm_3d_resources::transform::Transform3D;
use galfus_realm_3d_resources::uv_decal::{UvDecalBake3D, UvDecalBake3DUniform};
use galfus_realm_core::error::{RealmError, RealmResult};
use wgpu::util::DeviceExt;

use crate::context::{Realm3DContext, not_found};
use crate::pipeline::{Pipeline3D, to_wgpu_topology};
use crate::types::validate_id;

const UV_BAKE_SHADER: &str = include_str!("uv_bake.wgsl");

/// Cached UV-space decal baking render pipelines keyed by target format, blend mode, and topology.
pub struct UvBakePipeline3D {
    shader: wgpu::ShaderModule,
    bake_layout: wgpu::BindGroupLayout,
    pipeline_layout: wgpu::PipelineLayout,
    pipelines: HashMap<
        (
            wgpu::TextureFormat,
            ProjectorBlendMode3D,
            PrimitiveTopology3D,
        ),
        wgpu::RenderPipeline,
    >,
}

fn blend_state_for_mode(mode: ProjectorBlendMode3D) -> wgpu::BlendState {
    match mode {
        ProjectorBlendMode3D::Alpha => wgpu::BlendState::ALPHA_BLENDING,
        ProjectorBlendMode3D::Multiply => wgpu::BlendState {
            color: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::Dst,
                dst_factor: wgpu::BlendFactor::Zero,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::Zero,
                dst_factor: wgpu::BlendFactor::One,
                operation: wgpu::BlendOperation::Add,
            },
        },
        ProjectorBlendMode3D::Additive => wgpu::BlendState {
            color: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::SrcAlpha,
                dst_factor: wgpu::BlendFactor::One,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::Zero,
                dst_factor: wgpu::BlendFactor::One,
                operation: wgpu::BlendOperation::Add,
            },
        },
    }
}

impl UvBakePipeline3D {
    pub fn new(device: &wgpu::Device, model_layout: &wgpu::BindGroupLayout) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Realm3D UV Decal Bake Shader"),
            source: wgpu::ShaderSource::Wgsl(UV_BAKE_SHADER.into()),
        });
        let bake_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Realm3D UV Decal Bake Layout"),
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
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Realm3D UV Decal Bake Pipeline Layout"),
            bind_group_layouts: &[&bake_layout, model_layout],
            immediate_size: 0,
        });
        Self {
            shader,
            bake_layout,
            pipeline_layout,
            pipelines: HashMap::new(),
        }
    }

    fn get_or_create(
        &mut self,
        device: &wgpu::Device,
        format: wgpu::TextureFormat,
        blend_mode: ProjectorBlendMode3D,
        topology: PrimitiveTopology3D,
    ) -> &wgpu::RenderPipeline {
        let key = (format, blend_mode, topology);
        self.pipelines.entry(key).or_insert_with(|| {
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("Realm3D UV Decal Bake Pipeline"),
                layout: Some(&self.pipeline_layout),
                vertex: wgpu::VertexState {
                    module: &self.shader,
                    entry_point: Some("vs_uv_bake"),
                    buffers: &[wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<Vertex3D>() as wgpu::BufferAddress,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &wgpu::vertex_attr_array![
                            0 => Float32x3,
                            1 => Float32x3,
                            2 => Float32x2,
                            3 => Float32x2,
                            4 => Float32x4,
                            5 => Float32x4,
                            6 => Uint32x4,
                            7 => Float32x4,
                            8 => Uint32x4,
                            9 => Float32x4
                        ],
                    }],
                    compilation_options: Default::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: &self.shader,
                    entry_point: Some("fs_uv_bake"),
                    targets: &[Some(wgpu::ColorTargetState {
                        format,
                        blend: Some(blend_state_for_mode(blend_mode)),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                    compilation_options: Default::default(),
                }),
                primitive: wgpu::PrimitiveState {
                    topology: to_wgpu_topology(topology),
                    strip_index_format: topology.is_strip().then_some(wgpu::IndexFormat::Uint32),
                    front_face: wgpu::FrontFace::Ccw,
                    cull_mode: None,
                    ..Default::default()
                },
                depth_stencil: None,
                multisample: wgpu::MultisampleState::default(),
                multiview_mask: None,
                cache: None,
            })
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub fn execute_bake(
        &mut self,
        device: &wgpu::Device,
        encoder: &mut wgpu::CommandEncoder,
        pipeline: &Pipeline3D,
        bones_buf: &wgpu::Buffer,
        target_view: &wgpu::TextureView,
        decal_view: Option<&wgpu::TextureView>,
        bake: &UvDecalBake3D,
        transform: &Transform3D,
        vertex_buf: &wgpu::Buffer,
        index_buf: &wgpu::Buffer,
        index_count: u32,
        topology: PrimitiveTopology3D,
        model_bg: &wgpu::BindGroup,
    ) {
        if index_count == 0 || !topology.is_triangle() {
            return;
        }
        let target_format = target_view.texture().format();
        let uniform: UvDecalBake3DUniform =
            bake.build_uniform(transform, decal_view.is_some(), target_format.is_srgb());
        let uniform_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Realm3D UV Bake Uniform"),
            contents: bytemuck::bytes_of(&uniform),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let tex_view = decal_view.unwrap_or(&pipeline.fallback_white_view);
        let bake_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Realm3D UV Bake Bind Group"),
            layout: &self.bake_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buf.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: bones_buf.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(tex_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::Sampler(&pipeline.samplers.linear_clamp),
                },
            ],
        });

        let render_pipeline = self.get_or_create(device, target_format, bake.blend_mode, topology);
        let load = if bake.clear_target {
            wgpu::LoadOp::Clear(wgpu::Color {
                r: f64::from(bake.clear_color.x),
                g: f64::from(bake.clear_color.y),
                b: f64::from(bake.clear_color.z),
                a: f64::from(bake.clear_color.w),
            })
        } else {
            wgpu::LoadOp::Load
        };

        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("Realm3D UV Decal Bake Pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load,
                    store: wgpu::StoreOp::Store,
                },
                depth_slice: None,
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(render_pipeline);
        pass.set_bind_group(0, &bake_bg, &[]);
        pass.set_bind_group(1, model_bg, &[]);
        pass.set_vertex_buffer(0, vertex_buf.slice(..));
        pass.set_index_buffer(index_buf.slice(..), wgpu::IndexFormat::Uint32);
        pass.draw_indexed(0..index_count, 0, 0..1);
    }
}

impl Realm3DContext {
    /// Queues a one-shot UV-space decal bake onto `bake.target_texture_id`.
    ///
    /// Executed during the next `prepare` pass once model transforms, morphs, and skeletal
    /// bones are uploaded, so the stamped decal is immediately visible on the same frame and
    /// permanently baked into the texture for all subsequent frames (even as the mesh animates).
    pub fn bake_uv_decal(
        &mut self,
        bake: UvDecalBake3D,
        transform: Transform3D,
    ) -> RealmResult<()> {
        validate_id(bake.model_id)?;
        validate_id(bake.target_texture_id)?;
        if let Some(decal_tex_id) = bake.decal_texture_id {
            validate_id(decal_tex_id)?;
        }
        if !self.models.contains_key(&bake.model_id) {
            return Err(not_found(self.id, "Model3D", bake.model_id));
        }
        if !bake.size.x.is_finite() || !bake.size.y.is_finite() || !bake.size.z.is_finite() {
            return Err(RealmError::Internal(
                "UvDecalBake3D size must be finite".into(),
            ));
        }
        self.pending_uv_bakes.push((bake, transform));
        self.dirty = true;
        Ok(())
    }

    /// Executes all queued UV-space decal bakes against live GPU model/bone buffers.
    pub(crate) fn execute_pending_uv_bakes<'a>(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        textures: &'a (dyn Fn(u32) -> Option<&'a wgpu::TextureView> + 'a),
    ) {
        if self.pending_uv_bakes.is_empty() {
            return;
        }
        let (Some(pipeline), Some(scene)) = (self.pipeline.as_ref(), self.scene_buffers.as_ref())
        else {
            return;
        };
        let uv_bake = self
            .uv_bake_pipeline
            .get_or_insert_with(|| UvBakePipeline3D::new(device, &pipeline.model_layout));
        let jobs = std::mem::take(&mut self.pending_uv_bakes);
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Realm3D UV Decal Bake Encoder"),
        });
        let mut recorded = false;

        for (bake, transform) in jobs {
            let Some(target_view) = textures(bake.target_texture_id) else {
                continue;
            };
            let Some((model, _, _, _, _, Some(model_bg))) = self.models.get(&bake.model_id) else {
                continue;
            };
            let Some((geom, Some(gpu_mesh))) = self.geometries.get(&model.geometry_id) else {
                continue;
            };
            let decal_view = bake.decal_texture_id.and_then(textures);
            uv_bake.execute_bake(
                device,
                &mut encoder,
                pipeline,
                &scene._bones_buf,
                target_view,
                decal_view,
                &bake,
                &transform,
                &gpu_mesh.vertices,
                &gpu_mesh.indices,
                gpu_mesh.index_count,
                geom.topology,
                model_bg,
            );
            recorded = true;
        }

        if recorded {
            queue.submit(std::iter::once(encoder.finish()));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use galfus_realm_3d_resources::geometry::Geometry3D;
    use galfus_realm_3d_resources::material::Material3D;
    use galfus_realm_3d_resources::model::Model3D;
    use galfus_realm_core::realm::Realm;
    use galfus_realm_core::types::RealmPrepareContext;
    use glam::{Quat, Vec3, Vec4};

    fn readback_rgba8(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        tex: &wgpu::Texture,
        size: u32,
    ) -> Vec<u8> {
        let bytes_per_row = (size * 4).div_ceil(256) * 256;
        let read_buf = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("UV Bake Readback Buffer"),
            size: u64::from(bytes_per_row * size),
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        let mut enc = device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
        enc.copy_texture_to_buffer(
            tex.as_image_copy(),
            wgpu::TexelCopyBufferInfo {
                buffer: &read_buf,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(bytes_per_row),
                    rows_per_image: Some(size),
                },
            },
            wgpu::Extent3d {
                width: size,
                height: size,
                depth_or_array_layers: 1,
            },
        );
        queue.submit(std::iter::once(enc.finish()));
        let slice = read_buf.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |res| {
            let _ = tx.send(res);
        });
        let _ = device.poll(wgpu::PollType::wait_indefinitely());
        rx.recv().unwrap().unwrap();
        let data = slice.get_mapped_range();
        let mut pixels = Vec::with_capacity((size * size * 4) as usize);
        for y in 0..size {
            let start = (y * bytes_per_row) as usize;
            pixels.extend_from_slice(&data[start..start + (size * 4) as usize]);
        }
        drop(data);
        read_buf.unmap();
        pixels
    }

    #[test]
    fn uv_decal_bakes_front_and_rejects_backface() {
        let Ok(gpu) = galfus_gpu_manager::GpuManager::new_headless() else {
            return;
        };
        let device = gpu.device();
        let queue = gpu.queue();

        let size = 32u32;
        let target_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("UV Bake Target"),
            size: wgpu::Extent3d {
                width: size,
                height: size,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_DST
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let white = vec![255u8; (size * size * 4) as usize];
        queue.write_texture(
            target_tex.as_image_copy(),
            &white,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(size * 4),
                rows_per_image: Some(size),
            },
            wgpu::Extent3d {
                width: size,
                height: size,
                depth_or_array_layers: 1,
            },
        );
        let target_view = target_tex.create_view(&wgpu::TextureViewDescriptor::default());

        let mut realm = Realm3DContext::new(1);
        realm
            .create_geometry(1, Geometry3D::plane(2.0, 2.0))
            .unwrap();
        realm.create_material(1, Material3D::default()).unwrap();
        realm
            .create_model(1, Model3D::new(1, 1), Transform3D::default())
            .unwrap();

        // 1. Stamp red square (1x1) straight down (-Y) onto the center of the 2x2 plane (+Y normal).
        let red_bake = UvDecalBake3D {
            model_id: 1,
            target_texture_id: 10,
            color: Vec4::new(1.0, 0.0, 0.0, 1.0),
            size: Vec3::new(1.0, 1.0, 4.0),
            ..Default::default()
        };
        let down_tf = Transform3D {
            position: Vec3::new(0.0, 1.0, 0.0),
            rotation: Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2),
            scale: Vec3::ONE,
        };
        realm.bake_uv_decal(red_bake, down_tf).unwrap();

        // 2. Attempt blue stamp from below (+Y direction, same as normal) — must be rejected!
        let blue_back = UvDecalBake3D {
            model_id: 1,
            target_texture_id: 10,
            color: Vec4::new(0.0, 0.0, 1.0, 1.0),
            size: Vec3::new(1.0, 1.0, 4.0),
            ..Default::default()
        };
        let up_tf = Transform3D {
            position: Vec3::new(0.0, -1.0, 0.0),
            rotation: Quat::from_rotation_x(std::f32::consts::FRAC_PI_2),
            scale: Vec3::ONE,
        };
        realm.bake_uv_decal(blue_back, up_tf).unwrap();

        let tex_lookup = |id: u32| (id == 10).then_some(&target_view);
        realm
            .prepare(&RealmPrepareContext {
                frame_id: 1,
                delta_time: 0.016,
                device,
                queue,
                textures: &tex_lookup,
            })
            .unwrap();

        let pixels = readback_rgba8(device, queue, &target_tex, size);
        let px = |x: u32, y: u32| -> [u8; 4] {
            let i = ((y * size + x) * 4) as usize;
            [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]
        };
        let center = px(16, 16);
        let corner = px(1, 1);
        assert!(
            center[0] > 240 && center[1] < 15 && center[2] < 15,
            "center={center:?}"
        );
        assert!(
            corner[0] > 240 && corner[1] > 240 && corner[2] > 240,
            "corner={corner:?}"
        );
    }
}
