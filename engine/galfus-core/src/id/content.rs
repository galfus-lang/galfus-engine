use crate::error::{CoreError, CoreResult};

/// Deterministic 64-bit content hash identifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ContentId(u64);

impl ContentId {
    /// Constructs a `ContentId` directly from a 64-bit hash.
    #[inline]
    pub const fn from_raw(hash: u64) -> Self {
        Self(hash)
    }

    /// Computes a deterministic 64-bit FNV-1a hash from a byte slice.
    pub fn from_bytes(bytes: &[u8]) -> Self {
        const FNV_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
        const FNV_PRIME: u64 = 0x100000001b3;

        let mut hash = FNV_OFFSET_BASIS;
        for &byte in bytes {
            hash ^= u64::from(byte);
            hash = hash.wrapping_mul(FNV_PRIME);
        }

        Self(hash)
    }

    /// Returns the underlying raw 64-bit hash.
    #[inline]
    pub const fn as_u64(self) -> u64 {
        self.0
    }

    /// Validates that two content sources with identical IDs actually match, guarding against hash collisions.
    pub fn verify_match(self, other: Self) -> CoreResult<()> {
        if self == other {
            Ok(())
        } else {
            Err(CoreError::CollisionDetected { content_id: self.0 })
        }
    }
}

impl From<u64> for ContentId {
    #[inline]
    fn from(hash: u64) -> Self {
        Self::from_raw(hash)
    }
}

impl From<ContentId> for u64 {
    #[inline]
    fn from(id: ContentId) -> Self {
        id.as_u64()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_content_id_determinism() {
        let id1 = ContentId::from_bytes(b"vertex_shader_v1");
        let id2 = ContentId::from_bytes(b"vertex_shader_v1");
        let id3 = ContentId::from_bytes(b"vertex_shader_v2");

        assert_eq!(id1, id2);
        assert_ne!(id1, id3);
        assert_ne!(id1.as_u64(), 0);
    }

    #[test]
    fn test_content_id_collision_verification() {
        let id1 = ContentId::from_raw(0x1234);
        let id2 = ContentId::from_raw(0x1234);
        let id3 = ContentId::from_raw(0x5678);

        assert!(id1.verify_match(id2).is_ok());
        assert!(id1.verify_match(id3).is_err());
    }
}
