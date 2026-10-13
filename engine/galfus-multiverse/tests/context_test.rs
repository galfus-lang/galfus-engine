use galfus_multiverse::*;
use galfus_realm_core::*;
use glam::UVec2;

struct MockRealm {
    id: u32,
    kind: RealmKind,
    prepare_count: usize,
    rendered_invocations: Vec<u32>,
}

impl MockRealm {
    fn new(id: u32, kind: RealmKind) -> Self {
        Self {
            id,
            kind,
            prepare_count: 0,
            rendered_invocations: Vec::new(),
        }
    }
}

impl Realm for MockRealm {
    fn id(&self) -> u32 {
        self.id
    }

    fn kind(&self) -> RealmKind {
        self.kind
    }

    fn prepare(&mut self, _ctx: &RealmPrepareContext) -> RealmResult<()> {
        self.prepare_count += 1;
        Ok(())
    }

    fn render(&mut self, ctx: &RealmInvocationContext) -> RealmResult<()> {
        self.rendered_invocations.push(ctx.invocation_id);
        Ok(())
    }
}

#[test]
fn test_multiverse_lifecycle_and_validation() {
    let mut mv = MultiverseContext::new();

    // Create target
    let target_desc = TargetDesc {
        kind: TargetKind::Window { window_id: 1 },
        size: Some(UVec2::new(800, 600)),
    };
    assert!(mv.create_target(1, target_desc.clone()).is_ok());

    // Duplicate target should fail
    assert!(mv.create_target(1, target_desc).is_err());

    // Reserved ID should fail
    assert!(
        mv.create_target(
            u32::MAX,
            TargetDesc {
                kind: TargetKind::Window { window_id: 1 },
                size: None,
            }
        )
        .is_err()
    );

    // Register realm
    assert!(
        mv.register_realm(Box::new(MockRealm::new(10, RealmKind::ThreeD)))
            .is_ok()
    );

    // Create invocation
    let inv = InvocationDesc {
        realm_id: 10,
        target_id: 1,
        camera_slot: None,
        viewport: ViewportRect::default(),
        filters: Vec::new(),
        z_index: 0,
        enabled: true,
        clear_color: None,
    };
    assert!(mv.create_invocation(100, inv).is_ok());

    // Resolve schedule
    let schedule = mv.resolve().expect("Failed to resolve schedule");
    assert_eq!(schedule.target_blocks.len(), 1);
    assert_eq!(schedule.target_blocks[0].target_id, 1);
    assert_eq!(schedule.target_blocks[0].invocations.len(), 1);
    assert_eq!(schedule.target_blocks[0].invocations[0].invocation_id, 100);

    // Dispatch frame
    assert!(mv.dispatch(1, 0.016).is_ok());
}

