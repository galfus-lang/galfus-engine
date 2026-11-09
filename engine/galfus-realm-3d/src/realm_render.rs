//! Execution logic for 3D forward and multi-pass rendering.

use galfus_realm_3d_resources::frustum::Frustum;
use galfus_realm_core::error::RealmResult;
use galfus_realm_core::types::RealmInvocationContext;
use glam::UVec2;

use crate::collector::{DrawCollector, render_draw_items};
use crate::context::Realm3DContext;

impl Realm3DContext {
    /// Dispatches the complete 3D rendering pipeline for an active invocation pass.
    pub(crate) fn execute_render_3d(
        &mut self,
        ctx: &RealmInvocationContext<'_>,
    ) -> RealmResult<()> {
        let device = ctx.device;
        let queue = ctx.queue;

        // Resolve camera strictly by requested slot, or default slot 0 if none specified
        let selected_camera = if let Some(slot) = ctx.camera_slot {
            self.cameras
                .iter()
                .find(|(id, (c, _))| c.active && (c.camera_slot == slot || **id == slot))
                .map(|(_, pair)| pair)
        } else {
            self.cameras
                .values()
                .find(|(c, _)| c.active && c.camera_slot == 0)
        };

        let Some((camera, camera_transform)) = selected_camera else {
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
        sky_pipe.ensure_format(device, ctx.target_format);
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
        if let Some(cull_pipe) = &self.light_cull_pipeline
            && !self.lights.is_empty()
        {
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
                &self.materials,
                &self.geometries,
                self.total_time,
            );
        }

        let has_refr = !collector.refractive.is_empty();
        let refraction_threshold = if has_refr {
            let min_refr = collector
                .refractive
                .iter()
                .map(|i| i.depth)
                .fold(f32::INFINITY, f32::min);
            let threshold = (min_refr.sqrt() - 0.6).max(0.0).powi(2);
            Some((camera_transform.position, threshold))
        } else {
            None
        };

        crate::particle::collect_emitter_instances(
            &self.emitters,
            &self.materials,
            refraction_threshold,
            &mut self.particle_alpha_instances,
            &mut self.particle_additive_instances,
            &mut self.particle_alpha_batches,
            &mut self.particle_additive_batches,
        );

        let alpha_count = self.particle_alpha_instances.len() as u32;
        let additive_count = self.particle_additive_instances.len() as u32;
        let has_behind_particles = self
            .particle_alpha_batches
            .iter()
            .chain(self.particle_additive_batches.iter())
            .any(|b| !b.behind_range.is_empty());
        let has_front_particles = self
            .particle_alpha_batches
            .iter()
            .chain(self.particle_additive_batches.iter())
            .any(|b| !b.front_range.is_empty());

        if alpha_count > 0 || additive_count > 0 {
            let particle_renderer = self.particle_renderer.get_or_insert_with(|| {
                crate::particle::ParticleRenderer3D::new(device, ctx.target_format, pipeline)
            });
            particle_renderer.upload(
                device,
                queue,
                &self.particle_alpha_instances,
                &self.particle_additive_instances,
            );
        }

        // 0. Render offscreen mirror / optical portal passes for all visible mirrors reached by the camera
        let has_mirrors = !collector.mirrors.is_empty();
        if has_mirrors {
            for mirror_item in &collector.mirrors {
                let portal_config = self
                    .portals
                    .values()
                    .find(|portal| portal.model_id == mirror_item.model_id);
                if !crate::portal::is_mirror_or_portal_active(
                    &self.portals,
                    mirror_item.model_id,
                    mirror_item.surface_type,
                ) {
                    continue;
                }
                let mirror_portal = portal_config.filter(|portal| portal.active);
                let portal_scale = mirror_portal
                    .map(|portal| portal.resolution_scale.max(0.01))
                    .unwrap_or(1.0);
                let portal_width = ((width as f32 * portal_scale).round() as u32).max(1);
                let portal_height = ((height as f32 * portal_scale).round() as u32).max(1);
                let portal_pipe = self
                    .portal_pipelines
                    .entry(mirror_item.model_id)
                    .or_insert_with(|| {
                        crate::portal::PortalPipeline3D::new(
                            device,
                            ctx.target_format,
                            &pipeline.refraction_layout,
                            portal_width,
                            portal_height,
                        )
                    });
                portal_pipe.resize(
                    device,
                    &pipeline.refraction_layout,
                    ctx.target_format,
                    portal_width,
                    portal_height,
                );
                let mirror_transform = self
                    .models
                    .get(&mirror_item.model_id)
                    .map(|m| m.1)
                    .unwrap_or_default();
                let is_horizontal = self
                    .geometries
                    .get(&mirror_item.geometry_id)
                    .and_then(|g| g.0.label.as_deref())
                    .map(|l| l == "Plane3D")
                    .unwrap_or(false);

                let is_portal = mirror_portal
                    .and_then(|p| p.exit_transform.as_ref())
                    .is_some();
                let mirror_normal = if is_portal {
                    None
                } else if is_horizontal {
                    Some(mirror_transform.rotation * glam::Vec3::Y)
                } else {
                    Some(mirror_transform.rotation * glam::Vec3::Z)
                };

                let v_cam = if let Some(p) = mirror_portal
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
                    portal_pipe.ensure_virtual_scene_bind_group(
                        device,
                        pipeline,
                        scene_buffers,
                        shadow_map,
                        self.scene_bindings_generation,
                    );
                    let v_bg = portal_pipe.virtual_scene_bind_group();
                    let v_collector = crate::portal::PortalPipeline3D::collect_virtual_items(
                        &self.models,
                        &self.instanced_models,
                        &self.geometries,
                        &self.materials,
                        &v_cam,
                        mirror_item.model_id,
                        mirror_transform.position,
                        mirror_normal,
                    );
                    let opaque_draws = v_collector.opaque.iter().chain(v_collector.masked.iter());
                    let particle_draw = self
                        .particle_renderer
                        .as_ref()
                        .filter(|_| alpha_count > 0 || additive_count > 0)
                        .map(|p| {
                            (
                                p,
                                self.particle_alpha_batches.as_slice(),
                                self.particle_additive_batches.as_slice(),
                            )
                        });
                    portal_pipe.render_portal_pass(
                        crate::portal::PortalPassDesc {
                            encoder: &mut encoder,
                            pipeline,
                            virtual_scene_bg: v_bg,
                            sky_pipe: self.skybox_pipeline.as_ref(),
                            sky_mode: self.environment.skybox.mode,
                            materials: &self.materials,
                            particles: particle_draw,
                        },
                        opaque_draws,
                    );
                }
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
            let opaque_draws = collector.opaque.iter().chain(collector.masked.iter());
            render_draw_items(
                &mut pass,
                pipeline,
                opaque_draws,
                &pipeline.dummy_refraction_bg,
            );

            crate::collector::render_transparent_opaque(
                &mut pass,
                pipeline,
                collector.transparent.iter(),
                &pipeline.dummy_refraction_bg,
            );

            // Draw background particles before capturing opaque texture so they distort through refractive surfaces
            if has_behind_particles {
                pass.set_bind_group(0, &scene_buffers.bind_group, &[]);
                if let Some(particle_renderer) = &self.particle_renderer {
                    particle_renderer.render(
                        &mut pass,
                        &self.materials,
                        &self.particle_alpha_batches,
                        &self.particle_additive_batches,
                        crate::particle::ParticlePassSlice::BehindRefractive,
                    );
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
        let has_additive = !collector.additive.is_empty();
        if has_refr || has_mirrors || has_trans || has_additive || has_front_particles {
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
                for item in &collector.mirrors {
                    if !crate::portal::is_mirror_or_portal_active(
                        &self.portals,
                        item.model_id,
                        item.surface_type,
                    ) {
                        continue;
                    }
                    let portal_bg = self
                        .portal_pipelines
                        .get(&item.model_id)
                        .map(|p| p.bind_group())
                        .unwrap_or(&pipeline.dummy_refraction_bg);
                    render_draw_items(&mut pass, pipeline, std::iter::once(item), portal_bg);
                }
            }
            if has_refr {
                let refr_bg = self
                    .refraction_pipeline
                    .as_ref()
                    .map(|r| r.bind_group())
                    .unwrap_or(&pipeline.dummy_refraction_bg);
                render_draw_items(&mut pass, pipeline, collector.refractive.iter(), refr_bg);
            }
            if has_trans {
                crate::collector::render_transparent_partial(
                    &mut pass,
                    pipeline,
                    collector.transparent.iter(),
                    &pipeline.dummy_refraction_bg,
                );
            }
            if has_additive {
                render_draw_items(
                    &mut pass,
                    pipeline,
                    collector.additive.iter(),
                    &pipeline.dummy_refraction_bg,
                );
            }

            if has_front_particles && let Some(particle_renderer) = &self.particle_renderer {
                pass.set_bind_group(0, &scene_buffers.bind_group, &[]);
                particle_renderer.render(
                    &mut pass,
                    &self.materials,
                    &self.particle_alpha_batches,
                    &self.particle_additive_batches,
                    crate::particle::ParticlePassSlice::FrontRefractive,
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
}
