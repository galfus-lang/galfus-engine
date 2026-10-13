use galfus_core::CoreError;
use thiserror::Error;

/// Errors produced by platform operations and environment adapters.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum PlatformError {
    /// Windowing operations must be executed on the main thread.
    #[error("Platform operation must be executed on the main thread")]
    NotOnMainThread,

    /// The specified window was not found in the platform context.
    #[error("Window with ID {0} not found")]
    WindowNotFound(u32),

    /// A window with this logical ID is already registered.
    #[error("Window with ID {0} already exists")]
    WindowAlreadyExists(u32),

    /// Window creation failed in the underlying backend.
    #[error("Failed to create window: {0}")]
    WindowCreationFailed(String),

    /// The requested operation is not supported by the current platform backend.
    #[error("Platform capability not supported: {0}")]
    UnsupportedCapability(&'static str),

    /// Audio system initialization failed.
    #[error("Failed to initialize audio system: {0}")]
    AudioInitializationFailed(String),

    /// The specified sound resource was not found.
    #[error("Sound with ID {0} not found")]
    SoundNotFound(u32),

    /// An audio playback or control operation failed.
    #[error("Audio playback error: {0}")]
    AudioPlaybackFailed(String),

    /// An underlying core error occurred (e.g. reserved logical ID).
    #[error(transparent)]
    Core(#[from] CoreError),
}

/// Convenience result alias for platform operations.
pub type PlatformResult<T> = Result<T, PlatformError>;
