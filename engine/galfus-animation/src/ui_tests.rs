//! UI transition target application tests.

use std::collections::HashMap;

use crate::{AnimValue, AnimationTarget, apply_target_value};
use galfus_realm_2d::Realm2DContext;
use galfus_realm_2d_resources::Transform2D;
use galfus_realm_2d_resources::ui::{Model2DUI, PanelNode, UiDirtyFlags, UiLayoutStyle};

#[test]
fn border_transitions_change_only_the_requested_property() {
    let mut ui = Model2DUI::new();
    ui.create_panel(
        1,
        PanelNode {
            border_color: [0.0, 0.0, 0.0, 1.0],
            ..Default::default()
        },
        UiLayoutStyle::default(),
    )
    .unwrap();
    let mut realm = Realm2DContext::new(2);
    realm.create_ui(10, ui, Transform2D::default()).unwrap();
    let mut multiverse = galfus_multiverse::MultiverseContext::new();
    multiverse.register_realm(Box::new(realm)).unwrap();
    let mut custom = HashMap::new();
    let side = AnimationTarget::UiElementBorderSideColor {
        realm_id: 2,
        ui_id: 10,
        element_id: 1,
        side: 1,
    };
    let color = AnimValue::Vec4(glam::Vec4::new(1.0, 0.0, 0.0, 1.0));
    apply_target_value(&side, &color, &mut multiverse, &mut custom).unwrap();
    let realm = multiverse.get_realm_mut::<Realm2DContext>(2).unwrap();
    let ui = &mut realm.uis.get_mut(&10).unwrap().0;
    let panel = ui.nodes[&1].kind.as_panel().unwrap();
    assert_eq!(panel.border_colors.unwrap()[1], [1.0, 0.0, 0.0, 1.0]);
    assert_eq!(panel.border_colors.unwrap()[0], [0.0, 0.0, 0.0, 1.0]);
    ui.dirty_flags.clear();
    realm.dirty = false;
    apply_target_value(&side, &color, &mut multiverse, &mut custom).unwrap();
    let realm = multiverse.get_realm_mut::<Realm2DContext>(2).unwrap();
    assert!(!realm.dirty);
    assert!(realm.uis[&10].0.dirty_flags.is_empty());
    let width = AnimationTarget::UiElementBorderWidth {
        realm_id: 2,
        ui_id: 10,
        element_id: 1,
    };
    apply_target_value(
        &width,
        &AnimValue::Vec4(glam::Vec4::new(1.0, 2.0, 3.0, 4.0)),
        &mut multiverse,
        &mut custom,
    )
    .unwrap();
    let ui = &multiverse.get_realm_mut::<Realm2DContext>(2).unwrap().uis[&10].0;
    assert_eq!(
        ui.nodes[&1].kind.as_panel().unwrap().border_width,
        [1.0, 2.0, 3.0, 4.0]
    );
    assert!(ui.dirty_flags[&1].contains(UiDirtyFlags::PAINT));
}
