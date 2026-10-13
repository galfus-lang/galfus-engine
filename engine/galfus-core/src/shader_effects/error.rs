use thiserror::Error;

/// Errors produced during shader effect validation and composition.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum EffectError {
    /// Snippet contains no actual code.
    #[error("Shader snippet cannot be empty")]
    EmptySnippet,

    /// Snippet contains a token reserved for engine pipelines.
    #[error("Shader snippet contains forbidden token '{0}'")]
    ForbiddenToken(String),

    /// Required function entrypoint was not found in the snippet.
    #[error("Shader snippet is missing required function entrypoint '{0}'")]
    MissingEntrypoint(String),

    /// Missing or malformed injection placeholder.
    #[error("Shader template is missing required placeholder '{0}'")]
    MissingPlaceholder(String),
}

/// Convenience result alias for shader effect operations.
pub type EffectResult<T> = Result<T, EffectError>;
