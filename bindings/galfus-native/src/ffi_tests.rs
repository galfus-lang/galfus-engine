//! FFI unit tests.

use super::*;
use crate::ffi_audio::*;
use crate::ffi_interaction::*;
use crate::ffi_multiverse::*;
use crate::ffi_realm_2d::*;
use crate::ffi_transforms_getters::galfus_platform_get_window_size;

#[test]
fn audio_play_ffi_preserves_the_voice_id() {
    assert_eq!(finish_audio_play(Ok(42)), 42);
    assert_eq!(finish_audio_play(Ok(u32::MAX)), u32::MAX);
    assert_eq!(finish_audio_play(Err("playback failed".into())), 0);
}

#[test]
fn test_c_api_lifecycle_and_json_exchange() {
    // Shutdown any leftover state from prior tests
    let _ = galfus_platform_shutdown();

    // 1. Initialize headless
    assert_eq!(galfus_platform_init_headless(), 0);

    // Double init should fail
    assert_eq!(galfus_platform_init_headless(), -1);
    let err_ptr = galfus_get_last_error();
    assert!(!err_ptr.is_null());
    let err_str = unsafe { from_c_str(err_ptr) }.unwrap();
    assert!(err_str.contains("already initialized"));
    unsafe { galfus_string_free(err_ptr) };

    // 2. Capabilities JSON
    let caps_ptr = galfus_platform_get_capabilities();
    assert!(!caps_ptr.is_null());
    let caps_json = unsafe { from_c_str(caps_ptr) }.unwrap();
    assert!(caps_json.contains("\"isHeadless\":true"));
    assert!(caps_json.contains("\"supportsMultipleWindows\":false"));
    unsafe { galfus_string_free(caps_ptr) };

    // 3. Window creation should be rejected in headless mode
    let config_json =
        CString::new(r#"{"id": 1, "title": "Test Window", "size": [800, 600]}"#).unwrap();
    let create_res = unsafe { galfus_window_create(config_json.as_ptr()) };
    assert_eq!(create_res, -1);

    let err_ptr = galfus_get_last_error();
    assert!(!err_ptr.is_null());
    let err_str = unsafe { from_c_str(err_ptr) }.unwrap();
    assert!(err_str.contains("headless mode"));
    unsafe { galfus_string_free(err_ptr) };

    // 4. Pump events (1-by-1 128-byte struct)
    let mut event_record = crate::ffi_event_batch::GalfusPlatformEvent::default();
    assert_eq!(unsafe { galfus_platform_pump_events(&mut event_record) }, 0);
    assert_eq!(event_record.kind, 0);
    assert_eq!(event_record.has_more, 0);

    // 4.1 Window & Audio error paths on non-existent IDs
    assert_eq!(galfus_window_close(999), -1);
    let title = CString::new("New Title").unwrap();
    assert_eq!(unsafe { galfus_window_set_title(999, title.as_ptr()) }, -1);
    assert_eq!(galfus_window_set_cursor_grab(999, 1), -1);
    assert_eq!(galfus_window_set_cursor_icon(999, 1), -1);
    assert_eq!(
        unsafe { galfus_window_set_icon(999, std::ptr::null(), 0) },
        -1
    );

    let mut w: u32 = 0;
    let mut h: u32 = 0;
    assert_eq!(
        unsafe { galfus_platform_get_window_size(999, &mut w, &mut h) },
        -1
    );

    assert_eq!(galfus_audio_play_sound(999, 1.0, 0.0, 1.0, false), 0);
    assert_eq!(galfus_audio_unload_sound(999), -1);

    // 4.2 Clipboard get/set
    let clip_in = CString::new("Clipboard FFI Test").unwrap();
    assert_eq!(
        unsafe { galfus_platform_set_clipboard_text(clip_in.as_ptr()) },
        0
    );
    let clip_out_ptr = galfus_platform_get_clipboard_text();
    assert!(!clip_out_ptr.is_null());
    let clip_out_str = unsafe { from_c_str(clip_out_ptr) }.unwrap();
    assert_eq!(clip_out_str, "Clipboard FFI Test");
    unsafe { galfus_string_free(clip_out_ptr) };

    // 5. Shutdown
    assert_eq!(galfus_platform_shutdown(), 0);
}

#[test]
fn shutdown_clears_pending_events() {
    let _ = galfus_platform_shutdown();
    assert_eq!(galfus_platform_init_headless(), 0);

    crate::ffi_event_batch::enqueue_events(vec![galfus_platform::PlatformEvent::Window(
        galfus_platform::WindowEvent::CloseRequested { window_id: 1 },
    )]);
    assert_eq!(crate::ffi_event_batch::pending_event_count(), 1);

    assert_eq!(galfus_platform_shutdown(), 0);
    assert_eq!(crate::ffi_event_batch::pending_event_count(), 0);
}

#[test]
fn test_ffi_interaction_and_collision() {
    let _ = galfus_platform_shutdown();
    assert_eq!(galfus_platform_init_headless(), 0);

    // 1. Create Target (Window target with id 1)
    let target_json =
        CString::new(r#"{"kind":{"type":"window","windowId":100},"size":[800,600]}"#).unwrap();
    assert_eq!(
        unsafe { galfus_multiverse_create_target(1, target_json.as_ptr()) },
        0
    );
    assert_eq!(galfus_multiverse_update_window_size(100, 800, 600), 0);

    // 2. Create Realm 2D
    assert_eq!(galfus_realm_2d_create(10), 0);

    let ui_desc = CString::new("{}").unwrap();
    assert_eq!(
        unsafe {
            crate::ffi_realm_2d_ui::galfus_realm_2d_create_ui(
                10,
                77,
                ui_desc.as_ptr(),
                std::ptr::null(),
            )
        },
        0
    );
    let commands = CString::new(
        r#"[{"type":"create","id":1,"kind":{"type":"panel"}},{"type":"create","id":3,"kind":{"type":"text","text":"a😀","fontSize":14}},{"type":"insert","parentId":1,"childId":3},{"type":"create","id":4,"kind":{"type":"richText","spans":[{"text":"😀","style":{"fontWeight":700,"italic":true,"underline":true,"strikethrough":true,"color":[1,0,0,1]}}]}},{"type":"insert","parentId":1,"childId":4}]"#,
    )
    .unwrap();
    assert_eq!(
        unsafe {
            crate::ffi_realm_2d_ui::galfus_realm_2d_apply_ui_commands(10, 77, commands.as_ptr())
        },
        0
    );
    let invalid =
        CString::new(r#"[{"type":"setVisible","id":1,"visible":false},{"type":"remove","id":2}]"#)
            .unwrap();
    assert_eq!(
        unsafe {
            crate::ffi_realm_2d_ui::galfus_realm_2d_apply_ui_commands(10, 77, invalid.as_ptr())
        },
        -1
    );
    assert!(crate::ffi_realm_2d_ui::galfus_realm_2d_get_rich_text_clusters(10, 77, 4).is_null());
    crate::state::with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<galfus_realm_2d::context::Realm2DContext>(10)
            .unwrap();
        assert!(realm.uis[&77].0.nodes[&1].visible);
        let galfus_realm_2d_resources::ui::UiNodeKind::Text(text) =
            &realm.uis[&77].0.nodes[&3].kind
        else {
            panic!("expected text node");
        };
        assert_eq!(text.text.as_utf16(), &[0x61, 0xd83d, 0xde00]);
        let galfus_realm_2d_resources::ui::UiNodeKind::RichText(rich) =
            &realm.uis[&77].0.nodes[&4].kind
        else {
            panic!("expected rich text node");
        };
        assert_eq!(rich.spans[0].text.as_utf16(), &[0xd83d, 0xde00]);
        assert_eq!(rich.spans[0].style.font_weight, 700);
        assert!(
            rich.spans[0].style.italic
                && rich.spans[0].style.underline
                && rich.spans[0].style.strikethrough
        );
        realm.uis.get_mut(&77).unwrap().0.computed.insert(
            1,
            galfus_realm_2d_resources::ui::UiComputedLayout {
                absolute_rect: [1.0, 2.0, 30.0, 40.0],
                ..Default::default()
            },
        );
        realm.uis.get_mut(&77).unwrap().0.dirty_flags.clear();
        realm.uis.get_mut(&77).unwrap().0.computed.insert(
            4,
            galfus_realm_2d_resources::ui::UiComputedLayout {
                absolute_rect: [10.0, 20.0, 300.0, 100.0],
                ..Default::default()
            },
        );
        realm.uis.get_mut(&77).unwrap().0.computed.insert(
            3,
            galfus_realm_2d_resources::ui::UiComputedLayout {
                absolute_rect: [10.0, 20.0, 300.0, 100.0],
                ..Default::default()
            },
        );
        Ok(())
    })
    .unwrap();
    let layout = crate::ffi_realm_2d_ui::galfus_realm_2d_get_ui_layout(10, 77, 1);
    let layout_json = unsafe { from_c_str(layout) }.unwrap();
    let layout_value: serde_json::Value = serde_json::from_str(layout_json).unwrap();
    assert_eq!(
        layout_value["absoluteRect"],
        serde_json::json!([1.0, 2.0, 30.0, 40.0])
    );
    unsafe { galfus_string_free(layout) };
    assert!(crate::ffi_realm_2d_ui::galfus_realm_2d_get_ui_layout(10, 77, 999).is_null());
    let clusters = crate::ffi_realm_2d_ui::galfus_realm_2d_get_rich_text_clusters(10, 77, 4);
    let cluster_json = unsafe { from_c_str(clusters) }.unwrap();
    let cluster_value: serde_json::Value = serde_json::from_str(cluster_json).unwrap();
    assert_eq!(cluster_value[0]["start"], 0);
    assert_eq!(cluster_value[0]["end"], 2);
    assert_eq!(cluster_value[0]["rect"][0], 10.0);
    unsafe { galfus_string_free(clusters) };
    let geometry = crate::ffi_realm_2d_ui::galfus_realm_2d_get_rich_text_geometry(10, 77, 4);
    let geometry_value: serde_json::Value =
        serde_json::from_str(unsafe { from_c_str(geometry) }.unwrap()).unwrap();
    assert_eq!(geometry_value["lines"][0]["end"], 2);
    assert_eq!(geometry_value["clusters"][0]["end"], 2);
    unsafe { galfus_string_free(geometry) };
    let simple = crate::ffi_realm_2d_ui::galfus_realm_2d_get_ui_text_geometry(10, 77, 3);
    let simple_value: serde_json::Value =
        serde_json::from_str(unsafe { from_c_str(simple) }.unwrap()).unwrap();
    assert_eq!(simple_value["lines"][0]["end"], 3);
    assert_eq!(simple_value["clusters"][1]["end"], 3);
    unsafe { galfus_string_free(simple) };
    assert!(crate::ffi_realm_2d_ui::galfus_realm_2d_get_rich_text_clusters(10, 77, 1).is_null());

    let cam_json = CString::new(r#"{"cameraSlot":0,"active":true,"orthoScale":1.0}"#).unwrap();
    let cam_res =
        unsafe { galfus_realm_2d_create_camera(10, 100, cam_json.as_ptr(), std::ptr::null()) };
    if cam_res != 0 {
        let err = unsafe { from_c_str(galfus_get_last_error()) }.unwrap();
        panic!("create_camera failed: {err}");
    }

    let sprite_json = CString::new(r#"{"dimensions":[100.0,50.0]}"#).unwrap();
    let sprite_res =
        unsafe { galfus_realm_2d_create_sprite(10, 42, sprite_json.as_ptr(), std::ptr::null()) };
    if sprite_res != 0 {
        let err = unsafe { from_c_str(galfus_get_last_error()) }.unwrap();
        panic!("create_sprite failed: {err}");
    }

    // 3. Create Collider on Model 42
    let collider_json =
        CString::new(r#"{"shape":{"type":"rectangle","halfExtents":[50.0,25.0]}}"#).unwrap();
    let res = unsafe { galfus_realm_2d_create_collider(10, 1, 42, collider_json.as_ptr()) };
    if res != 0 {
        let err = galfus_get_last_error();
        let err_str = unsafe { from_c_str(err) }.unwrap();
        panic!("create_collider failed: {err_str}");
    }

    // 4. Create Invocation
    let inv_json =
        CString::new(r#"{"targetId":1,"realmId":10,"zIndex":0,"enabled":true}"#).unwrap();
    assert_eq!(
        unsafe { galfus_multiverse_create_invocation(1000, inv_json.as_ptr()) },
        0
    );
    assert_eq!(galfus_multiverse_publish_interaction_frame(100), 0);

    // 5. Send Pointer Move at center of screen (400, 300) -> should hit model 42 at (0, 0)
    let move_json = CString::new(r#"{"type":"move","windowId":100,"pointerId":1,"position":[400.0,300.0],"delta":[0.0,0.0]}"#).unwrap();
    assert_eq!(
        unsafe { galfus_multiverse_handle_pointer_event(move_json.as_ptr()) },
        0
    );

    // 6. Poll interaction events
    let events_ptr = galfus_multiverse_poll_interaction_events();
    assert!(!events_ptr.is_null());
    let events_json = unsafe { from_c_str(events_ptr) }.unwrap();
    assert!(events_json.contains("\"interactionType\":\"hover\""));
    assert!(events_json.contains("\"modelId\":42"));
    unsafe { galfus_string_free(events_ptr) };

    // 7. Cleanup
    assert_eq!(galfus_realm_2d_destroy_collider(10, 1), 0);
    assert_eq!(galfus_multiverse_destroy_invocation(1000), 0);
    assert_eq!(galfus_realm_2d_destroy(10), 0);
    assert_eq!(galfus_multiverse_destroy_target(1), 0);
    assert_eq!(galfus_platform_shutdown(), 0);
}
