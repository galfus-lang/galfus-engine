use std::cell::RefCell;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use galfus_platform::{CursorGrabMode, CursorIcon, WindowConfig};

use crate::state::{
    init_context, init_context_headless, shutdown_context, with_context, with_context_mut,
};

thread_local! {
    static LAST_ERROR: RefCell<Option<CString>> = const { RefCell::new(None) };
}

pub(crate) fn set_last_error(err: &str) {
    LAST_ERROR.with(|cell| {
        *cell.borrow_mut() = CString::new(err).ok();
    });
}

/// Helper converting a Rust string into a newly allocated C string pointer.
pub(crate) fn to_c_string(s: &str) -> *mut c_char {
    match CString::new(s) {
        Ok(c_str) => c_str.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Helper safely reading a C string pointer.
pub(crate) unsafe fn from_c_str<'a>(ptr: *const c_char) -> Result<&'a str, String> {
    if ptr.is_null() {
        return Err("Null pointer passed as string argument".into());
    }
    // SAFETY: caller guarantees null-terminated UTF-8 string.
    unsafe { CStr::from_ptr(ptr) }
        .to_str()
        .map_err(|e| format!("Invalid UTF-8 in C string: {e}"))
}

// ---------------------------------------------------------------------------
// Exported C API Functions
// ---------------------------------------------------------------------------

/// Initializes the global platform context. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_platform_init() -> i32 {
    match init_context() {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Initializes the global platform context in headless mode. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_platform_init_headless() -> i32 {
    match init_context_headless() {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Shuts down and cleans up the platform context. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_platform_shutdown() -> i32 {
    match shutdown_context() {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Returns the last recorded error message as a newly allocated C string, or null if none.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_get_last_error() -> *mut c_char {
    LAST_ERROR.with(|cell| {
        cell.borrow_mut()
            .take()
            .map(CString::into_raw)
            .unwrap_or(std::ptr::null_mut())
    })
}

/// Frees a C string allocated by the Galfus library.
///
/// # Safety
/// The pointer must have been returned by a Galfus export function and not yet freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_string_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        // SAFETY: reclaimed string was previously allocated via CString::into_raw.
        unsafe { drop(CString::from_raw(ptr)) };
    }
}

/// Returns a JSON string containing the platform capabilities.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_platform_get_capabilities() -> *mut c_char {
    let result = with_context(|ctx| {
        let caps = ctx.capabilities();
        serde_json::to_string(&caps).map_err(|e| e.to_string())
    });

    match result {
        Ok(json) => to_c_string(&json),
        Err(e) => {
            set_last_error(&e);
            std::ptr::null_mut()
        }
    }
}

/// Creates a new window from a JSON-serialized `WindowConfig`. Returns 0 on success, -1 on failure.
///
/// # Safety
/// `config_json` must be a valid, null-terminated UTF-8 string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_window_create(config_json: *const c_char) -> i32 {
    let json_str = match unsafe { from_c_str(config_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let config: WindowConfig = match serde_json::from_str(json_str) {
        Ok(c) => c,
        Err(e) => {
            set_last_error(&format!("Failed to parse WindowConfig JSON: {e}"));
            return -1;
        }
    };

    let result = with_context_mut(|ctx| {
        ctx.create_window(config)
            .map(|_| ())
            .map_err(|e| e.to_string())
    });

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Closes and destroys a window by its logical ID. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_window_close(window_id: u32) -> i32 {
    let result = with_context_mut(|ctx| ctx.close_window(window_id).map_err(|e| e.to_string()));

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates the title of the window. Returns 0 on success, -1 on failure.
///
/// # Safety
/// `title` must be a valid, null-terminated UTF-8 string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_window_set_title(window_id: u32, title: *const c_char) -> i32 {
    let title_str = match unsafe { from_c_str(title) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let result = with_context_mut(|ctx| {
        let win = ctx.get_window_mut(window_id).map_err(|e| e.to_string())?;
        win.set_title(title_str);
        Ok(())
    });

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates cursor grab mode. Mode: 0 = None, 1 = Confined, 2 = Locked.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_window_set_cursor_grab(window_id: u32, mode: u32) -> i32 {
    let grab_mode = match mode {
        1 => CursorGrabMode::Confined,
        2 => CursorGrabMode::Locked,
        _ => CursorGrabMode::None,
    };

    let result = with_context_mut(|ctx| {
        let win = ctx.get_window_mut(window_id).map_err(|e| e.to_string())?;
        win.set_cursor_grab(grab_mode).map_err(|e| e.to_string())
    });

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates cursor icon. Icon: 0 = Default, 1 = Pointer, 2 = Grab, 3 = Crosshair, etc.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_window_set_cursor_icon(window_id: u32, icon: u32) -> i32 {
    let cursor_icon = match icon {
        1 => CursorIcon::Pointer,
        2 => CursorIcon::Grab,
        3 => CursorIcon::Grabbing,
        4 => CursorIcon::Crosshair,
        5 => CursorIcon::Text,
        6 => CursorIcon::Move,
        7 => CursorIcon::Wait,
        _ => CursorIcon::Default,
    };

    let result = with_context_mut(|ctx| {
        let win = ctx.get_window_mut(window_id).map_err(|e| e.to_string())?;
        win.set_cursor_icon(cursor_icon);
        Ok(())
    });

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Pumps pending platform events into a stable fixed-layout batch.
///
/// The returned pointers remain valid until `galfus_platform_release_event_batch` is called.
///
/// # Safety
///
/// `out_batch` must be a non-null, valid pointer to writable `GalfusEventBatch` storage.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_platform_pump_events(
    out_batch: *mut crate::ffi_event_batch::GalfusEventBatch,
) -> i32 {
    if out_batch.is_null() {
        set_last_error("Null pointer passed to platform_pump_events");
        return -1;
    }
    match with_context_mut(|ctx| ctx.pump_events().map_err(|error| error.to_string())) {
        Ok(events) => {
            let batch = crate::ffi_event_batch::store_event_batch(events);
            // SAFETY: The pointer was checked above and points to one caller-owned output struct.
            unsafe { *out_batch = batch };
            0
        }
        Err(error) => {
            set_last_error(&error);
            -1
        }
    }
}

/// Releases a platform event batch and invalidates all pointers in its view.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_platform_release_event_batch(batch_id: u64) -> i32 {
    match crate::ffi_event_batch::release_event_batch(batch_id) {
        Ok(()) => 0,
        Err(error) => {
            set_last_error(&error);
            -1
        }
    }
}

/// Returns a JSON array string describing all currently connected gamepads.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_gamepad_get_connected() -> *mut c_char {
    let result = with_context(|ctx| {
        let gamepads = ctx.connected_gamepads();
        serde_json::to_string(&gamepads).map_err(|e| e.to_string())
    });

    match result {
        Ok(json) => to_c_string(&json),
        Err(e) => {
            set_last_error(&e);
            std::ptr::null_mut()
        }
    }
}

/// Triggers force-feedback rumble vibration on a connected gamepad.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_gamepad_set_rumble(
    gamepad_id: u32,
    strong_magnitude: f32,
    weak_magnitude: f32,
    duration_ms: u32,
) -> i32 {
    let result = with_context_mut(|ctx| {
        ctx.set_gamepad_rumble(gamepad_id, strong_magnitude, weak_magnitude, duration_ms)
            .map_err(|e| e.to_string())
    });

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Loads raw audio data bytes (WAV, MP3, OGG, FLAC) from memory under a host logical ID. Returns 0 on success, -1 on failure.
///
/// # Safety
/// `data_ptr` must be valid for reads of `data_len` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_audio_load_sound(
    sound_id: u32,
    data_ptr: *const u8,
    data_len: usize,
) -> i32 {
    if data_ptr.is_null() || data_len == 0 {
        set_last_error("Null or empty audio buffer");
        return -1;
    }
    let slice = unsafe { std::slice::from_raw_parts(data_ptr, data_len) };
    let result = with_context_mut(|ctx| {
        ctx.load_sound_bytes(sound_id, slice)
            .map(|_| ())
            .map_err(|e| e.to_string())
    });
    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Plays a registered sound with playback parameters. Returns voice instance ID (>= 0) on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_play_sound(
    sound_id: u32,
    volume: f32,
    panning: f32,
    speed: f32,
    looping: bool,
) -> i32 {
    let config = galfus_platform::PlaybackConfig {
        volume,
        panning,
        speed,
        looping,
    };

    let result =
        with_context_mut(|ctx| ctx.play_sound(sound_id, config).map_err(|e| e.to_string()));

    match result {
        Ok(voice_id) => voice_id as i32,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Plays a registered sound with 3D/2D spatial positioning relative to a listener ear.
/// Returns voice instance ID (>= 0) on success, -1 on failure.
///
/// # Safety
/// `emitter_json`, `listener_json`, and `config_json` must be valid null-terminated C string pointers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_audio_play_sound_spatial(
    sound_id: u32,
    spatial: *const crate::ffi_native_structs::GalfusSpatialAudio,
) -> i32 {
    if spatial.is_null() {
        set_last_error("Null pointer passed to play_sound_spatial");
        return -1;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let (emitter, listener, config) = unsafe { (*spatial).into_parts() };

    let result = with_context_mut(|ctx| {
        ctx.play_sound_spatial(sound_id, emitter, listener, config)
            .map_err(|e| e.to_string())
    });

    match result {
        Ok(voice_id) => voice_id as i32,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Updates spatial positioning of an active sound voice relative to a listener ear.
/// Returns 0 on success, -1 on failure.
///
/// # Safety
/// `emitter_json`, `listener_json`, and `config_json` must be valid null-terminated C string pointers.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_audio_update_sound_spatial(
    voice_id: u32,
    spatial: *const crate::ffi_native_structs::GalfusSpatialAudio,
) -> i32 {
    if spatial.is_null() {
        set_last_error("Null pointer passed to update_sound_spatial");
        return -1;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let (emitter, listener, config) = unsafe { (*spatial).into_parts() };

    let result = with_context_mut(|ctx| {
        ctx.update_sound_spatial(voice_id, emitter, listener, config)
            .map_err(|e| e.to_string())
    });

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Pauses a sound voice. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_pause_sound(voice_id: u32) -> i32 {
    let result = with_context_mut(|ctx| ctx.pause_sound(voice_id).map_err(|e| e.to_string()));

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Resumes a paused sound voice. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_resume_sound(voice_id: u32) -> i32 {
    let result = with_context_mut(|ctx| ctx.resume_sound(voice_id).map_err(|e| e.to_string()));

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Stops a sound voice. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_stop_sound(voice_id: u32) -> i32 {
    let result = with_context_mut(|ctx| ctx.stop_sound(voice_id).map_err(|e| e.to_string()));

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Sets the volume of a sound voice. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_set_volume(voice_id: u32, volume: f32) -> i32 {
    let result = with_context_mut(|ctx| {
        ctx.set_sound_volume(voice_id, volume)
            .map_err(|e| e.to_string())
    });

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Sets the panning of a sound voice. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_set_panning(voice_id: u32, panning: f32) -> i32 {
    let result = with_context_mut(|ctx| {
        ctx.set_sound_panning(voice_id, panning)
            .map_err(|e| e.to_string())
    });

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Unloads a sound resource. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_unload_sound(sound_id: u32) -> i32 {
    let result = with_context_mut(|ctx| ctx.unload_sound(sound_id).map_err(|e| e.to_string()));

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi_transforms_getters::galfus_platform_get_window_size;

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

        let mut w: u32 = 0;
        let mut h: u32 = 0;
        assert_eq!(
            unsafe { galfus_platform_get_window_size(999, &mut w, &mut h) },
            -1
        );

        assert_eq!(galfus_audio_play_sound(999, 1.0, 0.0, 1.0, false), -1);
        assert_eq!(galfus_audio_unload_sound(999), -1);

        // 5. Shutdown
        assert_eq!(galfus_platform_shutdown(), 0);
    }
}
