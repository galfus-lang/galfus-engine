//! Tests for UI batch generation, legacy quads backward compatibility, and text run vertex bounds.

use std::collections::HashMap;

use galfus_realm_2d_resources::Transform2D;
use galfus_realm_2d_resources::ui::{Model2DUI, TextNode};

use crate::batch::BatchBuilder2D;
use crate::context_ui::UiManager2D;
use crate::ui_tests::create_test_font_db;

#[test]
fn test_ui_legacy_quads_backward_compatibility() {
    let (_font_db, _font_fam) = create_test_font_db();
    let mut ui = Model2DUI::new();

    // Legacy quad
    ui.quads.push(galfus_realm_2d_resources::ui::UiQuad2D {
        rect: [0.0, 0.0, 120.0, 60.0],
        z_layer: 0.0,
        border_radius: [0.0; 4],
        border_width: [2.0; 4],
        background_color: [0.1, 0.2, 0.3, 1.0],
        border_color: [1.0, 1.0, 1.0, 1.0],
        texture_id: None,
        uv_rect: [0.0, 0.0, 1.0, 1.0],
        sampler_index: 0,
        tint_color: [1.0; 4],
        clip_rect: None,
    });

    let mut uis = HashMap::new();
    uis.insert(10, (ui, Transform2D::default()));

    let manager = UiManager2D::new();
    let mut batch_builder = BatchBuilder2D::new();

    manager.push_batches(&uis, &mut batch_builder);
    batch_builder.build();

    let instances = batch_builder.instances();
    // 1 background quad + 4 border edges = 5 instances
    assert_eq!(instances.len(), 5);
}

#[test]
fn test_ui_legacy_sync_gpu_and_batch() {
    let instance = wgpu::Instance::default();
    let Ok(adapter) = pollster::block_on(instance.request_adapter(&Default::default())) else {
        return;
    };
    let Ok((device, queue)) = pollster::block_on(adapter.request_device(&Default::default()))
    else {
        return;
    };
    let fonts = crate::ui_fonts::UiFontLibrary::default();
    let mut ui = Model2DUI::new();
    ui.quads.push(galfus_realm_2d_resources::ui::UiQuad2D {
        rect: [0.0, 0.0, 1120.0, 700.0],
        z_layer: 0.0,
        border_radius: [12.0; 4],
        border_width: [1.5; 4],
        background_color: [0.03, 0.06, 0.09, 1.0],
        border_color: [0.11, 0.19, 0.29, 1.0],
        texture_id: None,
        uv_rect: [0.0, 0.0, 1.0, 1.0],
        sampler_index: 0,
        tint_color: [1.0; 4],
        clip_rect: None,
    });
    ui.texts.push(galfus_realm_2d_resources::ui::UiText2D {
        position: [100.0, 28.5],
        z_layer: 0.0,
        font_size: 13.0,
        color: [0.94, 0.96, 1.0, 1.0],
        text: "UI2 — MODEL2DUI NATIVE".into(),
        clip_rect: None,
    });
    let mut uis = HashMap::new();
    uis.insert(10, (ui, Transform2D::default()));
    let mut manager = UiManager2D::new();
    let mut mat_bgs = HashMap::new();
    let dummy_texture = device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 1,
            height: 1,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        usage: wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    let dummy_view = dummy_texture.create_view(&Default::default());
    let samplers = galfus_gpu_manager::StandardSamplers::new(&device);
    let pipeline_mgr = crate::pipeline::PipelineManager2D::new(&device);

    manager.sync_gpu(
        &device,
        &queue,
        &pipeline_mgr.material_bind_group_layout,
        &samplers,
        &dummy_view,
        &dummy_view,
        &dummy_view,
        &|_| None,
        &uis,
        &mut mat_bgs,
        &fonts,
    );

    let mut batch_builder = BatchBuilder2D::new();
    manager.push_batches(&uis, &mut batch_builder);
    batch_builder.build();
    let instances = batch_builder.instances();
    let ranges = batch_builder.ranges();
    assert_eq!(ranges.len(), 1);
    assert_eq!(instances.len(), 1);
    let geom = manager.get_geometry_by_u64(ranges[0].key.geometry_id);
    assert!(geom.is_some());
    assert!(geom.unwrap().index_count > 0);
}

#[test]
fn test_ui_text_run_vertex_bounds() {
    let (font_db, font_fam) = create_test_font_db();
    crate::ui_text::with_font_face(&font_db, None, &font_fam, |face| {
        let units = face.units_per_em() as f32;
        let scale = 12.0 / units;
        println!(
            "Ascender: {}, Descender: {}, Units: {}",
            face.ascender(),
            face.descender(),
            face.units_per_em()
        );
        let text = "[00:001] Native Model2DUI quads & texts compiled to GPU";
        let mut cur_x = 0.0f32;
        for c in text.chars() {
            let gid = face.glyph_index(c);
            let adv = gid.and_then(|g| face.glyph_hor_advance(g)).unwrap_or(0) as f32 * scale;
            let bbox = gid.and_then(|g| face.glyph_bounding_box(g));
            if let Some(bb) = bbox {
                let x0 = cur_x + bb.x_min as f32 * scale;
                let x1 = cur_x + bb.x_max as f32 * scale;
                println!(
                    "Char: '{c}', cur_x: {:.2}, bbox_x: [{:.2}, {:.2}], adv: {:.2}",
                    cur_x, x0, x1, adv
                );
            } else {
                println!(
                    "Char: '{c}' (NO BBOX), cur_x: {:.2}, adv: {:.2}",
                    cur_x, adv
                );
            }
            cur_x += adv;
        }
    });

    let mut buffers: lyon_tessellation::VertexBuffers<crate::vector_geometry::VectorVertex, u32> =
        lyon_tessellation::VertexBuffers::new();

    let text_node = TextNode {
        text: "Hello World".into(),
        font_size: 20.0,
        color: [1.0, 1.0, 1.0, 1.0],
        ..Default::default()
    };

    crate::ui_text::tessellate_text_run(
        &mut buffers,
        &font_db,
        &font_fam,
        &text_node,
        100.0,
        50.0,
        200.0,
        30.0,
        800.0,
        600.0,
        0.001,
        1.0,
        None,
    );

    assert!(!buffers.vertices.is_empty(), "Text should produce vertices");
    let mut min_x = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for v in &buffers.vertices {
        min_x = min_x.min(v[0]);
        max_x = max_x.max(v[0]);
        min_y = min_y.min(v[1]);
        max_y = max_y.max(v[1]);
    }
    println!(
        "Text vertices count: {}, bounds: X: [{}, {}], Y: [{}, {}]",
        buffers.vertices.len(),
        min_x,
        max_x,
        min_y,
        max_y
    );
    let height = max_y - min_y;
    assert!(
        (10.0..=30.0).contains(&height),
        "Text height should be roughly font_size (20), but got: {height}"
    );
}
