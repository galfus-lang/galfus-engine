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

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }
}
