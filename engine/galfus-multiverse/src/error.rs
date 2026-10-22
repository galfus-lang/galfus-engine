use thiserror::Error;

/// Errors emitted by Multiverse operations.
#[derive(Debug, Error)]
pub enum MultiverseError {
    #[error("Target {0} not found")]
    TargetNotFound(u32),

    #[error("Target {0} already exists")]
    TargetAlreadyExists(u32),

    #[error("Realm {0} not found")]
    RealmNotFound(u32),

    #[error("Realm {0} already registered")]
    RealmAlreadyRegistered(u32),

    #[error("Invocation {0} not found")]
    InvocationNotFound(u32),

    #[error("Invocation {0} already exists")]
    InvocationAlreadyExists(u32),

    #[error("Core error: {0}")]
    Core(#[from] galfus_core::error::CoreError),

    #[error("Shader effect error: {0}")]
    ShaderEffect(#[from] galfus_core::shader_effects::EffectError),

    #[error("Invalid host logical ID: {0}")]
    InvalidId(String),

    #[error("Cyclic dependency detected among targets: {0}")]
    CyclicDependency(String),

    #[error("Realm error in realm {0}: {1}")]
    RealmError(u32, String),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("GPU error: {0}")]
    Gpu(#[from] galfus_gpu_manager::GpuError),
}

/// Convenience alias for `Result<T, MultiverseError>`.
pub type MultiverseResult<T> = Result<T, MultiverseError>;
