use galfus_gpu_manager::{
    AddressMode, BindGroupEntryDesc, BindGroupLayoutDesc, BindGroupLayoutEntryDesc,
    BindResourceDesc, BindingType, BufferArena, BufferArenaDesc, BufferManager, BufferUsageFlags,
    FilterMode, GpuBufferDesc, GpuContext, GpuManager, GpuSamplerDesc, GpuTextureDesc,
    NormalizedTextureFormat, RenderPipelineTargetConfig, SamplerManager, ShaderVisibility,
    TextureDimension, TextureManager, TextureUsageFlags, TileAtlas2DArray, TileAtlasDesc,
};

#[test]
fn test_gpu_context_headless_initialization() {
    let context = GpuContext::new_headless().expect("Failed to initialize headless GPU context");
    assert!(!context.adapter_info().name.is_empty());
    assert!(context.limits().max_texture_dimension_2d >= 2048);
}

#[test]
fn test_buffer_manager_lifecycle() {
    let context = GpuContext::new_headless().expect("GPU context needed");
    let mut manager = BufferManager::new();

    let desc = GpuBufferDesc {
        label: Some("Test Vertex Buffer".into()),
        size: 128,
        usages: BufferUsageFlags::VERTEX,
        mapped_at_creation: false,
    };

    let handle = manager
        .create_buffer(context.device(), &desc)
        .expect("Buffer creation failed");
    assert_eq!(manager.get(handle).unwrap().size(), 128);

    let data = [1u8, 2, 3, 4];
    manager
        .write_buffer(context.queue(), handle, 0, &data)
        .expect("Write buffer failed");

    // Test out of bounds write
    let err = manager.write_buffer(context.queue(), handle, 126, &data);
    assert!(err.is_err());

    // Destroy
    manager.destroy(handle).expect("Destroy failed");
    assert!(manager.get(handle).is_err());
}

#[test]
fn test_texture_manager_lifecycle() {
    let context = GpuContext::new_headless().expect("GPU context needed");
    let mut manager = TextureManager::new();

    let desc = GpuTextureDesc {
        label: Some("Target Offscreen Texture".into()),
        width: 256,
        height: 256,
        depth_or_layers: 1,
        mip_levels: 1,
        sample_count: 1,
        dimension: TextureDimension::D2,
        format: NormalizedTextureFormat::Rgba8Unorm,
        usages: TextureUsageFlags::default(),
    };

    let handle = manager
        .create_texture(context.device(), &desc)
        .expect("Texture creation failed");
    let tex = manager.get_texture(handle).expect("Get texture failed");
    assert_eq!(tex.width(), 256);
    assert_eq!(tex.height(), 256);

    let default_view_handle = tex.default_view();
    let view = manager
        .get_view(default_view_handle)
        .expect("Get view failed");
    assert_eq!(view.parent(), handle);

    // Destroy
    manager.destroy_texture(handle).expect("Destroy failed");
    assert!(manager.get_texture(handle).is_err());
    assert!(manager.get_view(default_view_handle).is_err());
}

#[test]
fn test_sampler_manager_caching() {
    let context = GpuContext::new_headless().expect("GPU context needed");
    let mut manager = SamplerManager::new();

    let desc = GpuSamplerDesc {
        label: Some("Linear Clamp Sampler".into()),
        address_mode_u: AddressMode::ClampToEdge,
        address_mode_v: AddressMode::ClampToEdge,
        address_mode_w: AddressMode::ClampToEdge,
        mag_filter: FilterMode::Linear,
        min_filter: FilterMode::Linear,
        mipmap_filter: FilterMode::Linear,
        compare: None,
    };

    let handle1 = manager
        .get_or_create(context.device(), &desc)
        .expect("Sampler creation failed");
    let handle2 = manager
        .get_or_create(context.device(), &desc)
        .expect("Sampler caching failed");

    // Both requests must yield the exact same cached handle
    assert_eq!(handle1, handle2);

    manager.destroy(handle1).expect("Destroy sampler failed");
    assert!(manager.get(handle1).is_err());
}

