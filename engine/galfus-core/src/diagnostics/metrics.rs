//! Fixed-memory counters, span timing ring buffers, per-category memory breakdown,
//! drift warnings, and unified snapshot types.

use std::collections::BTreeMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::Serialize;

use super::clock::ClockTimestamp;
use super::log_ring::DiagnosticLogEntry;

/// Rolling window size per timing span (bounded O(1) memory).
pub const SPAN_RING_CAP: usize = 128;

/// Global low-overhead atomic counters.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(usize)]
pub enum MetricCounter {
    FfiCStringAlloc = 0,
    FfiCStringFree = 1,
    FfiCStringOutboundBytes = 2,
    FfiInboundPayloadBytes = 3,
    GpuSamplerCacheHit = 4,
    GpuSamplerCacheMiss = 5,
    GpuLayoutCacheHit = 6,
    GpuLayoutCacheMiss = 7,
    GpuPipelineCacheHit = 8,
    GpuPipelineCacheMiss = 9,
    GpuPipelineUncachedCreated = 10,
    GpuBindGroupCascadeDestroyed = 11,
    GpuArenaGrowCount = 12,
    GpuAtlasRepackCount = 13,
    Realm3dPerFrameBindGroups = 14,
    AudioVoicesReaped = 15,
    AnimationEventEvictions = 16,
    FrameCount = 17,
}

pub const METRIC_COUNTER_COUNT: usize = 18;

pub struct AtomicCounters {
    values: [AtomicU64; METRIC_COUNTER_COUNT],
}

impl AtomicCounters {
    pub const fn new() -> Self {
        #[allow(clippy::declare_interior_mutable_const)]
        const ZERO: AtomicU64 = AtomicU64::new(0);
        Self {
            values: [ZERO; METRIC_COUNTER_COUNT],
        }
    }

    #[inline]
    pub fn add(&self, counter: MetricCounter, delta: u64) {
        self.values[counter as usize].fetch_add(delta, Ordering::Relaxed);
    }

    #[inline]
    pub fn get(&self, counter: MetricCounter) -> u64 {
        self.values[counter as usize].load(Ordering::Relaxed)
    }

    pub fn reset(&self) {
        for v in &self.values {
            v.store(0, Ordering::Relaxed);
        }
    }

    pub fn snapshot(&self) -> CountersSnapshot {
        let alloc = self.get(MetricCounter::FfiCStringAlloc);
        let free = self.get(MetricCounter::FfiCStringFree);
        CountersSnapshot {
            frame_count: self.get(MetricCounter::FrameCount),
            ffi_cstring_alloc: alloc,
            ffi_cstring_free: free,
            ffi_cstring_live: alloc.saturating_sub(free),
            ffi_cstring_outbound_bytes: self.get(MetricCounter::FfiCStringOutboundBytes),
            ffi_inbound_payload_bytes: self.get(MetricCounter::FfiInboundPayloadBytes),
            gpu_sampler_cache_hit: self.get(MetricCounter::GpuSamplerCacheHit),
            gpu_sampler_cache_miss: self.get(MetricCounter::GpuSamplerCacheMiss),
            gpu_layout_cache_hit: self.get(MetricCounter::GpuLayoutCacheHit),
            gpu_layout_cache_miss: self.get(MetricCounter::GpuLayoutCacheMiss),
            gpu_pipeline_cache_hit: self.get(MetricCounter::GpuPipelineCacheHit),
            gpu_pipeline_cache_miss: self.get(MetricCounter::GpuPipelineCacheMiss),
            gpu_pipeline_uncached_created: self.get(MetricCounter::GpuPipelineUncachedCreated),
            gpu_bind_group_cascade_destroyed: self.get(MetricCounter::GpuBindGroupCascadeDestroyed),
            gpu_arena_grow_count: self.get(MetricCounter::GpuArenaGrowCount),
            gpu_atlas_repack_count: self.get(MetricCounter::GpuAtlasRepackCount),
            realm3d_per_frame_bind_groups: self.get(MetricCounter::Realm3dPerFrameBindGroups),
            audio_voices_reaped: self.get(MetricCounter::AudioVoicesReaped),
            animation_event_evictions: self.get(MetricCounter::AnimationEventEvictions),
        }
    }
}

