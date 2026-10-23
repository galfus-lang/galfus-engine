//! Scene-wide uniform-buffer synchronization.

use galfus_realm_3d_resources::transform::Transform3D;
use wgpu::util::DeviceExt;

use super::SceneGpuBuffers;

/// Synchronizes scene-wide uniform buffers, shadow maps, and directional/point/spot lights.
#[allow(clippy::too_many_arguments)]
pub fn sync_scene_buffers(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pipeline: &crate::pipeline::Pipeline3D,
    shadow_pipe: &crate::shadow::ShadowPipeline3D,
    shadow_map_opt: &mut Option<crate::shadow::ShadowMap3D>,
    scene_buffers: &mut Option<SceneGpuBuffers>,
    environment: &galfus_realm_3d_resources::environment::EnvironmentRealm3D,
    lights: &std::collections::BTreeMap<
        u32,
        (galfus_realm_3d_resources::light::Light3D, Transform3D),
    >,
    bones: &[glam::Mat4],
    dirty: &mut bool,
) {
    if scene_buffers.is_none() || *dirty {
        let bones_data = if bones.is_empty() {
            vec![glam::Mat4::IDENTITY]
        } else {
            bones.to_vec()
        };
        let bones_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Bones Storage Buffer"),
            contents: bytemuck::cast_slice(&bones_data),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        });

        let shadow_map = match shadow_map_opt.as_mut() {
            Some(sm) => {
                sm.update_bones(device, shadow_pipe, &bones_buf);
                sm
            }
            None => {
                *shadow_map_opt = Some(crate::shadow::ShadowMap3D::new(
                    device,
                    shadow_pipe,
                    &bones_buf,
                ));
                shadow_map_opt.as_mut().unwrap()
            }
        };

        let env_uniform = environment.build_uniform(0.0);
        let mut shadow_counter = 0u32;
        let mut lights_data: Vec<galfus_realm_3d_resources::light::Light3DUniform> = lights
            .values()
            .map(|(l, t)| {
                if l.cast_shadow && l.active {
                    let layers_needed =
                        if l.kind == galfus_realm_3d_resources::light::LightKind3D::Point {
                            6
                        } else {
                            1
                        };
                    if shadow_counter + layers_needed <= crate::shadow::MAX_SHADOW_LIGHTS {
                        let base_layer = shadow_counter;
                        shadow_counter += layers_needed;
                        l.build_uniform_with_layer(t, base_layer)
                    } else {
                        l.build_uniform(t)
                    }
                } else {
                    l.build_uniform(t)
                }
            })
            .collect();
        if lights_data.is_empty() {
            lights_data.push(bytemuck::Zeroable::zeroed());
        }

        *scene_buffers = Some(SceneGpuBuffers::build(
            device,
            pipeline,
            shadow_map,
            &env_uniform,
            &lights_data,
            lights.len() as u32,
            bones_buf,
        ));
        *dirty = false;
    } else if let Some(scene) = scene_buffers {
        let env_uniform = environment.build_uniform(0.0);
        queue.write_buffer(&scene.env_buf, 0, bytemuck::bytes_of(&env_uniform));
    }
}
