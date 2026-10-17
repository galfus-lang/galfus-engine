use crate::pipeline::PipelineManager2D;
use crate::shadow::SHADOW_SAMPLES_PER_DIRECTION;
use crate::types::{
    Camera2DUniform, Item2DInstanceRaw, Light2DUniform, Material2D, Material2DUniform,
    ShadowSample2DRaw,
};
use bytemuck::cast_slice;

/// Reusable GPU buffer creation helper.
#[inline]
pub fn create_gpu_buffer(
    device: &wgpu::Device,
    label: &str,
    size: u64,
    usage: wgpu::BufferUsages,
) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some(label),
        size,
        usage,
        mapped_at_creation: false,
    })
}

/// GPU resources and bind groups owned by Realm2DContext.
pub struct GpuResources2D {
    pub quad_vertex_buffer: wgpu::Buffer,
    pub quad_index_buffer: wgpu::Buffer,
    pub camera_buffer: wgpu::Buffer,
    pub instance_buffer: wgpu::Buffer,
    pub light_buffer: wgpu::Buffer,
    pub shadow_sample_buffer: wgpu::Buffer,

    pub _point_sampler: wgpu::Sampler,
    pub linear_sampler: wgpu::Sampler,
    pub samplers: galfus_gpu_manager::StandardSamplers,
    pub fallback_texture_view: wgpu::TextureView,
    pub fallback_normal_view: wgpu::TextureView,
    pub fallback_black_view: wgpu::TextureView,
    _fallback_textures: (wgpu::Texture, wgpu::Texture, wgpu::Texture),
    pub fallback_material_buffer: wgpu::Buffer,
    pub fallback_material_bind_group: wgpu::BindGroup,
    pub global_bind_group: wgpu::BindGroup,
}

fn create_1x1_texture(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    label: &str,
    color: [u8; 4],
) -> (wgpu::Texture, wgpu::TextureView) {
    let size = wgpu::Extent3d {
        width: 1,
        height: 1,
        depth_or_array_layers: 1,
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &color,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(4),
            rows_per_image: Some(1),
        },
        size,
    );
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    (texture, view)
}

/// Creates a 2D material bind group with uniform buffer, 8 texture slots, and 4 standard samplers.
#[allow(clippy::too_many_arguments)]
pub fn create_material_bind_group_2d<'tex>(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    samplers: &galfus_gpu_manager::StandardSamplers,
    fallback_white: &wgpu::TextureView,
    fallback_normal: &wgpu::TextureView,
    fallback_black: &wgpu::TextureView,
    uniform_buf: &wgpu::Buffer,
    slots: &[Option<u32>; 8],
    textures: &dyn Fn(u32) -> Option<&'tex wgpu::TextureView>,
) -> wgpu::BindGroup {
    let mut views: [&wgpu::TextureView; 8] = [fallback_white; 8];
    views[1] = fallback_normal;
    views[4] = fallback_black;

    for (i, slot) in slots.iter().enumerate() {
        if let Some(view) = slot.and_then(textures) {
            views[i] = view;
        }
    }

    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("galfus_2d_mat_bg"),
        layout,
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
                resource: wgpu::BindingResource::Sampler(&samplers.linear_repeat),
            },
            wgpu::BindGroupEntry {
                binding: 10,
                resource: wgpu::BindingResource::Sampler(&samplers.linear_clamp),
            },
            wgpu::BindGroupEntry {
                binding: 11,
                resource: wgpu::BindingResource::Sampler(&samplers.nearest_repeat),
            },
            wgpu::BindGroupEntry {
                binding: 12,
                resource: wgpu::BindingResource::Sampler(&samplers.nearest_clamp),
            },
        ],
    })
}

