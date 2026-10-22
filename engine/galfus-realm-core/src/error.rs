use thiserror::Error;

/// Errors emitted by Realm operations.
#[derive(Debug, Error)]
pub enum RealmError {
    #[error("Failed to prepare realm {0}: {1}")]
    PrepareFailed(u32, String),

    #[error("Failed to render realm {0}: {1}")]
    RenderFailed(u32, String),

    #[error("Resource not found in realm {0}: {1}")]
    ResourceNotFound(u32, String),

    #[error("Internal realm error: {0}")]
    Internal(String),
}

/// Convenience alias for `Result<T, RealmError>`.
pub type RealmResult<T> = Result<T, RealmError>;
