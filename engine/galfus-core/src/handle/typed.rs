use std::fmt;
use std::hash::{Hash, Hasher};
use std::marker::PhantomData;
use std::num::NonZeroU32;

/// A strongly typed generational handle referencing a resource in a pool or registry.
pub struct Handle<T> {
    slot: u32,
    generation: NonZeroU32,
    namespace: u16,
    _marker: PhantomData<fn() -> T>,
}

impl<T> Handle<T> {
    /// Creates a new `Handle` from raw components.
    #[inline]
    pub const fn new(slot: u32, generation: NonZeroU32, namespace: u16) -> Self {
        Self {
            slot,
            generation,
            namespace,
            _marker: PhantomData,
        }
    }

    /// Returns the slot index of the handle.
    #[inline]
    pub const fn slot(&self) -> u32 {
        self.slot
    }

    /// Returns the generation number of the handle.
    #[inline]
    pub const fn generation(&self) -> NonZeroU32 {
        self.generation
    }

    /// Returns the namespace identifier of the registry that issued this handle.
    #[inline]
    pub const fn namespace(&self) -> u16 {
        self.namespace
    }

    /// Casts this handle to reference a different type while preserving slot, generation, and namespace.
    #[inline]
    pub fn cast<U>(self) -> Handle<U> {
        Handle::new(self.slot, self.generation, self.namespace)
    }

    /// Encodes this handle into a 64-bit integer representation (16-bit namespace, 16-bit generation, 32-bit slot).
    #[inline]
    pub const fn to_u64(&self) -> u64 {
        ((self.namespace as u64) << 48)
            | (((self.generation.get() as u64) & 0xFFFF) << 32)
            | (self.slot as u64)
    }

    /// Decodes a handle from its 64-bit integer representation.
    #[inline]
    pub fn from_u64(val: u64) -> Option<Self> {
        let namespace = (val >> 48) as u16;
        let gen_num = ((val >> 32) & 0xFFFF) as u32;
        let slot = (val & 0xFFFF_FFFF) as u32;
        let generation = NonZeroU32::new(gen_num)?;
        Some(Self::new(slot, generation, namespace))
    }

    /// Encodes this handle into a 32-bit integer (16-bit generation, 16-bit slot) for 32-bit FFI channels.
    #[inline]
    pub const fn to_u32_index(&self) -> u32 {
        ((self.generation.get() & 0xFFFF) << 16) | (self.slot & 0xFFFF)
    }

    /// Decodes a handle from a 32-bit integer with an explicit namespace.
    #[inline]
    pub fn from_u32_index(val: u32, namespace: u16) -> Option<Self> {
        let gen_num = (val >> 16) & 0xFFFF;
        let slot = val & 0xFFFF;
        let generation = NonZeroU32::new(gen_num)?;
        Some(Self::new(slot, generation, namespace))
    }
}

impl<T> Copy for Handle<T> {}

impl<T> Clone for Handle<T> {
    #[inline]
    fn clone(&self) -> Self {
        *self
    }
}

impl<T> PartialEq for Handle<T> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.slot == other.slot
            && self.generation == other.generation
            && self.namespace == other.namespace
    }
}

impl<T> Eq for Handle<T> {}

impl<T> Hash for Handle<T> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.slot.hash(state);
        self.generation.hash(state);
        self.namespace.hash(state);
    }
}

impl<T> fmt::Debug for Handle<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Handle")
            .field("slot", &self.slot)
            .field("generation", &self.generation.get())
            .field("namespace", &self.namespace)
            .finish()
    }
}

impl<T> fmt::Display for Handle<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Handle#{}[slot:{},gen:{}]",
            self.namespace,
            self.slot,
            self.generation.get()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct DummyResource;

    #[test]
    fn test_handle_accessors() {
        let generation = NonZeroU32::new(1).unwrap();
        let handle: Handle<DummyResource> = Handle::new(5, generation, 2);

        assert_eq!(handle.slot(), 5);
        assert_eq!(handle.generation().get(), 1);
        assert_eq!(handle.namespace(), 2);
    }

    #[test]
    fn test_handle_cast() {
        struct OtherResource;

        let generation = NonZeroU32::new(2).unwrap();
        let handle1: Handle<DummyResource> = Handle::new(10, generation, 1);
        let handle2: Handle<OtherResource> = handle1.cast();

        assert_eq!(handle2.slot(), 10);
        assert_eq!(handle2.generation().get(), 2);
        assert_eq!(handle2.namespace(), 1);
    }

    #[test]
    fn test_handle_u64_roundtrip() {
        let generation = NonZeroU32::new(42).unwrap();
        let handle: Handle<DummyResource> = Handle::new(1234, generation, 0x20);

        let encoded = handle.to_u64();
        let decoded: Handle<DummyResource> = Handle::from_u64(encoded).unwrap();

        assert_eq!(handle, decoded);
        assert_eq!(decoded.slot(), 1234);
        assert_eq!(decoded.generation().get(), 42);
        assert_eq!(decoded.namespace(), 0x20);
    }

    #[test]
    fn test_handle_u32_index_roundtrip() {
        let generation = NonZeroU32::new(7).unwrap();
        let handle: Handle<DummyResource> = Handle::new(88, generation, 0x30);

        let index = handle.to_u32_index();
        let decoded: Handle<DummyResource> = Handle::from_u32_index(index, 0x30).unwrap();

        assert_eq!(decoded.slot(), 88);
        assert_eq!(decoded.generation().get(), 7);
        assert_eq!(decoded.namespace(), 0x30);
    }
}
