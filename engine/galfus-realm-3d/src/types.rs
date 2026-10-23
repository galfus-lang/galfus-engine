//! Internal types and GPU buffer helper utilities for Realm3D.

use galfus_core::id::validate_host_logical_id;
use galfus_realm_3d_resources::model::Model3D;
use galfus_realm_3d_resources::transform::Transform3D;
use galfus_realm_core::error::{RealmError, RealmResult};
use wgpu::util::DeviceExt;

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

/// GPU buffers associated with one geometry.
pub struct GpuMeshBuffers {
    pub vertices: wgpu::Buffer,
    pub indices: wgpu::Buffer,
    pub index_count: u32,
    pub morph_targets: Option<wgpu::Buffer>,
}

/// Model entity state: model, transform, deformed local bounds, uniform, morph weights, and bind group.
pub type GpuModelEntry = (
    Model3D,
    Transform3D,
    galfus_realm_3d_resources::Aabb,
    Option<wgpu::Buffer>,
    Option<wgpu::Buffer>,
    Option<wgpu::BindGroup>,
);

/// Instanced model state: model, instances, instance storage, model uniform, morph weights, and bind group.
pub type GpuInstancedModelEntry = (
    galfus_realm_3d_resources::model::InstancedModel3D,
    Vec<galfus_realm_3d_resources::model::InstanceData3D>,
    Option<wgpu::Buffer>,
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
#[allow(clippy::too_many_arguments)]
pub fn sync_realm_resources<'a>(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
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
            let morph_targets = (!geom.morph_targets.is_empty()).then(|| {
                let deltas: Vec<_> = geom
                    .morph_targets
                    .iter()
                    .flat_map(|target| target.deltas.iter().copied())
                    .collect();
                device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("Morph Targets Storage Buffer"),
                    contents: bytemuck::cast_slice(&deltas),
                    usage: wgpu::BufferUsages::STORAGE,
                })
            });
            *gpu_buffers = Some(GpuMeshBuffers {
                vertices: v,
                indices: i,
                index_count: geom.indices.len() as u32,
                morph_targets,
            });
        }
    }

    // 2. Sync Materials and pre-compile custom surface pipelines
    for (mat, buf_opt, bg_opt) in materials.values_mut() {
        let uniform = mat.build_uniform();
        if let Some(buf) = buf_opt {
            queue.write_buffer(buf, 0, bytemuck::bytes_of(&uniform));
        } else {
            let buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Mat Uniform Buffer"),
                contents: bytemuck::bytes_of(&uniform),
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            });
            *buf_opt = Some(buf);
        }

        if bg_opt.is_none() {
            let buf = buf_opt.as_ref().unwrap();
            let resolved_slots = mat.resolved_texture_slots();
            let bg = create_material_bind_group(device, pipeline, buf, &resolved_slots, textures);
            *bg_opt = Some(bg);
        }

        pipeline.ensure_pipeline(
            device,
            mat.shader_effect.as_deref(),
            crate::pipeline::SurfacePipelineState::from_surface_type(mat.surface_type),
            mat.side,
        );
    }

    // 3. Sync Models
    for (model, transform, _, buf_opt, morph_weights_opt, bg_opt) in models.values_mut() {
        let uniform = model.build_uniform(transform);
        if let Some(buf) = buf_opt {
            queue.write_buffer(buf, 0, bytemuck::bytes_of(&uniform));
        } else {
            let buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Model Uniform Buffer"),
                contents: bytemuck::bytes_of(&uniform),
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            });
            *buf_opt = Some(buf);
        }

        if !model.morph_weights.is_empty() {
            let required_bytes = std::mem::size_of_val(&model.morph_weights[..]) as u64;
            let needs_alloc = match morph_weights_opt {
                Some(buffer) => buffer.size() < required_bytes,
                None => true,
            };
            if needs_alloc {
                *morph_weights_opt = Some(device.create_buffer_init(
                    &wgpu::util::BufferInitDescriptor {
                        label: Some("Model Morph Weights Storage Buffer"),
                        contents: bytemuck::cast_slice(&model.morph_weights),
                        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
                    },
                ));
                *bg_opt = None;
            } else if let Some(buffer) = morph_weights_opt {
                queue.write_buffer(buffer, 0, bytemuck::cast_slice(&model.morph_weights));
            }
        }

        if bg_opt.is_none() {
            let morph_targets = geometries
                .get(&model.geometry_id)
                .and_then(|(_, buffers)| buffers.as_ref())
                .and_then(|buffers| buffers.morph_targets.as_ref())
                .unwrap_or(&pipeline.dummy_morph_targets_buffer);
            let morph_weights = morph_weights_opt
                .as_ref()
                .unwrap_or(&pipeline.dummy_morph_weights_buffer);
            let model_buf = buf_opt.as_ref().expect("model uniform was allocated");
            *bg_opt = Some(device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Model Bind Group"),
                layout: &pipeline.model_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: model_buf.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: pipeline.dummy_instance_buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: morph_weights.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: morph_targets.as_entire_binding(),
                    },
                ],
            }));
        }
    }

    // 4. Sync Instanced Models
    for (inst_model, instances, inst_buf_opt, model_buf_opt, morph_weights_opt, model_bg_opt) in
        instanced_models.values_mut()
    {
        let mut flags = 0u32;
        if inst_model.receive_shadow {
            flags |= 1 << 0;
        }
        let uniform = galfus_realm_3d_resources::model::Model3DUniform {
            model: glam::Mat4::IDENTITY,
            normal_matrix: glam::Mat4::IDENTITY,
            outline_color: glam::Vec4::ZERO,
            flags: glam::UVec4::new(flags, 0, 0, inst_model.morph_weights.len() as u32),
        };
        if let Some(buf) = model_buf_opt {
            queue.write_buffer(buf, 0, bytemuck::bytes_of(&uniform));
        } else {
            *model_buf_opt = Some(
                device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("Instanced Model Uniform Buffer"),
                    contents: bytemuck::bytes_of(&uniform),
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                }),
            );
        }

        if !inst_model.morph_weights.is_empty() {
            let required_bytes = std::mem::size_of_val(&inst_model.morph_weights[..]) as u64;
            let needs_alloc = match morph_weights_opt {
                Some(buffer) => buffer.size() < required_bytes,
                None => true,
            };
            if needs_alloc {
                *morph_weights_opt = Some(device.create_buffer_init(
                    &wgpu::util::BufferInitDescriptor {
                        label: Some("Instanced Morph Weights Storage Buffer"),
                        contents: bytemuck::cast_slice(&inst_model.morph_weights),
                        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
                    },
                ));
                *model_bg_opt = None;
            } else if let Some(buffer) = morph_weights_opt {
                queue.write_buffer(buffer, 0, bytemuck::cast_slice(&inst_model.morph_weights));
            }
        }

        if !instances.is_empty() {
            let required_bytes = std::mem::size_of_val(&instances[..]) as u64;
            let needs_alloc = match inst_buf_opt {
                Some(buf) => buf.size() < required_bytes,
                None => true,
            };
            if needs_alloc {
                let buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("Instanced Storage Buffer"),
                    contents: bytemuck::cast_slice(instances),
                    usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
                });
                *inst_buf_opt = Some(buf);
                *model_bg_opt = None;
            } else if let Some(buf) = inst_buf_opt {
                queue.write_buffer(buf, 0, bytemuck::cast_slice(instances));
            }
        }

        if model_bg_opt.is_none() {
            let model_buf = model_buf_opt.as_ref().expect("model uniform was allocated");
            let instance_buf = inst_buf_opt
                .as_ref()
                .unwrap_or(&pipeline.dummy_instance_buffer);
            let morph_weights = morph_weights_opt
                .as_ref()
                .unwrap_or(&pipeline.dummy_morph_weights_buffer);
            let morph_targets = geometries
                .get(&inst_model.geometry_id)
                .and_then(|(_, buffers)| buffers.as_ref())
                .and_then(|buffers| buffers.morph_targets.as_ref())
                .unwrap_or(&pipeline.dummy_morph_targets_buffer);
            *model_bg_opt = Some(device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Realm3D Instance Bind Group"),
                layout: &pipeline.model_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: model_buf.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: instance_buf.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: morph_weights.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: morph_targets.as_entire_binding(),
                    },
                ],
            }));
        }
    }
}

#[path = "types_scene.rs"]
mod types_scene;
pub use types_scene::sync_scene_buffers;
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
