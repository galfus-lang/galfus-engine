use thiserror::Error;

/// Errors produced by animation evaluations, transitions, and target bindings.
#[derive(Debug, Error)]
pub enum AnimationError {
    #[error("Transition ID {0} not found")]
    TransitionNotFound(u32),

    #[error("Transition ID {0} is reserved or already in use")]
    TransitionAlreadyExists(u32),

    #[error("Target type mismatch: cannot interpolate {from:?} to {to:?}")]
    TypeMismatch { from: String, to: String },

    #[error("Invalid value format: {0}")]
    InvalidValue(String),

    #[error("Target property '{target}' is already locked by active animation owner {owner_id}")]
    TargetConflict { target: String, owner_id: u32 },

    #[error("PathFollow ID {0} not found")]
    PathFollowNotFound(u32),

    #[error("PathFollow ID {0} is reserved or already in use")]
    PathFollowAlreadyExists(u32),

    #[error("Invalid path points: {0}")]
    InvalidPathPoints(String),

    #[error("Animation error: {0}")]
    General(String),
}

pub type AnimationResult<T> = Result<T, AnimationError>;