#[test]
fn test_tile_atlas_allocation_and_repack() {
    let context = GpuContext::new_headless().expect("GPU context needed");

    let desc = TileAtlasDesc {
        label: Some("Shadow Atlas Test"),
        format: wgpu::TextureFormat::Depth32Float,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        tile_px: 64,
        guard_px: 8,
        tiles_w: 4,
        tiles_h: 4,
        layers: 2,
    };

    let mut atlas = TileAtlas2DArray::new(context.device(), desc);

    // Allocate 2x2 region
    let (h1, rel1) = atlas.alloc(2, 2).expect("Allocation 1 failed");
    assert!(rel1.is_empty());

    // Allocate 2x2 region
    let (h2, _) = atlas.alloc(2, 2).expect("Allocation 2 failed");

    // Allocate 2x2 region
    let (h3, _) = atlas.alloc(2, 2).expect("Allocation 3 failed");

    // Check UV transform
    let uv = atlas.get_uv_transform(h1).expect("UV transform failed");
    assert!(uv.0 > 0.0); // scale_x > 0
    assert!(uv.1 > 0.0); // scale_y > 0

    // Free h2 to create a hole (fragmentation)
    assert!(atlas.free(h2));

    // Allocate 3x2 which requires repack
    let (h4, relocations) = atlas.alloc(3, 2).expect("Allocation with repack failed");
    assert_ne!(h1, h4);

    // Relocations list may contain moved items
    for rel in relocations {
        assert!(rel.handle == h1 || rel.handle == h3);
    }
}

#[test]
fn test_buffer_arena_suballocation_and_grow() {
    let context = GpuContext::new_headless().expect("GPU context needed");

    let desc = BufferArenaDesc {
        label: Some("Test Arena"),
        initial_capacity: 128,
        usage: wgpu::BufferUsages::VERTEX,
        alignment: 4,
        keep_frames: 2,
    };

    let mut arena = BufferArena::new(context.device_arc(), context.queue_arc(), desc);

    let h1 = arena.allocate(32);
    let slice1 = arena.slice(h1);
    assert_eq!(slice1.offset, 0);
    assert_eq!(slice1.size, 32);

    let data = [1u8, 2, 3, 4];
    arena.write_bytes(h1, &data);

    // Allocate large block that forces grow
    let h2 = arena.allocate(256);
    let slice2 = arena.slice(h2);
    assert!(slice2.offset >= 32);
    assert!(arena.capacity() >= 288);

    // Advance frame and check deferred retirement
    arena.begin_frame(1);
    arena.begin_frame(3);

    assert!(arena.free(h1));
    assert!(arena.free(h2));
}

