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
}
