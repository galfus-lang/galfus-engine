use crate::error::{GpuError, GpuResult};
use crate::handle::{
    GpuTextureHandle, GpuTextureViewHandle, NAMESPACE_TEXTURE, NAMESPACE_TEXTURE_VIEW,
    TextureResource, TextureViewResource,
};
use crate::types::{GpuTextureDesc, TextureColorSpace};
use galfus_core::GenerationalPool;

/// An allocated GPU Texture resource.
pub struct GpuTexture {
    texture: wgpu::Texture,
    desc: GpuTextureDesc,
    default_view: Option<GpuTextureViewHandle>,
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
            .expect("texture must always have a default view after construction")
    }

    pub fn format(&self) -> wgpu::TextureFormat {
        self.desc.format.to_wgpu()
    }

    /// Returns the color space encoded by this texture's format.
    pub fn color_space(&self) -> TextureColorSpace {
        self.desc.color_space()
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

use galfus_core::id::validate_host_logical_id;
use std::collections::HashMap;

/// Registry and allocator for GPU Textures and Texture Views.
pub struct TextureManager {
    textures: GenerationalPool<GpuTexture>,
    views: GenerationalPool<GpuTextureView>,
    views_by_texture: HashMap<GpuTextureHandle, Vec<GpuTextureViewHandle>>,
    logical_map: HashMap<u32, GpuTextureHandle>,
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
            views_by_texture: HashMap::new(),
            logical_map: HashMap::new(),
        }
    }

    /// Creates a new GPU texture and its default 2D/3D texture view.
    pub fn create_texture(
        &mut self,
        device: &wgpu::Device,
        desc: &GpuTextureDesc,
    ) -> GpuResult<GpuTextureHandle> {
        validate_texture_desc(desc)?;
        let wgpu_desc = wgpu::TextureDescriptor {
            label: desc.label.as_deref(),
            size: wgpu::Extent3d {
                width: desc.width,
                height: desc.height,
                depth_or_array_layers: desc.depth_or_layers,
            },
            mip_level_count: desc.mip_levels,
            sample_count: desc.sample_count,
            dimension: desc.dimension.to_wgpu(),
            format: desc.format.to_wgpu(),
            usage: desc.usages.to_wgpu(),
            view_formats: &[],
        };

        let texture = device.create_texture(&wgpu_desc);
        let tex_entry = GpuTexture {
            texture,
            desc: desc.clone(),
            default_view: None,
        };
        let tex_handle = self.textures.insert(tex_entry)?.cast::<TextureResource>();

        let raw_view =
            self.get_texture(tex_handle)?
                .texture
                .create_view(&wgpu::TextureViewDescriptor {
                    label: desc
                        .label
                        .as_ref()
                        .map(|label| format!("{label} Default View"))
                        .as_deref(),
                    ..Default::default()
                });
        let view_handle = match self.views.insert(GpuTextureView {
            view: raw_view,
            parent_texture: tex_handle,
            label: desc.label.clone(),
        }) {
            Ok(handle) => handle.cast::<TextureViewResource>(),
            Err(error) => {
                let texture = self
                    .textures
                    .remove(tex_handle.cast())
                    .expect("new texture handle must remain valid");
                texture.texture.destroy();
                return Err(error.into());
            }
        };
        self.views_by_texture.insert(tex_handle, vec![view_handle]);
        self.textures
            .get_mut(tex_handle.cast())
            .expect("new texture handle must remain valid")
            .default_view = Some(view_handle);

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
        validate_texture_desc(&upload_desc)?;
        let bytes_per_pixel = bytes_per_pixel(desc.format)?;
        let expected_bytes = expected_byte_len(
            desc.width,
            desc.height,
            desc.depth_or_layers,
            bytes_per_pixel,
        )?;
        if data.len() < expected_bytes {
            return Err(GpuError::InvalidArgument(format!(
                "Texture data underflow: expected at least {expected_bytes} bytes, got {}",
                data.len()
            )));
        }

        let bytes_per_row = desc
            .width
            .checked_mul(bytes_per_pixel)
            .ok_or_else(|| GpuError::InvalidArgument("Texture row byte size overflow".into()))?;
        let handle = self.create_texture(device, &upload_desc)?;
        let entry = self.get_texture(handle)?;

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
        self.views_by_texture
            .entry(texture_handle)
            .or_default()
            .push(view_handle);
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

        let view_handles = self
            .views_by_texture
            .remove(&handle)
            .unwrap_or_else(|| vec![entry.default_view()]);
        for view_handle in view_handles {
            let _ = self.views.remove(view_handle.cast());
        }
        self.logical_map
            .retain(|_, mapped_handle| *mapped_handle != handle);
        entry.texture.destroy();
        Ok(())
    }

    /// Destroys an explicit texture view.
    pub fn destroy_view(&mut self, handle: GpuTextureViewHandle) -> GpuResult<()> {
        let parent_handle = self.get_view(handle)?.parent();
        let texture = self.get_texture(parent_handle)?;
        if texture.default_view() == handle {
            return Err(GpuError::InvalidArgument(
                "The default texture view is owned by its texture".into(),
            ));
        }

        self.views
            .remove(handle.cast())
            .map(|_| {
                if let Some(view_handles) = self.views_by_texture.get_mut(&parent_handle) {
                    view_handles.retain(|view_handle| *view_handle != handle);
                }
            })
            .map_err(|_| GpuError::TextureViewNotFound {
                slot: handle.slot(),
                generation: handle.generation().get(),
            })
    }

    /// Creates and initializes a texture mapped to a host logical ID.
    pub fn create_logical_texture_with_data(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        logical_id: u32,
        desc: &GpuTextureDesc,
        data: &[u8],
    ) -> GpuResult<GpuTextureHandle> {
        validate_host_logical_id(logical_id)
            .map_err(|e| GpuError::InvalidArgument(e.to_string()))?;
        if self.logical_map.contains_key(&logical_id) {
            return Err(GpuError::InvalidArgument(format!(
                "Texture with logical ID {logical_id} already exists"
            )));
        }
        let handle = self.create_texture_with_data(device, queue, desc, data)?;
        self.logical_map.insert(logical_id, handle);
        Ok(handle)
    }

    /// Retrieves the internal handle for a host logical texture ID.
    pub fn get_logical_handle(&self, logical_id: u32) -> GpuResult<GpuTextureHandle> {
        self.logical_map.get(&logical_id).copied().ok_or_else(|| {
            GpuError::InvalidArgument(format!("Texture with logical ID {logical_id} not found"))
        })
    }

    /// Retrieves an active logical GPU texture by host ID.
    pub fn get_logical_texture(&self, logical_id: u32) -> GpuResult<&GpuTexture> {
        let handle = self.get_logical_handle(logical_id)?;
        self.get_texture(handle)
    }

    /// Retrieves the default texture view of a logical texture.
    pub fn get_logical_view(&self, logical_id: u32) -> GpuResult<&GpuTextureView> {
        let tex = self.get_logical_texture(logical_id)?;
        self.get_view(tex.default_view())
    }

    /// Writes pixel data to a logical texture sub-rectangle.
    #[allow(clippy::too_many_arguments)]
    pub fn write_logical_texture(
        &self,
        queue: &wgpu::Queue,
        logical_id: u32,
        x: u32,
        y: u32,
        width: u32,
        height: u32,
        data: &[u8],
    ) -> GpuResult<()> {
        let tex = self.get_logical_texture(logical_id)?;
        if width == 0 || height == 0 {
            return Err(GpuError::InvalidArgument(
                "Texture write dimensions must be greater than zero".into(),
            ));
        }
        let end_x = x
            .checked_add(width)
            .ok_or_else(|| GpuError::InvalidArgument("Texture write X range overflow".into()))?;
        let end_y = y
            .checked_add(height)
            .ok_or_else(|| GpuError::InvalidArgument("Texture write Y range overflow".into()))?;
        if end_x > tex.width() || end_y > tex.height() {
            return Err(GpuError::InvalidArgument(format!(
                "Texture write region [{x}, {y}, {width}, {height}] exceeds texture {}x{}",
                tex.width(),
                tex.height()
            )));
        }
        let bytes_per_pixel = bytes_per_pixel(tex.desc.format)?;
        let expected_bytes = expected_byte_len(width, height, 1, bytes_per_pixel)?;
        if data.len() < expected_bytes {
            return Err(GpuError::InvalidArgument(format!(
                "Texture sub-region data underflow: expected at least {expected_bytes} bytes, got {}",
                data.len()
            )));
        }
        let bytes_per_row = width
            .checked_mul(bytes_per_pixel)
            .ok_or_else(|| GpuError::InvalidArgument("Texture row byte size overflow".into()))?;
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &tex.texture,
                mip_level: 0,
                origin: wgpu::Origin3d { x, y, z: 0 },
                aspect: wgpu::TextureAspect::All,
            },
            data,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(bytes_per_row),
                rows_per_image: Some(height),
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        Ok(())
    }

    /// Disposes a texture by its host logical ID.
    pub fn dispose_logical_texture(&mut self, logical_id: u32) -> GpuResult<()> {
        let handle = self.logical_map.remove(&logical_id).ok_or_else(|| {
            GpuError::InvalidArgument(format!("Texture with logical ID {logical_id} not found"))
        })?;
        self.destroy_texture(handle)
    }

    pub(crate) fn view_handles_for_texture(
        &self,
        handle: GpuTextureHandle,
    ) -> GpuResult<Vec<GpuTextureViewHandle>> {
        self.get_texture(handle)?;
        Ok(self
            .views_by_texture
            .get(&handle)
            .cloned()
            .unwrap_or_default())
    }
}

