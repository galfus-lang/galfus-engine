use crate::error::{CoreError, CoreResult};

/// Total number of IDs reserved by the core at the end of the `u32` range.
pub const RESERVED_LOGICAL_ID_COUNT: u32 = 65_535;

/// Starting value (inclusive) of the core-reserved ID range.
pub const RESERVED_RANGE_START: u32 = u32::MAX - RESERVED_LOGICAL_ID_COUNT + 1; // 4_294_901_761

/// Ending value (inclusive) of the core-reserved ID range.
pub const RESERVED_RANGE_END: u32 = u32::MAX; // 4_294_967_295

/// Returns true if the provided `id` falls into the core-reserved range.
#[inline]
pub const fn is_reserved_logical_id(id: u32) -> bool {
    id >= RESERVED_RANGE_START
}

/// Validates that a host-supplied logical ID does not use the core-reserved range.
pub fn validate_host_logical_id(id: u32) -> CoreResult<u32> {
    if is_reserved_logical_id(id) {
        Err(CoreError::ReservedLogicalId {
            id,
            range_start: RESERVED_RANGE_START,
            range_end: RESERVED_RANGE_END,
        })
    } else {
        Ok(id)
    }
}

/// A validated host logical identifier that is guaranteed not to fall within the reserved range.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct LogicalId(u32);

impl LogicalId {
    /// Attempts to construct a new `LogicalId` from a raw `u32`, validating the core reservation policy.
    pub fn new(id: u32) -> CoreResult<Self> {
        validate_host_logical_id(id)?;
        Ok(Self(id))
    }

    /// Returns the inner raw ID.
    #[inline]
    pub const fn get(self) -> u32 {
        self.0
    }
}

impl TryFrom<u32> for LogicalId {
    type Error = CoreError;

    #[inline]
    fn try_from(value: u32) -> Result<Self, Self::Error> {
        Self::new(value)
    }
}

impl From<LogicalId> for u32 {
    #[inline]
    fn from(id: LogicalId) -> Self {
        id.get()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_logical_ids() {
        assert!(validate_host_logical_id(0).is_ok());
        assert!(validate_host_logical_id(1).is_ok());
        assert!(validate_host_logical_id(RESERVED_RANGE_START - 1).is_ok());

        let id = LogicalId::new(42).unwrap();
        assert_eq!(id.get(), 42);
    }

    #[test]
    fn test_reserved_logical_ids_rejected() {
        assert!(validate_host_logical_id(RESERVED_RANGE_START).is_err());
        assert!(validate_host_logical_id(RESERVED_RANGE_START + 10).is_err());
        assert!(validate_host_logical_id(RESERVED_RANGE_END).is_err());
        assert!(validate_host_logical_id(u32::MAX).is_err());

        assert!(LogicalId::new(RESERVED_RANGE_START).is_err());
    }

    #[test]
    fn test_boundary_values() {
        assert_eq!(RESERVED_RANGE_START, 4_294_901_761);
        assert_eq!(RESERVED_RANGE_END, 4_294_967_295);
        assert_eq!(
            RESERVED_RANGE_END - RESERVED_RANGE_START + 1,
            RESERVED_LOGICAL_ID_COUNT
        );
    }
}
