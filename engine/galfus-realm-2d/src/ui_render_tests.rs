//! Rendering and transformation tests for UI geometry.

use crate::batch::BatchBuilder2D;
use crate::context_ui::UiManager2D;
use crate::ui_layout::solve_ui_layout;
use galfus_realm_2d_resources::Transform2D;
use galfus_realm_2d_resources::ui::{
    Model2DUI, PanelNode, SpritePanelNode, UiCommand, UiDimension, UiLayoutStyle, UiNodeKind,
};
use std::collections::HashMap;

fn create_test_font_db() -> (fontdb::Database, String) {
    let mut fonts = fontdb::Database::new();
    fonts.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
    let family = fonts
        .faces()
        .next()
        .and_then(|f| f.families.first().cloned())
        .map(|(name, _)| name)
        .unwrap_or_else(|| "sans-serif".to_string());
    (fonts, family)
}

#[test]
fn borders_use_independent_side_widths_and_colors() {
    let mut buffers = lyon_tessellation::VertexBuffers::new();
    crate::ui_borders::append_borders(
        &mut buffers,
        [0.0, 0.0, 100.0, 100.0],
        [0.0; 4],
        [2.0, 0.0, 6.0, 0.0],
        [
            [1.0, 0.0, 0.0, 1.0],
            [0.0; 4],
            [0.0, 1.0, 0.0, 1.0],
            [0.0; 4],
        ],
        0.0,
    );
    assert!(!buffers.indices.is_empty());
    let mut top = 0;
    let mut bottom = 0;
    for vertex in &buffers.vertices {
        if vertex[5] == 1.0 {
            top += 1;
            assert!(vertex[1] >= 98.0 && vertex[1] <= 100.0);
        } else if vertex[6] == 1.0 {
            bottom += 1;
            assert!(vertex[1] >= 0.0 && vertex[1] <= 6.0);
        } else {
            panic!("disabled sides should not generate vertices");
        }
    }
    assert!(top > 0 && bottom > 0);
}

