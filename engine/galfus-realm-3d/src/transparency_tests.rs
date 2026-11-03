use crate::Realm3DContext;
use galfus_realm_3d_resources::{
    camera::Camera3D,
    environment::EnvironmentRealm3D,
    geometry::Geometry3D,
    material::{Material3D, MaterialSide3D, SurfaceType3D},
    model::Model3D,
    transform::Transform3D,
};
use galfus_realm_core::{
    realm::Realm,
    types::{RealmInvocationContext, RealmPrepareContext},
};
use glam::{UVec4, Vec3, Vec4};

fn render_layers(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    order: [usize; 3],
    front_alpha: f32,
) -> [u8; 4] {
    let mut realm = Realm3DContext::new(1);
    let mut camera = Camera3D::perspective(60.0, 0.1, 100.0, 0);
    camera.set_look_at(Vec3::ZERO, Vec3::Y).unwrap();
    realm
        .create_camera(
            1,
            camera,
            Transform3D::from_position(Vec3::new(0.0, 0.0, 3.0)),
        )
        .unwrap();
    realm.set_environment(EnvironmentRealm3D {
        ambient_color: Vec4::ONE,
        ..Default::default()
    });
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let layers = [
        ([1.0, 0.0, 0.0, front_alpha], 0.0),
        ([0.0, 1.0, 0.0, 1.0], -0.4),
        ([0.0, 0.0, 1.0, 0.5], 0.4),
    ];
    for layer in order {
        let (color, z) = layers[layer];
        let mut quad = Geometry3D::quad(2.0, 2.0);
        for vertex in &mut quad.vertices {
            vertex.position[2] = z;
            vertex.color = color;
        }
        let offset = vertices.len() as u32;
        indices.extend(quad.indices.iter().map(|index| index + offset));
        vertices.extend(quad.vertices);
    }
    realm
        .create_geometry(1, Geometry3D::new(vertices, indices, None))
        .unwrap();
    realm
        .create_material(
            1,
            Material3D {
                surface_type: SurfaceType3D::Transparent,
                side: MaterialSide3D::Double,
                metallic: 0.0,
                ..Default::default()
            },
        )
        .unwrap();
    realm
        .create_model(1, Model3D::new(1, 1), Transform3D::default())
        .unwrap();
    realm
        .prepare(&RealmPrepareContext {
            frame_id: 1,
            delta_time: 0.016,
            device,
            queue,
            textures: &|_| None,
        })
        .unwrap();
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 64,
            height: 64,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT
            | wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = texture.create_view(&Default::default());
    realm
        .render(&RealmInvocationContext {
            frame_id: 1,
            invocation_id: 1,
            target_id: 1,
            camera_slot: Some(0),
            viewport: UVec4::new(0, 0, 64, 64),
            subpixel_jitter: None,
            device,
            queue,
            target_view: &view,
            target_format: wgpu::TextureFormat::Rgba8Unorm,
        })
        .unwrap();
    let buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: 64 * 64 * 4,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut encoder = device.create_command_encoder(&Default::default());
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &buffer,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(256),
                rows_per_image: Some(64),
            },
        },
        wgpu::Extent3d {
            width: 64,
            height: 64,
            depth_or_array_layers: 1,
        },
    );
    queue.submit([encoder.finish()]);
    let slice = buffer.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| tx.send(result).unwrap());
    device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
    rx.recv().unwrap().unwrap();
    let data = slice.get_mapped_range();
    let offset = (32 * 64 + 32) * 4;
    data[offset..offset + 4].try_into().unwrap()
}

#[test]
fn opaque_fragments_occlude_blended_triangles_independent_of_index_order() {
    let instance = wgpu::Instance::default();
    let Ok(adapter) =
        pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
    else {
        return;
    };
    let Ok((device, queue)) =
        pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
    else {
        return;
    };
    let a = render_layers(&device, &queue, [0, 1, 2], 1.0);
    let b = render_layers(&device, &queue, [2, 1, 0], 1.0);
    assert_eq!(a, b, "triangle order changed the resulting pixel");
    assert!(
        a[0] > 40 && a[2] > 40 && a[1] < 10,
        "expected blue blended over red, got {a:?}"
    );
}

#[test]
#[ignore = "partially transparent triangles are not yet ordered per fragment"]
fn partially_transparent_triangles_are_independent_of_index_order() {
    let instance = wgpu::Instance::default();
    let Ok(adapter) =
        pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
    else {
        return;
    };
    let Ok((device, queue)) =
        pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
    else {
        return;
    };
    let a = render_layers(&device, &queue, [0, 1, 2], 247.0 / 255.0);
    let b = render_layers(&device, &queue, [2, 1, 0], 247.0 / 255.0);
    assert_eq!(
        a, b,
        "partially transparent triangles must be composited by depth"
    );
}