#[test]
fn test_bind_group_assembly_and_stale_detection() {
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

    // Create valid resources
    let buf_handle = gpu
        .buffers
        .create_buffer(
            &device,
            &GpuBufferDesc {
                label: Some("Test UBO".into()),
                size: 64,
                usages: BufferUsageFlags::UNIFORM,
                mapped_at_creation: false,
            },
        )
        .unwrap();

    let tex_handle = gpu
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

    let view_handle = gpu.textures.get_texture(tex_handle).unwrap().default_view();

    let registries = galfus_gpu_manager::GpuResourceRegistries {
        buffers: &gpu.buffers,
        textures: &gpu.textures,
        samplers: &gpu.samplers,
    };

    // Create bind group with valid resources
    let bg_handle = gpu
        .bind_groups
        .create_bind_group(
            &device,
            &layout,
            Some("Valid BG"),
            &[
                BindGroupEntryDesc {
                    binding: 0,
                    resource: BindResourceDesc::Buffer {
                        handle: buf_handle,
                        offset: 0,
                        size: None,
                    },
                },
                BindGroupEntryDesc {
                    binding: 1,
                    resource: BindResourceDesc::TextureView {
                        handle: view_handle,
                    },
                },
            ],
            &registries,
        )
        .expect("Valid bind group failed");

    assert!(gpu.bind_groups.get(bg_handle).is_ok());

    // Destroy the buffer to make the handle stale
    gpu.buffers.destroy(buf_handle).unwrap();

    let registries_after = galfus_gpu_manager::GpuResourceRegistries {
        buffers: &gpu.buffers,
        textures: &gpu.textures,
        samplers: &gpu.samplers,
    };

    // Attempting to create a bind group with stale buffer must fail
    let stale_err = gpu.bind_groups.create_bind_group(
        &device,
        &layout,
        Some("Stale BG"),
        &[
            BindGroupEntryDesc {
                binding: 0,
                resource: BindResourceDesc::Buffer {
                    handle: buf_handle,
                    offset: 0,
                    size: None,
                },
            },
            BindGroupEntryDesc {
                binding: 1,
                resource: BindResourceDesc::TextureView {
                    handle: view_handle,
                },
            },
        ],
        &registries_after,
    );
    assert!(stale_err.is_err());
}

#[test]
fn test_derived_render_pipeline_caching() {
    let mut gpu = GpuManager::new_headless().expect("GPU Manager needed");
    let device = gpu.context.device_arc();

    let wgsl = r#"
        @vertex
        fn vs_main(@builtin(vertex_index) in_vertex_index: u32) -> @builtin(position) vec4<f32> {
            var pos = array<vec2<f32>, 3>(
                vec2<f32>(0.0, 0.5),
                vec2<f32>(-0.5, -0.5),
                vec2<f32>(0.5, -0.5)
            );
            return vec4<f32>(pos[in_vertex_index], 0.0, 1.0);
        }

        @fragment
        fn fs_main() -> @location(0) vec4<f32> {
            return vec4<f32>(1.0, 0.0, 0.0, 1.0);
        }
    "#;

    let shader = gpu
        .pipelines
        .create_shader_module(&device, Some("Simple Shader"), wgsl)
        .unwrap();

    let pipe_layout = gpu
        .layouts
        .create_pipeline_layout(&device, Some("Empty Layout"), &[])
        .unwrap();

    let target_rgba = RenderPipelineTargetConfig {
        color_format: wgpu::TextureFormat::Rgba8Unorm,
        depth_format: None,
        sample_count: 1,
        blend: None,
    };

    let target_bgra = RenderPipelineTargetConfig {
        color_format: wgpu::TextureFormat::Bgra8UnormSrgb,
        depth_format: None,
        sample_count: 1,
        blend: None,
    };

    let desc_rgba = galfus_gpu_manager::DerivedPipelineDesc {
        shader,
        layout: &pipe_layout,
        target: target_rgba.clone(),
        entry_point_vs: "vs_main",
        entry_point_fs: "fs_main",
        vertex_buffers: &[],
    };

    let p1 = gpu
        .pipelines
        .get_or_create_render_pipeline_derived(&device, &desc_rgba)
        .unwrap();

    // Calling again with same target format returns cached handle
    let p1_cached = gpu
        .pipelines
        .get_or_create_render_pipeline_derived(&device, &desc_rgba)
        .unwrap();
    assert_eq!(p1, p1_cached);

    // Calling with different target format creates distinct pipeline
    let desc_bgra = galfus_gpu_manager::DerivedPipelineDesc {
        shader,
        layout: &pipe_layout,
        target: target_bgra,
        entry_point_vs: "vs_main",
        entry_point_fs: "fs_main",
        vertex_buffers: &[],
    };

    let p2 = gpu
        .pipelines
        .get_or_create_render_pipeline_derived(&device, &desc_bgra)
        .unwrap();
    assert_ne!(p1, p2);
}
