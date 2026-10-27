use thiserror::Error;

/// Foundational domain-neutral errors for the Galfus Engine.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum CoreError {
    /// Attempted to use a host logical ID within the core-reserved range.
    #[error("Host logical ID {id} falls within the reserved range [{range_start}..={range_end}]")]
    ReservedLogicalId {
        id: u32,
        range_start: u32,
        range_end: u32,
    },

    /// The specified handle slot does not exist or has never been allocated.
    #[error("Handle slot {slot} is invalid or unallocated")]
    InvalidHandle { slot: u32 },

    /// The handle refers to an old generation that has since been recycled.
    #[error(
        "Stale handle at slot {slot}: expected generation {expected_generation}, found {actual_generation}"
    )]
    StaleHandle {
        slot: u32,
        expected_generation: u32,
        actual_generation: u32,
    },

    /// The handle was presented to a pool or registry with a different namespace ID.
    #[error("Namespace mismatch for handle at slot {slot}: expected {expected}, found {actual}")]
    NamespaceMismatch {
        slot: u32,
        expected: u16,
        actual: u16,
    },

    /// The registry or pool has exhausted available slots.
    #[error("Handle pool exhausted: no free slots available")]
    SlotExhaustion,

    /// Deterministic content IDs do not match.
    #[error("Content ID mismatch: expected {expected:#018x}, got {actual:#018x}")]
    ContentMismatch { expected: u64, actual: u64 },

    /// A deterministic content ID collision was detected.
    #[error("Content ID collision detected for hash {content_id:#018x}")]
    CollisionDetected { content_id: u64 },

    /// A shader effect error occurred during validation or composition.
    #[error("Shader effect error: {0}")]
    ShaderEffect(#[from] crate::shader_effects::EffectError),
}

/// Convenience result alias for core operations.
pub type CoreResult<T> = Result<T, CoreError>;
