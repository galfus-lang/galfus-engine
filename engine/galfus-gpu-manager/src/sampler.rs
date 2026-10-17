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

/// Pre-configured universal samplers shared across the entire engine.
pub struct StandardSamplers {
    pub linear_repeat: wgpu::Sampler,
    pub linear_clamp: wgpu::Sampler,
    pub nearest_repeat: wgpu::Sampler,
    pub nearest_clamp: wgpu::Sampler,
}

impl StandardSamplers {
    /// Creates the 4 standard universal GPU samplers.
    pub fn new(device: &wgpu::Device) -> Self {
        let linear_repeat = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Galfus Standard Linear Repeat Sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            address_mode_w: wgpu::AddressMode::Repeat,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..Default::default()
        });
        let linear_clamp = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Galfus Standard Linear Clamp Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..Default::default()
        });
        let nearest_repeat = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Galfus Standard Nearest Repeat Sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            address_mode_w: wgpu::AddressMode::Repeat,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });
        let nearest_clamp = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Galfus Standard Nearest Clamp Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });
        Self {
            linear_repeat,
            linear_clamp,
            nearest_repeat,
            nearest_clamp,
        }
    }
}
