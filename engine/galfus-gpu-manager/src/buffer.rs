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

/// Registry and allocator for GPU Buffers.
pub struct BufferManager {
    pool: GenerationalPool<GpuBuffer>,
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
        if offset + (data.len() as u64) > entry.size {
            return Err(GpuError::InvalidArgument(format!(
                "Buffer overflow: size={}, requested offset+len={}",
                entry.size,
                offset + data.len() as u64
            )));
        }
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
        entry.buffer.destroy();
        Ok(())
    }
}
