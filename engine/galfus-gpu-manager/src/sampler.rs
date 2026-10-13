use crate::error::{GpuError, GpuResult};
use crate::handle::{GpuSamplerHandle, NAMESPACE_SAMPLER, SamplerResource};
use crate::types::GpuSamplerDesc;
use galfus_core::GenerationalPool;
use std::collections::HashMap;

/// An allocated GPU Sampler resource.
pub struct GpuSampler {
    sampler: wgpu::Sampler,
    desc: GpuSamplerDesc,
}

impl GpuSampler {
    pub fn raw(&self) -> &wgpu::Sampler {
        &self.sampler
    }

    pub fn desc(&self) -> &GpuSamplerDesc {
        &self.desc
    }
}

/// Registry and cache for GPU Samplers.
pub struct SamplerManager {
    pool: GenerationalPool<GpuSampler>,
    cache: HashMap<GpuSamplerDesc, GpuSamplerHandle>,
}

impl Default for SamplerManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SamplerManager {
    pub fn new() -> Self {
        Self {
            pool: GenerationalPool::new(NAMESPACE_SAMPLER),
            cache: HashMap::new(),
        }
    }

    /// Retrieves an existing cached sampler matching the descriptor, or creates a new one.
    pub fn get_or_create(
        &mut self,
        device: &wgpu::Device,
        desc: &GpuSamplerDesc,
    ) -> GpuResult<GpuSamplerHandle> {
        if let Some(&handle) = self
            .cache
            .get(desc)
            .filter(|h| self.pool.get(h.cast()).is_ok())
        {
            return Ok(handle);
        }

        let wgpu_desc = wgpu::SamplerDescriptor {
            label: desc.label.as_deref(),
            address_mode_u: desc.address_mode_u.to_wgpu(),
            address_mode_v: desc.address_mode_v.to_wgpu(),
            address_mode_w: desc.address_mode_w.to_wgpu(),
            mag_filter: desc.mag_filter.to_wgpu(),
            min_filter: desc.min_filter.to_wgpu(),
            mipmap_filter: desc.mipmap_filter.to_wgpu_mipmap(),
            compare: desc.compare.map(|c| c.to_wgpu()),
            ..Default::default()
        };

        let sampler = device.create_sampler(&wgpu_desc);
        let entry = GpuSampler {
            sampler,
            desc: desc.clone(),
        };

        let handle = self.pool.insert(entry)?.cast::<SamplerResource>();
        self.cache.insert(desc.clone(), handle);
        Ok(handle)
    }

    /// Retrieves a sampler by handle.
    pub fn get(&self, handle: GpuSamplerHandle) -> GpuResult<&GpuSampler> {
        self.pool
            .get(handle.cast())
            .map_err(|_| GpuError::SamplerNotFound {
                slot: handle.slot(),
                generation: handle.generation().get(),
            })
    }

    /// Destroys a sampler and invalidates its cache entry.
    pub fn destroy(&mut self, handle: GpuSamplerHandle) -> GpuResult<()> {
        let entry = self
            .pool
            .remove(handle.cast())
            .map_err(|_| GpuError::SamplerNotFound {
                slot: handle.slot(),
                generation: handle.generation().get(),
            })?;

        self.cache.remove(&entry.desc);
        Ok(())
    }
}
