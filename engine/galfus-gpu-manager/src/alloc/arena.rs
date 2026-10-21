use serde::{Deserialize, Serialize};
use std::ops::Range;

use crate::GpuShared;

/// Strongly typed handle to an allocated slice in a `BufferArena`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArenaAllocHandle {
    pub index: u32,
    pub generation: u32,
}

/// Sliced range of bytes in a GPU buffer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArenaSlice {
    pub offset: u64,
    pub size: u64,
}

impl ArenaSlice {
    #[inline]
    pub fn range(&self) -> Range<u64> {
        self.offset..(self.offset + self.size)
    }
}

/// Description for initializing a `BufferArena`.
#[derive(Debug, Clone)]
pub struct BufferArenaDesc {
    pub label: Option<&'static str>,
    pub initial_capacity: u64,
    pub usage: wgpu::BufferUsages,
    pub alignment: u64,
    pub keep_frames: u64,
}

impl Default for BufferArenaDesc {
    fn default() -> Self {
        Self {
            label: Some("Galfus Buffer Arena"),
            initial_capacity: 1024 * 64, // 64 KB
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::INDEX,
            alignment: 4,
            keep_frames: 3,
        }
    }
}

#[derive(Debug, Clone)]
struct AllocRecord {
    generation: u32,
    alive: bool,
    offset: u64,
    size: u64,
}

struct GarbageEntry {
    _buffer: wgpu::Buffer,
    retire_after_frame: u64,
}

/// Sub-allocator over an expanding GPU buffer with generational safety and deferred buffer retirement.
pub struct BufferArena {
    buffer: wgpu::Buffer,
    usage: wgpu::BufferUsages,
    capacity: u64,
    cursor: u64,
    alignment: u64,

    records: Vec<AllocRecord>,
    free_indices: Vec<u32>,
    live_bytes: u64,
    dead_bytes: u64,

    garbage: Vec<GarbageEntry>,
    keep_frames: u64,

    device: GpuShared<wgpu::Device>,
    queue: GpuShared<wgpu::Queue>,
}

