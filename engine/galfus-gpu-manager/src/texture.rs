use crate::error::{GpuError, GpuResult};
use crate::handle::{
    GpuTextureHandle, GpuTextureViewHandle, NAMESPACE_TEXTURE, NAMESPACE_TEXTURE_VIEW,
    TextureResource, TextureViewResource,
};
use crate::types::GpuTextureDesc;
use galfus_core::{GenerationalPool, Handle};
use std::num::NonZeroU32;

/// An allocated GPU Texture resource.
pub struct GpuTexture {
    texture: wgpu::Texture,
    desc: GpuTextureDesc,
    default_view: GpuTextureViewHandle,
}

impl GpuTexture {
    pub fn raw(&self) -> &wgpu::Texture {
        &self.texture
    }

    pub fn desc(&self) -> &GpuTextureDesc {
        &self.desc
    }

    pub fn default_view(&self) -> GpuTextureViewHandle {
        self.default_view
    }

    pub fn format(&self) -> wgpu::TextureFormat {
        self.desc.format.to_wgpu()
    }

    pub fn width(&self) -> u32 {
        self.desc.width
    }

    pub fn height(&self) -> u32 {
        self.desc.height
    }
}

/// An allocated GPU Texture View resource.
pub struct GpuTextureView {
    view: wgpu::TextureView,
    parent_texture: GpuTextureHandle,
    label: Option<String>,
}

impl GpuTextureView {
    pub fn raw(&self) -> &wgpu::TextureView {
        &self.view
    }

    pub fn parent(&self) -> GpuTextureHandle {
        self.parent_texture
    }

    pub fn label(&self) -> Option<&str> {
        self.label.as_deref()
    }
}

/// Registry and allocator for GPU Textures and Texture Views.
pub struct TextureManager {
    textures: GenerationalPool<GpuTexture>,
    views: GenerationalPool<GpuTextureView>,
}

impl Default for TextureManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TextureManager {
    pub fn new() -> Self {
        Self {
            textures: GenerationalPool::new(NAMESPACE_TEXTURE),
            views: GenerationalPool::new(NAMESPACE_TEXTURE_VIEW),
        }
    }

    /// Creates a new GPU texture and its default 2D/3D texture view.
    pub fn create_texture(
        &mut self,
        device: &wgpu::Device,
        desc: &GpuTextureDesc,
    ) -> GpuResult<GpuTextureHandle> {
        let wgpu_desc = wgpu::TextureDescriptor {
            label: desc.label.as_deref(),
            size: wgpu::Extent3d {
                width: desc.width.max(1),
                height: desc.height.max(1),
                depth_or_array_layers: desc.depth_or_layers.max(1),
            },
            mip_level_count: desc.mip_levels.max(1),
            sample_count: desc.sample_count.max(1),
            dimension: desc.dimension.to_wgpu(),
            format: desc.format.to_wgpu(),
            usage: desc.usages.to_wgpu(),
            view_formats: &[],
        };

        let texture = device.create_texture(&wgpu_desc);
        let raw_view = texture.create_view(&wgpu::TextureViewDescriptor {
            label: desc
                .label
                .as_ref()
                .map(|l| format!("{l} Default View"))
                .as_deref(),
            ..Default::default()
        });

        // Placeholder parent texture handle that will be updated immediately
        let dummy_parent: GpuTextureHandle =
            Handle::new(0, NonZeroU32::new(1).unwrap(), NAMESPACE_TEXTURE);

        let view_entry = GpuTextureView {
            view: raw_view,
            parent_texture: dummy_parent,
            label: desc.label.clone(),
        };
        let view_handle = self.views.insert(view_entry)?.cast::<TextureViewResource>();

        let tex_entry = GpuTexture {
            texture,
            desc: desc.clone(),
            default_view: view_handle,
        };
        let tex_handle = self.textures.insert(tex_entry)?.cast::<TextureResource>();

        // Update the view's parent_texture handle
        if let Ok(view_mut) = self.views.get_mut(view_handle.cast()) {
            view_mut.parent_texture = tex_handle;
        }

        Ok(tex_handle)
    }

