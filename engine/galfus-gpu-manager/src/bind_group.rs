use crate::buffer::BufferManager;
use crate::error::{GpuError, GpuResult};
use crate::handle::{
    BindGroupResource, GpuBindGroupHandle, GpuBufferHandle, GpuSamplerHandle, GpuTextureViewHandle,
    NAMESPACE_BIND_GROUP,
};
use crate::sampler::SamplerManager;
use crate::texture::TextureManager;
use galfus_core::GenerationalPool;

/// Specific GPU resource binding configuration for a single slot.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BindResourceDesc {
    Buffer {
        handle: GpuBufferHandle,
        offset: u64,
        size: Option<u64>,
    },
    TextureView {
        handle: GpuTextureViewHandle,
    },
    Sampler {
        handle: GpuSamplerHandle,
    },
}

/// Description of a single slot entry when assembling a bind group.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BindGroupEntryDesc {
    pub binding: u32,
    pub resource: BindResourceDesc,
}

/// References to active resource registries required for resolving handles.
pub struct GpuResourceRegistries<'a> {
    pub buffers: &'a BufferManager,
    pub textures: &'a TextureManager,
    pub samplers: &'a SamplerManager,
}

/// Registry and constructor for GPU Bind Groups.
pub struct BindGroupManager {
    pool: GenerationalPool<wgpu::BindGroup>,
}

impl Default for BindGroupManager {
    fn default() -> Self {
        Self::new()
    }
}

impl BindGroupManager {
    pub fn new() -> Self {
        Self {
            pool: GenerationalPool::new(NAMESPACE_BIND_GROUP),
        }
    }

    /// Assembles a new `wgpu::BindGroup` validating all resource handles for stale detection.
    pub fn create_bind_group(
        &mut self,
        device: &wgpu::Device,
        layout: &wgpu::BindGroupLayout,
        label: Option<&str>,
        entries: &[BindGroupEntryDesc],
        registries: &GpuResourceRegistries<'_>,
    ) -> GpuResult<GpuBindGroupHandle> {
        let mut wgpu_entries = Vec::with_capacity(entries.len());

        for entry in entries {
            let resource = match &entry.resource {
                BindResourceDesc::Buffer {
                    handle,
                    offset,
                    size,
                } => {
                    let buf = registries.buffers.get(*handle)?;
                    wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                        buffer: buf.raw(),
                        offset: *offset,
                        size: size.and_then(std::num::NonZeroU64::new),
                    })
                }
                BindResourceDesc::TextureView { handle } => {
                    let view = registries.textures.get_view(*handle)?;
                    wgpu::BindingResource::TextureView(view.raw())
                }
                BindResourceDesc::Sampler { handle } => {
                    let samp = registries.samplers.get(*handle)?;
                    wgpu::BindingResource::Sampler(samp.raw())
                }
            };

            wgpu_entries.push(wgpu::BindGroupEntry {
                binding: entry.binding,
                resource,
            });
        }

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label,
            layout,
            entries: &wgpu_entries,
        });

        let handle = self.pool.insert(bind_group)?.cast::<BindGroupResource>();
        Ok(handle)
    }

    /// Retrieves an active `wgpu::BindGroup` by handle.
    pub fn get(&self, handle: GpuBindGroupHandle) -> GpuResult<&wgpu::BindGroup> {
        self.pool.get(handle.cast()).map_err(|_| {
            GpuError::InvalidArgument(format!(
                "BindGroup handle invalid or stale: {:?}",
                handle.slot()
            ))
        })
    }

    /// Destroys and removes a `BindGroup`.
    pub fn destroy(&mut self, handle: GpuBindGroupHandle) -> GpuResult<()> {
        self.pool.remove(handle.cast()).map(|_| ()).map_err(|_| {
            GpuError::InvalidArgument(format!("BindGroup handle not found: {:?}", handle.slot()))
        })
    }
}
