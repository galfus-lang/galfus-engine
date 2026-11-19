//! Fixed-capacity ring buffer for tagged debug logs (O(1) bounded memory).

use std::collections::VecDeque;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use super::clock::now_ms;
use super::tags::tag_name;

/// Maximum number of log entries retained in memory at any time.
pub const MAX_LOG_RING_ENTRIES: usize = 512;

/// Diagnostic log severity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticLogLevel {
    Trace = 0,
    Debug = 1,
    Info = 2,
    Warn = 3,
    Error = 4,
}

impl DiagnosticLogLevel {
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => Self::Trace,
            1 => Self::Debug,
            2 => Self::Info,
            3 => Self::Warn,
            _ => Self::Error,
        }
    }
}

/// A single tagged diagnostic log entry.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticLogEntry {
    pub ts_ms: f64,
    pub tag: &'static str,
    pub level: DiagnosticLogLevel,
    pub message: String,
}

pub struct LogRing {
    entries: Mutex<VecDeque<DiagnosticLogEntry>>,
}

impl LogRing {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(VecDeque::with_capacity(MAX_LOG_RING_ENTRIES)),
        }
    }

    pub fn push(&self, tag_bit: u64, level: DiagnosticLogLevel, message: String, console: bool) {
        let tag = tag_name(tag_bit);
        let ts_ms = now_ms();

        if console {
            match level {
                DiagnosticLogLevel::Trace | DiagnosticLogLevel::Debug => {
                    log::debug!("[galfus:{tag}] {message}");
                }
                DiagnosticLogLevel::Info => {
                    log::info!("[galfus:{tag}] {message}");
                }
                DiagnosticLogLevel::Warn => {
                    log::warn!("[galfus:{tag}] {message}");
                }
                DiagnosticLogLevel::Error => {
                    log::error!("[galfus:{tag}] {message}");
                }
            }
        }

        if let Ok(mut guard) = self.entries.lock() {
            if guard.len() >= MAX_LOG_RING_ENTRIES {
                guard.pop_front();
            }
            guard.push_back(DiagnosticLogEntry {
                ts_ms,
                tag,
                level,
                message,
            });
        }
    }

    pub fn snapshot(&self, max_entries: usize) -> Vec<DiagnosticLogEntry> {
        let Ok(guard) = self.entries.lock() else {
            return Vec::new();
        };
        let len = guard.len();
        let skip = len.saturating_sub(max_entries);
        guard.iter().skip(skip).cloned().collect()
    }

    pub fn drain(&self, max_entries: usize) -> Vec<DiagnosticLogEntry> {
        let Ok(mut guard) = self.entries.lock() else {
            return Vec::new();
        };
        let take = max_entries.min(guard.len());
        guard.drain(..take).collect()
    }

    pub fn clear(&self) {
        if let Ok(mut guard) = self.entries.lock() {
            guard.clear();
        }
    }
}

impl Default for LogRing {
    fn default() -> Self {
        Self::new()
    }
}
