//! Planar reflection mirror and optical portal pipeline for Realm3D.

use std::collections::BTreeMap;

use galfus_realm_3d_resources::camera::Camera3DUniform;
use galfus_realm_3d_resources::frustum::Frustum;
use galfus_realm_3d_resources::geometry::Geometry3D;
use galfus_realm_3d_resources::material::Material3D;
use galfus_realm_3d_resources::transform::Transform3D;
use glam::{Mat4, Quat, Vec3};

use crate::collector::DrawCollector;
use crate::types::{GpuMeshBuffers, GpuModelEntry};

/// GPU pipeline managing offscreen render-to-texture passes for mirrors and portals.
pub struct PortalPipeline3D {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub depth_texture: wgpu::Texture,
    pub depth_view: wgpu::TextureView,
    pub sampler: wgpu::Sampler,
    pub bind_group: wgpu::BindGroup,
    pub virtual_camera_buf: wgpu::Buffer,
    pub width: u32,
    pub height: u32,
    pub target_format: wgpu::TextureFormat,
}

/// Parameters describing the scene context and attachments for an offscreen portal/mirror pass.
pub struct PortalPassDesc<'a> {
    pub encoder: &'a mut wgpu::CommandEncoder,
    pub pipeline: &'a crate::pipeline::Pipeline3D,
    pub virtual_scene_bg: &'a wgpu::BindGroup,
    pub sky_pipe: Option<&'a crate::skybox::SkyboxPipeline3D>,
    pub sky_mode: galfus_realm_3d_resources::environment::SkyboxMode3D,
    pub particles: Option<(&'a crate::particle::ParticleRenderer3D, u32, u32)>,
}

