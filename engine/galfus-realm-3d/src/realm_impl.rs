use galfus_realm_3d_resources::frustum::Frustum;
use galfus_realm_core::error::RealmResult;
use galfus_realm_core::realm::Realm;
use galfus_realm_core::types::{RealmInvocationContext, RealmKind, RealmPrepareContext};
use glam::UVec2;

use crate::collector::{DrawCollector, render_draw_items};
use crate::context::Realm3DContext;
use crate::pipeline::Pipeline3D;
use crate::shadow::ShadowPipeline3D;

impl Realm for Realm3DContext {
    fn id(&self) -> u32 {
        self.id
    }

    fn kind(&self) -> RealmKind {
        RealmKind::ThreeD
    }

    fn clear(&mut self) -> RealmResult<()> {
        self.cameras.clear();
        self.materials.clear();
        self.geometries.clear();
        self.models.clear();
        self.lights.clear();
        self.emitters.clear();
        self.portals.clear();
        self.model_bones.clear();
        self.bones.clear();
        self.gizmos.clear();
        self.dirty = true;
        Ok(())
    }

    fn destroy(&mut self) -> RealmResult<()> {
        self.clear()?;
        self.pipeline = None;
        self.shadow_pipeline = None;
        self.shadow_map = None;
        self.skybox_pipeline = None;
        self.post_pipelines = crate::postprocess::PostProcessPipelines::new();
        self.light_cull_pipeline = None;
        self.particle_renderer = None;
        self.refraction_pipeline = None;
        self.portal_pipeline = None;
        self.scene_buffers = None;
        self.depth_texture = None;
        Ok(())
    }

    fn prepare(&mut self, ctx: &RealmPrepareContext<'_>) -> RealmResult<()> {
        let device = ctx.device;
        let queue = ctx.queue;
        self.total_time += ctx.delta_time;

        for (emitter, transform, state) in self.emitters.values_mut() {
            state.update(
                emitter,
                ctx.delta_time,
                transform.position,
                transform.rotation,
            );
        }

        self.rebuild_bones();

        if self.pipeline.is_none() {
            self.pipeline = Some(Pipeline3D::new(
                device,
                queue,
                wgpu::TextureFormat::Rgba8Unorm,
            ));
        }
        let pipeline = self.pipeline.as_mut().unwrap();

        // 1-3. Sync Geometries, Materials, and Models
        crate::types::sync_realm_resources(
            device,
            pipeline,
            ctx.textures,
            &mut self.geometries,
            &mut self.materials,
            &mut self.models,
            &mut self.instanced_models,
        );

        // 4. Sync Scene Buffers (Environment, Lights, Shadows)
        let shadow_pipe = self
            .shadow_pipeline
            .get_or_insert_with(|| ShadowPipeline3D::new(device, &pipeline.model_layout));

        crate::types::sync_scene_buffers(
            device,
            queue,
            pipeline,
            shadow_pipe,
            &mut self.shadow_map,
            &mut self.scene_buffers,
            &self.environment,
            &self.lights,
            &self.bones,
            &mut self.dirty,
        );

        Ok(())
    }

