use super::{UiFontFamily, UiFontLibrary};
use galfus_realm_2d_resources::ui::TextNode;
use std::collections::BTreeMap;

#[test]
fn removal_requires_unreferenced_families_and_groups() {
    use galfus_realm_2d_resources::{
        Transform2D,
        ui::{Model2DUI, PanelNode, UiLayoutStyle},
    };
    let mut realm = crate::Realm2DContext::new(1);
    let regular = include_bytes!("../tests/fixtures/NotoSans-Test-Regular.ttf").as_slice();
    realm.register_font_group("Extra", &[regular]).unwrap();
    realm
        .set_font_family(
            "display",
            UiFontFamily {
                groups: vec!["Extra".into()],
                axes: BTreeMap::new(),
            },
        )
        .unwrap();
    let mut ui = Model2DUI::new();
    ui.create_panel(1, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    ui.create_text(
        2,
        TextNode {
            font_family: Some("display".into()),
            ..Default::default()
        },
        UiLayoutStyle::default(),
    )
    .unwrap();
    realm.create_ui(7, ui, Transform2D::default()).unwrap();
    assert!(realm.remove_font_family("display").is_err());
    assert!(realm.remove_font_group("Extra").is_err());
    assert!(realm.remove_font_family("default").is_err());
    assert!(realm.remove_font_group("Noto Sans").is_err());
    assert!(realm.remove_font_family("missing").is_err());
    assert!(realm.remove_font_group("missing").is_err());
    realm.destroy_ui(7).unwrap();
    realm.remove_font_family("display").unwrap();
    let previous = realm.font_db().faces().count();
    realm.remove_font_group("Extra").unwrap();
    assert_eq!(realm.font_db().faces().count(), previous - 1);
}

#[test]
fn family_configuration_is_ordered_and_validated_atomically() {
    let mut library = UiFontLibrary::default();
    let mut other = UiFontLibrary::default();
    let bold = include_bytes!("../tests/fixtures/NotoSans-Test-Bold.ttf").as_slice();
    library.register_group("Icons", &[bold]).unwrap();
    let config = UiFontFamily {
        groups: vec!["Noto Sans".into(), "Icons".into()],
        axes: BTreeMap::from([("wdth".into(), 90.0)]),
    };
    library.set_family("display", config.clone()).unwrap();
    assert_eq!(library.family("display"), Some(&config));
    let faces = library.family_faces("display", 700, false).unwrap();
    assert_eq!(faces.len(), 2);
    assert!(library.groups["Noto Sans"].faces.contains(&faces[0]));
    assert!(library.groups["Icons"].faces.contains(&faces[1]));
    assert!(library.family_faces("missing", 400, false).is_err());
    let axes = library
        .face_variations("display", faces[0], &BTreeMap::new(), 700, false)
        .unwrap();
    assert_eq!(
        axes.iter().find(|axis| axis.tag == "wght").unwrap().value,
        700.0
    );
    assert!(
        library
            .face_variations("default", faces[1], &BTreeMap::new(), 400, false)
            .is_err()
    );
    let node = TextNode {
        text: "Hello".into(),
        font_weight: 700,
        ..Default::default()
    };
    let runs = crate::ui_text_fallback::shape_ordered(&*library.database, &faces, &node).unwrap();
    assert_eq!(runs[0].font, faces[0]);
    assert!(other.family("display").is_none());
    assert!(other.set_family("display", config.clone()).is_err());
    for invalid in [
        UiFontFamily {
            groups: vec![],
            axes: BTreeMap::new(),
        },
        UiFontFamily {
            groups: vec!["Missing".into()],
            axes: BTreeMap::new(),
        },
        UiFontFamily {
            groups: vec!["Noto Sans".into(), "Noto Sans".into()],
            axes: BTreeMap::new(),
        },
        UiFontFamily {
            groups: vec!["Noto Sans".into()],
            axes: BTreeMap::from([("bad".into(), 1.0)]),
        },
        UiFontFamily {
            groups: vec!["Noto Sans".into()],
            axes: BTreeMap::from([("wght".into(), f32::NAN)]),
        },
    ] {
        assert!(library.set_family("display", invalid).is_err());
        assert_eq!(library.family("display"), Some(&config));
    }
    assert_eq!(
        library.family("default").unwrap().groups,
        ["Noto Sans", "Noto Color Emoji"]
    );
    assert!(library.set_family(" ", config).is_err());
}

#[test]
fn registers_complete_groups_atomically() {
    let mut library = UiFontLibrary::default();
    let regular = include_bytes!("../tests/fixtures/NotoSans-Test-Regular.ttf").as_slice();
    let bold = include_bytes!("../tests/fixtures/NotoSans-Test-Bold.ttf").as_slice();
    let initial = library.database.faces().count();
    assert!(
        library
            .register_group("Example", &[regular, b"invalid"])
            .is_err()
    );
    assert_eq!(library.database.faces().count(), initial);
    assert!(!library.groups.contains_key("Example"));
    assert!(
        library
            .register_group("Example", &[regular, regular])
            .is_err()
    );
    library.register_group("Example", &[regular, bold]).unwrap();
    assert_eq!(library.groups["Example"].faces.len(), 2);
    assert_eq!(library.database.faces().count(), initial + 2);
    assert!(library.register_group("Example", &[regular]).is_err());
    assert!(library.register_group("  ", &[regular]).is_err());
    assert!(library.register_group("Empty", &[]).is_err());
}

#[test]
fn configured_family_is_used_for_measurement_and_rich_text() {
    use galfus_realm_2d_resources::ui::{RichText, RichTextSpan, RichTextStyle};
    let mut library = UiFontLibrary::default();
    library
        .register_group(
            "Variable",
            &[include_bytes!(
                "../tests/fixtures/NotoSans-Variable-subset.ttf"
            )],
        )
        .unwrap();
    library
        .set_family(
            "display",
            UiFontFamily {
                groups: vec!["Variable".into(), "Noto Sans".into()],
                axes: BTreeMap::from([("wght".into(), 200.0)]),
            },
        )
        .unwrap();
    let node = TextNode {
        text: "office".into(),
        font_family: Some("display".into()),
        font_axes: BTreeMap::from([("wght".into(), 300.0)]),
        font_weight: 900,
        ..Default::default()
    };
    let run = crate::ui_text_fallback::shape(&library, &library.default_family, &node).unwrap();
    assert!(library.groups["Variable"].faces.contains(&run[0].font));
    let fallback = crate::ui_text_fallback::shape(
        &library,
        &library.default_family,
        &TextNode {
            text: "ob".into(),
            ..node.clone()
        },
    )
    .unwrap();
    assert!(library.groups["Variable"].faces.contains(&fallback[0].font));
    assert!(
        library.groups["Noto Sans"]
            .faces
            .contains(&fallback[1].font)
    );
    assert_eq!(
        run[0]
            .variations
            .iter()
            .find(|axis| axis.tag == "wght")
            .unwrap()
            .value,
        900.0
    );
    let measurement = crate::ui_text::measure_text(&library, &library.default_family, &node, None);
    let geometry = crate::ui_text_geometry::text_geometry(
        &node,
        &library,
        &library.default_family,
        [0.0, 0.0, 200.0, 50.0],
    )
    .unwrap();
    let rich = RichText {
        font_family: Some("display".into()),
        spans: vec![RichTextSpan {
            text: "office".into(),
            style: RichTextStyle {
                font_weight: 900,
                ..Default::default()
            },
        }],
        ..Default::default()
    };
    let rich_size = crate::ui_rich_text::measure(&rich, &library, &library.default_family, None);
    assert!((measurement.width - rich_size[0]).abs() < 0.001);
    assert!(
        (measurement.width
            - geometry
                .clusters
                .iter()
                .map(|cluster| cluster.rect[2])
                .sum::<f32>())
        .abs()
            < 0.001
    );
    let unrelated = TextNode {
        text: "😀".into(),
        ..Default::default()
    };
    let runs =
        crate::ui_text_fallback::shape(&library, &library.default_family, &unrelated).unwrap();
    assert!(
        runs.iter()
            .all(|run| library.groups["Noto Color Emoji"].faces.contains(&run.font))
    );
    assert!(
        crate::ui_text_fallback::shape(
            &library,
            &library.default_family,
            &TextNode {
                font_family: Some("missing".into()),
                ..node
            }
        )
        .is_err()
    );
}

#[test]
fn default_noto_sans_supports_weights_and_italic() {
    let library = UiFontLibrary::default();
    assert_eq!(library.default_family, "Noto Sans");
    for (weight, italic) in [(400, false), (700, false), (400, true), (700, true)] {
        let id = crate::ui_text_font::select_font(
            &library.database,
            None,
            &library.default_family,
            weight,
            italic,
        )
        .unwrap();
        let face = library.database.face(id).unwrap();
        assert!(face.families.iter().any(|(name, _)| name == "Noto Sans"));
        assert_eq!(face.style == fontdb::Style::Italic, italic);
        let axes = library
            .face_variations("default", id, &BTreeMap::new(), weight, italic)
            .unwrap();
        assert_eq!(
            axes.iter().find(|axis| axis.tag == "wght").unwrap().value,
            f32::from(weight)
        );
    }
}

#[test]
fn noto_sans_covers_portuguese() {
    let library = UiFontLibrary::default();
    assert_eq!(library.database.faces().count(), 3);
    let node = TextNode {
        text: "Olá, ação e café".into(),
        ..Default::default()
    };
    let runs = crate::ui_text_fallback::shape(&library, &library.default_family, &node).unwrap();
    assert!(!runs.is_empty());
    assert!(
        runs.iter()
            .flat_map(|run| &run.glyphs)
            .all(|glyph| glyph.glyph_id != 0)
    );
    library
        .database
        .with_face_data(runs[0].font, |data, index| {
            let face = ttf_parser::Face::parse(data, index).unwrap();
            assert!(face.glyph_index('😀').is_none());
            assert!(face.glyph_index('م').is_none());
        })
        .unwrap();
}
#[test]
fn unknown_font_family_rejects_ui_mutations_atomically() {
    use galfus_realm_2d_resources::Transform2D;
    use galfus_realm_2d_resources::ui::{
        Model2DUI, PanelNode, UiCommand, UiLayoutStyle, UiNodeKind,
    };
    let mut realm = crate::context::Realm2DContext::new(1);
    let mut ui = Model2DUI::new();
    ui.create_panel(1, PanelNode::default(), UiLayoutStyle::default())
        .unwrap();
    realm
        .create_ui(7, ui.clone(), Transform2D::default())
        .unwrap();
    let node = TextNode {
        text: "test".into(),
        font_family: Some("unknown".into()),
        ..Default::default()
    };
    let commands = [UiCommand::Create {
        id: 2,
        kind: UiNodeKind::Text(node.clone()),
        layout: UiLayoutStyle::default(),
    }];
    assert!(realm.apply_ui_commands(7, &commands).is_err());
    assert_eq!(realm.uis[&7].0, ui);
    ui.create_text(2, node, UiLayoutStyle::default()).unwrap();
    assert!(realm.set_ui_content(7, ui).is_err());
}
