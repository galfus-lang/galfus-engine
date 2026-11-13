use galfus_realm_core::error::RealmResult;
use galfus_realm_core::realm::Realm;
use galfus_realm_core::types::{RealmInvocationContext, RealmKind, RealmPrepareContext};

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
        self.clear_scene_resources();
        Ok(())
    }

    fn destroy(&mut self) -> RealmResult<()> {
        self.clear()?;
        self.clear_gpu_pipelines();
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
        self.prune_portal_pipelines();
        let pipeline = self.pipeline.as_mut().unwrap();

        // 1-3. Sync Geometries, Materials, and Models
        crate::types::sync_realm_resources(
            device,
            queue,
            pipeline,
            ctx.textures,
            &mut self.geometries,
            &mut self.materials,
            &mut self.models,
            &mut self.instanced_models,
        );

        let sky_pipe = self.skybox_pipeline.get_or_insert_with(|| {
            crate::skybox::SkyboxPipeline3D::new(device, wgpu::TextureFormat::Rgba8Unorm)
        });
        let sky_tex = self.environment.skybox.texture_id.and_then(ctx.textures);
        sky_pipe.sync_texture(device, self.environment.skybox.texture_id, sky_tex);

        // 4. Sync Scene Buffers (Environment, Lights, Shadows)
        let shadow_pipe = self.shadow_pipeline.get_or_insert_with(|| {
            ShadowPipeline3D::new(device, &pipeline.material_layout, &pipeline.model_layout)
        });

        if crate::types::sync_scene_buffers(
            device,
            queue,
            pipeline,
            shadow_pipe,
            &mut self.shadow_map,
            &mut self.scene_buffers,
            &self.environment,
            &self.lights,
            &self.bones,
            &mut self.lights_dirty,
            &mut self.bones_dirty,
        ) {
            self.scene_bindings_generation = self.scene_bindings_generation.wrapping_add(1);
        }

        Ok(())
    }

    fn render(&mut self, ctx: &RealmInvocationContext<'_>) -> RealmResult<()> {
        self.execute_render_3d(ctx)
    }

    fn referenced_texture_ids(&self) -> Vec<u32> {
        let mut ids: Vec<u32> = self
            .materials
            .values()
            .flat_map(|(m, _, _)| m.resolved_texture_slots().into_iter().flatten())
            .filter(|&id| id != 0)
            .collect();
        if let Some(tex_id) = self.environment.skybox.texture_id.filter(|&id| id != 0) {
            ids.push(tex_id);
        }
        ids
    }

    fn pick_3d(
        &self,
        camera_slot: Option<u32>,
        ray: galfus_realm_core::Ray3D,
    ) -> Option<galfus_realm_core::HitResult3D> {
        self.perform_pick_3d(camera_slot, ray)
    }

    fn pick_3d_with_limit(
        &self,
        _camera_slot: Option<u32>,
        ray: galfus_realm_core::Ray3D,
        max_distance: f32,
    ) -> Option<galfus_realm_core::HitResult3D> {
        self.raycast_colliders_3d(ray, max_distance, u32::MAX)
            .into_iter()
            .next()
    }

    fn viewport_ray_3d(
        &self,
        camera_slot: Option<u32>,
        position: glam::Vec2,
        size: glam::Vec2,
    ) -> Option<(galfus_realm_core::Ray3D, f32)> {
        if size.x <= 0.0 || size.y <= 0.0 {
            return None;
        }
        let (camera, transform) = if let Some(slot) = camera_slot {
            self.cameras
                .iter()
                .find(|(id, (c, _))| c.active && (c.camera_slot == slot || **id == slot))
                .map(|(_, pair)| pair)
        } else {
            self.cameras
                .values()
                .find(|(c, _)| c.active && c.camera_slot == 0)
        }?;
        let matrix = camera
            .build_uniform(transform, size.x / size.y)
            .view_projection;
        let det = matrix.determinant();
        if !det.is_finite() || det == 0.0 {
            return None;
        }
        let inverse = matrix.inverse();
        let ndc = glam::Vec2::new(
            position.x / size.x * 2.0 - 1.0,
            1.0 - position.y / size.y * 2.0,
        );
        let near = inverse.project_point3(glam::Vec3::new(ndc.x, ndc.y, 1.0));
        let far = inverse.project_point3(glam::Vec3::new(ndc.x, ndc.y, 0.0));
        let direction = far - near;
        let distance = direction.length();
        if !near.is_finite() || !distance.is_finite() || distance <= 0.0 {
            return None;
        }
        Some((galfus_realm_core::Ray3D::new(near, direction), distance))
    }

    fn has_interactive_collider(&self, model_id: u32, collider_id: u32) -> bool {
        self.colliders
            .get(&collider_id)
            .is_some_and(|c| c.model_id == model_id && c.active)
    }

    fn has_collider(&self, model_id: u32, collider_id: u32) -> bool {
        self.colliders
            .get(&collider_id)
            .is_some_and(|c| c.model_id == model_id)
    }

    fn supports_interaction_surface(&self, model_id: u32, collider_id: u32) -> bool {
        self.colliders.get(&collider_id).is_some_and(|collider| {
            collider.model_id == model_id
                && matches!(
                    collider.shape,
                    galfus_realm_core::ColliderShape3D::Rectangle { .. }
                        | galfus_realm_core::ColliderShape3D::Box { .. }
                )
        })
    }

    fn snapshot_interaction(&self) -> Option<Box<dyn Realm>> {
        let mut snapshot = Self::new(self.id);
        snapshot.cameras = self.cameras.clone();
        snapshot.colliders = self.colliders.clone();
        for collider in self.colliders.values() {
            let model_id = collider.model_id;
            if let Some(transform) = self
                .model_transforms
                .get(&model_id)
                .copied()
                .or_else(|| self.models.get(&model_id).map(|model| model.1))
            {
                snapshot.model_transforms.insert(model_id, transform);
            }
        }
        Some(Box::new(snapshot))
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }
}
