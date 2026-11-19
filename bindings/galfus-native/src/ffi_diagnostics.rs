//! C FFI exports for the tagged debug & diagnostic metrics system.

use std::os::raw::c_char;

use galfus_core::diagnostics::{self, DiagnosticsConfig};

use crate::ffi::{from_c_str, set_last_error, to_c_string};
use crate::state::collect_diagnostics_snapshot;

/// Configures tagged diagnostics from a JSON [`DiagnosticsConfig`] payload.
/// Returns 0 on success, -1 on failure.
///
/// # Safety
/// `config_json` must be a valid, null-terminated UTF-8 C string pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_diagnostics_configure(config_json: *const c_char) -> i32 {
    let json_str = match unsafe { from_c_str(config_json) } {
        Ok(s) => s,
        Err(e) => {
            set_last_error(&e);
            return -1;
        }
    };
    let config: DiagnosticsConfig = match serde_json::from_str(json_str) {
        Ok(c) => c,
        Err(e) => {
            set_last_error(&format!("Invalid DiagnosticsConfig JSON: {e}"));
            return -1;
        }
    };
    diagnostics::configure(&config);
    0
}

/// Sets the active diagnostic tag bitmask directly. Returns 0.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_diagnostics_set_tags(tags_mask: u64) -> i32 {
    diagnostics::set_enabled_tags_mask(tags_mask);
    0
}

/// Captures a pull-on-demand diagnostic snapshot (including per-category memory breakdown,
/// counters, timings, drift warnings, and recent logs) as a newly allocated JSON C string.
/// Pass `tags_mask = 0` to include all recorded timing spans.
/// Caller must free the returned string via `galfus_string_free`.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_diagnostics_snapshot(tags_mask: u64) -> *mut c_char {
    let snapshot = collect_diagnostics_snapshot(tags_mask);
    match serde_json::to_string(&snapshot) {
        Ok(json) => to_c_string(&json),
        Err(e) => {
            set_last_error(&format!("Failed to serialize DiagnosticsSnapshot: {e}"));
            std::ptr::null_mut()
        }
    }
}

/// Drains up to `max_entries` tagged debug log entries as a JSON array C string.
/// Caller must free the returned string via `galfus_string_free`.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_diagnostics_drain_logs(max_entries: u32) -> *mut c_char {
    let logs = diagnostics::drain_logs(max_entries as usize);
    match serde_json::to_string(&logs) {
        Ok(json) => to_c_string(&json),
        Err(e) => {
            set_last_error(&format!("Failed to serialize diagnostic logs: {e}"));
            std::ptr::null_mut()
        }
    }
}

/// Resets counters, timing ring buffers, and log ring buffer (preserves enabled tags).
#[unsafe(no_mangle)]
pub extern "C" fn galfus_diagnostics_reset() -> i32 {
    diagnostics::reset();
    0
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::{CStr, CString};

    #[test]
    fn ffi_diagnostics_configure_snapshot_and_category_memory() {
        diagnostics::reset();
        let cfg =
            CString::new(r#"{"enabledTags":["memory","physics","ffi"],"consoleOutput":false}"#)
                .unwrap();
        assert_eq!(unsafe { galfus_diagnostics_configure(cfg.as_ptr()) }, 0);

        galfus_core::galfus_trace!(diagnostics::tags::MEMORY, "test-memory-trace");
        {
            let _span = galfus_core::galfus_span!(diagnostics::tags::PHYSICS, "physics.test_span");
        }

        let snap_ptr = galfus_diagnostics_snapshot(0);
        assert!(!snap_ptr.is_null());
        let snap_str = unsafe { CStr::from_ptr(snap_ptr) }
            .to_str()
            .unwrap()
            .to_string();
        unsafe { crate::ffi::galfus_string_free(snap_ptr) };

        let v: serde_json::Value = serde_json::from_str(&snap_str).unwrap();
        assert!(v["memory"]["categories"].is_array());
        assert!(
            v["memory"]["categories"]
                .as_array()
                .unwrap()
                .iter()
                .any(|c| c["category"] == "ffi.events")
        );
        assert!(
            v["timings"]
                .as_array()
                .unwrap()
                .iter()
                .any(|t| t["name"] == "physics.test_span")
        );

        let logs_ptr = galfus_diagnostics_drain_logs(16);
        assert!(!logs_ptr.is_null());
        let logs_str = unsafe { CStr::from_ptr(logs_ptr) }
            .to_str()
            .unwrap()
            .to_string();
        unsafe { crate::ffi::galfus_string_free(logs_ptr) };
        let logs: serde_json::Value = serde_json::from_str(&logs_str).unwrap();
        assert!(
            logs.as_array()
                .unwrap()
                .iter()
                .any(|e| e["message"] == "test-memory-trace")
        );

        assert_eq!(galfus_diagnostics_reset(), 0);
        assert_eq!(galfus_diagnostics_set_tags(0), 0);
    }
}