    /// Creates a GPU texture and writes initial pixel data to it.
    pub fn create_texture_with_data(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        desc: &GpuTextureDesc,
        data: &[u8],
    ) -> GpuResult<GpuTextureHandle> {
        let mut upload_desc = desc.clone();
        upload_desc.usages.copy_dst = true;

        let handle = self.create_texture(device, &upload_desc)?;
        let entry = self.get_texture(handle)?;

        let bytes_per_pixel = match desc.format.to_wgpu() {
            wgpu::TextureFormat::R8Unorm => 1,
            wgpu::TextureFormat::Rg8Unorm | wgpu::TextureFormat::R16Float => 2,
            wgpu::TextureFormat::Rgba8Unorm
            | wgpu::TextureFormat::Rgba8UnormSrgb
            | wgpu::TextureFormat::Bgra8Unorm
            | wgpu::TextureFormat::Bgra8UnormSrgb
            | wgpu::TextureFormat::Depth32Float
            | wgpu::TextureFormat::R32Float => 4,
            wgpu::TextureFormat::Rgba16Float => 8,
            wgpu::TextureFormat::Rgba32Float => 16,
            _ => 4,
        };

        let bytes_per_row = desc.width * bytes_per_pixel;

        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &entry.texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            data,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(bytes_per_row),
                rows_per_image: Some(desc.height),
            },
            wgpu::Extent3d {
                width: desc.width,
                height: desc.height,
                depth_or_array_layers: desc.depth_or_layers.max(1),
            },
        );

        Ok(handle)
    }

    /// Creates an additional specific texture view on an existing texture.
    pub fn create_view(
        &mut self,
        texture_handle: GpuTextureHandle,
        desc: &wgpu::TextureViewDescriptor,
    ) -> GpuResult<GpuTextureViewHandle> {
        let texture_entry = self.get_texture(texture_handle)?;
        let raw_view = texture_entry.texture.create_view(desc);

        let view_entry = GpuTextureView {
            view: raw_view,
            parent_texture: texture_handle,
            label: desc.label.map(str::to_string),
        };

        let view_handle = self.views.insert(view_entry)?.cast::<TextureViewResource>();
        Ok(view_handle)
    }

    /// Retrieves an active texture by handle.
    pub fn get_texture(&self, handle: GpuTextureHandle) -> GpuResult<&GpuTexture> {
        self.textures
            .get(handle.cast())
            .map_err(|_| GpuError::TextureNotFound {
                slot: handle.slot(),
                generation: handle.generation().get(),
            })
    }

    /// Retrieves an active texture view by handle.
    pub fn get_view(&self, handle: GpuTextureViewHandle) -> GpuResult<&GpuTextureView> {
        self.views
            .get(handle.cast())
            .map_err(|_| GpuError::TextureViewNotFound {
                slot: handle.slot(),
                generation: handle.generation().get(),
            })
    }

    /// Destroys a texture and its default view.
    pub fn destroy_texture(&mut self, handle: GpuTextureHandle) -> GpuResult<()> {
        let entry = self
            .textures
            .remove(handle.cast())
            .map_err(|_| GpuError::TextureNotFound {
                slot: handle.slot(),
                generation: handle.generation().get(),
            })?;

        let _ = self.views.remove(entry.default_view.cast());
        entry.texture.destroy();
        Ok(())
    }

    /// Destroys an explicit texture view.
    pub fn destroy_view(&mut self, handle: GpuTextureViewHandle) -> GpuResult<()> {
        self.views
            .remove(handle.cast())
            .map(|_| ())
            .map_err(|_| GpuError::TextureViewNotFound {
                slot: handle.slot(),
                generation: handle.generation().get(),
            })
    }
}
