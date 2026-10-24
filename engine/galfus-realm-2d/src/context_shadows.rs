use bytemuck::cast_slice;
use galfus_realm_2d_resources::{Light2DUniform, Occluder2D, OccluderSilhouette2D};
use glam::Vec2;

use crate::context::Realm2DContext;
use crate::gpu::GpuResources2D;
use crate::types::ShadowSample2DRaw;

/// Frame-local storage retained by the realm to avoid shadow allocation churn.
#[derive(Default)]
pub(crate) struct ShadowFrameData {
    occluders: Vec<Occluder2D>,
    light_uniforms: Vec<Light2DUniform>,
    samples: Vec<ShadowSample2DRaw>,
}

impl Realm2DContext {
    pub(crate) fn prepare_shadows(&mut self, device: &wgpu::Device, queue: &wgpu::Queue) {
        let shadows_rebuilt = self.shadow_manager.is_dirty;
        self.shadow_data.light_uniforms.clear();
        let mut shadow_index = 0_u32;
        for light in self.lights.values() {
            let casts_shadow = light.active && light.cast_shadow;
            let current_shadow_index = casts_shadow.then(|| {
                let index = shadow_index;
                shadow_index += 1;
                index
            });
            self.shadow_data
                .light_uniforms
                .push(light.build_uniform(current_shadow_index.unwrap_or_default()));
        }

        if shadows_rebuilt {
            self.collect_shadow_occluders();
            self.shadow_data.samples.clear();
            for light in self.lights.values() {
                if light.active && light.cast_shadow {
                    self.shadow_manager.append_samples_for_light(
                        light,
                        &self.shadow_data.occluders,
                        &mut self.shadow_data.samples,
                    );
                }
            }
            self.shadow_manager.is_dirty = false;
        }

        let pipeline_manager = self
            .pipeline_manager
            .as_ref()
            .expect("GPU pipelines are initialized");
        let gpu = self
            .gpu_res
            .as_mut()
            .expect("GPU resources are initialized");
        upload_shadow_buffers(
            device,
            queue,
            pipeline_manager,
            gpu,
            &self.shadow_data,
            shadows_rebuilt,
        );
    }

    fn collect_shadow_occluders(&mut self) {
        self.shadow_data.occluders.clear();

        for (&id, (sprite, transform)) in &self.sprites {
            if sprite.cast_shadow {
                self.shadow_data.occluders.push(Occluder2D {
                    entity_id: id,
                    silhouette: OccluderSilhouette2D::from_quad(
                        sprite.compute_world_corners(transform),
                    ),
                    shadow_layer_mask: sprite.shadow_layer_mask,
                    shadow_height: sprite.shadow_height,
                    height_range: sprite.height_range,
                });
            }
        }

        for (&id, (shape, transform)) in &self.shapes {
            if shape.cast_shadow {
                let occluders = &mut self.shadow_data.occluders;
                shape.append_world_silhouettes(transform, |silhouette| {
                    occluders.push(Occluder2D {
                        entity_id: id,
                        silhouette,
                        shadow_layer_mask: shape.shadow_layer_mask,
                        shadow_height: shape.shadow_height,
                        height_range: shape.height_range,
                    });
                });
            }
        }

        for (&id, instance) in &self.svg_manager.instances {
            if instance.svg.cast_shadow {
                let fallback_size = instance
                    .geometry_handle
                    .and_then(|handle| {
                        self.svg_manager
                            .pool
                            .get(handle)
                            .ok()
                            .map(|geometry| geometry.dimensions)
                    })
                    .unwrap_or(Vec2::splat(100.0));
                self.shadow_data.occluders.push(Occluder2D {
                    entity_id: id,
                    silhouette: OccluderSilhouette2D::from_quad(
                        instance
                            .svg
                            .compute_world_corners(&instance.transform, fallback_size),
                    ),
                    shadow_layer_mask: instance.svg.shadow_layer_mask,
                    shadow_height: instance.svg.shadow_height,
                    height_range: instance.svg.height_range,
                });
            }
        }
    }
}

fn upload_shadow_buffers(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pipeline_manager: &crate::pipeline::PipelineManager2D,
    gpu: &mut GpuResources2D,
    frame: &ShadowFrameData,
    write_shadow_samples: bool,
) {
    let mut bind_group_dirty = false;
    let required_light_bytes =
        (std::mem::size_of::<Light2DUniform>() * frame.light_uniforms.len().max(1)) as u64;
    if gpu.light_buffer.size() < required_light_bytes {
        let new_size = required_light_bytes.max(64 * std::mem::size_of::<Light2DUniform>() as u64);
        gpu.light_buffer = crate::gpu::create_gpu_buffer(
            device,
            "galfus_2d_light_buffer",
            new_size,
            wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        );
        bind_group_dirty = true;
    }

    let required_shadow_bytes =
        (std::mem::size_of::<ShadowSample2DRaw>() * frame.samples.len().max(1)) as u64;
    if gpu.shadow_sample_buffer.size() < required_shadow_bytes {
        let new_size =
            required_shadow_bytes.max(512 * std::mem::size_of::<ShadowSample2DRaw>() as u64);
        gpu.shadow_sample_buffer = crate::gpu::create_gpu_buffer(
            device,
            "galfus_2d_shadow_sample_buffer",
            new_size,
            wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        );
        bind_group_dirty = true;
    }

    if bind_group_dirty {
        gpu.global_bind_group = GpuResources2D::build_global_bind_group(
            device,
            pipeline_manager,
            &gpu.camera_buffer,
            &gpu.point_sampler,
            &gpu.linear_sampler,
            &gpu.light_buffer,
            &gpu.shadow_sample_buffer,
        );
    }

    if !frame.light_uniforms.is_empty() {
        queue.write_buffer(&gpu.light_buffer, 0, cast_slice(&frame.light_uniforms));
    }
    if write_shadow_samples && !frame.samples.is_empty() {
        queue.write_buffer(&gpu.shadow_sample_buffer, 0, cast_slice(&frame.samples));
    }
}
