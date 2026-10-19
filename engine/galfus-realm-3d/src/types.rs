//! Internal types and GPU buffer helper utilities for Realm3D.

use galfus_core::id::validate_host_logical_id;
use galfus_realm_3d_resources::model::Model3D;
use galfus_realm_3d_resources::transform::Transform3D;
use galfus_realm_core::error::{RealmError, RealmResult};
use wgpu::util::DeviceExt;

/// Creates a GPU uniform buffer with its single-binding bind group.
pub fn create_uniform_bg(
    device: &wgpu::Device,
    label: &str,
    layout: &wgpu::BindGroupLayout,
    contents: &[u8],
) -> (wgpu::Buffer, wgpu::BindGroup) {
    let buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some(label),
        contents,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    });
    let bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some(label),
        layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: buf.as_entire_binding(),
        }],
    });
    (buf, bg)
}

/// Validates a host logical identifier against core engine policy.
pub fn validate_id(id: u32) -> RealmResult<()> {
    validate_host_logical_id(id)
        .map(|_| ())
        .map_err(|e| RealmError::Internal(e.to_string()))
}

/// GPU uniform buffers and bind group for common scene-wide data.
pub struct SceneGpuBuffers {
    pub camera_buf: wgpu::Buffer,
    pub env_buf: wgpu::Buffer,
    pub lights_buf: wgpu::Buffer,
    pub _lights_header_buf: wgpu::Buffer,
    pub _bones_buf: wgpu::Buffer,
    pub bind_group: wgpu::BindGroup,
}

impl SceneGpuBuffers {
    pub fn build(
        device: &wgpu::Device,
        pipeline: &crate::pipeline::Pipeline3D,
        shadow_map: &crate::shadow::ShadowMap3D,
        env_uniform: &galfus_realm_3d_resources::environment::Environment3DUniform,
        lights_data: &[galfus_realm_3d_resources::light::Light3DUniform],
        light_count: u32,
        bones_buf: wgpu::Buffer,
    ) -> Self {
        let camera_buf = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Camera Uniform Buffer"),
            size: std::mem::size_of::<galfus_realm_3d_resources::camera::Camera3DUniform>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let env_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Environment Uniform Buffer"),
            contents: bytemuck::bytes_of(env_uniform),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let lights_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Lights Storage Buffer"),
            contents: bytemuck::cast_slice(lights_data),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        });

        let header = [light_count, 0, 0, 0];
        let lights_header_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Lights Header Buffer"),
            contents: bytemuck::cast_slice(&header),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let b_entry = |binding, resource| wgpu::BindGroupEntry { binding, resource };
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Scene Bind Group"),
            layout: &pipeline.scene_layout,
            entries: &[
                b_entry(0, camera_buf.as_entire_binding()),
                b_entry(1, env_buf.as_entire_binding()),
                b_entry(2, lights_buf.as_entire_binding()),
                b_entry(3, lights_header_buf.as_entire_binding()),
                b_entry(
                    4,
                    wgpu::BindingResource::TextureView(&shadow_map.array_view),
                ),
                b_entry(5, wgpu::BindingResource::Sampler(&shadow_map.sampler)),
                b_entry(6, bones_buf.as_entire_binding()),
                b_entry(7, shadow_map.matrices_buffer.as_entire_binding()),
            ],
        });

        Self {
            camera_buf,
            env_buf,
            lights_buf,
            _lights_header_buf: lights_header_buf,
            _bones_buf: bones_buf,
            bind_group,
        }
    }

    /// Creates a scene bind group referencing a custom virtual camera buffer (e.g. for mirrors and portals).
    pub fn create_camera_bind_group(
        &self,
        device: &wgpu::Device,
        pipeline: &crate::pipeline::Pipeline3D,
        shadow_map: &crate::shadow::ShadowMap3D,
        camera_buf: &wgpu::Buffer,
    ) -> wgpu::BindGroup {
        let b_entry = |binding, resource| wgpu::BindGroupEntry { binding, resource };
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Virtual Camera Scene Bind Group"),
            layout: &pipeline.scene_layout,
            entries: &[
                b_entry(0, camera_buf.as_entire_binding()),
                b_entry(1, self.env_buf.as_entire_binding()),
                b_entry(2, self.lights_buf.as_entire_binding()),
                b_entry(3, self._lights_header_buf.as_entire_binding()),
                b_entry(
                    4,
                    wgpu::BindingResource::TextureView(&shadow_map.array_view),
                ),
                b_entry(5, wgpu::BindingResource::Sampler(&shadow_map.sampler)),
                b_entry(6, self._bones_buf.as_entire_binding()),
                b_entry(7, shadow_map.matrices_buffer.as_entire_binding()),
            ],
        })
    }
}

