use super::*;

#[test]
fn test_create_target_texture_format_support() {
    let mut mv = MultiverseContext::new();

    // 1. Valid HDR / float format
    let res_hdr = mv.create_target(
        50,
        TargetDesc {
            kind: TargetKind::Texture {
                width: 128,
                height: 128,
                format: "rgba16float".into(),
            },
            size: None,
        },
    );
    assert!(res_hdr.is_ok());

    // 2. Valid sRGB format
    let res_srgb = mv.create_target(
        51,
        TargetDesc {
            kind: TargetKind::Texture {
                width: 128,
                height: 128,
                format: "rgba8unormsrgb".into(),
            },
            size: None,
        },
    );
    assert!(res_srgb.is_ok());

    // 3. Invalid format should fail
    let res_invalid = mv.create_target(
        52,
        TargetDesc {
            kind: TargetKind::Texture {
                width: 128,
                height: 128,
                format: "non_existent_unsupported_format".into(),
            },
            size: None,
        },
    );
    assert!(res_invalid.is_err());
}

#[test]
fn test_target_and_invocation_error_paths() {
    let mut mv = MultiverseContext::new();

    // 1. Destroying non-existent resources
    assert!(mv.destroy_target(999).is_err());
    assert!(mv.destroy_invocation(999).is_err());
    assert!(mv.unregister_realm(999).is_err());

    // 2. Reading size of non-existent target
    assert!(mv.target_size(999).is_none());

    // 3. Creating invocation with non-existent target or realm fails validation immediately
    let inv_bad_realm = InvocationDesc {
        realm_id: 888,
        target_id: 1,
        camera_slot: None,
        viewport: ViewportRect::default(),
        filters: Vec::new(),
        z_index: 0,
        enabled: true,
        clear_color: None,
        anti_aliasing: None,
    };
    assert!(mv.create_invocation(10, inv_bad_realm).is_err());

    let target_desc = TargetDesc {
        kind: TargetKind::Texture {
            width: 128,
            height: 128,
            format: "rgba8unorm".into(),
        },
        size: None,
    };
    assert!(mv.create_target(1, target_desc).is_ok());

    let inv_bad_realm2 = InvocationDesc {
        realm_id: 888,
        target_id: 1,
        camera_slot: None,
        viewport: ViewportRect::default(),
        filters: Vec::new(),
        z_index: 0,
        enabled: true,
        clear_color: None,
        anti_aliasing: None,
    };
    assert!(mv.create_invocation(10, inv_bad_realm2).is_err());

    // Register realm and create valid invocation
    assert!(
        mv.register_realm(Box::new(MockRealm::new(100, RealmKind::TwoD)))
            .is_ok()
    );
    let inv_valid = InvocationDesc {
        realm_id: 100,
        target_id: 1,
        camera_slot: None,
        viewport: ViewportRect::default(),
        filters: Vec::new(),
        z_index: 0,
        enabled: true,
        clear_color: None,
        anti_aliasing: None,
    };
    assert!(mv.create_invocation(10, inv_valid).is_ok());
    assert!(mv.resolve().is_ok());

    // 4. Destroying invocation cleanly clears it
    assert!(mv.destroy_invocation(10).is_ok());
    assert!(mv.resolve().is_ok());
}
