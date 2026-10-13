use crate::error::GpuResult;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

/// Stages of the shader pipeline where a binding is visible.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShaderVisibility {
    #[serde(default)]
    pub vertex: bool,
    #[serde(default)]
    pub fragment: bool,
    #[serde(default)]
    pub compute: bool,
}

impl ShaderVisibility {
    pub const VERTEX: Self = Self {
        vertex: true,
        fragment: false,
        compute: false,
    };
    pub const FRAGMENT: Self = Self {
        vertex: false,
        fragment: true,
        compute: false,
    };
    pub const VERTEX_FRAGMENT: Self = Self {
        vertex: true,
        fragment: true,
        compute: false,
    };
    pub const COMPUTE: Self = Self {
        vertex: false,
        fragment: false,
        compute: true,
    };
    pub const ALL: Self = Self {
        vertex: true,
        fragment: true,
        compute: true,
    };

    pub fn to_wgpu(self) -> wgpu::ShaderStages {
        let mut stages = wgpu::ShaderStages::empty();
        if self.vertex {
            stages |= wgpu::ShaderStages::VERTEX;
        }
        if self.fragment {
            stages |= wgpu::ShaderStages::FRAGMENT;
        }
        if self.compute {
            stages |= wgpu::ShaderStages::COMPUTE;
        }
        stages
    }
}

/// Category and options of a binding resource.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum BindingType {
    UniformBuffer {
        #[serde(default)]
        has_dynamic_offset: bool,
    },
    StorageBuffer {
        #[serde(default)]
        read_only: bool,
        #[serde(default)]
        has_dynamic_offset: bool,
    },
    SampledTexture {
        #[serde(default)]
        multisampled: bool,
    },
    Sampler {
        #[serde(default)]
        comparison: bool,
    },
}

impl BindingType {
    pub fn to_wgpu(self) -> wgpu::BindingType {
        match self {
            Self::UniformBuffer { has_dynamic_offset } => wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset,
                min_binding_size: None,
            },
            Self::StorageBuffer {
                read_only,
                has_dynamic_offset,
            } => wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Storage { read_only },
                has_dynamic_offset,
                min_binding_size: None,
            },
            Self::SampledTexture { multisampled } => wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled,
            },
            Self::Sampler { comparison } => {
                let binding_type = if comparison {
                    wgpu::SamplerBindingType::Comparison
                } else {
                    wgpu::SamplerBindingType::Filtering
                };
                wgpu::BindingType::Sampler(binding_type)
            }
        }
    }
}

/// Description of a single entry in a bind group layout.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BindGroupLayoutEntryDesc {
    pub binding: u32,
    pub visibility: ShaderVisibility,
    pub ty: BindingType,
}

impl BindGroupLayoutEntryDesc {
    pub fn to_wgpu(&self) -> wgpu::BindGroupLayoutEntry {
        wgpu::BindGroupLayoutEntry {
            binding: self.binding,
            visibility: self.visibility.to_wgpu(),
            ty: self.ty.to_wgpu(),
            count: None,
        }
    }
}

/// Description for configuring a full bind group layout.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BindGroupLayoutDesc {
    pub label: Option<String>,
    pub entries: Vec<BindGroupLayoutEntryDesc>,
}

/// Manager and cache for `BindGroupLayout` and `PipelineLayout` objects.
pub struct LayoutManager {
    bind_group_layouts: HashMap<Vec<BindGroupLayoutEntryDesc>, Arc<wgpu::BindGroupLayout>>,
}

impl Default for LayoutManager {
    fn default() -> Self {
        Self::new()
    }
}

impl LayoutManager {
    pub fn new() -> Self {
        Self {
            bind_group_layouts: HashMap::new(),
        }
    }

    /// Retrieves an existing cached `BindGroupLayout` or compiles and caches a new one.
    pub fn get_or_create_bind_group_layout(
        &mut self,
        device: &wgpu::Device,
        desc: &BindGroupLayoutDesc,
    ) -> Arc<wgpu::BindGroupLayout> {
        self.bind_group_layouts
            .entry(desc.entries.clone())
            .or_insert_with(|| {
                let wgpu_entries: Vec<wgpu::BindGroupLayoutEntry> = desc
                    .entries
                    .iter()
                    .map(BindGroupLayoutEntryDesc::to_wgpu)
                    .collect();

                Arc::new(
                    device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                        label: desc.label.as_deref(),
                        entries: &wgpu_entries,
                    }),
                )
            })
            .clone()
    }

    /// Creates a `PipelineLayout` referencing a sequence of bind group layouts.
    pub fn create_pipeline_layout(
        &self,
        device: &wgpu::Device,
        label: Option<&str>,
        bind_group_layouts: &[&wgpu::BindGroupLayout],
    ) -> GpuResult<wgpu::PipelineLayout> {
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label,
            bind_group_layouts,
            ..Default::default()
        });
        Ok(layout)
    }
}
