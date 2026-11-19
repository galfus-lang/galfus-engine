//! Tagged debug logging, process timing spans, per-category memory tracking,
//! and diagnostic snapshot primitives for Galfus Engine.

pub mod clock;
pub mod log_ring;
pub mod metrics;
pub mod tags;

use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicU64, Ordering};

use serde::{Deserialize, Serialize};

pub use clock::{ClockTimestamp, now_ms};
pub use log_ring::{DiagnosticLogEntry, DiagnosticLogLevel, MAX_LOG_RING_ENTRIES};
pub use metrics::{
    CountersSnapshot, DiagnosticsSnapshot, DriftWarning, MemoryBreakdown, MemoryCategoryStats,
    MetricCounter, RealmDiagnosticReport, SPAN_RING_CAP, SpanGuard, SpanStats,
};

use log_ring::LogRing;
use metrics::{AtomicCounters, SpanRegistry};

/// Runtime configuration for the tagged diagnostics system.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsConfig {
    /// Optional list of tag names (e.g. `["gpu", "physics", "ffi", "memory"]` or `["*"]`).
    pub enabled_tags: Option<Vec<String>>,
    /// Optional raw bitmask override (takes precedence if `enabled_tags` is `None`).
    pub tags_mask: Option<u64>,
    /// Forward tagged logs to `log::debug!/info!/warn!/error!`.
    pub console_output: Option<bool>,
    /// Minimum log level (`trace`, `debug`, `info`, `warn`, `error`).
    pub log_level: Option<DiagnosticLogLevel>,
}

struct DiagnosticsState {
    enabled_tags: AtomicU64,
    console_output: AtomicBool,
    min_level: AtomicU8,
    counters: AtomicCounters,
    spans: SpanRegistry,
    logs: LogRing,
}

impl DiagnosticsState {
    fn new() -> Self {
        let initial_tags = tags::initial_mask_from_env();
        Self {
            enabled_tags: AtomicU64::new(initial_tags),
            console_output: AtomicBool::new(initial_tags != 0),
            min_level: AtomicU8::new(DiagnosticLogLevel::Debug as u8),
            counters: AtomicCounters::new(),
            spans: SpanRegistry::new(),
            logs: LogRing::new(),
        }
    }
}

static STATE: OnceLock<DiagnosticsState> = OnceLock::new();

#[inline]
fn state() -> &'static DiagnosticsState {
    STATE.get_or_init(DiagnosticsState::new)
}

/// Fast-path check (~1 atomic load) for whether any bit in `tag_mask` is enabled.
#[inline]
pub fn is_tag_enabled(tag_mask: u64) -> bool {
    (state().enabled_tags.load(Ordering::Relaxed) & tag_mask) != 0
}

/// Returns the currently active tag bitmask.
#[inline]
pub fn enabled_tags_mask() -> u64 {
    state().enabled_tags.load(Ordering::Relaxed)
}

/// Sets the active tag bitmask directly.
pub fn set_enabled_tags_mask(mask: u64) {
    state().enabled_tags.store(mask, Ordering::Relaxed);
}

/// Applies a [`DiagnosticsConfig`] update.
pub fn configure(config: &DiagnosticsConfig) {
    let st = state();
    if let Some(ref list) = config.enabled_tags {
        st.enabled_tags
            .store(tags::parse_tag_list(list), Ordering::Relaxed);
    } else if let Some(mask) = config.tags_mask {
        st.enabled_tags.store(mask, Ordering::Relaxed);
    }
    if let Some(console) = config.console_output {
        st.console_output.store(console, Ordering::Relaxed);
    }
    if let Some(level) = config.log_level {
        st.min_level.store(level as u8, Ordering::Relaxed);
    }
}

/// Increments a global atomic counter unconditionally (cost ~1ns).
#[inline]
pub fn counter_add(counter: MetricCounter, delta: u64) {
    state().counters.add(counter, delta);
}

/// Reads a global atomic counter.
#[inline]
pub fn counter_get(counter: MetricCounter) -> u64 {
    state().counters.get(counter)
}

/// Returns a snapshot of all global atomic counters.
pub fn counters_snapshot() -> CountersSnapshot {
    state().counters.snapshot()
}

/// Records a span timing sample in microseconds.
#[inline]
pub fn record_span(tag_bit: u64, name: &'static str, elapsed_us: f64) {
    state().spans.record(tag_bit, name, elapsed_us);
}