/// Vertex buffer, index buffer, and index count tuple for GPU meshes.
pub type GpuMeshBuffers = (wgpu::Buffer, wgpu::Buffer, u32);

/// Model entity state tuple: model, transform, uniform buffer, and bind group.
pub type GpuModelEntry = (
    Model3D,
    Transform3D,
    Option<wgpu::Buffer>,
    Option<wgpu::BindGroup>,
);

/// Instanced model entity state tuple: instanced_model, instances, gpu_instance_buffer, uniform_buffer, bind_group.
pub type GpuInstancedModelEntry = (
    galfus_realm_3d_resources::model::InstancedModel3D,
    Vec<galfus_realm_3d_resources::model::InstanceData3D>,
    Option<wgpu::Buffer>,
    Option<wgpu::Buffer>,
    Option<wgpu::BindGroup>,
);

/// Creates a material bind group with uniform buffer, 8 texture slots, and 4 standard samplers.
pub fn create_material_bind_group<'tex>(
    device: &wgpu::Device,
    pipeline: &crate::pipeline::Pipeline3D,
    uniform_buf: &wgpu::Buffer,
    slots: &[Option<u32>; 8],
    textures: &dyn Fn(u32) -> Option<&'tex wgpu::TextureView>,
) -> wgpu::BindGroup {
    let mut views: [&wgpu::TextureView; 8] = [&pipeline.fallback_white_view; 8];
    views[1] = &pipeline.fallback_normal_view;
    views[4] = &pipeline.fallback_black_view;

    for (i, slot) in slots.iter().enumerate() {
        if let Some(view) = slot.and_then(textures) {
            views[i] = view;
        }
    }

    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("Material Bind Group"),
        layout: &pipeline.material_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buf.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::TextureView(views[0]),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: wgpu::BindingResource::TextureView(views[1]),
            },
            wgpu::BindGroupEntry {
                binding: 3,
                resource: wgpu::BindingResource::TextureView(views[2]),
            },
            wgpu::BindGroupEntry {
                binding: 4,
                resource: wgpu::BindingResource::TextureView(views[3]),
            },
            wgpu::BindGroupEntry {
                binding: 5,
                resource: wgpu::BindingResource::TextureView(views[4]),
            },
            wgpu::BindGroupEntry {
                binding: 6,
                resource: wgpu::BindingResource::TextureView(views[5]),
            },
            wgpu::BindGroupEntry {
                binding: 7,
                resource: wgpu::BindingResource::TextureView(views[6]),
            },
            wgpu::BindGroupEntry {
                binding: 8,
                resource: wgpu::BindingResource::TextureView(views[7]),
            },
            wgpu::BindGroupEntry {
                binding: 9,
                resource: wgpu::BindingResource::Sampler(&pipeline.samplers.linear_repeat),
            },
            wgpu::BindGroupEntry {
                binding: 10,
                resource: wgpu::BindingResource::Sampler(&pipeline.samplers.linear_clamp),
            },
            wgpu::BindGroupEntry {
                binding: 11,
                resource: wgpu::BindingResource::Sampler(&pipeline.samplers.nearest_repeat),
            },
            wgpu::BindGroupEntry {
                binding: 12,
                resource: wgpu::BindingResource::Sampler(&pipeline.samplers.nearest_clamp),
            },
        ],
    })
}