#[test]
fn tree_batches_preserve_sprite_order_and_rebuild_only_changed_node() {
    use galfus_realm_core::{Realm, RealmInvocationContext, RealmPrepareContext};
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
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 1,
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
        &[255, 255, 255, 255],
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(4),
            rows_per_image: Some(1),
        },
        texture.size(),
    );
    let texture_view = texture.create_view(&Default::default());
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(100.0),
            height: UiDimension::Exact(100.0),
            ..Default::default()
        },
    )
    .unwrap();
    let size = UiLayoutStyle {
        width: UiDimension::Exact(20.0),
        height: UiDimension::Exact(20.0),
        ..Default::default()
    };
    ui.create_sprite_panel(
        2,
        SpritePanelNode {
            panel: PanelNode {
                border_width: [2.0; 4],
                border_color: [1.0; 4],
                ..Default::default()
            },
            texture_id: Some(42),
            ..Default::default()
        },
        size.clone(),
    )
    .unwrap();
    ui.create_panel(3, PanelNode::default(), size).unwrap();
    ui.insert_child(1, 2, None).unwrap();
    ui.insert_child(1, 3, None).unwrap();
    let mut realm = crate::context::Realm2DContext::new(1);
    realm
        .set_camera(1, crate::Camera2D::new(100.0, 0), Transform2D::default())
        .unwrap();
    realm.set_shadow_config(crate::Shadow2DConfig {
        ambient: 1.0,
        ..Default::default()
    });
    realm.create_ui(10, ui, Transform2D::default()).unwrap();
    let prepare = |realm: &mut crate::context::Realm2DContext| {
        realm
            .prepare(&RealmPrepareContext {
                frame_id: 1,
                delta_time: 0.016,
                device: &device,
                queue: &queue,
                textures: &|id| (id == 42).then_some(&texture_view),
            })
            .unwrap()
    };
    prepare(&mut realm);
    let geometries: Vec<_> = realm
        .batch_builder
        .ranges()
        .iter()
        .map(|range| range.key.geometry_id)
        .collect();
    assert_eq!(
        geometries.len(),
        5,
        "root, sprite background, sprite image, border, and following panel"
    );
    assert_ne!(geometries[0], 0);
    assert_ne!(geometries[1], 0);
    assert_eq!(geometries[2], 0);
    assert_ne!(geometries[3], 0);
    assert_ne!(geometries[4], 0);
    assert!(
        realm
            .ui_manager
            .get_geometry_by_u64(geometries[0])
            .is_some()
    );
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
    let readback = device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: 64 * 64 * 4,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut encoder = device.create_command_encoder(&Default::default());
    encoder.copy_texture_to_buffer(
        output.as_image_copy(),
        wgpu::TexelCopyBufferInfo {
            buffer: &readback,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(256),
                rows_per_image: Some(64),
            },
        },
        output.size(),
    );
    queue.submit([encoder.finish()]);
    let slice = readback.slice(..);
    let (sender, receiver) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |result| {
        sender.send(result).unwrap()
    });
    device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
    receiver.recv().unwrap().unwrap();
    let data = slice.get_mapped_range();
    let pixel = &data[(6 * 64 + 6) * 4..(6 * 64 + 6) * 4 + 4];
    assert!(
        pixel[0] > 220 && pixel[1] > 220 && pixel[2] > 220,
        "sprite should appear over its panel: {pixel:?}"
    );
    drop(data);
    readback.unmap();
    let before: Vec<_> = (1..=3)
        .map(|id| realm.ui_manager.node_upload_count(10, id))
        .collect();
    let changed = PanelNode {
        background_color: [1.0, 0.0, 0.0, 1.0],
        ..Default::default()
    };
    realm
        .apply_ui_commands(
            10,
            &[UiCommand::SetKind {
                id: 3,
                kind: UiNodeKind::Panel(changed),
            }],
        )
        .unwrap();
    prepare(&mut realm);
    let after: Vec<_> = (1..=3)
        .map(|id| realm.ui_manager.node_upload_count(10, id))
        .collect();
    assert_eq!(after, vec![before[0], before[1], before[2] + 1]);
    prepare(&mut realm);
    assert_eq!(realm.ui_manager.node_upload_count(10, 3), after[2]);
    realm.destroy_ui(10).unwrap();
    assert!(
        realm
            .ui_manager
            .get_geometry_by_u64(geometries[0])
            .is_none()
    );
}

#[test]
fn sprite_centers_follow_model_scale_then_rotation() {
    let (fonts, family) = create_test_font_db();
    let mut ui = Model2DUI::new();
    let transparent = PanelNode {
        background_color: [0.0; 4],
        ..Default::default()
    };
    ui.create_panel(
        1,
        transparent.clone(),
        UiLayoutStyle {
            width: UiDimension::Exact(100.0),
            height: UiDimension::Exact(100.0),
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_sprite_panel(
        2,
        SpritePanelNode {
            panel: transparent,
            texture_id: Some(42),
            ..Default::default()
        },
        UiLayoutStyle {
            width: UiDimension::Exact(20.0),
            height: UiDimension::Exact(10.0),
            position_offset: Some([60.0, 0.0]),
            ..Default::default()
        },
    )
    .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    solve_ui_layout(&mut ui, &fonts, &family, 100.0, 100.0);
    let transform = Transform2D {
        position: glam::Vec2::new(10.0, 20.0),
        scale: glam::Vec2::new(2.0, 3.0),
        rotation: std::f32::consts::FRAC_PI_2,
        ..Default::default()
    };
    let mut builder = BatchBuilder2D::new();
    UiManager2D::new().push_batches(&HashMap::from([(10, (ui, transform))]), &mut builder);
    builder.build();
    let center = builder.instances()[0].model_matrix.w_axis;
    assert!((center.x + 125.0).abs() < 0.001);
    assert!((center.y - 60.0).abs() < 0.001);
}