#[test]
fn test_portal_dependency_ordering() {
    let mut mv = MultiverseContext::new();

    let target_window = 1;
    let target_portal_texture = 2;

    // Window target
    mv.create_target(
        target_window,
        TargetDesc {
            kind: TargetKind::Window { window_id: 1 },
            size: Some(UVec2::new(1920, 1080)),
        },
    )
    .unwrap();

    // Portal offscreen texture target
    mv.create_target(
        target_portal_texture,
        TargetDesc {
            kind: TargetKind::Texture {
                width: 512,
                height: 512,
                format: "rgba8unorm".into(),
            },
            size: None,
        },
    )
    .unwrap();

    // World realm (3D) & UI realm (2D)
    mv.register_realm(Box::new(MockRealm::new(10, RealmKind::ThreeD)))
        .unwrap();
    mv.register_realm(Box::new(MockRealm::new(20, RealmKind::TwoD)))
        .unwrap();

    // Invocations:
    // 101: World Realm rendering inside Portal Camera -> Portal Texture Target
    mv.create_invocation(
        101,
        InvocationDesc {
            realm_id: 10,
            target_id: target_portal_texture,
            camera_slot: Some(2), // Portal camera
            viewport: ViewportRect::default(),
            filters: Vec::new(),
            z_index: 0,
            enabled: true,
            clear_color: None,
        },
    )
    .unwrap();

    // 102: World Realm rendering Main Camera -> Window Target
    mv.create_invocation(
        102,
        InvocationDesc {
            realm_id: 10,
            target_id: target_window,
            camera_slot: Some(1), // Main player camera
            viewport: ViewportRect::default(),
            filters: Vec::new(),
            z_index: 0,
            enabled: true,
            clear_color: None,
        },
    )
    .unwrap();

    // 103: 2D HUD rendering over Window Target
    mv.create_invocation(
        103,
        InvocationDesc {
            realm_id: 20,
            target_id: target_window,
            camera_slot: None,
            viewport: ViewportRect::default(),
            filters: Vec::new(),
            z_index: 10, // Drawn above 3D
            enabled: true,
            clear_color: None,
        },
    )
    .unwrap();

    // Declare dependency: World Realm (ID 10) reads from Portal Texture Target (ID 2)
    mv.bind_target_texture(TargetTextureBinding {
        source_target_id: target_portal_texture,
        realm_id: 10,
        slot: "portal_surface".into(),
    })
    .unwrap();

    // Resolve schedule: Target 2 MUST come before Target 1!
    let schedule = mv.resolve().expect("Failed to resolve schedule");
    assert_eq!(schedule.target_blocks.len(), 2);
    assert_eq!(schedule.target_blocks[0].target_id, target_portal_texture);
    assert_eq!(schedule.target_blocks[1].target_id, target_window);

    // Inside target_window: 102 (z=0) must come before 103 (z=10)
    let window_invs = &schedule.target_blocks[1].invocations;
    assert_eq!(window_invs.len(), 2);
    assert_eq!(window_invs[0].invocation_id, 102);
    assert_eq!(window_invs[1].invocation_id, 103);

    // Dispatch
    assert!(mv.dispatch(1, 0.016).is_ok());
}

#[test]
fn test_color_realm_in_multiverse() {
    let mut mv = MultiverseContext::new();

    let target_id = 1;
    mv.create_target(
        target_id,
        TargetDesc {
            kind: TargetKind::Texture {
                width: 256,
                height: 256,
                format: "rgba8unorm".into(),
            },
            size: None,
        },
    )
    .unwrap();

    let realm_id = 10;
    let color_realm = ColorRealm::new(realm_id, [1.0, 0.0, 0.0, 1.0]);
    assert_eq!(color_realm.color(), [1.0, 0.0, 0.0, 1.0]);
    assert_eq!(color_realm.render_count(), 0);

    mv.register_realm(Box::new(color_realm)).unwrap();

    let inv_id = 100;
    mv.create_invocation(
        inv_id,
        InvocationDesc {
            realm_id,
            target_id,
            camera_slot: None,
            viewport: ViewportRect::pixels(0, 0, 128, 128),
            filters: Vec::new(),
            z_index: 0,
            enabled: true,
            clear_color: Some([0.0, 1.0, 0.0, 1.0]),
        },
    )
    .unwrap();

    let schedule = mv.resolve().expect("Failed to resolve");
    assert_eq!(schedule.target_blocks.len(), 1);
    assert_eq!(schedule.target_blocks[0].target_id, target_id);
    assert_eq!(schedule.target_blocks[0].invocations.len(), 1);

    mv.dispatch(1, 0.016).unwrap();
    mv.dispatch(2, 0.016).unwrap();
}

