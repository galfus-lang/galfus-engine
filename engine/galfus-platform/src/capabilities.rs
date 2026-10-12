use serde::{Deserialize, Serialize};

/// Explicit capability report of the current platform environment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilities {
    /// True if multiple independent OS windows can be spawned.
    pub supports_multiple_windows: bool,

    /// True if the platform permits programmatic window positioning.
    pub supports_window_positioning: bool,

    /// True if the cursor can be confined or locked.
    pub supports_cursor_grab: bool,

    /// True if gamepad polling/events are available.
    pub supports_gamepad: bool,

    /// True if audio output is supported.
    pub supports_audio: bool,

    /// True if running in a headless mode without display outputs.
    pub is_headless: bool,
}

impl PlatformCapabilities {
    /// Detects and returns capabilities available in the current compile target.
    pub const fn current() -> Self {
        #[cfg(target_arch = "wasm32")]
        {
            Self {
                supports_multiple_windows: false,
                supports_window_positioning: false,
                supports_cursor_grab: true,
                supports_gamepad: true,
                supports_audio: true,
                is_headless: false,
            }
        }

        #[cfg(not(target_arch = "wasm32"))]
        {
            Self {
                supports_multiple_windows: true,
                // On Wayland, programmatic window positioning is restricted by the compositor
                #[cfg(target_os = "linux")]
                supports_window_positioning: false,
                #[cfg(not(target_os = "linux"))]
                supports_window_positioning: true,
                supports_cursor_grab: true,
                supports_gamepad: true,
                supports_audio: true,
                is_headless: false,
            }
        }
    }
}

impl Default for PlatformCapabilities {
    fn default() -> Self {
        Self::current()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_platform_capabilities_detection() {
        let caps = PlatformCapabilities::current();
        #[cfg(not(target_arch = "wasm32"))]
        {
            assert!(caps.supports_multiple_windows);
            assert!(caps.supports_gamepad);
            assert!(caps.supports_audio);
        }
    }
}
