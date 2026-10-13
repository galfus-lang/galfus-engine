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
        camera_id: None,
        viewport: ViewportRect::default(),
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
            camera_id: Some(2), // Portal camera
            viewport: ViewportRect::default(),
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
            camera_id: Some(1), // Main player camera
            viewport: ViewportRect::default(),
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
            camera_id: None,
            viewport: ViewportRect::default(),
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
