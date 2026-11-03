use super::*;

#[test]
fn detach_window_releases_window_state_without_destroying_targets() {
    let mut context = MultiverseContext::new();
    context
        .create_target(
            1,
            TargetDesc {
                kind: TargetKind::Window { window_id: 7 },
                size: Some(UVec2::new(64, 64)),
            },
        )
        .unwrap();
    context.window_sizes.insert(7, UVec2::new(64, 64));

    assert!(context.detach_window(7).unwrap());
    assert!(!context.window_sizes.contains_key(&7));
    assert!(context.targets.contains_key(&1));
    assert!(!context.detach_window(7).unwrap());
}

#[test]
fn destroy_target_releases_window_sizes_and_surfaces() {
    let mut context = MultiverseContext::new();
    context
        .create_target(
            1,
            TargetDesc {
                kind: TargetKind::Window { window_id: 7 },
                size: Some(UVec2::new(64, 64)),
            },
        )
        .unwrap();
    context.window_sizes.insert(7, UVec2::new(64, 64));

    context.destroy_target(1).unwrap();
    assert!(!context.targets.contains_key(&1));
    assert!(!context.window_sizes.contains_key(&7));
}

#[test]
fn changing_z_index_reorders_the_resolved_invocations() {
    let mut context = MultiverseContext::new();
    context
        .create_target(
            1,
            TargetDesc {
                kind: TargetKind::Window { window_id: 7 },
                size: Some(UVec2::new(64, 64)),
            },
        )
        .unwrap();
    context
        .register_color_realm(10, [0.0, 0.0, 0.0, 1.0])
        .unwrap();
    let desc = crate::InvocationDesc {
        realm_id: 10,
        target_id: 1,
        ..Default::default()
    };
    context.create_invocation(11, desc.clone()).unwrap();
    context.create_invocation(12, desc).unwrap();
    assert_eq!(
        context.resolve().unwrap().target_blocks[0].invocations[0].invocation_id,
        11
    );
    context.set_invocation_z_index(11, 2).unwrap();
    assert_eq!(
        context.resolve().unwrap().target_blocks[0].invocations[0].invocation_id,
        12
    );
    assert!(context.set_invocation_z_index(99, 0).is_err());
}
