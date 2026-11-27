//! Structured engine error event queue with bounded capacity and deduplication.
//!
//! Captures asynchronous GPU errors (`wgpu::Error::OutOfMemory`, `DeviceLost`,
//! `Validation`, `Internal`), surface errors, resource overflows, and recovered
//! internal panics without aborting the host process.

use std::collections::VecDeque;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

/// Maximum number of distinct error events retained between drains.
pub const MAX_ENGINE_ERROR_EVENTS: usize = 64;

/// Machine-readable error category emitted by the engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineErrorCode {
    /// GPU memory allocation or swapchain memory exhausted.
    GpuOutOfMemory,
    /// GPU device was lost (driver reset / TDR / severe OOM).
    GpuDeviceLost,
    /// GPU API validation error reported by `wgpu`.
    GpuValidation,
    /// Internal GPU backend error reported by `wgpu`.
    GpuInternal,
    /// Swapchain / presentation surface error (`Lost`, `Outdated`, `Timeout`, `Other`).
    GpuSurfaceError,
    /// GPU arena, atlas, or resource capacity overflow.
    ResourceOverflow,
    /// Unexpected Rust panic recovered at an FFI/host boundary.
    InternalPanic,
}

/// Subsystem that originated an [`EngineErrorEvent`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineErrorSource {
    Gpu,
    Core,
    Platform,
    Multiverse,
    Realm,
}

/// Severity level guiding host handling when no error listener is registered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineErrorSeverity {
    /// Recoverable transient issue (e.g. swapchain outdated/timeout).
    Warning,
    /// Operation-level error that did not invalidate the entire runtime.
    Error,
    /// Fatal runtime/GPU failure (e.g. OOM, device lost, internal panic).
    Fatal,
}

/// Structured error event drained by the host and dispatched to error listeners.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineErrorEvent {
    pub code: EngineErrorCode,
    pub source: EngineErrorSource,
    pub severity: EngineErrorSeverity,
    pub message: String,
    /// Number of coalesced occurrences of this identical error since the last drain.
    pub count: u32,
}

fn error_queue() -> &'static Mutex<VecDeque<EngineErrorEvent>> {
    static QUEUE: OnceLock<Mutex<VecDeque<EngineErrorEvent>>> = OnceLock::new();
    QUEUE.get_or_init(|| Mutex::new(VecDeque::with_capacity(MAX_ENGINE_ERROR_EVENTS)))
}

/// Enqueues a structured engine error event, coalescing identical errors and
/// capping queue size to [`MAX_ENGINE_ERROR_EVENTS`] to prevent error storms.
pub fn push_engine_error(
    code: EngineErrorCode,
    source: EngineErrorSource,
    severity: EngineErrorSeverity,
    message: impl Into<String>,
) {
    let message = message.into();
    let mut queue = error_queue()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);

    if let Some(existing) = queue.iter_mut().find(|ev| {
        ev.code == code && ev.source == source && ev.severity == severity && ev.message == message
    }) {
        existing.count = existing.count.saturating_add(1);
        return;
    }

    if queue.len() >= MAX_ENGINE_ERROR_EVENTS {
        queue.pop_front();
    }

    queue.push_back(EngineErrorEvent {
        code,
        source,
        severity,
        message,
        count: 1,
    });
}

/// Drains all pending engine error events in FIFO order.
pub fn drain_engine_errors() -> Vec<EngineErrorEvent> {
    let mut queue = error_queue()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    queue.drain(..).collect()
}

/// Discards all pending engine error events (e.g. on platform shutdown).
pub fn clear_engine_errors() {
    let mut queue = error_queue()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    queue.clear();
}

/// Extracts a human-readable message from a panic payload.
pub fn panic_payload_message(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "Unknown panic payload".to_string()
    }
}

/// Runs `f` inside `catch_unwind`, converting any panic into an
/// [`EngineErrorCode::InternalPanic`] event and returning `Err(message)`.
pub fn catch_panic_as_error<T, F: FnOnce() -> T>(context: &str, f: F) -> Result<T, String> {
    catch_unwind(AssertUnwindSafe(f)).map_err(|payload| {
        let detail = panic_payload_message(payload.as_ref());
        let message = format!("Internal panic in {context}: {detail}");
        push_engine_error(
            EngineErrorCode::InternalPanic,
            EngineErrorSource::Core,
            EngineErrorSeverity::Fatal,
            message.clone(),
        );
        message
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn coalesces_identical_errors_and_respects_capacity() {
        let _lock = TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        clear_engine_errors();

        push_engine_error(
            EngineErrorCode::GpuOutOfMemory,
            EngineErrorSource::Gpu,
            EngineErrorSeverity::Fatal,
            "VRAM exhausted",
        );
        push_engine_error(
            EngineErrorCode::GpuOutOfMemory,
            EngineErrorSource::Gpu,
            EngineErrorSeverity::Fatal,
            "VRAM exhausted",
        );

        let drained = drain_engine_errors();
        assert_eq!(drained.len(), 1);
        assert_eq!(drained[0].code, EngineErrorCode::GpuOutOfMemory);
        assert_eq!(drained[0].count, 2);
        assert!(drain_engine_errors().is_empty());

        for i in 0..(MAX_ENGINE_ERROR_EVENTS + 10) {
            push_engine_error(
                EngineErrorCode::GpuValidation,
                EngineErrorSource::Gpu,
                EngineErrorSeverity::Error,
                format!("err-{i}"),
            );
        }
        let capped = drain_engine_errors();
        assert_eq!(capped.len(), MAX_ENGINE_ERROR_EVENTS);
        assert_eq!(capped[0].message, "err-10");
    }

    #[test]
    fn catch_panic_as_error_records_internal_panic() {
        let _lock = TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        clear_engine_errors();
        let res: Result<(), String> = catch_panic_as_error("test_boundary", || {
            panic!("simulated boom");
        });
        assert!(res.is_err());
        let events = drain_engine_errors();
        assert!(events.iter().any(|ev| {
            ev.code == EngineErrorCode::InternalPanic
                && ev.severity == EngineErrorSeverity::Fatal
                && ev.message.contains("simulated boom")
        }));
    }
}