    fn render(&mut self, ctx: &RealmInvocationContext<'_>) -> RealmResult<()> {
        let device = ctx.device;
        let queue = ctx.queue;

        // Resolve camera
        let Some((camera, camera_transform)) = ctx
            .camera_slot
            .and_then(|s| {
                self.cameras
                    .values()
                    .find(|(c, _)| c.camera_slot == s)
                    .or_else(|| self.cameras.get(&s))
            })
            .or_else(|| self.cameras.values().next())
        else {
            return Ok(());
        };

        let width = ctx.viewport.z.max(1);
        let height = ctx.viewport.w.max(1);
        let size = UVec2::new(width, height);
        let aspect = width as f32 / height as f32;

        let mut camera_uniform = camera.build_uniform(camera_transform, aspect);
        if let Some(jitter) = ctx.subpixel_jitter {
            camera_uniform.projection.w_axis.x += jitter.x;
            camera_uniform.projection.w_axis.y += jitter.y;
            camera_uniform.view_projection = camera_uniform.projection * camera_uniform.view;
        }
        let scene_buffers = match &self.scene_buffers {
            Some(sb) => sb,
            None => return Ok(()),
        };
        queue.write_buffer(
            &scene_buffers.camera_buf,
            0,
            bytemuck::bytes_of(&camera_uniform),
        );
        let env_uniform = self.environment.build_uniform(self.total_time);
        queue.write_buffer(&scene_buffers.env_buf, 0, bytemuck::bytes_of(&env_uniform));

        // Ensure Reverse-Z depth texture matches invocation viewport size
        let depth_view =
            crate::types::ensure_depth_texture(device, &mut self.depth_texture, width, height);

        // Initialize and update Skybox if configured
        let sky_pipe = self
            .skybox_pipeline
            .get_or_insert_with(|| crate::skybox::SkyboxPipeline3D::new(device, ctx.target_format));
        sky_pipe.update(
            queue,
            &camera_uniform.view_projection,
            camera_uniform.position,
            &self.environment.skybox,
        );

        let pipeline = match &self.pipeline {
            Some(p) => p,
            None => return Ok(()),
        };

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Realm3D Render Encoder"),
        });

        let cam_frustum = Frustum::from_view_projection(camera_uniform.view_projection);

        // Optional parallel GPU light culling against camera frustum
        if !self.lights.is_empty() {
            let cull_pipe = self
                .light_cull_pipeline
                .get_or_insert_with(|| crate::light_cull::LightCullingPipeline3D::new(device, 256));
            cull_pipe.dispatch(
                device,
                queue,
                &mut encoder,
                &scene_buffers.lights_buf,
                self.lights.len() as u32,
                &cam_frustum.planes,
            );
        }

        let collector = DrawCollector::collect(
            &self.models,
            &self.instanced_models,
            &self.geometries,
            &self.materials,
            Some(&cam_frustum),
            camera_transform.position,
        );

        // Shadow Depth Pass for each shadow-casting light (Directional & Spot, Reverse-Z)
        if let (Some(shadow_pipe), Some(shadow_map)) = (&self.shadow_pipeline, &self.shadow_map) {
            crate::shadow::render_shadow_depth_pass(
                &mut encoder,
                queue,
                shadow_pipe,
                shadow_map,
                &self.lights,
                &self.models,
                &self.instanced_models,
                &self.geometries,
                self.total_time,
            );
        }

        let (mut alpha_instances, mut additive_instances) =
            crate::particle::collect_emitter_instances(&self.emitters, &self.materials);

        let alpha_count = alpha_instances.len() as u32;
        let additive_count = additive_instances.len() as u32;

        let has_refr = !collector.refractive.is_empty();
        let (behind_alpha, behind_additive) = if has_refr && (alpha_count > 0 || additive_count > 0)
        {
            let min_refr = collector
                .refractive
                .iter()
                .map(|i| i.depth)
                .fold(f32::INFINITY, f32::min);
            let threshold = (min_refr.sqrt() - 0.6).max(0.0).powi(2);
            let cam_pos = camera_transform.position;
            (
                crate::particle::partition_by_depth(&mut alpha_instances, cam_pos, threshold),
                crate::particle::partition_by_depth(&mut additive_instances, cam_pos, threshold),
            )
        } else {
            (0, 0)
        };

        if alpha_count > 0 || additive_count > 0 {
            let particle_renderer = self.particle_renderer.get_or_insert_with(|| {
                crate::particle::ParticleRenderer3D::new(
                    device,
                    ctx.target_format,
                    &pipeline.scene_layout,
                )
            });
            particle_renderer.upload(device, queue, &alpha_instances, &additive_instances);
        }

        // 0. Render offscreen mirror / optical portal pass if mirrors exist
        let has_mirrors = !collector.mirrors.is_empty();
        if has_mirrors {
            let portal_pipe = self.portal_pipeline.get_or_insert_with(|| {
                crate::portal::PortalPipeline3D::new(
                    device,
                    ctx.target_format,
                    &pipeline.refraction_layout,
                    width,
                    height,
                )
            });
            portal_pipe.resize(
                device,
                &pipeline.refraction_layout,
                ctx.target_format,
                width,
                height,
            );

            let primary_item = collector.mirrors[0];
            let primary_portal = self
                .portals
                .values()
                .find(|p| p.model_id == primary_item.model_id && p.active);
            let mirror_transform = self
                .models
                .get(&primary_item.model_id)
                .map(|m| m.1)
                .unwrap_or_default();
            let is_horizontal = self
                .geometries
                .get(&primary_item.geometry_id)
                .and_then(|g| g.0.label.as_deref())
                .map(|l| l == "Plane3D")
                .unwrap_or(false);

            let is_portal = primary_portal
                .and_then(|p| p.exit_transform.as_ref())
                .is_some();
            let mirror_normal = if is_portal {
                None
            } else if is_horizontal {
                Some(mirror_transform.rotation * glam::Vec3::Y)
            } else {
                Some(mirror_transform.rotation * glam::Vec3::Z)
            };

            let v_cam = if let Some(p) = primary_portal
                && let Some(exit) = &p.exit_transform
            {
                crate::portal::PortalPipeline3D::compute_portal_camera(
                    &camera_uniform,
                    &mirror_transform,
                    exit,
                )
            } else {
                crate::portal::PortalPipeline3D::compute_mirror_camera(
                    &camera_uniform,
                    &mirror_transform,
                    is_horizontal,
                )
            };

            queue.write_buffer(
                &portal_pipe.virtual_camera_buf,
                0,
                bytemuck::bytes_of(&v_cam),
            );

            if let Some(shadow_map) = &self.shadow_map {
                let v_bg = scene_buffers.create_camera_bind_group(
                    device,
                    pipeline,
                    shadow_map,
                    &portal_pipe.virtual_camera_buf,
                );
                let v_collector = crate::portal::PortalPipeline3D::collect_virtual_items(
                    &self.models,
                    &self.instanced_models,
                    &self.geometries,
                    &self.materials,
                    &v_cam,
                    primary_item.model_id,
                    mirror_transform.position,
                    mirror_normal,
                );
                let opaque_draws = v_collector
                    .opaque
                    .iter()
                    .chain(v_collector.masked.iter())
                    .map(|i| (i, false));
                let particle_draw = self
                    .particle_renderer
                    .as_ref()
                    .filter(|_| alpha_count > 0 || additive_count > 0)
                    .map(|p| (p, alpha_count, additive_count));
                portal_pipe.render_portal_pass(
                    crate::portal::PortalPassDesc {
                        encoder: &mut encoder,
                        pipeline,
                        virtual_scene_bg: &v_bg,
                        sky_pipe: self.skybox_pipeline.as_ref(),
                        sky_mode: self.environment.skybox.mode,
                        particles: particle_draw,
                    },
                    opaque_draws,
                );
            }
        }

        // 1. Opaque & Masked forward geometry pass
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Realm3D Opaque Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: ctx.target_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Load,
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: depth_view,
                    // Reverse-Z: Clear depth buffer to 0.0 (Far plane)
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

            // Draw Skybox at Reverse-Z far plane (0.0) before geometry if enabled
            if self.environment.skybox.mode
                != galfus_realm_3d_resources::environment::SkyboxMode3D::None
                && let Some(sky_pipe) = &self.skybox_pipeline
            {
                pass.set_pipeline(&sky_pipe.pipeline);
                pass.set_bind_group(0, &sky_pipe.bind_group, &[]);
                pass.draw(0..3, 0..1);
            }

            pass.set_bind_group(0, &scene_buffers.bind_group, &[]);
            let opaque_draws = collector
                .opaque
                .iter()
                .chain(collector.masked.iter())
                .map(|i| (i, false));
            render_draw_items(
                &mut pass,
                pipeline,
                opaque_draws,
                &pipeline.dummy_refraction_bg,
            );

            // Draw background particles before capturing opaque texture so they distort through refractive surfaces
            if behind_alpha > 0 || behind_additive > 0 {
                pass.set_bind_group(0, &scene_buffers.bind_group, &[]);
                if let Some(particle_renderer) = &self.particle_renderer {
                    particle_renderer.render(&mut pass, 0..behind_alpha, 0..behind_additive);
                }
            }
        }

        // 2. Capture opaque frame for optical refraction if refractive models exist
        if has_refr {
            let refr = self.refraction_pipeline.get_or_insert_with(|| {
                crate::refraction::RefractionPipeline3D::new(
                    device,
                    ctx.target_format,
                    width,
                    height,
                )
            });
            refr.resize(device, ctx.target_format, width, height);
            refr.capture_opaque(device, &mut encoder, ctx.target_view);
        }

        // 3. Translucent, Refractive, Mirror, and Foreground Particle pass
        let has_trans = !collector.transparent.is_empty();
        let has_front_particles = alpha_count > behind_alpha || additive_count > behind_additive;
        if has_refr || has_mirrors || has_trans || has_front_particles {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Realm3D Refractive & Transparent Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: ctx.target_view,
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

            pass.set_bind_group(0, &scene_buffers.bind_group, &[]);

            if has_mirrors {
                let portal_bg = self
                    .portal_pipeline
                    .as_ref()
                    .map(|p| p.bind_group())
                    .unwrap_or(&pipeline.dummy_refraction_bg);
                render_draw_items(
                    &mut pass,
                    pipeline,
                    collector.mirrors.iter().map(|i| (i, false)),
                    portal_bg,
                );
            }
            if has_refr {
                let refr_bg = self
                    .refraction_pipeline
                    .as_ref()
                    .map(|r| r.bind_group())
                    .unwrap_or(&pipeline.dummy_refraction_bg);
                render_draw_items(
                    &mut pass,
                    pipeline,
                    collector.refractive.iter().map(|i| (i, true)),
                    refr_bg,
                );
            }
            if has_trans {
                render_draw_items(
                    &mut pass,
                    pipeline,
                    collector.transparent.iter().map(|i| (i, true)),
                    &pipeline.dummy_refraction_bg,
                );
            }

            if has_front_particles && let Some(particle_renderer) = &self.particle_renderer {
                pass.set_bind_group(0, &scene_buffers.bind_group, &[]);
                particle_renderer.render(
                    &mut pass,
                    behind_alpha..alpha_count,
                    behind_additive..additive_count,
                );
            }
        }

        // 3-6. Screen-space post-processing: Outlines, SSAO, Bloom HDR glow, and Debug Gizmos
        self.post_pipelines.execute(
            crate::postprocess::PostProcessDesc {
                device,
                queue,
                encoder: &mut encoder,
                target_view: ctx.target_view,
                target_format: ctx.target_format,
                depth_view,
                size,
                scene_buffers,
                pipeline,
                environment: &self.environment,
                cam_frustum: &cam_frustum,
                projection: &camera_uniform.projection,
                models: &self.models,
                geometries: &self.geometries,
            },
            &mut self.gizmos,
        );

        queue.submit(Some(encoder.finish()));
        Ok(())
    }

    fn referenced_texture_ids(&self) -> Vec<u32> {
        let mut ids = Vec::new();
        for (mat, _, _) in self.materials.values() {
            for slot in mat.resolved_texture_slots() {
                if let Some(id) = slot
                    && id != 0
                {
                    ids.push(id);
                }
            }
        }
        ids
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }
}
