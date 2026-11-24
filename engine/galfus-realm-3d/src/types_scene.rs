//! Incremental synchronization for scene-wide GPU resources.

use galfus_realm_3d_resources::light::{Light3D, Light3DUniform, LightKind3D};
use galfus_realm_3d_resources::projector::Projector3D;
use galfus_realm_3d_resources::transform::Transform3D;
use wgpu::util::DeviceExt;

use super::SceneGpuBuffers;

type RealmLights = std::collections::BTreeMap<u32, (Light3D, Transform3D)>;
type RealmProjectors = std::collections::BTreeMap<u32, (Projector3D, Transform3D)>;

fn collect_lights(lights: &RealmLights) -> Vec<Light3DUniform> {
    let mut shadow_counter = 0_u32;
    let mut data: Vec<_> = lights
        .values()
        .map(|(light, transform)| {
            if light.cast_shadow && light.active {
                let layers_needed = if light.kind == LightKind3D::Point {
                    6
                } else {
                    1
                };
                if shadow_counter + layers_needed <= crate::shadow::MAX_SHADOW_LIGHTS {
                    let base_layer = shadow_counter;
                    shadow_counter += layers_needed;
                    return light.build_uniform_with_layer(transform, base_layer);
                }
            }
            light.build_uniform(transform)
        })
        .collect();
    if data.is_empty() {
        data.push(bytemuck::Zeroable::zeroed());
    }
    data
}

fn bones_or_identity(bones: &[glam::Mat4]) -> &[glam::Mat4] {
    if bones.is_empty() {
        std::slice::from_ref(&glam::Mat4::IDENTITY)
    } else {
        bones
    }
}

fn create_bones_buffer(device: &wgpu::Device, bones: &[glam::Mat4]) -> wgpu::Buffer {
    device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("Bones Storage Buffer"),
        contents: bytemuck::cast_slice(bones_or_identity(bones)),
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
    })
}

