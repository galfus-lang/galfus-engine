use galfus_gpu_manager::{
    BindGroupEntryDesc, BindGroupLayoutDesc, BindGroupLayoutEntryDesc, BindResourceDesc,
    BindingType, BufferUsageFlags, GpuBufferDesc, GpuManager, GpuResourceRegistries,
    GpuTextureDesc, NormalizedTextureFormat, ShaderVisibility, TextureDimension, TextureUsageFlags,
};

#[test]
fn bind_groups_are_invalidated_with_their_resources() {
    let mut gpu = GpuManager::new_headless().expect("GPU Manager needed");
    let device = gpu.context.device_arc();
    let layout_desc = BindGroupLayoutDesc {
        label: Some("Test Layout".into()),
        entries: vec![
            BindGroupLayoutEntryDesc {
                binding: 0,
                visibility: ShaderVisibility::VERTEX_FRAGMENT,
                ty: BindingType::UniformBuffer {
                    has_dynamic_offset: false,
                },
            },
            BindGroupLayoutEntryDesc {
                binding: 1,
                visibility: ShaderVisibility::FRAGMENT,
                ty: BindingType::SampledTexture {
                    multisampled: false,
                },
            },
        ],
    };
    let layout = gpu
        .layouts
        .get_or_create_bind_group_layout(&device, &layout_desc);
    let buffer = create_uniform_buffer(&mut gpu, &device, "Test UBO");
    let texture = gpu
        .textures
        .create_texture(
            &device,
            &GpuTextureDesc {
                label: Some("Test Tex".into()),
                width: 16,
                height: 16,
                depth_or_layers: 1,
                mip_levels: 1,
                sample_count: 1,
                dimension: TextureDimension::D2,
                format: NormalizedTextureFormat::Rgba8Unorm,
                usages: TextureUsageFlags::default(),
            },
        )
        .unwrap();
    let view = gpu.textures.get_texture(texture).unwrap().default_view();
    let bind_group = create_bind_group(&mut gpu, &device, &layout, buffer, view, "Valid BG");

    gpu.destroy_buffer(buffer).unwrap();
    assert!(gpu.bind_groups.get(bind_group).is_err());

    let stale_result =
        create_bind_group_result(&mut gpu, &device, &layout, buffer, view, "Stale BG");
    assert!(stale_result.is_err());

    let replacement_buffer = create_uniform_buffer(&mut gpu, &device, "Replacement UBO");
    let texture_bind_group = create_bind_group(
        &mut gpu,
        &device,
        &layout,
        replacement_buffer,
        view,
        "Texture dependency BG",
    );
    gpu.destroy_texture(texture).unwrap();
    assert!(gpu.bind_groups.get(texture_bind_group).is_err());
}

fn create_uniform_buffer(
    gpu: &mut GpuManager,
    device: &wgpu::Device,
    label: &str,
) -> galfus_gpu_manager::GpuBufferHandle {
    gpu.buffers
        .create_buffer(
            device,
            &GpuBufferDesc {
                label: Some(label.into()),
                size: 64,
                usages: BufferUsageFlags::UNIFORM,
                mapped_at_creation: false,
            },
        )
        .unwrap()
}

fn create_bind_group(
    gpu: &mut GpuManager,
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    buffer: galfus_gpu_manager::GpuBufferHandle,
    view: galfus_gpu_manager::GpuTextureViewHandle,
    label: &str,
) -> galfus_gpu_manager::GpuBindGroupHandle {
    create_bind_group_result(gpu, device, layout, buffer, view, label).unwrap()
}

fn create_bind_group_result(
    gpu: &mut GpuManager,
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    buffer: galfus_gpu_manager::GpuBufferHandle,
    view: galfus_gpu_manager::GpuTextureViewHandle,
    label: &str,
) -> galfus_gpu_manager::GpuResult<galfus_gpu_manager::GpuBindGroupHandle> {
    let registries = GpuResourceRegistries {
        buffers: &gpu.buffers,
        textures: &gpu.textures,
        samplers: &gpu.samplers,
    };
    gpu.bind_groups.create_bind_group(
        device,
        layout,
        Some(label),
        &[
            BindGroupEntryDesc {
                binding: 0,
                resource: BindResourceDesc::Buffer {
                    handle: buffer,
                    offset: 0,
                    size: None,
                },
            },
            BindGroupEntryDesc {
                binding: 1,
                resource: BindResourceDesc::TextureView { handle: view },
            },
        ],
        &registries,
    )
}