fn validate_texture_desc(desc: &GpuTextureDesc) -> GpuResult<()> {
    if desc.width == 0 || desc.height == 0 || desc.depth_or_layers == 0 {
        return Err(GpuError::InvalidArgument(
            "Texture dimensions must be greater than zero".into(),
        ));
    }
    if desc.mip_levels == 0 || desc.sample_count == 0 {
        return Err(GpuError::InvalidArgument(
            "Texture mip level and sample count must be greater than zero".into(),
        ));
    }
    Ok(())
}

fn bytes_per_pixel(format: crate::types::NormalizedTextureFormat) -> GpuResult<u32> {
    use crate::types::NormalizedTextureFormat;

    match format {
        NormalizedTextureFormat::R8Unorm => Ok(1),
        NormalizedTextureFormat::Rg8Unorm | NormalizedTextureFormat::R16Float => Ok(2),
        NormalizedTextureFormat::Rgba8Unorm
        | NormalizedTextureFormat::Rgba8UnormSrgb
        | NormalizedTextureFormat::Bgra8Unorm
        | NormalizedTextureFormat::Bgra8UnormSrgb
        | NormalizedTextureFormat::Depth32Float
        | NormalizedTextureFormat::R32Float => Ok(4),
        NormalizedTextureFormat::Rg16Float | NormalizedTextureFormat::Rg32Float => Ok(8),
        NormalizedTextureFormat::Rgba16Float => Ok(8),
        NormalizedTextureFormat::Rgba32Float => Ok(16),
        NormalizedTextureFormat::Depth24Plus | NormalizedTextureFormat::Depth24PlusStencil8 => {
            Err(GpuError::InvalidArgument(
                "CPU texture uploads are unsupported for opaque depth formats".into(),
            ))
        }
    }
}

fn expected_byte_len(
    width: u32,
    height: u32,
    depth: u32,
    bytes_per_pixel: u32,
) -> GpuResult<usize> {
    let byte_len = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|value| value.checked_mul(u64::from(depth)))
        .and_then(|value| value.checked_mul(u64::from(bytes_per_pixel)))
        .ok_or_else(|| GpuError::InvalidArgument("Texture byte size overflow".into()))?;
    usize::try_from(byte_len)
        .map_err(|_| GpuError::InvalidArgument("Texture byte size exceeds address space".into()))
}
