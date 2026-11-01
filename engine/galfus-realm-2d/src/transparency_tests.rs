use crate::{
    Camera2D, Material2D, Realm2DContext, Shadow2DConfig, Shape2D, Sprite2D, SurfaceType2D,
    Transform2D,
};
use galfus_realm_core::{Realm, RealmInvocationContext, RealmPrepareContext};
use glam::{UVec4, Vec2, Vec4};

fn render(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    surface: SurfaceType2D,
    alpha: f32,
    shape: bool,
    gradient: bool,
) -> [[u8; 4]; 3] {
    let mut realm = Realm2DContext::new(1);
    realm
        .set_camera(1, Camera2D::new(10.0, 0), Transform2D::default())
        .unwrap();
    realm.set_shadow_config(Shadow2DConfig {
        ambient: 1.0,
        ..Default::default()
    });
    realm
        .set_material(
            1,
            Material2D {
                surface_type: SurfaceType2D::Opaque,
                base_color: Vec4::new(1.0, 0.0, 0.0, 1.0),
                ..Default::default()
            },
        )
        .unwrap();
    realm
        .set_material(
            2,
            Material2D {
                surface_type: surface,
                base_color: Vec4::new(0.0, 0.0, 1.0, alpha),
                shader_effect: gradient.then(|| {
                    r#"fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D {
                    var out: SurfaceOutput2D;
                    out.color = vec4<f32>(in.color.rgb, in.uv.x * in.color.a);
                    out.emissive = vec4<f32>(0.0);
                    return out;
                }"#
                    .to_owned()
                }),
                ..Default::default()
            },
        )
        .unwrap();
    realm
        .set_sprite(
            10,
            Sprite2D::new(Vec2::splat(4.0), Some(1)),
            Transform2D::default(),
        )
        .unwrap();
    if shape {
        realm
            .set_shape(
                20,
                Shape2D::rectangle(Vec2::splat(4.0), Some(2)),
                Transform2D::default(),
            )
            .unwrap();
    } else {
        realm
            .set_sprite(
                20,
                Sprite2D::new(Vec2::splat(4.0), Some(2)),
                Transform2D::default(),
            )
            .unwrap();
    }
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
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = texture.create_view(&Default::default());
    let mut encoder = device.create_command_encoder(&Default::default());
    {
        let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &view,
                depth_slice: None,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
    }
    queue.submit([encoder.finish()]);
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
    [24, 32, 40].map(|x| {
        let offset = (32 * 64 + x) * 4;
        data[offset..offset + 4].try_into().unwrap()
    })
}

#[test]
fn sprite_surface_modes_composite_in_resource_order() {
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
    for shape in [false, true] {
        let opaque = render(&device, &queue, SurfaceType2D::Opaque, 0.25, shape, false)[1];
        let blend = render(
            &device,
            &queue,
            SurfaceType2D::Transparent,
            0.25,
            shape,
            false,
        )[1];
        let masked = render(&device, &queue, SurfaceType2D::Masked, 0.25, shape, false)[1];
        let additive = render(&device, &queue, SurfaceType2D::Additive, 0.25, shape, false)[1];
        assert!(opaque[0] < 10 && opaque[2] > 240, "opaque: {opaque:?}");
        assert!(
            blend[0] > 180 && blend[2] > 45 && blend[2] < 80,
            "blend: {blend:?}"
        );
        assert!(masked[0] > 240 && masked[2] < 10, "masked: {masked:?}");
        assert!(
            additive[0] > 240 && additive[2] > 45 && additive[2] < 80,
            "additive: {additive:?}"
        );
        let gradient = render(
            &device,
            &queue,
            SurfaceType2D::Transparent,
            1.0,
            shape,
            true,
        );
        assert!(
            gradient[0][2] < gradient[1][2] && gradient[1][2] < gradient[2][2],
            "gradient: {gradient:?}"
        );
    }
}