/// Synchronizes dirty CPU mesh geometries, material uniforms, and model matrix uniforms with the GPU.
pub fn sync_realm_resources<'a>(
    device: &wgpu::Device,
    pipeline: &mut crate::pipeline::Pipeline3D,
    textures: &dyn Fn(u32) -> Option<&'a wgpu::TextureView>,
    geometries: &mut std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::geometry::Geometry3D,
            Option<GpuMeshBuffers>,
        ),
    >,
    materials: &mut std::collections::BTreeMap<
        u32,
        (
            galfus_realm_3d_resources::material::Material3D,
            Option<wgpu::Buffer>,
            Option<wgpu::BindGroup>,
        ),
    >,
    models: &mut std::collections::BTreeMap<u32, GpuModelEntry>,
    instanced_models: &mut std::collections::BTreeMap<u32, GpuInstancedModelEntry>,
) {
    // 1. Sync Geometries
    for (geom, gpu_buffers) in geometries.values_mut() {
        if gpu_buffers.is_none() && !geom.vertices.is_empty() {
            let v = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Vertex Buffer"),
                contents: bytemuck::cast_slice(&geom.vertices),
                usage: wgpu::BufferUsages::VERTEX,
            });
            let i = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Index Buffer"),
                contents: bytemuck::cast_slice(&geom.indices),
                usage: wgpu::BufferUsages::INDEX,
            });
            *gpu_buffers = Some((v, i, geom.indices.len() as u32));
        }
    }

    // 2. Sync Materials and pre-compile custom surface pipelines
    for (mat, buf_opt, bg_opt) in materials.values_mut() {
        if buf_opt.is_none() || bg_opt.is_none() {
            let buf = buf_opt.get_or_insert_with(|| {
                device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("Mat Uniform Buffer"),
                    contents: bytemuck::bytes_of(&mat.build_uniform()),
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                })
            });
            let resolved_slots = mat.resolved_texture_slots();
            let bg = create_material_bind_group(device, pipeline, buf, &resolved_slots, textures);
            *bg_opt = Some(bg);
        }
        pipeline.ensure_pipeline(
            device,
            mat.shader_effect.as_deref(),
            mat.surface_type == galfus_realm_3d_resources::material::SurfaceType3D::Transparent,
        );
    }

    // 3. Sync Models
    for (model, transform, buf_opt, bg_opt) in models.values_mut() {
        if buf_opt.is_none() {
            let (buf, bg) = create_uniform_bg(
                device,
                "Model",
                &pipeline.model_layout,
                bytemuck::bytes_of(&model.build_uniform(transform)),
            );
            *buf_opt = Some(buf);
            *bg_opt = Some(bg);
        }
    }

    // 4. Sync Instanced Models
    for (inst_model, instances, inst_buf_opt, model_buf_opt, model_bg_opt) in
        instanced_models.values_mut()
    {
        if model_buf_opt.is_none() || model_bg_opt.is_none() {
            let mut flags = 0u32;
            if inst_model.receive_shadow {
                flags |= 1 << 0;
            }
            let uniform = galfus_realm_3d_resources::model::Model3DUniform {
                model: glam::Mat4::IDENTITY,
                normal_matrix: glam::Mat4::IDENTITY,
                outline_color: glam::Vec4::ZERO,
                flags: glam::UVec4::new(flags, 0, 0, 0),
            };
            let (buf, bg) = create_uniform_bg(
                device,
                "Instanced Model",
                &pipeline.model_layout,
                bytemuck::bytes_of(&uniform),
            );
            *model_buf_opt = Some(buf);
            *model_bg_opt = Some(bg);
        }

        if inst_buf_opt.is_none() && !instances.is_empty() {
            let buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Instanced Vertex Buffer"),
                contents: bytemuck::cast_slice(instances),
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            });
            *inst_buf_opt = Some(buf);
        }
    }
}

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
