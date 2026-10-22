use std::num::NonZeroU32;

use crate::error::{CoreError, CoreResult};
use crate::handle::typed::Handle;

enum Slot<T> {
    Occupied {
        value: T,
        generation: NonZeroU32,
    },
    Vacant {
        next_free: Option<u32>,
        generation: NonZeroU32,
    },
}

/// A generational storage pool providing safe allocation, retrieval, and recycling of slots.
pub struct GenerationalPool<T> {
    namespace: u16,
    slots: Vec<Slot<T>>,
    free_head: Option<u32>,
    active_count: usize,
}

impl<T> GenerationalPool<T> {
    /// Creates a new empty `GenerationalPool` with the given namespace identifier.
    pub fn new(namespace: u16) -> Self {
        Self {
            namespace,
            slots: Vec::new(),
            free_head: None,
            active_count: 0,
        }
    }

    /// Creates a new `GenerationalPool` with pre-allocated capacity.
    pub fn with_capacity(namespace: u16, capacity: usize) -> Self {
        Self {
            namespace,
            slots: Vec::with_capacity(capacity),
            free_head: None,
            active_count: 0,
        }
    }

    /// Returns the namespace identifier assigned to this pool.
    #[inline]
    pub const fn namespace(&self) -> u16 {
        self.namespace
    }

    /// Returns the number of currently active items in the pool.
    #[inline]
    pub fn len(&self) -> usize {
        self.active_count
    }

    /// Returns true if the pool contains no active items.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.active_count == 0
    }

    /// Inserts a new value into the pool, returning its strongly typed `Handle<T>`.
    pub fn insert(&mut self, value: T) -> CoreResult<Handle<T>> {
        self.active_count += 1;

        if let Some(free_slot_idx) = self.free_head {
            let slot = self
                .slots
                .get_mut(free_slot_idx as usize)
                .ok_or(CoreError::SlotExhaustion)?;

            match slot {
                Slot::Vacant {
                    next_free,
                    generation,
                } => {
                    self.free_head = *next_free;
                    let current_gen = *generation;
                    *slot = Slot::Occupied {
                        value,
                        generation: current_gen,
                    };
                    Ok(Handle::new(free_slot_idx, current_gen, self.namespace))
                }
                Slot::Occupied { .. } => Err(CoreError::InvalidHandle {
                    slot: free_slot_idx,
                }),
            }
        } else {
            let slot_idx =
                u32::try_from(self.slots.len()).map_err(|_| CoreError::SlotExhaustion)?;
            let initial_gen = NonZeroU32::new(1).unwrap();
            self.slots.push(Slot::Occupied {
                value,
                generation: initial_gen,
            });
            Ok(Handle::new(slot_idx, initial_gen, self.namespace))
        }
    }

    /// Validates handle namespace and generation, returning the slot index on success.
    fn validate_handle(&self, handle: Handle<T>) -> CoreResult<usize> {
        if handle.namespace() != self.namespace {
            return Err(CoreError::NamespaceMismatch {
                slot: handle.slot(),
                expected: self.namespace,
                actual: handle.namespace(),
            });
        }

        let slot_idx = handle.slot() as usize;
        let slot = self.slots.get(slot_idx).ok_or(CoreError::InvalidHandle {
            slot: handle.slot(),
        })?;

        match slot {
            Slot::Occupied { generation, .. } => {
                if *generation == handle.generation() {
                    Ok(slot_idx)
                } else {
                    Err(CoreError::StaleHandle {
                        slot: handle.slot(),
                        expected_generation: generation.get(),
                        actual_generation: handle.generation().get(),
                    })
                }
            }
            Slot::Vacant { generation, .. } => Err(CoreError::StaleHandle {
                slot: handle.slot(),
                expected_generation: generation.get(),
                actual_generation: handle.generation().get(),
            }),
        }
    }

    /// Retrieves an immutable reference to the value associated with the handle.
    pub fn get(&self, handle: Handle<T>) -> CoreResult<&T> {
        let slot_idx = self.validate_handle(handle)?;
        match &self.slots[slot_idx] {
            Slot::Occupied { value, .. } => Ok(value),
            Slot::Vacant { .. } => unreachable!(),
        }
    }

    /// Retrieves a mutable reference to the value associated with the handle.
    pub fn get_mut(&mut self, handle: Handle<T>) -> CoreResult<&mut T> {
        let slot_idx = self.validate_handle(handle)?;
        match &mut self.slots[slot_idx] {
            Slot::Occupied { value, .. } => Ok(value),
            Slot::Vacant { .. } => unreachable!(),
        }
    }

    /// Removes and returns the value, incrementing the slot's generation to invalidate existing handles.
    pub fn remove(&mut self, handle: Handle<T>) -> CoreResult<T> {
        let slot_idx = self.validate_handle(handle)?;
        self.active_count -= 1;

        let next_free = self.free_head;
        self.free_head = Some(slot_idx as u32);

        let old_slot = std::mem::replace(
            &mut self.slots[slot_idx],
            Slot::Vacant {
                next_free,
                generation: bump_generation(handle.generation()),
            },
        );

        match old_slot {
            Slot::Occupied { value, .. } => Ok(value),
            Slot::Vacant { .. } => unreachable!(),
        }
    }

    /// Returns true if the handle is valid and refers to an active value in this pool.
    pub fn contains(&self, handle: Handle<T>) -> bool {
        self.validate_handle(handle).is_ok()
    }
}

/// Increments a generation number safely, wrapping around while avoiding zero.
fn bump_generation(current: NonZeroU32) -> NonZeroU32 {
    let next = current.get().wrapping_add(1);
    NonZeroU32::new(if next == 0 { 1 } else { next }).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pool_lifecycle() {
        let mut pool = GenerationalPool::<String>::new(1);
        let h1 = pool.insert("Item 1".to_string()).unwrap();
        let h2 = pool.insert("Item 2".to_string()).unwrap();

        assert_eq!(pool.len(), 2);
        assert_eq!(pool.get(h1).unwrap(), "Item 1");
        assert_eq!(pool.get(h2).unwrap(), "Item 2");

        let removed = pool.remove(h1).unwrap();
        assert_eq!(removed, "Item 1");
        assert_eq!(pool.len(), 1);

        // h1 is now stale
        assert!(pool.get(h1).is_err());
        assert!(!pool.contains(h1));

        // Insert new item should reuse slot 0 with bumped generation
        let h3 = pool.insert("Item 3".to_string()).unwrap();
        assert_eq!(h3.slot(), h1.slot());
        assert_ne!(h3.generation(), h1.generation());
        assert_eq!(pool.get(h3).unwrap(), "Item 3");
    }

    #[test]
    fn test_namespace_mismatch_rejected() {
        let mut pool1 = GenerationalPool::<u32>::new(10);
        let h1 = pool1.insert(100).unwrap();

        let pool2 = GenerationalPool::<u32>::new(20);
        assert!(matches!(
            pool2.get(h1),
            Err(CoreError::NamespaceMismatch { .. })
        ));
    }
}
