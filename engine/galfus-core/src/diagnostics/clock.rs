//! Cross-platform monotonic clock helper for native and wasm32 targets.

#[cfg(not(target_arch = "wasm32"))]
use std::sync::OnceLock;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[cfg(not(target_arch = "wasm32"))]
static PROCESS_START: OnceLock<Instant> = OnceLock::new();

/// Returns milliseconds elapsed since process/session start.
#[inline]
pub fn now_ms() -> f64 {
    #[cfg(not(target_arch = "wasm32"))]
    {
        let start = PROCESS_START.get_or_init(Instant::now);
        start.elapsed().as_secs_f64() * 1000.0
    }
    #[cfg(target_arch = "wasm32")]
    {
        web_sys::window()
            .and_then(|w| w.performance())
            .map(|p| p.now())
            .unwrap_or(0.0)
    }
}

/// A lightweight monotonic timestamp for measuring span durations.
#[derive(Debug, Clone, Copy)]
pub struct ClockTimestamp {
    #[cfg(not(target_arch = "wasm32"))]
    instant: Instant,
    #[cfg(target_arch = "wasm32")]
    ms: f64,
}

impl ClockTimestamp {
    #[inline]
    pub fn now() -> Self {
        #[cfg(not(target_arch = "wasm32"))]
        {
            Self {
                instant: Instant::now(),
            }
        }
        #[cfg(target_arch = "wasm32")]
        {
            Self { ms: now_ms() }
        }
    }

    /// Returns elapsed duration in microseconds.
    #[inline]
    pub fn elapsed_us(self) -> f64 {
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.instant.elapsed().as_secs_f64() * 1_000_000.0
        }
        #[cfg(target_arch = "wasm32")]
        {
            (now_ms() - self.ms).max(0.0) * 1000.0
        }
    }
}