impl Default for AtomicCounters {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountersSnapshot {
    pub frame_count: u64,
    pub ffi_cstring_alloc: u64,
    pub ffi_cstring_free: u64,
    pub ffi_cstring_live: u64,
    pub ffi_cstring_outbound_bytes: u64,
    pub ffi_inbound_payload_bytes: u64,
    pub gpu_sampler_cache_hit: u64,
    pub gpu_sampler_cache_miss: u64,
    pub gpu_layout_cache_hit: u64,
    pub gpu_layout_cache_miss: u64,
    pub gpu_pipeline_cache_hit: u64,
    pub gpu_pipeline_cache_miss: u64,
    pub gpu_pipeline_uncached_created: u64,
    pub gpu_bind_group_cascade_destroyed: u64,
    pub gpu_arena_grow_count: u64,
    pub gpu_atlas_repack_count: u64,
    pub realm3d_per_frame_bind_groups: u64,
    pub audio_voices_reaped: u64,
    pub animation_event_evictions: u64,
}

/// Fixed-capacity rolling timing window for a single named span.
struct SpanWindow {
    tag_bit: u64,
    samples_us: [f64; SPAN_RING_CAP],
    cursor: usize,
    filled: usize,
    total_count: u64,
    last_us: f64,
    max_us: f64,
}

impl SpanWindow {
    fn new(tag_bit: u64) -> Self {
        Self {
            tag_bit,
            samples_us: [0.0; SPAN_RING_CAP],
            cursor: 0,
            filled: 0,
            total_count: 0,
            last_us: 0.0,
            max_us: 0.0,
        }
    }

    fn record(&mut self, elapsed_us: f64) {
        self.samples_us[self.cursor] = elapsed_us;
        self.cursor = (self.cursor + 1) % SPAN_RING_CAP;
        if self.filled < SPAN_RING_CAP {
            self.filled += 1;
        }
        self.total_count += 1;
        self.last_us = elapsed_us;
        if elapsed_us > self.max_us {
            self.max_us = elapsed_us;
        }
    }

