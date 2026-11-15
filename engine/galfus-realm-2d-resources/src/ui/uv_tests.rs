use super::*;

#[test]
fn sprite_panel_uv_update_is_atomic_and_only_marks_paint() {
    let mut ui = Model2DUI::new();
    ui.create_panel(1, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    let sprite = SpritePanelNode {
        texture_id: Some(42),
        tint_color: [0.2, 0.3, 0.4, 0.5],
        ..Default::default()
    };
    ui.create_sprite_panel(2, sprite.clone(), UiLayoutStyle::default())
        .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    ui.dirty_flags.clear();
    let uv = [1.5, -0.2, 0.0, 1.0];
    ui.apply_commands(&[UiCommand::SetSpriteUvRect { id: 2, uv_rect: uv }])
        .unwrap();
    let UiNodeKind::SpritePanel(updated) = &ui.nodes[&2].kind else {
        panic!("not sprite")
    };
    let mut expected = sprite;
    expected.uv_rect = uv;
    assert_eq!(updated, &expected);
    assert_eq!(ui.dirty_flags[&2].0, UiDirtyFlags::PAINT);
    let previous = ui.clone();
    assert!(
        ui.apply_commands(&[
            UiCommand::SetSpriteUvRect {
                id: 2,
                uv_rect: [0.0; 4]
            },
            UiCommand::SetSpriteUvRect {
                id: 1,
                uv_rect: [0.0; 4]
            }
        ])
        .is_err()
    );
    assert_eq!(ui, previous);
    assert!(
        ui.apply_commands(&[UiCommand::SetSpriteUvRect {
            id: 2,
            uv_rect: [f32::NAN, 0.0, 1.0, 1.0]
        }])
        .is_err()
    );
    assert!(
        ui.apply_commands(&[UiCommand::SetSpriteUvRect {
            id: u32::MAX,
            uv_rect: [0.0; 4]
        }])
        .is_err()
    );
    assert!(
        ui.apply_commands(&[UiCommand::SetSpriteUvRect {
            id: 999,
            uv_rect: [0.0; 4]
        }])
        .is_err()
    );
    assert_eq!(ui, previous);
}