#[test]
fn test_screen_effect_filter_lifecycle() {
    let mut mv = MultiverseContext::new();

    let target_id = 1;
    mv.create_target(
        target_id,
        TargetDesc {
            kind: TargetKind::Texture {
                width: 64,
                height: 64,
                format: "rgba8unorm".into(),
            },
            size: None,
        },
    )
    .unwrap();

    mv.register_realm(Box::new(ColorRealm::new(10, [0.5, 0.5, 0.5, 1.0])))
        .unwrap();

    // Register a valid custom screen effect
    let invert_shader = r#"
        fn screen_effect(in: ScreenInput) -> vec4<f32> {
            return vec4<f32>(1.0 - in.color.rgb, in.color.a);
        }
    "#;
    assert!(mv.register_shader(42, invert_shader).is_ok());

    // Registering an invalid snippet with forbidden token should fail
    let invalid_shader = r#"
        @group(0) @binding(0) var bad: texture_2d<f32>;
        fn screen_effect(in: ScreenInput) -> vec4<f32> {
            return in.color;
        }
    "#;
    assert!(mv.register_shader(43, invalid_shader).is_err());

    // Create invocation with custom filter
    mv.create_invocation(
        100,
        InvocationDesc {
            realm_id: 10,
            target_id,
            camera_slot: None,
            viewport: ViewportRect::default(),
            filters: vec![InvocationFilter::Custom { shader_id: 42 }],
            z_index: 0,
            enabled: true,
            clear_color: None,
        },
    )
    .unwrap();

    let schedule = mv.resolve().expect("Failed to resolve schedule");
    assert_eq!(schedule.target_blocks.len(), 1);
    assert_eq!(schedule.target_blocks[0].target_id, target_id);
    assert_eq!(schedule.target_blocks[0].invocations.len(), 1);
    assert_eq!(
        schedule.target_blocks[0].invocations[0].filters,
        vec![InvocationFilter::Custom { shader_id: 42 }]
    );

    assert!(mv.dispatch(1, 0.016).is_ok());
}

#[test]
fn test_target_binding_cycle_soft_cut() {
    let mut mv = MultiverseContext::new();

    let target_a = 1;
    let target_b = 2;

    mv.create_target(
        target_a,
        TargetDesc {
            kind: TargetKind::Texture {
                width: 64,
                height: 64,
                format: "rgba8unorm".into(),
            },
            size: None,
        },
    )
    .unwrap();

    mv.create_target(
        target_b,
        TargetDesc {
            kind: TargetKind::Texture {
                width: 64,
                height: 64,
                format: "rgba8unorm".into(),
            },
            size: None,
        },
    )
    .unwrap();

    mv.register_realm(Box::new(MockRealm::new(10, RealmKind::ThreeD)))
        .unwrap();
    mv.register_realm(Box::new(MockRealm::new(20, RealmKind::ThreeD)))
        .unwrap();

    // Realm 10 renders to Target A, but reads Target B
    mv.create_invocation(
        100,
        InvocationDesc {
            realm_id: 10,
            target_id: target_a,
            camera_slot: None,
            viewport: ViewportRect::default(),
            filters: Vec::new(),
            z_index: 0,
            enabled: true,
            clear_color: None,
        },
    )
    .unwrap();
    mv.bind_target_texture(TargetTextureBinding {
        source_target_id: target_b,
        realm_id: 10,
        slot: "portal_b".into(),
    })
    .unwrap();

    // Realm 20 renders to Target B, but reads Target A (Mutual cycle!)
    mv.create_invocation(
        200,
        InvocationDesc {
            realm_id: 20,
            target_id: target_b,
            camera_slot: None,
            viewport: ViewportRect::default(),
            filters: Vec::new(),
            z_index: 0,
            enabled: true,
            clear_color: None,
        },
    )
    .unwrap();
    mv.bind_target_texture(TargetTextureBinding {
        source_target_id: target_a,
        realm_id: 20,
        slot: "portal_a".into(),
    })
    .unwrap();

    let schedule = mv.resolve().expect("Cycle should be broken via soft cut");
    assert!(!schedule.soft_cut_edges.is_empty());
    assert_eq!(schedule.target_blocks.len(), 2);
}
