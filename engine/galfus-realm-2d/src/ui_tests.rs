//! Comprehensive tests for Phase 1 to Phase 4 UI tree, layout, text, and batch rendering.

use galfus_realm_2d_resources::Transform2D;
use galfus_realm_2d_resources::ui::{
    Model2DUI, PanelNode, SpriteImageMode, SpritePanelNode, TextNode, TextWrapMode, UiDimension,
    UiDirtyFlags, UiLayoutDirection, UiLayoutStyle,
};
use std::collections::HashMap;

use crate::batch::BatchBuilder2D;
use crate::context_ui::UiManager2D;
use crate::ui_layout::solve_ui_layout;
use crate::ui_text::measure_text;

#[test]
fn invalid_transport_tree_does_not_replace_existing_ui() {
    let mut realm = crate::context::Realm2DContext::new(1);
    let mut ui = Model2DUI::new();
    ui.create_panel(1, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    realm
        .create_ui(7, ui.clone(), Transform2D::default())
        .unwrap();

    let mut invalid = ui.clone();
    invalid.nodes.get_mut(&1).unwrap().children.push(999);
    assert!(realm.set_ui_content(7, invalid.clone()).is_err());
    assert_eq!(realm.uis[&7].0, ui);
    assert!(realm.create_ui(8, invalid, Transform2D::default()).is_err());
    assert!(!realm.uis.contains_key(&8));
}

#[test]
fn clipping_cuts_partial_triangles_without_creating_panel_edges() {
    let mut buffers = lyon_tessellation::VertexBuffers::new();
    crate::ui_text::tessellate_rounded_panel(
        &mut buffers,
        -50.0,
        -50.0,
        100.0,
        100.0,
        [0.0; 4],
        [0.0; 4],
        [1.0; 4],
        [2.0; 4],
        0.0,
    );
    // Keep the central strip. It intersects only the original top and bottom borders.
    crate::ui_clip::clip_new_geometry(
        &mut buffers,
        0,
        Some([40.0, 0.0, 20.0, 100.0]),
        100.0,
        100.0,
    );
    assert!(!buffers.indices.is_empty());
    for &index in &buffers.indices {
        let v = buffers.vertices[index as usize];
        assert!((-10.001..=10.001).contains(&v[0]));
        assert!(
            v[1].abs() >= 47.0,
            "clipping must not invent vertical borders: {v:?}"
        );
    }
}

#[test]
fn clipping_preserves_partially_visible_text() {
    let (font_db, family) = create_test_font_db();
    let node = TextNode {
        text: "Hello".into(),
        font_size: 30.0,
        ..Default::default()
    };
    let mut full = lyon_tessellation::VertexBuffers::new();
    crate::ui_text::tessellate_text_run(
        &mut full, &font_db, &family, &node, 0.0, 0.0, 100.0, 50.0, 100.0, 100.0, 0.0, 1.0, None,
    );
    let mut clipped = lyon_tessellation::VertexBuffers::new();
    crate::ui_text::tessellate_text_run(
        &mut clipped,
        &font_db,
        &family,
        &node,
        0.0,
        0.0,
        100.0,
        50.0,
        100.0,
        100.0,
        0.0,
        1.0,
        Some([0.0, 0.0, 10.0, 100.0]),
    );
    assert!(!full.indices.is_empty());
    assert!(
        !clipped.indices.is_empty(),
        "a partially visible glyph must remain visible"
    );
    for &index in &clipped.indices {
        let x = clipped.vertices[index as usize][0];
        assert!((-50.001..=-39.999).contains(&x));
    }
}

pub(crate) fn create_test_font_db() -> (fontdb::Database, String) {
    let mut db = fontdb::Database::new();
    db.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
    let default_family = db
        .faces()
        .next()
        .and_then(|f| f.families.first().cloned())
        .map(|(fam, _)| fam)
        .unwrap_or_else(|| "sans-serif".to_string());
    (db, default_family)
}

#[test]
fn auto_sized_panel_clips_children_to_final_bounds() {
    let (fonts, family) = create_test_font_db();
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode {
            clip: true,
            ..Default::default()
        },
        UiLayoutStyle {
            min_width: Some(20.0),
            min_height: Some(10.0),
            padding: [2.0; 4],
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_panel(
        2,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(80.0),
            height: UiDimension::Exact(30.0),
            ..Default::default()
        },
    )
    .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    solve_ui_layout(&mut ui, &fonts, &family, 200.0, 200.0);
    assert_eq!(ui.computed[&1].absolute_rect, [0.0, 0.0, 84.0, 34.0]);
    assert_eq!(ui.computed[&2].clip_rect, Some([0.0, 0.0, 84.0, 34.0]));
    ui.damage_regions.clear();
    solve_ui_layout(&mut ui, &fonts, &family, 200.0, 200.0);
    assert!(
        ui.damage_regions.is_empty(),
        "unchanged clips must not trigger damage"
    );
}

#[test]
fn hidden_parent_disables_descendant_hit_testing() {
    let (fonts, family) = create_test_font_db();
    let mut ui = Model2DUI::new();
    let size = UiLayoutStyle {
        width: UiDimension::Exact(50.0),
        height: UiDimension::Exact(50.0),
        ..Default::default()
    };
    ui.create_panel(1, PanelNode::default(), size.clone())
        .unwrap();
    ui.create_panel(2, PanelNode::default(), size.clone())
        .unwrap();
    ui.create_panel(3, PanelNode::default(), size).unwrap();
    ui.insert_child(1, 2, None).unwrap();
    ui.insert_child(2, 3, None).unwrap();
    solve_ui_layout(&mut ui, &fonts, &family, 50.0, 50.0);
    assert_eq!(ui.pick_panel([10.0, 10.0]), Some(3));
    ui.nodes.get_mut(&2).unwrap().visible = false;
    assert_eq!(ui.pick_panel([10.0, 10.0]), Some(1));
}

#[test]
fn explicit_zero_text_width_is_not_replaced_by_intrinsic_width() {
    let (fonts, family) = create_test_font_db();
    let mut ui = Model2DUI::new();
    ui.create_text(
        1,
        TextNode {
            text: "Hello".into(),
            ..Default::default()
        },
        UiLayoutStyle {
            width: UiDimension::Exact(0.0),
            ..Default::default()
        },
    )
    .unwrap();
    solve_ui_layout(&mut ui, &fonts, &family, 100.0, 100.0);
    assert_eq!(ui.computed[&1].absolute_rect[2], 0.0);
}

#[test]
fn test_ui_tree_layout_flex_row_and_column() {
    let (font_db, font_fam) = create_test_font_db();
    let mut ui = Model2DUI::new();

    // Container panel (width: 200, height: 100, padding: 10, gap: 5, Row)
    let container_style = UiLayoutStyle {
        width: UiDimension::Exact(200.0),
        height: UiDimension::Exact(100.0),
        padding: [10.0, 10.0, 10.0, 10.0],
        gap: [5.0, 5.0],
        direction: UiLayoutDirection::Row,
        ..Default::default()
    };
    ui.create_panel(1, PanelNode::default(), container_style)
        .unwrap();

    // Child 1: 50x40
    let child1_style = UiLayoutStyle {
        width: UiDimension::Exact(50.0),
        height: UiDimension::Exact(40.0),
        ..Default::default()
    };
    ui.create_panel(2, PanelNode::default(), child1_style)
        .unwrap();

    // Child 2: 60x40
    let child2_style = UiLayoutStyle {
        width: UiDimension::Exact(60.0),
        height: UiDimension::Exact(40.0),
        ..Default::default()
    };
    ui.create_panel(3, PanelNode::default(), child2_style)
        .unwrap();

    ui.insert_child(1, 2, None).unwrap();
    ui.insert_child(1, 3, None).unwrap();

    solve_ui_layout(&mut ui, &font_db, &font_fam, 800.0, 600.0);

    let c1 = &ui.computed[&2];
    let c2 = &ui.computed[&3];

    // Child 1 starts at container padding (10, 10)
    assert_eq!(c1.local_rect, [0.0, 0.0, 50.0, 40.0]);
    assert_eq!(c1.absolute_rect, [10.0, 10.0, 50.0, 40.0]);

    // Child 2 is offset by child 1 width (50) + gap (5) = 55 in Row direction
    assert_eq!(c2.absolute_rect, [65.0, 10.0, 60.0, 40.0]);
}

#[test]
fn test_ui_native_text_measurement_and_wrapping() {
    let (font_db, font_fam) = create_test_font_db();

    let text_node = TextNode {
        text: "The quick brown fox jumps over the lazy dog".to_string(),
        font_size: 16.0,
        wrap: TextWrapMode::WordWrap,
        ..Default::default()
    };

    // Measure with tight width constraint (e.g. 100px)
    let measured = measure_text(&font_db, &font_fam, &text_node, Some(100.0));
    assert!(
        measured.lines.len() > 1,
        "Text should wrap into multiple lines"
    );
    assert!(measured.height > 16.0);
    for line in &measured.lines {
        assert!(
            line.width <= 120.0,
            "Wrapped lines should respect approximate bound"
        );
    }
}

#[test]
fn test_ui_nested_clipping_and_composite_opacity() {
    let (font_db, font_fam) = create_test_font_db();
    let mut ui = Model2DUI::new();

    // Parent panel: bounds 0..100, 0..100, clip: true, opacity: 0.5
    let parent = PanelNode {
        opacity: 0.5,
        clip: true,
        ..Default::default()
    };
    let parent_style = UiLayoutStyle {
        width: UiDimension::Exact(100.0),
        height: UiDimension::Exact(100.0),
        ..Default::default()
    };
    ui.create_panel(1, parent, parent_style).unwrap();

    // Child panel: offset at 60, 60, size 80x80, opacity: 0.5
    let child = PanelNode {
        opacity: 0.5,
        ..Default::default()
    };
    let child_style = UiLayoutStyle {
        width: UiDimension::Exact(80.0),
        height: UiDimension::Exact(80.0),
        position_offset: Some([60.0, 60.0]),
        ..Default::default()
    };
    ui.create_panel(2, child, child_style).unwrap();
    ui.insert_child(1, 2, None).unwrap();

    solve_ui_layout(&mut ui, &font_db, &font_fam, 800.0, 600.0);

    let child_computed = &ui.computed[&2];

    // Opacity compounding: 0.5 * 0.5 = 0.25
    assert!((child_computed.accumulated_opacity - 0.25).abs() < 1e-4);

    // Scissor clipping: child inherits parent's scissor rect [0, 0, 100, 100]
    assert_eq!(child_computed.clip_rect, Some([0.0, 0.0, 100.0, 100.0]));

    // When applied to the child quad at [60, 60, 80, 80], the clipped visible rect is [60, 60, 40, 40]
    let clip = child_computed.clip_rect.unwrap();
    let visible_rect = crate::ui_layout::intersect_rects(child_computed.absolute_rect, clip);
    assert_eq!(visible_rect, [60.0, 60.0, 40.0, 40.0]);
}

#[test]
fn test_ui_damage_regions_tracking() {
    let (font_db, font_fam) = create_test_font_db();
    let mut ui = Model2DUI::new();

    let style = UiLayoutStyle {
        width: UiDimension::Exact(100.0),
        height: UiDimension::Exact(50.0),
        ..Default::default()
    };
    ui.create_panel(1, PanelNode::default(), style).unwrap();
    solve_ui_layout(&mut ui, &font_db, &font_fam, 800.0, 600.0);

    // Initial damage recorded
    assert!(!ui.damage_regions.is_empty());
    ui.damage_regions.clear();

    // Modify size: width from 100 to 150
    ui.nodes.get_mut(&1).unwrap().layout.width = UiDimension::Exact(150.0);
    ui.mark_dirty(1, UiDirtyFlags::LAYOUT);

    solve_ui_layout(&mut ui, &font_db, &font_fam, 800.0, 600.0);

    // Damage regions should record both old bounds [0, 0, 100, 50] and new bounds [0, 0, 150, 50]
    assert_eq!(ui.damage_regions.len(), 2);
    assert_eq!(ui.damage_regions[0], [0.0, 0.0, 100.0, 50.0]);
    assert_eq!(ui.damage_regions[1], [0.0, 0.0, 150.0, 50.0]);
}

#[test]
fn test_ui_nine_slice_and_batch_generation() {
    let (font_db, font_fam) = create_test_font_db();
    let mut ui = Model2DUI::new();

    // Create 9-slice sprite panel with transparent background
    let sprite = SpritePanelNode {
        panel: PanelNode {
            background_color: [0.0; 4],
            ..Default::default()
        },
        texture_id: Some(42),
        slice_border: [10.0, 10.0, 10.0, 10.0],
        image_mode: SpriteImageMode::NineSlice,
        ..Default::default()
    };
    let style = UiLayoutStyle {
        width: UiDimension::Exact(100.0),
        height: UiDimension::Exact(100.0),
        ..Default::default()
    };
    ui.create_sprite_panel(1, sprite, style).unwrap();

    solve_ui_layout(&mut ui, &font_db, &font_fam, 800.0, 600.0);

    let mut uis = HashMap::new();
    uis.insert(10, (ui, Transform2D::default()));

    let manager = UiManager2D::new();
    let mut batch_builder = BatchBuilder2D::new();

    manager.push_batches(&uis, &mut batch_builder);
    batch_builder.build();

    // NineSlice should push 9 sub-quad instances for the textured frame
    let instances = batch_builder.instances();
    assert_eq!(
        instances.len(),
        9,
        "NineSlice must emit exactly 9 quad instances"
    );
}

#[test]
fn clipped_sprites_keep_original_texture_coordinates() {
    let (fonts, family) = create_test_font_db();
    for mode in [SpriteImageMode::Stretch, SpriteImageMode::NineSlice] {
        let mut ui = Model2DUI::new();
        let transparent = PanelNode {
            background_color: [0.0; 4],
            clip: true,
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
                image_mode: mode,
                slice_border: [10.0; 4],
                ..Default::default()
            },
            UiLayoutStyle {
                width: UiDimension::Exact(80.0),
                height: UiDimension::Exact(80.0),
                position_offset: Some([70.0, 0.0]),
                ..Default::default()
            },
        )
        .unwrap();
        ui.insert_child(1, 2, None).unwrap();
        solve_ui_layout(&mut ui, &fonts, &family, 100.0, 100.0);
        let mut builder = BatchBuilder2D::new();
        let mut manager = UiManager2D::new();
        manager.set_test_texture_size(42, [80.0, 80.0]);
        manager.push_batches(
            &HashMap::from([(10, (ui, Transform2D::default()))]),
            &mut builder,
        );
        builder.build();
        let instances = builder.instances();
        assert_eq!(
            instances.len(),
            if mode == SpriteImageMode::NineSlice {
                6
            } else {
                1
            }
        );
        let max_u = instances
            .iter()
            .map(|instance| instance.uv_rect.z)
            .fold(0.0f32, f32::max);
        assert!(
            (max_u - 0.375).abs() < 0.0001,
            "cropping must retain the visible part of the source image"
        );
        assert!(instances.iter().all(|instance| instance.tint.w == 1.0));
    }
}
