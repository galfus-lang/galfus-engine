use crate::error::{GpuError, GpuResult};
use crate::handle::{BufferResource, GpuBufferHandle, NAMESPACE_BUFFER};
use crate::types::{BufferUsageFlags, GpuBufferDesc};
use galfus_core::GenerationalPool;

/// An allocated GPU buffer resource.
pub struct GpuBuffer {
    buffer: wgpu::Buffer,
    size: u64,
    usages: BufferUsageFlags,
    label: Option<String>,
}

impl GpuBuffer {
    pub fn raw(&self) -> &wgpu::Buffer {
        &self.buffer
    }

    pub fn size(&self) -> u64 {
        self.size
    }

    pub fn usages(&self) -> BufferUsageFlags {
        self.usages
    }

    pub fn label(&self) -> Option<&str> {
        self.label.as_deref()
    }
}

use galfus_core::diagnostics::{self, tags};
use galfus_core::handle::PoolStats;
use galfus_core::id::validate_host_logical_id;
use serde::Serialize;
use std::collections::HashMap;

/// Diagnostic statistics for [`BufferManager`].
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BufferManagerStats {
    pub pool: PoolStats,
    pub logical_map_len: usize,
    pub total_gpu_bytes: u64,
}

/// Registry and allocator for GPU Buffers.
pub struct BufferManager {
    pool: GenerationalPool<GpuBuffer>,
    logical_map: HashMap<u32, GpuBufferHandle>,
    total_gpu_bytes: u64,
}

impl Default for BufferManager {
    fn default() -> Self {
        Self::new()
    }
}

impl BufferManager {
    pub fn new() -> Self {
        Self {
            pool: GenerationalPool::new(NAMESPACE_BUFFER),
            logical_map: HashMap::new(),
            total_gpu_bytes: 0,
        }
    }

    /// Returns diagnostic statistics for this buffer manager.
    pub fn diagnostic_stats(&self) -> BufferManagerStats {
        BufferManagerStats {
            pool: self.pool.stats(),
            logical_map_len: self.logical_map.len(),
            total_gpu_bytes: self.total_gpu_bytes,
        }
    }