/// Synchronizes scene buffers, allocating only when capacity or binding identity changes.
#[allow(clippy::too_many_arguments)]
pub fn sync_scene_buffers<'tex>(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pipeline: &crate::pipeline::Pipeline3D,
    shadow_pipe: &crate::shadow::ShadowPipeline3D,
    shadow_map_opt: &mut Option<crate::shadow::ShadowMap3D>,
    projector_gpu_opt: &mut Option<crate::projector::ProjectorGpuResources3D>,
    scene_buffers: &mut Option<SceneGpuBuffers>,
    environment: &galfus_realm_3d_resources::environment::EnvironmentRealm3D,
    lights: &RealmLights,
    projectors: &RealmProjectors,
    textures: &dyn Fn(u32) -> Option<&'tex wgpu::TextureView>,
    bones: &[glam::Mat4],
    lights_dirty: &mut bool,
    projectors_dirty: &mut bool,
    bones_dirty: &mut bool,
) -> bool {
    let env_uniform = environment.build_uniform(0.0);
    if scene_buffers.is_none() {
        let bones_buf = create_bones_buffer(device, bones);
        *shadow_map_opt = Some(crate::shadow::ShadowMap3D::new(
            device,
            shadow_pipe,
            &bones_buf,
        ));
        let mut proj_gpu =
            crate::projector::ProjectorGpuResources3D::new(device, shadow_pipe, &bones_buf);
        let (mut proj_data, _) = proj_gpu.sync(device, queue, projectors, textures);
        let active_proj_count = proj_data.len() as u32;
        if proj_data.is_empty() {
            proj_data.push(bytemuck::Zeroable::zeroed());
        }
        *projector_gpu_opt = Some(proj_gpu);
        let shadow_map = shadow_map_opt.as_ref().expect("shadow map was initialized");
        let projector_gpu = projector_gpu_opt
            .as_ref()
            .expect("projector gpu was initialized");
        let lights_data = collect_lights(lights);
        *scene_buffers = Some(SceneGpuBuffers::build(
            device,
            pipeline,
            shadow_map,
            projector_gpu,
            &env_uniform,
            &lights_data,
            lights.len() as u32,
            &proj_data,
            active_proj_count,
            bones_buf,
        ));
        *lights_dirty = false;
        *projectors_dirty = false;
        *bones_dirty = false;
        return true;
    }

    let scene = scene_buffers
        .as_mut()
        .expect("scene buffers were initialized");
    let shadow_map = shadow_map_opt
        .as_mut()
        .expect("scene buffers require a shadow map");
    let projector_gpu = projector_gpu_opt
        .as_mut()
        .expect("scene buffers require projector gpu resources");
    let mut bindings_changed = false;
    let mut header_dirty = false;
    let mut active_proj_count = projectors.values().filter(|(p, _)| p.active).count() as u32;

    if *bones_dirty {
        let bone_bytes = std::mem::size_of_val(bones_or_identity(bones)) as u64;
        if scene._bones_buf.size() < bone_bytes {
            scene._bones_buf = create_bones_buffer(device, bones);
            shadow_map.update_bones(device, shadow_pipe, &scene._bones_buf);
            projector_gpu.update_bones(device, shadow_pipe, &scene._bones_buf);
            bindings_changed = true;
        } else {
            queue.write_buffer(
                &scene._bones_buf,
                0,
                bytemuck::cast_slice(bones_or_identity(bones)),
            );
        }
        *bones_dirty = false;
    }

    if *lights_dirty {
        let lights_data = collect_lights(lights);
        let light_bytes = std::mem::size_of_val(lights_data.as_slice()) as u64;
        if scene.lights_buf.size() < light_bytes {
            scene.lights_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Lights Storage Buffer"),
                contents: bytemuck::cast_slice(&lights_data),
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            });
            bindings_changed = true;
        } else {
            queue.write_buffer(&scene.lights_buf, 0, bytemuck::cast_slice(&lights_data));
        }
        header_dirty = true;
        *lights_dirty = false;
    }

    if *projectors_dirty {
        let (mut proj_data, proj_bindings_changed) =
            projector_gpu.sync(device, queue, projectors, textures);
        active_proj_count = proj_data.len() as u32;
        if proj_data.is_empty() {
            proj_data.push(bytemuck::Zeroable::zeroed());
        }
        let proj_bytes = std::mem::size_of_val(proj_data.as_slice()) as u64;
        if scene.projectors_buf.size() < proj_bytes {
            scene.projectors_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Projectors Storage Buffer"),
                contents: bytemuck::cast_slice(&proj_data),
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            });
            bindings_changed = true;
        } else {
            queue.write_buffer(&scene.projectors_buf, 0, bytemuck::cast_slice(&proj_data));
        }
        bindings_changed |= proj_bindings_changed;
        header_dirty = true;
        *projectors_dirty = false;
    }

    if header_dirty {
        let header = [lights.len() as u32, active_proj_count, 0, 0];
        queue.write_buffer(&scene._lights_header_buf, 0, bytemuck::cast_slice(&header));
    }

    queue.write_buffer(&scene.env_buf, 0, bytemuck::bytes_of(&env_uniform));
    if bindings_changed {
        scene.rebuild_bind_group(device, pipeline, shadow_map, projector_gpu);
    }
    bindings_changed
}

/// Ensures the Reverse-Z depth texture matches the current invocation viewport size.
pub fn ensure_depth_texture<'a>(
    device: &wgpu::Device,
    depth_texture: &'a mut Option<(wgpu::Texture, wgpu::TextureView, glam::UVec2)>,
    width: u32,
    height: u32,
) -> &'a wgpu::TextureView {
    let size = glam::UVec2::new(width, height);
    if let Some((_, _, d_size)) = depth_texture
        && *d_size != size
    {
        *depth_texture = None;
    }
    if depth_texture.is_none() {
        let tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Realm3D Depth Texture"),
            size: wgpu::Extent3d {
                width: width.max(1),
                height: height.max(1),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let view = tex.create_view(&wgpu::TextureViewDescriptor::default());
        *depth_texture = Some((tex, view, size));
    }
    let (_, view, _) = depth_texture.as_ref().unwrap();
    view
}