impl PortalPipeline3D {
    /// Creates a new `PortalPipeline3D` initialized with the given dimensions.
    pub fn new(
        device: &wgpu::Device,
        target_format: wgpu::TextureFormat,
        layout: &wgpu::BindGroupLayout,
        width: u32,
        height: u32,
    ) -> Self {
        let w = width.max(1);
        let h = height.max(1);

        let (texture, view) = Self::create_color_texture(device, target_format, w, h);
        let (depth_texture, depth_view) = Self::create_depth_texture(device, w, h);

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Portal Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Portal Reflection BindGroup"),
            layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });

        let virtual_camera_buf = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Portal Virtual Camera Buffer"),
            size: std::mem::size_of::<Camera3DUniform>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Self {
            texture,
            view,
            depth_texture,
            depth_view,
            sampler,
            bind_group,
            virtual_camera_buf,
            width: w,
            height: h,
            target_format,
        }
    }

    /// Resizes the offscreen portal render textures if viewport size changed.
    pub fn resize(
        &mut self,
        device: &wgpu::Device,
        layout: &wgpu::BindGroupLayout,
        target_format: wgpu::TextureFormat,
        width: u32,
        height: u32,
    ) {
        let w = width.max(1);
        let h = height.max(1);
        if self.width == w && self.height == h && self.target_format == target_format {
            return;
        }

        self.width = w;
        self.height = h;
        self.target_format = target_format;

        let (texture, view) = Self::create_color_texture(device, target_format, w, h);
        let (depth_texture, depth_view) = Self::create_depth_texture(device, w, h);

        self.texture = texture;
        self.view = view;
        self.depth_texture = depth_texture;
        self.depth_view = depth_view;

        self.bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Portal Reflection BindGroup"),
            layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&self.view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
            ],
        });
    }

    fn create_color_texture(
        device: &wgpu::Device,
        format: wgpu::TextureFormat,
        width: u32,
        height: u32,
    ) -> (wgpu::Texture, wgpu::TextureView) {
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Portal Render Texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        (texture, view)
    }

    fn create_depth_texture(
        device: &wgpu::Device,
        width: u32,
        height: u32,
    ) -> (wgpu::Texture, wgpu::TextureView) {
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Portal Depth Texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        (texture, view)
    }

    /// Returns the active bind group for @group(3) containing the rendered reflection.
    pub fn bind_group(&self) -> &wgpu::BindGroup {
        &self.bind_group
    }

    /// Renders the scene from the virtual camera perspective into the offscreen portal texture.
    pub fn render_portal_pass<'a>(
        &self,
        desc: PortalPassDesc<'a>,
        items: impl IntoIterator<Item = (&'a crate::collector::CollectedDrawItem<'a>, bool)>,
    ) {
        let mut pass = desc.encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("Realm3D Portal Pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &self.view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                    store: wgpu::StoreOp::Store,
                },
                depth_slice: None,
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &self.depth_view,
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

        if desc.sky_mode != galfus_realm_3d_resources::environment::SkyboxMode3D::None
            && let Some(sky) = desc.sky_pipe
        {
            pass.set_pipeline(&sky.pipeline);
            pass.set_bind_group(0, &sky.bind_group, &[]);
            pass.draw(0..3, 0..1);
        }

        pass.set_bind_group(0, desc.virtual_scene_bg, &[]);
        crate::collector::render_draw_items(
            &mut pass,
            desc.pipeline,
            items,
            &desc.pipeline.dummy_refraction_bg,
        );

        if let Some((particle_renderer, alpha_count, additive_count)) = desc.particles {
            pass.set_bind_group(0, desc.virtual_scene_bg, &[]);
            particle_renderer.render(&mut pass, 0..alpha_count, 0..additive_count);
        }
    }

    /// Computes the virtual camera reflection across a planar mirror surface.
    pub fn compute_mirror_camera(
        camera: &Camera3DUniform,
        mirror_transform: &Transform3D,
        is_horizontal: bool,
    ) -> Camera3DUniform {
        let normal = if is_horizontal {
            mirror_transform.rotation * Vec3::Y
        } else {
            mirror_transform.rotation * Vec3::Z
        };
        let mirror_pos = mirror_transform.position;
        let cam_pos = camera.position.truncate();
        let f_cam = camera.direction.truncate();
        let u_cam = camera.up.truncate();

        let dist = normal.dot(cam_pos - mirror_pos);
        let refl_pos = cam_pos - 2.0 * dist * normal;
        let refl_forward = f_cam - 2.0 * normal.dot(f_cam) * normal;
        let refl_up = u_cam - 2.0 * normal.dot(u_cam) * normal;

        let refl_view = Mat4::look_to_rh(refl_pos, refl_forward, refl_up);
        let refl_vp = camera.projection * refl_view;

        Camera3DUniform {
            view: refl_view,
            projection: camera.projection,
            view_projection: refl_vp,
            position: refl_pos.extend(1.0),
            direction: refl_forward.extend(0.0),
            up: refl_up.extend(0.0),
            near_far: camera.near_far,
            _padding: [0.0; 2],
        }
    }

    /// Computes the virtual camera position and orientation looking out of a destination portal.
    pub fn compute_portal_camera(
        camera: &Camera3DUniform,
        entrance: &Transform3D,
        exit: &Transform3D,
    ) -> Camera3DUniform {
        let cam_pos = camera.position.truncate();
        let f_cam = camera.direction.truncate();
        let u_cam = camera.up.truncate();

        let q_in_inv = entrance.rotation.inverse();
        let p_rel = q_in_inv * (cam_pos - entrance.position);
        let f_rel = q_in_inv * f_cam;
        let u_rel = q_in_inv * u_cam;

        let rot_y_180 = Quat::from_rotation_y(std::f32::consts::PI);
        let p_portal = exit.position + exit.rotation * (rot_y_180 * p_rel);
        let f_portal = exit.rotation * (rot_y_180 * f_rel);
        let u_portal = exit.rotation * (rot_y_180 * u_rel);

        let portal_view = Mat4::look_to_rh(p_portal, f_portal, u_portal);
        let portal_vp = camera.projection * portal_view;

        Camera3DUniform {
            view: portal_view,
            projection: camera.projection,
            view_projection: portal_vp,
            position: p_portal.extend(1.0),
            direction: f_portal.extend(0.0),
            up: u_portal.extend(0.0),
            near_far: camera.near_far,
            _padding: [0.0; 2],
        }
    }

    /// Collects and culls objects for the virtual camera pass, filtering out the mirror surface itself
    /// and any objects behind the mirror plane for planar reflections.
    pub fn collect_virtual_items<'a>(
        models: &'a BTreeMap<u32, GpuModelEntry>,
        geometries: &'a BTreeMap<u32, (Geometry3D, Option<GpuMeshBuffers>)>,
        materials: &'a BTreeMap<u32, (Material3D, Option<wgpu::Buffer>, Option<wgpu::BindGroup>)>,
        v_cam: &Camera3DUniform,
        mirror_model_id: u32,
        mirror_pos: Vec3,
        mirror_normal: Option<Vec3>,
    ) -> DrawCollector<'a> {
        let v_frustum = Frustum::from_view_projection(v_cam.view_projection);
        let mut collector = DrawCollector::collect(
            models,
            geometries,
            materials,
            Some(&v_frustum),
            v_cam.position.truncate(),
        );

        // Never draw the mirror or portal surface itself inside its own offscreen render pass
        collector.opaque.retain(|i| i.model_id != mirror_model_id);
        collector.masked.retain(|i| i.model_id != mirror_model_id);

        // For planar reflections: cull any models situated on or behind the mirror plane
        if let Some(normal) = mirror_normal {
            let threshold = 0.15;
            collector.opaque.retain(|i| {
                models
                    .get(&i.model_id)
                    .map(|m| normal.dot(m.1.position - mirror_pos) > threshold)
                    .unwrap_or(true)
            });
            collector.masked.retain(|i| {
                models
                    .get(&i.model_id)
                    .map(|m| normal.dot(m.1.position - mirror_pos) > threshold)
                    .unwrap_or(true)
            });
        }

        collector
    }
}
