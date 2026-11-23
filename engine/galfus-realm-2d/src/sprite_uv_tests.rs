use crate::{Realm2DContext, Sprite2D, Transform2D};

#[test]
fn sprite_uv_update_preserves_other_state_and_rejects_invalid_input() {
    let mut realm = Realm2DContext::new(1);
    let sprite = Sprite2D {
        label: Some("sprite".into()),
        material_id: Some(4),
        ..Default::default()
    };
    let transform = Transform2D::default();
    realm.set_sprite(10, sprite.clone(), transform).unwrap();
    let uv = [1.5, -1.0, 0.0, 2.0];
    realm.set_sprite_uv_rect(10, uv).unwrap();
    let mut expected = sprite;
    expected.uv_rect = uv.into();
    assert_eq!(realm.sprites[&10].0, expected);
    assert_eq!(realm.sprites[&10].1, transform);
    assert!(
        realm
            .set_sprite_uv_rect(10, [f32::NAN, 0.0, 1.0, 1.0])
            .is_err()
    );
    assert!(realm.set_sprite_uv_rect(u32::MAX, uv).is_err());
    assert!(realm.set_sprite_uv_rect(11, uv).is_err());
    assert_eq!(realm.sprites[&10].0, expected);
}

#[test]
fn ui_sprite_uv_updates_the_next_batch_without_relayout() {
    use galfus_realm_2d_resources::ui::{
        Model2DUI, PanelNode, SpritePanelNode, UiCommand, UiDimension, UiLayoutStyle,
    };
    let mut ui = Model2DUI::new();
    let layout = UiLayoutStyle {
        width: UiDimension::Exact(64.0),
        height: UiDimension::Exact(64.0),
        ..Default::default()
    };
    ui.create_panel(1, PanelNode::default(), layout.clone())
        .unwrap();
    ui.create_sprite_panel(
        2,
        SpritePanelNode {
            texture_id: Some(42),
            ..Default::default()
        },
        layout,
    )
    .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    let fonts = crate::ui_fonts::UiFontLibrary::default();
    crate::ui_layout::solve_ui_layout(&mut ui, &*fonts.database, &fonts.default_family, 64.0, 64.0);
    let before = ui.computed[&2].clone();
    let uv = [0.5, 0.25, 0.75, 0.75];
    ui.apply_commands(&[UiCommand::SetSpriteUvRect { id: 2, uv_rect: uv }])
        .unwrap();
    assert_eq!(ui.computed[&2], before);
    let mut uis = std::collections::HashMap::new();
    uis.insert(10, (ui, Transform2D::default()));
    let manager = crate::context_ui::UiManager2D::new();
    let mut batches = crate::batch::BatchBuilder2D::new();
    manager.push_batches(&uis, &mut batches);
    batches.build();
    assert!(
        batches
            .instances()
            .iter()
            .any(|item| item.uv_rect.to_array() == uv)
    );
}

#[test]
fn sprite_uv_is_reflected_in_next_render_batch() {
    let _gpu_guard = crate::GPU_TEST_LOCK
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let _gpu_guard = crate::GPU_TEST_LOCK
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    use galfus_realm_core::{Realm, RealmPrepareContext};
    let instance = wgpu::Instance::default();
    let Ok(adapter) = pollster::block_on(instance.request_adapter(&Default::default())) else {
        return;
    };
    let Ok((device, queue)) = pollster::block_on(adapter.request_device(&Default::default()))
    else {
        return;
    };
    let mut realm = Realm2DContext::new(1);
    realm
        .set_sprite(10, Sprite2D::default(), Transform2D::default())
        .unwrap();
    let prepare = |realm: &mut Realm2DContext| {
        realm
            .prepare(&RealmPrepareContext {
                frame_id: 1,
                delta_time: 0.016,
                device: &device,
                queue: &queue,
                textures: &|_| None,
            })
            .unwrap()
    };
    prepare(&mut realm);
    assert!(
        realm
            .batch_builder
            .instances()
            .iter()
            .any(|item| item.uv_rect.to_array() == [0.0, 0.0, 1.0, 1.0])
    );
    let uv = [0.5, 0.25, 0.75, 0.75];
    realm.set_sprite_uv_rect(10, uv).unwrap();
    prepare(&mut realm);
    assert!(
        realm
            .batch_builder
            .instances()
            .iter()
            .any(|item| item.uv_rect.to_array() == uv)
    );
}

#[test]
fn sprite_panel_uv_changes_the_rendered_texture_region() {
    let _gpu_guard = crate::GPU_TEST_LOCK
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let _gpu_guard = crate::GPU_TEST_LOCK
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    use galfus_realm_2d_resources::ui::{
        Model2DUI, PanelNode, SpritePanelNode, UiCommand, UiDimension, UiLayoutStyle,
    };
    use galfus_realm_core::{Realm, RealmInvocationContext, RealmPrepareContext};
    let instance = wgpu::Instance::default();
    let Ok(adapter) = pollster::block_on(instance.request_adapter(&Default::default())) else {
        return;
    };
    let Ok((device, queue)) = pollster::block_on(adapter.request_device(&Default::default()))
    else {
        return;
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 2,
            height: 1,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        texture.as_image_copy(),
        &[255, 0, 0, 255, 0, 255, 0, 255],
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(8),
            rows_per_image: Some(1),
        },
        texture.size(),
    );
    let texture_view = texture.create_view(&Default::default());
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
    let mut ui = Model2DUI::new();
    let layout = UiLayoutStyle {
        width: UiDimension::Exact(64.0),
        height: UiDimension::Exact(64.0),
        ..Default::default()
    };
    ui.create_panel(1, PanelNode::default(), layout.clone())
        .unwrap();
    ui.create_sprite_panel(
        2,
        SpritePanelNode {
            texture_id: Some(42),
            sampler_index: 3,
            uv_rect: [0.0, 0.0, 0.5, 1.0],
            ..Default::default()
        },
        layout,
    )
    .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    let mut realm = Realm2DContext::new(1);
    realm
        .set_camera(1, crate::Camera2D::new(64.0, 0), Transform2D::default())
        .unwrap();
    realm.set_shadow_config(crate::Shadow2DConfig {
        ambient: 1.0,
        ..Default::default()
    });
    realm.create_ui(10, ui, Transform2D::default()).unwrap();
    let render = |realm: &mut Realm2DContext| {
        realm
            .prepare(&RealmPrepareContext {
                frame_id: 1,
                delta_time: 0.016,
                device: &device,
                queue: &queue,
                textures: &|id| (id == 42).then_some(&texture_view),
            })
            .unwrap();
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
        let offset = (32 * 64 + 32) * 4;
        let color = [data[offset], data[offset + 1], data[offset + 2]];
        drop(data);
        buffer.unmap();
        color
    };
    let before = render(&mut realm);
    assert!(before[0] > 200 && before[1] < 20, "{before:?}");
    realm
        .apply_ui_commands(
            10,
            &[UiCommand::SetSpriteUvRect {
                id: 2,
                uv_rect: [0.5, 0.0, 1.0, 1.0],
            }],
        )
        .unwrap();
    let after = render(&mut realm);
    assert!(after[1] > 200 && after[0] < 20, "{after:?}");
}
