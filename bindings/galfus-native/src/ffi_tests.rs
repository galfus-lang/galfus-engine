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

    // 4. Pump events
    let mut event_batch = crate::ffi_event_batch::GalfusEventBatch {
        batch_id: 0,
        events: std::ptr::null(),
        event_count: 0,
        text_data: std::ptr::null(),
        text_length: 0,
    };
    assert_eq!(unsafe { galfus_platform_pump_events(&mut event_batch) }, 0);
    assert_eq!(event_batch.event_count, 0);
    assert_eq!(galfus_platform_release_event_batch(event_batch.batch_id), 0);

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

    // 5. Shutdown
    assert_eq!(galfus_platform_shutdown(), 0);
}

#[test]
fn shutdown_releases_unclaimed_event_batches() {
    let _ = galfus_platform_shutdown();
    assert_eq!(galfus_platform_init_headless(), 0);

    let batch = crate::ffi_event_batch::store_event_batch(Vec::new());
    assert_eq!(crate::ffi_event_batch::event_batch_count(), 1);

    assert_eq!(galfus_platform_shutdown(), 0);
    assert_eq!(crate::ffi_event_batch::event_batch_count(), 0);
    assert!(crate::ffi_event_batch::release_event_batch(batch.batch_id).is_err());
}
