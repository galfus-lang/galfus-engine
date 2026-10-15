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
    pub fallback_texture_view: wgpu::TextureView,
    pub fallback_material_buffer: wgpu::Buffer,
    pub fallback_material_bind_group: wgpu::BindGroup,
    pub global_bind_group: wgpu::BindGroup,
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

        let fallback_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("galfus_2d_white_fallback_tex"),
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let fallback_texture_view =
            fallback_tex.create_view(&wgpu::TextureViewDescriptor::default());

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

        let fallback_material_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("galfus_2d_fallback_mat_bg"),
            layout: &pipeline_manager.material_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: fallback_material_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&fallback_texture_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&linear_sampler),
                },
            ],
        });

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
            fallback_texture_view,
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