    /// Allocates a new GPU buffer according to the descriptor.
    pub fn create_buffer(
        &mut self,
        device: &wgpu::Device,
        desc: &GpuBufferDesc,
    ) -> GpuResult<GpuBufferHandle> {
        let buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: desc.label.as_deref(),
            size: desc.size,
            usage: desc.usages.to_wgpu(),
            mapped_at_creation: desc.mapped_at_creation,
        });

        let gpu_buffer = GpuBuffer {
            buffer,
            size: desc.size,
            usages: desc.usages,
            label: desc.label.clone(),
        };

        let handle = self.pool.insert(gpu_buffer)?;
        self.total_gpu_bytes = self.total_gpu_bytes.saturating_add(desc.size);
        galfus_core::galfus_trace!(
            tags::BUFFERS | tags::MEMORY,
            "create_buffer size={} label={:?} total_gpu_bytes={}",
            desc.size,
            desc.label,
            self.total_gpu_bytes
        );
        Ok(handle.cast::<BufferResource>())
    }

    /// Allocates and initializes a new GPU buffer with contents.
    pub fn create_buffer_init(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        label: Option<&str>,
        contents: &[u8],
        usages: BufferUsageFlags,
    ) -> GpuResult<GpuBufferHandle> {
        let mut desc_usages = usages;
        desc_usages.copy_dst = true;

        let handle = self.create_buffer(
            device,
            &GpuBufferDesc {
                label: label.map(str::to_string),
                size: contents.len() as u64,
                usages: desc_usages,
                mapped_at_creation: false,
            },
        )?;

        self.write_buffer(queue, handle, 0, contents)?;
        Ok(handle)
    }

    /// Writes binary data into an existing GPU buffer at offset.
    pub fn write_buffer(
        &self,
        queue: &wgpu::Queue,
        handle: GpuBufferHandle,
        offset: u64,
        data: &[u8],
    ) -> GpuResult<()> {
        let entry = self.get(handle)?;
        let end = offset
            .checked_add(data.len() as u64)
            .ok_or_else(|| GpuError::InvalidArgument("Buffer write offset overflow".into()))?;
        if end > entry.size {
            return Err(GpuError::InvalidArgument(format!(
                "Buffer overflow: size={}, requested offset+len={}",
                entry.size, end
            )));
        }
        let _span = diagnostics::SpanGuard::new(tags::BUFFERS, "gpu.buffer_write");
        queue.write_buffer(&entry.buffer, offset, data);
        Ok(())
    }

    /// Retrieves a reference to an active GPU buffer.
    pub fn get(&self, handle: GpuBufferHandle) -> GpuResult<&GpuBuffer> {
        self.pool
            .get(handle.cast())
            .map_err(|_| GpuError::BufferNotFound {
                slot: handle.slot(),
                generation: handle.generation().get(),
            })
    }

    /// Destroys and frees an allocated GPU buffer.
    pub fn destroy(&mut self, handle: GpuBufferHandle) -> GpuResult<()> {
        let entry = self
            .pool
            .remove(handle.cast())
            .map_err(|_| GpuError::BufferNotFound {
                slot: handle.slot(),
                generation: handle.generation().get(),
            })?;
        self.logical_map
            .retain(|_, mapped_handle| *mapped_handle != handle);
        self.total_gpu_bytes = self.total_gpu_bytes.saturating_sub(entry.size);
        galfus_core::galfus_trace!(
            tags::BUFFERS | tags::MEMORY,
            "destroy_buffer size={} total_gpu_bytes={}",
            entry.size,
            self.total_gpu_bytes
        );
        entry.buffer.destroy();
        Ok(())
    }

    /// Allocates and initializes a buffer mapped to a host logical ID.
    pub fn create_logical_buffer(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        logical_id: u32,
        label: Option<&str>,
        contents: &[u8],
        usages: BufferUsageFlags,
    ) -> GpuResult<GpuBufferHandle> {
        validate_host_logical_id(logical_id)
            .map_err(|e| GpuError::InvalidArgument(e.to_string()))?;
        if self.logical_map.contains_key(&logical_id) {
            return Err(GpuError::InvalidArgument(format!(
                "Buffer with logical ID {logical_id} already exists"
            )));
        }
        let handle = self.create_buffer_init(device, queue, label, contents, usages)?;
        self.logical_map.insert(logical_id, handle);
        Ok(handle)
    }

    /// Writes data into a logical buffer at byte offset.
    pub fn write_logical_buffer(
        &self,
        queue: &wgpu::Queue,
        logical_id: u32,
        offset: u64,
        data: &[u8],
    ) -> GpuResult<()> {
        let handle = self.get_logical_handle(logical_id)?;
        self.write_buffer(queue, handle, offset, data)
    }

    /// Retrieves the internal handle for a host logical buffer ID.
    pub fn get_logical_handle(&self, logical_id: u32) -> GpuResult<GpuBufferHandle> {
        self.logical_map.get(&logical_id).copied().ok_or_else(|| {
            GpuError::InvalidArgument(format!("Buffer with logical ID {logical_id} not found"))
        })
    }

    /// Retrieves an active logical GPU buffer by host ID.
    pub fn get_logical(&self, logical_id: u32) -> GpuResult<&GpuBuffer> {
        let handle = self.get_logical_handle(logical_id)?;
        self.get(handle)
    }

    /// Disposes a buffer by its host logical ID.
    pub fn dispose_logical_buffer(&mut self, logical_id: u32) -> GpuResult<()> {
        let handle = self.logical_map.remove(&logical_id).ok_or_else(|| {
            GpuError::InvalidArgument(format!("Buffer with logical ID {logical_id} not found"))
        })?;
        self.destroy(handle)
    }
}
