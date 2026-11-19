//! Diagnostic statistics for [`PlatformContext`].

use crate::context::PlatformContext;

pub(super) fn pump_events_span() -> galfus_core::diagnostics::SpanGuard {
    galfus_core::diagnostics::SpanGuard::new(
        galfus_core::diagnostics::tags::PLATFORM,
        "platform.pump_events",
    )
}

/// Diagnostic statistics for [`PlatformContext`].
#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformDiagnosticsStats {
    pub windows_active: usize,
    pub pointer_positions_len: usize,
    pub browser_events_len: usize,
    pub audio: crate::audio::context::AudioDiagnosticsStats,
}

impl PlatformDiagnosticsStats {
    pub fn memory_categories(&self) -> Vec<galfus_core::diagnostics::MemoryCategoryStats> {
        vec![self.audio.memory_category()]
    }

    pub fn drift_warnings(&self) -> Vec<galfus_core::diagnostics::DriftWarning> {
        self.audio.drift_warnings()
    }
}

impl PlatformContext {
    /// Returns diagnostic statistics for platform windows, input queues, and audio.
    pub fn diagnostic_stats(&self) -> PlatformDiagnosticsStats {
        let audio = self.audio.diagnostic_stats();
        #[cfg(not(target_arch = "wasm32"))]
        let (pointer_positions_len, browser_events_len) = (self.pointer_positions.len(), 0);
        #[cfg(all(target_arch = "wasm32", feature = "browser"))]
        let (pointer_positions_len, browser_events_len) = (0, self.browser_events.borrow().len());
        #[cfg(all(target_arch = "wasm32", not(feature = "browser")))]
        let (pointer_positions_len, browser_events_len) = (0, 0);

        PlatformDiagnosticsStats {
            windows_active: self.windows.len(),
            pointer_positions_len,
            browser_events_len,
            audio,
        }
    }
}
