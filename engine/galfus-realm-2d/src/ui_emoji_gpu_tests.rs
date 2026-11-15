//! End-to-end GPU check for embedded color emoji.

use galfus_realm_2d_resources::{
    Transform2D,
    ui::{Model2DUI, PanelNode, TextNode, UiDimension, UiLayoutStyle},
};
use galfus_realm_core::{Realm, RealmInvocationContext, RealmPrepareContext};

#[test]
fn default_color_emoji_reaches_the_render_target() {
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
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(64.0),
            height: UiDimension::Exact(64.0),
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_text(
        2,
        TextNode {
            text: "😀".into(),
            font_size: 40.0,
            ..Default::default()
        },
        UiLayoutStyle::default(),
    )
    .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    let mut realm = crate::Realm2DContext::new(1);
    realm
        .set_camera(1, crate::Camera2D::new(64.0, 0), Transform2D::default())
        .unwrap();
    realm.set_shadow_config(crate::Shadow2DConfig {
        ambient: 1.0,
        ..Default::default()
    });
    realm.create_ui(10, ui, Transform2D::default()).unwrap();
    realm
        .prepare(&RealmPrepareContext {
            frame_id: 1,
            delta_time: 0.016,
            device: &device,
            queue: &queue,
            textures: &|_| None,
        })
        .unwrap();
    let output = device.create_texture(&wgpu::TextureDescriptor {
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
    let view = output.create_view(&Default::default());
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
            viewport: glam::UVec4::new(0, 0, 64, 64),
            subpixel_jitter: None,
            device: &device,
            queue: &queue,
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
        output.as_image_copy(),
        wgpu::TexelCopyBufferInfo {
            buffer: &buffer,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(256),
                rows_per_image: Some(64),
            },
        },
        output.size(),
    );
    queue.submit([encoder.finish()]);
    let slice = buffer.slice(..);
    let (sender, receiver) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        sender.send(result).unwrap()
    });
    device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
    receiver.recv().unwrap().unwrap();
    let data = slice.get_mapped_range();
    assert!(
        data.as_chunks::<4>()
            .0
            .iter()
            .any(|pixel| pixel[0] > 160 && pixel[1] > 80 && pixel[2] < 100),
        "no colored emoji pixels reached the render target"
    );
    drop(data);
    buffer.unmap();
}
