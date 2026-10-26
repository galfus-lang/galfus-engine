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
