//! FFI unit tests.

use super::*;
use crate::ffi_audio::*;
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