    fn stats(&self, name: &'static str) -> SpanStats {
        let mut sorted = self.samples_us[..self.filled].to_vec();
        sorted.sort_by(|a, b| a.total_cmp(b));
        let avg_us = if self.filled > 0 {
            sorted.iter().sum::<f64>() / self.filled as f64
        } else {
            0.0
        };
        let p95_us = if sorted.is_empty() {
            0.0
        } else {
            let idx = ((sorted.len() - 1) as f64 * 0.95).round() as usize;
            sorted[idx.min(sorted.len() - 1)]
        };
        SpanStats {
            name,
            tag: super::tags::tag_name(self.tag_bit),
            count: self.total_count,
            last_us: self.last_us,
            avg_us,
            p95_us,
            max_us: self.max_us,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpanStats {
    pub name: &'static str,
    pub tag: &'static str,
    pub count: u64,
    pub last_us: f64,
    pub avg_us: f64,
    pub p95_us: f64,
    pub max_us: f64,
}

pub struct SpanRegistry {
    windows: Mutex<BTreeMap<&'static str, SpanWindow>>,
}

impl SpanRegistry {
    pub fn new() -> Self {
        Self {
            windows: Mutex::new(BTreeMap::new()),
        }
    }

    pub fn record(&self, tag_bit: u64, name: &'static str, elapsed_us: f64) {
        if let Ok(mut guard) = self.windows.lock() {
            let window = guard
                .entry(name)
                .or_insert_with(|| SpanWindow::new(tag_bit));
            window.record(elapsed_us);
        }
    }

    pub fn snapshot(&self, tag_filter: u64) -> Vec<SpanStats> {
        let Ok(guard) = self.windows.lock() else {
            return Vec::new();
        };
        guard
            .iter()
            .filter(|(_, w)| tag_filter == 0 || (w.tag_bit & tag_filter) != 0)
            .map(|(name, w)| w.stats(name))
            .collect()
    }

    pub fn clear(&self) {
        if let Ok(mut guard) = self.windows.lock() {
            guard.clear();
        }
    }
}

impl Default for SpanRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// RAII span timer guard. When the span's tag is disabled, `start` is `None` (no-op on drop).
pub struct SpanGuard {
    tag_bit: u64,
    name: &'static str,
    start: Option<ClockTimestamp>,
}

impl SpanGuard {
    #[inline]
    pub fn new(tag_bit: u64, name: &'static str) -> Self {
        let start = if super::is_tag_enabled(tag_bit) {
            Some(ClockTimestamp::now())
        } else {
            None
        };
        Self {
            tag_bit,
            name,
            start,
        }
    }
}

impl Drop for SpanGuard {
    #[inline]
    fn drop(&mut self) {
        if let Some(start) = self.start {
            super::record_span(self.tag_bit, self.name, start.elapsed_us());
        }
    }
}

/// Memory reservation breakdown for a single subsystem category.
/// Separates active CPU RAM, active GPU VRAM, and reserved backing capacity
/// so leak sources can be isolated by category.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryCategoryStats {
    pub category: String,
    pub tag: &'static str,
    pub cpu_bytes: u64,
    pub gpu_bytes: u64,
    pub reserved_bytes: u64,
    pub item_count: usize,
}

impl MemoryCategoryStats {
    pub fn new(
        category: impl Into<String>,
        tag: &'static str,
        cpu_bytes: u64,
        gpu_bytes: u64,
        reserved_bytes: u64,
        item_count: usize,
    ) -> Self {
        Self {
            category: category.into(),
            tag,
            cpu_bytes,
            gpu_bytes,
            reserved_bytes,
            item_count,
        }
    }
}

/// Aggregated memory usage split by category plus grand totals.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryBreakdown {
    pub total_cpu_bytes: u64,
    pub total_gpu_bytes: u64,
    pub total_reserved_bytes: u64,
    pub total_bytes: u64,
    pub categories: Vec<MemoryCategoryStats>,
}

impl MemoryBreakdown {
    pub fn from_categories(mut categories: Vec<MemoryCategoryStats>) -> Self {
        categories.sort_by(|a, b| {
            let a_total = a.cpu_bytes.saturating_add(a.gpu_bytes);
            let b_total = b.cpu_bytes.saturating_add(b.gpu_bytes);
            b_total
                .cmp(&a_total)
                .then_with(|| a.category.cmp(&b.category))
        });

        let mut total_cpu_bytes = 0u64;
        let mut total_gpu_bytes = 0u64;
        let mut total_reserved_bytes = 0u64;
        for c in &categories {
            total_cpu_bytes = total_cpu_bytes.saturating_add(c.cpu_bytes);
            total_gpu_bytes = total_gpu_bytes.saturating_add(c.gpu_bytes);
            total_reserved_bytes = total_reserved_bytes.saturating_add(c.reserved_bytes);
        }

        Self {
            total_cpu_bytes,
            total_gpu_bytes,
            total_reserved_bytes,
            total_bytes: total_cpu_bytes.saturating_add(total_gpu_bytes),
            categories,
        }
    }
}

/// Automatic leak/drift alert emitted when an internal invariant diverges
/// (e.g., mapping table size > active Rapier set size, or unfreed FFI CStrings).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftWarning {
    pub category: String,
    pub metric: String,
    pub expected: u64,
    pub actual: u64,
    pub delta: i64,
    pub message: String,
}

/// Diagnostic report returned by a [`Realm`] implementation during snapshot collection.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealmDiagnosticReport {
    pub realm_kind: &'static str,
    pub memory_categories: Vec<MemoryCategoryStats>,
    pub drift_warnings: Vec<DriftWarning>,
    pub details: serde_json::Value,
}

/// Complete diagnostic snapshot exposed to native/NAPI/WASM hosts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsSnapshot {
    pub frame_index: u64,
    pub timestamp_ms: f64,
    pub enabled_tags: Vec<&'static str>,
    pub memory: MemoryBreakdown,
    pub counters: CountersSnapshot,
    pub timings: Vec<SpanStats>,
    pub drift_warnings: Vec<DriftWarning>,
    pub resources: serde_json::Value,
    pub recent_logs: Vec<DiagnosticLogEntry>,
}