/// Returns timing stats filtered by `tag_filter` (`0` means all recorded spans).
pub fn timings_snapshot(tag_filter: u64) -> Vec<SpanStats> {
    state().spans.snapshot(tag_filter)
}

/// Emits a tagged log entry if the tag and log level are enabled.
pub fn emit_log(tag_bit: u64, level: DiagnosticLogLevel, message: String) {
    let st = state();
    if (st.enabled_tags.load(Ordering::Relaxed) & tag_bit) == 0 {
        return;
    }
    if (level as u8) < st.min_level.load(Ordering::Relaxed) {
        return;
    }
    let console = st.console_output.load(Ordering::Relaxed);
    st.logs.push(tag_bit, level, message, console);
}

/// Returns up to `max_entries` recent log entries without draining.
pub fn recent_logs(max_entries: usize) -> Vec<DiagnosticLogEntry> {
    state().logs.snapshot(max_entries)
}

/// Drains up to `max_entries` log entries from the ring buffer.
pub fn drain_logs(max_entries: usize) -> Vec<DiagnosticLogEntry> {
    state().logs.drain(max_entries)
}

/// Resets counters, timing windows, and log ring buffer (preserves enabled tags).
pub fn reset() {
    let st = state();
    st.counters.reset();
    st.spans.clear();
    st.logs.clear();
}

/// Emits a tagged debug log only when the tag is enabled (zero formatting cost when disabled).
#[macro_export]
macro_rules! galfus_trace {
    ($tag:expr, $($arg:tt)*) => {
        if $crate::diagnostics::is_tag_enabled($tag) {
            $crate::diagnostics::emit_log(
                $tag,
                $crate::diagnostics::DiagnosticLogLevel::Debug,
                format!($($arg)*),
            );
        }
    };
}

/// Emits a tagged warning log only when the tag is enabled.
#[macro_export]
macro_rules! galfus_diag_warn {
    ($tag:expr, $($arg:tt)*) => {
        if $crate::diagnostics::is_tag_enabled($tag) {
            $crate::diagnostics::emit_log(
                $tag,
                $crate::diagnostics::DiagnosticLogLevel::Warn,
                format!($($arg)*),
            );
        }
    };
}

/// Creates a scoped RAII timing span that is a no-op when `$tag` is disabled.
#[macro_export]
macro_rules! galfus_span {
    ($tag:expr, $name:expr) => {
        $crate::diagnostics::SpanGuard::new($tag, $name)
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tag_parsing_and_mask_roundtrip() {
        let mask = tags::parse_tags_csv("gpu, physics, ffi, memory");
        assert_ne!(mask & tags::GPU, 0);
        assert_ne!(mask & tags::PHYSICS, 0);
        assert_ne!(mask & tags::FFI, 0);
        assert_ne!(mask & tags::MEMORY, 0);
        assert_eq!(mask & tags::AUDIO, 0);

        let names = tags::mask_to_names(mask);
        assert!(names.contains(&"gpu"));
        assert!(names.contains(&"physics"));
        assert!(names.contains(&"ffi"));
        assert!(names.contains(&"memory"));
    }

    #[test]
    fn log_ring_stays_bounded() {
        let ring = LogRing::new();
        for i in 0..(MAX_LOG_RING_ENTRIES + 100) {
            ring.push(
                tags::MEMORY,
                DiagnosticLogLevel::Debug,
                format!("msg {i}"),
                false,
            );
        }
        let all = ring.snapshot(MAX_LOG_RING_ENTRIES + 100);
        assert_eq!(all.len(), MAX_LOG_RING_ENTRIES);
        assert_eq!(all.first().unwrap().message, "msg 100");
    }

    #[test]
    fn memory_breakdown_sorts_by_total_desc() {
        let breakdown = MemoryBreakdown::from_categories(vec![
            MemoryCategoryStats::new("small", "gpu", 100, 0, 128, 1),
            MemoryCategoryStats::new("big_vram", "realm3d", 0, 1024 * 1024, 1024 * 1024, 1),
            MemoryCategoryStats::new("medium", "physics", 4096, 0, 8192, 10),
        ]);
        assert_eq!(breakdown.categories[0].category, "big_vram");
        assert_eq!(breakdown.categories[1].category, "medium");
        assert_eq!(breakdown.total_cpu_bytes, 4196);
        assert_eq!(breakdown.total_gpu_bytes, 1024 * 1024);
        assert_eq!(breakdown.total_bytes, 4196 + 1024 * 1024);
    }
}