impl BufferArena {
    /// Creates a new `BufferArena` using device and queue references.
    pub fn new(
        device: GpuShared<wgpu::Device>,
        queue: GpuShared<wgpu::Queue>,
        desc: BufferArenaDesc,
    ) -> Self {
        assert!(desc.initial_capacity > 0, "initial_capacity must be > 0");
        assert!(
            desc.alignment.is_power_of_two(),
            "alignment must be power-of-two"
        );
        assert!(desc.alignment >= 4, "alignment must be >= 4");

        let usage = desc.usage | wgpu::BufferUsages::COPY_SRC | wgpu::BufferUsages::COPY_DST;

        let buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: desc.label,
            size: desc.initial_capacity,
            usage,
            mapped_at_creation: false,
        });

        Self {
            buffer,
            usage,
            capacity: desc.initial_capacity,
            cursor: 0,
            alignment: desc.alignment,
            records: Vec::new(),
            free_indices: Vec::new(),
            live_bytes: 0,
            dead_bytes: 0,
            garbage: Vec::new(),
            keep_frames: desc.keep_frames.max(1),
            device,
            queue,
        }
    }

    /// Advances the frame counter, retiring deferred old GPU buffers.
    pub fn begin_frame(&mut self, current_frame: u64) {
        self.garbage
            .retain(|g| g.retire_after_frame > current_frame);
    }

    /// Allocates `size_bytes` aligned to the arena alignment.
    pub fn allocate(&mut self, size_bytes: u64) -> ArenaAllocHandle {
        assert!(size_bytes > 0, "cannot allocate 0 bytes");
        assert!(
            size_bytes.is_multiple_of(self.alignment),
            "size must be multiple of alignment ({})",
            self.alignment
        );

        let offset = Self::align_up_to(self.cursor, self.alignment);
        let end = offset
            .checked_add(size_bytes)
            .expect("arena offset overflow");

        if end > self.capacity {
            self.grow_to_fit(end);
        }

        self.cursor = end;
        self.live_bytes = self.live_bytes.saturating_add(size_bytes);

        if let Some(idx) = self.free_indices.pop() {
            let rec = &mut self.records[idx as usize];
            rec.generation = rec.generation.wrapping_add(1);
            rec.alive = true;
            rec.offset = offset;
            rec.size = size_bytes;

            ArenaAllocHandle {
                index: idx,
                generation: rec.generation,
            }
        } else {
            let idx = self.records.len() as u32;
            self.records.push(AllocRecord {
                generation: 1,
                alive: true,
                offset,
                size: size_bytes,
            });
            ArenaAllocHandle {
                index: idx,
                generation: 1,
            }
        }
    }

    /// Writes raw byte payload into an existing slice.
    pub fn write_bytes(&self, handle: ArenaAllocHandle, data: &[u8]) {
        let slice = self.slice(handle);
        assert!(
            data.len() as u64 <= slice.size,
            "data exceeds slice capacity"
        );
        self.queue.write_buffer(&self.buffer, slice.offset, data);
    }

    /// Allocates and writes a byte payload in one step, applying padding if necessary.
    pub fn allocate_and_write(&mut self, data: &[u8]) -> ArenaAllocHandle {
        assert!(!data.is_empty(), "cannot allocate empty data");
        let padded_len = Self::align_up_to(data.len() as u64, self.alignment) as usize;

        if padded_len == data.len() {
            let h = self.allocate(data.len() as u64);
            self.write_bytes(h, data);
            h
        } else {
            let mut padded = Vec::with_capacity(padded_len);
            padded.extend_from_slice(data);
            padded.resize(padded_len, 0u8);
            let h = self.allocate(padded_len as u64);
            self.write_bytes(h, &padded);
            h
        }
    }

    /// Releases a slice back to the arena.
    pub fn free(&mut self, handle: ArenaAllocHandle) -> bool {
        let Some(rec) = self.records.get_mut(handle.index as usize) else {
            return false;
        };

        if rec.generation != handle.generation || !rec.alive {
            return false;
        }

        rec.alive = false;
        self.dead_bytes = self.dead_bytes.saturating_add(rec.size);
        self.live_bytes = self.live_bytes.saturating_sub(rec.size);
        self.free_indices.push(handle.index);
        true
    }

    /// Resolves an allocated handle into an active slice.
    pub fn slice(&self, handle: ArenaAllocHandle) -> ArenaSlice {
        let rec = self
            .records
            .get(handle.index as usize)
            .expect("invalid arena handle index");
        assert_eq!(rec.generation, handle.generation, "stale arena handle");
        assert!(rec.alive, "arena slice has been freed");

        ArenaSlice {
            offset: rec.offset,
            size: rec.size,
        }
    }

    /// Returns a reference to the active backing GPU buffer.
    pub fn buffer(&self) -> &wgpu::Buffer {
        &self.buffer
    }

    /// Returns the active capacity in bytes.
    pub fn capacity(&self) -> u64 {
        self.capacity
    }

    /// Returns live allocated bytes.
    pub fn live_bytes(&self) -> u64 {
        self.live_bytes
    }

    fn grow_to_fit(&mut self, required_bytes: u64) {
        let mut new_cap = (self.capacity * 2).max(1024);
        while new_cap < required_bytes {
            new_cap = new_cap.saturating_mul(2);
        }

        let new_buf = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Galfus Buffer Arena (Grown)"),
            size: new_cap,
            usage: self.usage,
            mapped_at_creation: false,
        });

        // Copy valid data from old buffer to new buffer
        if self.cursor > 0 {
            let mut encoder = self
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("Galfus Arena Grow Copy"),
                });
            encoder.copy_buffer_to_buffer(&self.buffer, 0, &new_buf, 0, self.cursor);
            self.queue.submit(std::iter::once(encoder.finish()));
        }

        let old_buf = std::mem::replace(&mut self.buffer, new_buf);
        self.capacity = new_cap;
        self.garbage.push(GarbageEntry {
            _buffer: old_buf,
            retire_after_frame: self.keep_frames,
        });
    }

    #[inline]
    fn align_up_to(value: u64, alignment: u64) -> u64 {
        let mask = alignment - 1;
        (value + mask) & !mask
    }
}
