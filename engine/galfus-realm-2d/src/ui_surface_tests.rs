use crate::Realm2DContext;
use galfus_realm_2d_resources::Transform2D;
use galfus_realm_2d_resources::ui::{
    Model2DUI, PanelNode, SpriteImageMode, SpritePanelNode, UiDimension, UiLayoutStyle,
};
use galfus_realm_core::Realm;
use glam::Vec2;

fn surface(mode: SpriteImageMode, uv: [f32; 4]) -> Realm2DContext {
    let mut realm = Realm2DContext::new(1);
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode::default(),
        UiLayoutStyle {
            width: UiDimension::Exact(100.0),
            height: UiDimension::Exact(100.0),
            is_stack: true,
            ..Default::default()
        },
    )
    .unwrap();
    ui.create_sprite_panel(
        2,
        SpritePanelNode {
            texture_id: Some(7),
            image_mode: mode,
            uv_rect: uv,
            ..Default::default()
        },
        UiLayoutStyle {
            width: UiDimension::Exact(80.0),
            height: UiDimension::Exact(80.0),
            position_offset: Some([10.0, 10.0]),
            ..Default::default()
        },
    )
    .unwrap();
    ui.insert_child(1, 2, None).unwrap();
    crate::ui_layout::solve_ui_layout(
        &mut ui,
        realm.font_db(),
        realm.default_font_family(),
        100.0,
        100.0,
    );
    realm
        .create_ui(10, ui, Transform2D::from_translation(Vec2::new(50.0, 20.0)))
        .unwrap();
    realm
}

#[test]
fn ui_surface_maps_stretch_contain_cover_and_flipped_uvs() {
    let stretch = surface(SpriteImageMode::Stretch, [0.0, 0.0, 1.0, 1.0]);
    assert_eq!(stretch.ui_surface_texture(10, 2), Some(7));
    assert_eq!(
        stretch.ui_surface_uv(10, 2, Vec2::new(30.0, 40.0), [200, 100]),
        Some(Vec2::splat(0.25))
    );
    let contain = surface(SpriteImageMode::Contain, [0.0, 0.0, 1.0, 1.0]);
    assert_eq!(
        contain.ui_surface_uv(10, 2, Vec2::new(30.0, 45.0), [200, 100]),
        None
    );
    assert_eq!(
        contain.ui_surface_uv(10, 2, Vec2::new(50.0, 20.0), [200, 100]),
        Some(Vec2::splat(0.5))
    );
    let cover = surface(SpriteImageMode::Cover, [0.0, 0.0, 1.0, 1.0]);
    assert_eq!(
        cover.ui_surface_uv(10, 2, Vec2::new(30.0, 40.0), [200, 100]),
        Some(Vec2::new(0.375, 0.25))
    );
    let flip = surface(SpriteImageMode::Stretch, [1.0, 1.0, 0.0, 0.0]);
    assert_eq!(
        flip.ui_surface_uv(10, 2, Vec2::new(30.0, 40.0), [200, 100]),
        Some(Vec2::splat(0.75))
    );
    let nine = surface(SpriteImageMode::NineSlice, [0.0, 0.0, 1.0, 1.0]);
    assert_eq!(nine.ui_surface_texture(10, 2), None);
}
