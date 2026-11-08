use std::cell::RefCell;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use galfus_platform::{CursorGrabMode, CursorIcon, WindowConfig};

use crate::state::{
    close_window, init_context, init_context_headless, shutdown_context, with_context,
    with_context_mut,
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

/// Helper safely reading an optional C string pointer (NULL or empty string returns Ok(None)).
pub(crate) unsafe fn from_c_str_optional<'a>(
    ptr: *const c_char,
) -> Result<Option<&'a str>, String> {
    if ptr.is_null() {
        return Ok(None);
    }
    // SAFETY: caller guarantees null-terminated UTF-8 string when non-null.
    let s = unsafe { CStr::from_ptr(ptr) }
        .to_str()
        .map_err(|e| format!("Invalid UTF-8 in C string: {e}"))?;
    let trimmed = s.trim();
    if trimmed.is_empty() || trimmed == "null" || trimmed == "undefined" {
        Ok(None)
    } else {
        Ok(Some(trimmed))
    }
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
    let result = close_window(window_id);

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

/// Requests keyboard focus for a window input surface.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_window_request_input_focus(window_id: u32) -> i32 {
    let result = with_context_mut(|ctx| {
        ctx.get_window_mut(window_id)
            .map_err(|e| e.to_string())?
            .request_input_focus()
            .map_err(|e| e.to_string())
    });
    match result {
        Ok(()) => 0,
        Err(error) => {
            set_last_error(&error);
            -1
        }
    }
}

/// Configures browser Tab key capture.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_window_set_tab_capture(window_id: u32, enabled: u32) -> i32 {
    let result = with_context_mut(|ctx| {
        let window = ctx.get_window_mut(window_id).map_err(|e| e.to_string())?;
        window.set_tab_capture(enabled != 0);
        Ok(())
    });
    match result {
        Ok(()) => 0,
        Err(error) => {
            set_last_error(&error);
            -1
        }
    }
}

/// Enables or disables input method composition for a window.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_window_set_ime_allowed(window_id: u32, allowed: u32) -> i32 {
    let result = with_context_mut(|ctx| {
        ctx.get_window_mut(window_id)
            .map_err(|e| e.to_string())?
            .set_ime_allowed(allowed != 0)
            .map_err(|e| e.to_string())
    });
    match result {
        Ok(()) => 0,
        Err(error) => {
            set_last_error(&error);
            -1
        }
    }
}

/// Sets the IME candidate area in physical window pixels.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_window_set_ime_cursor_area(
    window_id: u32,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> i32 {
    let result = with_context_mut(|ctx| {
        ctx.get_window_mut(window_id)
            .map_err(|e| e.to_string())?
            .set_ime_cursor_area(x, y, width, height)
            .map_err(|e| e.to_string())
    });
    match result {
        Ok(()) => 0,
        Err(error) => {
            set_last_error(&error);
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

/// Sets the visual application icon of a window using raw encoded image bytes (ICO, PNG, WebP, JPEG).
///
/// # Safety
///
/// If `data_len > 0`, `data` must point to at least `data_len` valid, initialized bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_window_set_icon(
    window_id: u32,
    data: *const u8,
    data_len: u64,
) -> i32 {
    if data.is_null() && data_len > 0 {
        set_last_error("Null pointer passed for window icon data");
        return -1;
    }

    let slice = if data.is_null() || data_len == 0 {
        &[][..]
    } else {
        unsafe { std::slice::from_raw_parts(data, data_len as usize) }
    };

    let result = with_context_mut(|ctx| {
        let win = ctx.get_window_mut(window_id).map_err(|e| e.to_string())?;
        win.set_icon(slice).map_err(|e| e.to_string())
    });

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Pumps pending platform events and writes the next 128-byte `GalfusPlatformEvent` record into `out_event`.
///
/// - If `out_event.kind == 0`, no events were available.
/// - If `out_event.has_more == 1`, more events remain queued in the current cycle and the caller
///   should invoke `galfus_platform_pump_events` again until `has_more == 0`.
///
/// # Safety
///
/// `out_event` must be a non-null, valid pointer to writable `GalfusPlatformEvent` storage (128 bytes).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_platform_pump_events(
    out_event: *mut crate::ffi_event_batch::GalfusPlatformEvent,
) -> i32 {
    if out_event.is_null() {
        set_last_error("Null pointer passed to platform_pump_events");
        return -1;
    }
    if !crate::ffi_event_batch::has_pending_events() {
        match with_context_mut(|ctx| ctx.pump_events().map_err(|error| error.to_string())) {
            Ok(events) => crate::ffi_event_batch::enqueue_events(events),
            Err(error) => {
                set_last_error(&error);
                return -1;
            }
        }
    }
    let next = crate::ffi_event_batch::pop_next_event();
    // SAFETY: `out_event` was checked for null above and points to caller-owned `GalfusPlatformEvent` storage.
    unsafe { *out_event = next };
    0
}

/// Returns the current text stored in the platform clipboard as a newly allocated C string, or null on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_platform_get_clipboard_text() -> *mut c_char {
    let result = with_context_mut(|ctx| ctx.get_clipboard_text().map_err(|e| e.to_string()));
    match result {
        Ok(text) => to_c_string(&text),
        Err(e) => {
            set_last_error(&e);
            std::ptr::null_mut()
        }
    }
}

/// Replaces the text stored in the platform clipboard. Returns 0 on success, -1 on failure.
///
/// # Safety
/// `text` must be a valid, null-terminated UTF-8 string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_platform_set_clipboard_text(text: *const c_char) -> i32 {
    let text_str = match unsafe { from_c_str(text) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };

    let result =
        with_context_mut(|ctx| ctx.set_clipboard_text(text_str).map_err(|e| e.to_string()));
    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
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

#[cfg(test)]
#[path = "ffi_tests.rs"]
mod tests;
