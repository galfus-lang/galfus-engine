//! GPU Reverse-Z Hi-Z pyramid generation and indirect occlusion culling pipeline for Realm3D.

use bytemuck::{Pod, Zeroable};
use galfus_core::CullingMode;
use glam::{Mat4, UVec2, Vec3};

use crate::collector::CollectedDrawItem;

const HIZ_SHADER: &str = include_str!("occlusion_hiz.wgsl");

/// Stride in bytes of one `DrawIndexedIndirectArgs` entry.
pub const INDIRECT_ARGS_STRIDE: u64 = 20;

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct CullItemGpu {
    aabb_min: [f32; 4],
    aabb_max: [f32; 4],
    draw_params: [u32; 4],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct HiZCullParams {
    view_proj: [[f32; 4]; 4],
    hiz_size: [f32; 2],
    mip_count: u32,
    item_count: u32,
}

/// Computes the number of mip levels needed for a `width x height` Hi-Z pyramid.
pub(crate) fn hiz_mip_count(width: u32, height: u32) -> u32 {
    let max_dim = width.max(height).max(1);
    (u32::BITS - max_dim.leading_zeros()).max(1)
}

/// Manages the Reverse-Z Hi-Z pyramid texture and GPU compute occlusion culling pass.
pub struct HiZOcclusionPipeline3D {
    copy_pipeline: wgpu::ComputePipeline,
    copy_layout: wgpu::BindGroupLayout,
    downsample_pipeline: wgpu::ComputePipeline,
    downsample_layout: wgpu::BindGroupLayout,
    cull_pipeline: wgpu::ComputePipeline,
    cull_layout: wgpu::BindGroupLayout,

    hiz_texture: Option<wgpu::Texture>,
    hiz_full_view: Option<wgpu::TextureView>,
    hiz_mip_views: Vec<wgpu::TextureView>,
    hiz_size: UVec2,
    mip_count: u32,

    params_buffer: wgpu::Buffer,
    items_buffer: wgpu::Buffer,
    indirect_buffer: wgpu::Buffer,
    capacity: usize,
    staging_items: Vec<CullItemGpu>,

    /// Camera slot that last populated the Hi-Z pyramid (enables Debug Observer `cullCameraSlot` reuse).
    pub valid_camera_slot: Option<u32>,
    pub cached_view_proj: Mat4,
}

impl HiZOcclusionPipeline3D {
    /// Creates a new Hi-Z occlusion culling pipeline.
    pub fn new(device: &wgpu::Device) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Realm3D Hi-Z Occlusion Shader"),
            source: wgpu::ShaderSource::Wgsl(HIZ_SHADER.into()),
        });

        let copy_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Hi-Z Copy Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Depth,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: wgpu::TextureFormat::R32Float,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
            ],
        });

        let downsample_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Hi-Z Downsample Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: wgpu::TextureFormat::R32Float,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
            ],
        });

        let cull_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Hi-Z Cull Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let make_pipe = |label, layout: &wgpu::BindGroupLayout, entry_point| {
            let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some(label),
                bind_group_layouts: &[layout],
                immediate_size: 0,
            });
            device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                label: Some(label),
                layout: Some(&pl),
                module: &shader,
                entry_point: Some(entry_point),
                compilation_options: Default::default(),
                cache: None,
            })
        };

        let copy_pipeline = make_pipe("Hi-Z Copy Pipeline", &copy_layout, "cs_copy_depth");
        let downsample_pipeline = make_pipe(
            "Hi-Z Downsample Pipeline",
            &downsample_layout,
            "cs_downsample",
        );
        let cull_pipeline = make_pipe("Hi-Z Cull Pipeline", &cull_layout, "cs_cull_indirect");

        let capacity = 256;
        let params_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Hi-Z Cull Params Buffer"),
            size: std::mem::size_of::<HiZCullParams>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let (items_buffer, indirect_buffer) = Self::create_item_buffers(device, capacity);

        Self {
            copy_pipeline,
            copy_layout,
            downsample_pipeline,
            downsample_layout,
            cull_pipeline,
            cull_layout,
            hiz_texture: None,
            hiz_full_view: None,
            hiz_mip_views: Vec::new(),
            hiz_size: UVec2::ZERO,
            mip_count: 0,
            params_buffer,
            items_buffer,
            indirect_buffer,
            capacity,
            staging_items: Vec::with_capacity(capacity),
            valid_camera_slot: None,
            cached_view_proj: Mat4::IDENTITY,
        }
    }

    fn create_item_buffers(device: &wgpu::Device, capacity: usize) -> (wgpu::Buffer, wgpu::Buffer) {
        let items_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Hi-Z Cull Items Buffer"),
            size: (capacity * std::mem::size_of::<CullItemGpu>()) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let indirect_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Hi-Z DrawIndexedIndirect Buffer"),
            size: (capacity as u64) * INDIRECT_ARGS_STRIDE,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::INDIRECT,
            mapped_at_creation: false,
        });
        (items_buffer, indirect_buffer)
    }

    fn ensure_hiz_texture(&mut self, device: &wgpu::Device, width: u32, height: u32) {
        let size = UVec2::new(width.max(1), height.max(1));
        if self.hiz_texture.is_some() && self.hiz_size == size {
            return;
        }
        let mip_count = hiz_mip_count(size.x, size.y);
        let tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Realm3D Hi-Z Pyramid Texture"),
            size: wgpu::Extent3d {
                width: size.x,
                height: size.y,
                depth_or_array_layers: 1,
            },
            mip_level_count: mip_count,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R32Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::STORAGE_BINDING,
            view_formats: &[],
        });
        let full_view = tex.create_view(&wgpu::TextureViewDescriptor::default());
        let mip_views = (0..mip_count)
            .map(|level| {
                tex.create_view(&wgpu::TextureViewDescriptor {
                    base_mip_level: level,
                    mip_level_count: Some(1),
                    ..Default::default()
                })
            })
            .collect();
        self.hiz_texture = Some(tex);
        self.hiz_full_view = Some(full_view);
        self.hiz_mip_views = mip_views;
        self.hiz_size = size;
        self.mip_count = mip_count;
    }

    /// Generates the Reverse-Z Hi-Z mipmap pyramid from the depth pre-pass `depth_view`.
    pub fn build_pyramid(
        &mut self,
        device: &wgpu::Device,
        encoder: &mut wgpu::CommandEncoder,
        depth_view: &wgpu::TextureView,
        size: UVec2,
        camera_slot: u32,
        view_proj: Mat4,
    ) {
        self.ensure_hiz_texture(device, size.x, size.y);

        let copy_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Hi-Z Copy BG"),
            layout: &self.copy_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(depth_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&self.hiz_mip_views[0]),
                },
            ],
        });
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Hi-Z Mip 0 Copy"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.copy_pipeline);
            pass.set_bind_group(0, &copy_bg, &[]);
            pass.dispatch_workgroups(self.hiz_size.x.div_ceil(8), self.hiz_size.y.div_ceil(8), 1);
        }

        let mut mip_w = self.hiz_size.x;
        let mut mip_h = self.hiz_size.y;
        for level in 1..self.mip_count as usize {
            mip_w = (mip_w / 2).max(1);
            mip_h = (mip_h / 2).max(1);
            let bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Hi-Z Downsample BG"),
                layout: &self.downsample_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(
                            &self.hiz_mip_views[level - 1],
                        ),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::TextureView(&self.hiz_mip_views[level]),
                    },
                ],
            });
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Hi-Z Downsample"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.downsample_pipeline);
            pass.set_bind_group(0, &bg, &[]);
            pass.dispatch_workgroups(mip_w.div_ceil(8), mip_h.div_ceil(8), 1);
        }

        self.valid_camera_slot = Some(camera_slot);
        self.cached_view_proj = view_proj;
    }

    /// Dispatches GPU occlusion culling for all provided draw items and returns the indirect args buffer.
    pub fn cull_items<'a>(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        view_proj: Mat4,
        items: impl IntoIterator<Item = &'a CollectedDrawItem<'a>>,
    ) -> Option<&wgpu::Buffer> {
        let full_view = self.hiz_full_view.as_ref()?;
        self.staging_items.clear();
        for item in items {
            let always_visible = item.is_occluder
                || item.culling_mode != CullingMode::Auto
                || !item.world_aabb_min.is_finite()
                || !item.world_aabb_max.is_finite();
            let pad = Vec3::splat(item.cull_margin.max(0.0));
            let bmin = item.world_aabb_min - pad;
            let bmax = item.world_aabb_max + pad;
            self.staging_items.push(CullItemGpu {
                aabb_min: [
                    bmin.x,
                    bmin.y,
                    bmin.z,
                    if always_visible { 1.0 } else { 0.0 },
                ],
                aabb_max: [bmax.x, bmax.y, bmax.z, 0.0],
                draw_params: [item.index_count, item.instance_count, 0, 0],
            });
        }

        let count = self.staging_items.len();
        if count == 0 {
            return None;
        }
        if count > self.capacity {
            self.capacity = (self.capacity * 2).max(count);
            let (ib, argb) = Self::create_item_buffers(device, self.capacity);
            self.items_buffer = ib;
            self.indirect_buffer = argb;
        }

        let params = HiZCullParams {
            view_proj: view_proj.to_cols_array_2d(),
            hiz_size: [self.hiz_size.x as f32, self.hiz_size.y as f32],
            mip_count: self.mip_count,
            item_count: count as u32,
        };
        queue.write_buffer(&self.params_buffer, 0, bytemuck::bytes_of(&params));
        queue.write_buffer(
            &self.items_buffer,
            0,
            bytemuck::cast_slice(&self.staging_items),
        );

        let bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Hi-Z Cull BG"),
            layout: &self.cull_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.params_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: self.items_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(full_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: self.indirect_buffer.as_entire_binding(),
                },
            ],
        });

        let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("Hi-Z Occlusion Cull"),
            timestamp_writes: None,
        });
        pass.set_pipeline(&self.cull_pipeline);
        pass.set_bind_group(0, &bg, &[]);
        pass.dispatch_workgroups((count as u32).div_ceil(64), 1, 1);

        Some(&self.indirect_buffer)
    }

    /// Runs Hi-Z pyramid build (when not observing another camera) and indirect occlusion culling.
    #[allow(clippy::too_many_arguments)]
    pub fn execute_for_camera<'a>(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        depth_view: &wgpu::TextureView,
        width: u32,
        height: u32,
        camera_slot: u32,
        cull_camera_slot: Option<u32>,
        depth_prepass_ran: bool,
        view_proj: Mat4,
        items: impl IntoIterator<Item = &'a CollectedDrawItem<'a>>,
    ) -> Option<&wgpu::Buffer> {
        let hiz_vp = if let Some(cull_slot) = cull_camera_slot {
            (self.valid_camera_slot == Some(cull_slot)).then_some(self.cached_view_proj)
        } else if depth_prepass_ran {
            self.build_pyramid(
                device,
                encoder,
                depth_view,
                UVec2::new(width, height),
                camera_slot,
                view_proj,
            );
            Some(view_proj)
        } else {
            None
        };
        hiz_vp.and_then(|vp| self.cull_items(device, queue, encoder, vp, items))
    }

    /// Invalidates cached Hi-Z state (e.g. on realm clear).
    pub fn invalidate(&mut self) {
        self.valid_camera_slot = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hiz_mip_count_matches_dimensions() {
        assert_eq!(hiz_mip_count(1, 1), 1);
        assert_eq!(hiz_mip_count(2, 2), 2);
        assert_eq!(hiz_mip_count(640, 720), 10);
        assert_eq!(hiz_mip_count(1280, 720), 11);
    }
}