impl GpuResources2D {
    pub fn new(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        pipeline_manager: &PipelineManager2D,
        angular_resolution: u32,
    ) -> Self {
        #[rustfmt::skip]
        let quad_vertices: [f32; 36] = [
            -0.5, -0.5, 0.0,   0.0, 1.0,   1.0, 1.0, 1.0, 1.0,
             0.5, -0.5, 0.0,   1.0, 1.0,   1.0, 1.0, 1.0, 1.0,
             0.5,  0.5, 0.0,   1.0, 0.0,   1.0, 1.0, 1.0, 1.0,
            -0.5,  0.5, 0.0,   0.0, 0.0,   1.0, 1.0, 1.0, 1.0,
        ];
        let quad_indices: [u16; 6] = [0, 1, 2, 2, 3, 0];

        let quad_vertex_buffer = create_gpu_buffer(
            device,
            "galfus_2d_quad_vbo",
            std::mem::size_of_val(&quad_vertices) as u64,
            wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        );
        queue.write_buffer(&quad_vertex_buffer, 0, cast_slice(&quad_vertices));

        let quad_index_buffer = create_gpu_buffer(
            device,
            "galfus_2d_quad_ibo",
            std::mem::size_of_val(&quad_indices) as u64,
            wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
        );
        queue.write_buffer(&quad_index_buffer, 0, cast_slice(&quad_indices));

        let camera_buffer = create_gpu_buffer(
            device,
            "galfus_2d_camera_buffer",
            std::mem::size_of::<Camera2DUniform>() as u64,
            wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        );

        let initial_instance_capacity = 1024;
        let instance_buffer = create_gpu_buffer(
            device,
            "galfus_2d_instance_buffer",
            (std::mem::size_of::<Item2DInstanceRaw>() * initial_instance_capacity) as u64,
            wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        );

        let initial_light_capacity = 64;
        let light_buffer = create_gpu_buffer(
            device,
            "galfus_2d_light_buffer",
            (std::mem::size_of::<Light2DUniform>() * initial_light_capacity) as u64,
            wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        );

        let angular_res = angular_resolution as usize;
        let shadow_sample_capacity =
            angular_res * initial_light_capacity * SHADOW_SAMPLES_PER_DIRECTION;
        let shadow_sample_buffer = create_gpu_buffer(
            device,
            "galfus_2d_shadow_sample_buffer",
            (std::mem::size_of::<ShadowSample2DRaw>() * shadow_sample_capacity) as u64,
            wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        );

        let point_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("galfus_2d_point_sampler"),
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });

        let linear_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("galfus_2d_linear_sampler"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let samplers = galfus_gpu_manager::StandardSamplers::new(device);
        let (white_tex, fallback_texture_view) =
            create_1x1_texture(device, queue, "Fallback White 2D", [255, 255, 255, 255]);
        let (normal_tex, fallback_normal_view) =
            create_1x1_texture(device, queue, "Fallback Normal 2D", [128, 128, 255, 255]);
        let (black_tex, fallback_black_view) =
            create_1x1_texture(device, queue, "Fallback Black 2D", [0, 0, 0, 0]);

        let fallback_material_buffer = create_gpu_buffer(
            device,
            "galfus_2d_fallback_material_buf",
            std::mem::size_of::<Material2DUniform>() as u64,
            wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        );
        let default_mat = Material2D::default().build_uniform();
        queue.write_buffer(
            &fallback_material_buffer,
            0,
            bytemuck::bytes_of(&default_mat),
        );

        let fallback_material_bind_group = create_material_bind_group_2d(
            device,
            &pipeline_manager.material_bind_group_layout,
            &samplers,
            &fallback_texture_view,
            &fallback_normal_view,
            &fallback_black_view,
            &fallback_material_buffer,
            &[None; 8],
            &|_| None,
        );

        let global_bind_group = Self::build_global_bind_group(
            device,
            pipeline_manager,
            &camera_buffer,
            &point_sampler,
            &linear_sampler,
            &light_buffer,
            &shadow_sample_buffer,
        );

        Self {
            quad_vertex_buffer,
            quad_index_buffer,
            camera_buffer,
            instance_buffer,
            light_buffer,
            shadow_sample_buffer,
            _point_sampler: point_sampler,
            linear_sampler,
            samplers,
            fallback_texture_view,
            fallback_normal_view,
            fallback_black_view,
            _fallback_textures: (white_tex, normal_tex, black_tex),
            fallback_material_buffer,
            fallback_material_bind_group,
            global_bind_group,
        }
    }

    pub fn build_global_bind_group(
        device: &wgpu::Device,
        pipeline_manager: &PipelineManager2D,
        camera_buffer: &wgpu::Buffer,
        point_sampler: &wgpu::Sampler,
        linear_sampler: &wgpu::Sampler,
        light_buffer: &wgpu::Buffer,
        shadow_sample_buffer: &wgpu::Buffer,
    ) -> wgpu::BindGroup {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("galfus_2d_global_bg"),
            layout: &pipeline_manager.global_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: camera_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(point_sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(linear_sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: light_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: shadow_sample_buffer.as_entire_binding(),
                },
            ],
        })
    }
}
