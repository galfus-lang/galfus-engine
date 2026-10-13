use crate::error::{GpuError, GpuResult};
use crate::types::GpuPresentMode;
use glam::UVec2;

/// Manages a `wgpu::Surface` and its active swapchain configuration for a window.
pub struct GpuSurface {
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    size: UVec2,
}

impl GpuSurface {
    /// Creates and configures a new `GpuSurface` for a window or canvas.
    pub fn new(
        surface: wgpu::Surface<'static>,
        adapter: &wgpu::Adapter,
        device: &wgpu::Device,
        width: u32,
        height: u32,
        present_mode: GpuPresentMode,
    ) -> GpuResult<Self> {
        let caps = surface.get_capabilities(adapter);
        let format = caps
            .formats
            .iter()
            .copied()
            .find(|f| f.is_srgb())
            .unwrap_or_else(|| {
                caps.formats
                    .first()
                    .copied()
                    .unwrap_or(wgpu::TextureFormat::Bgra8UnormSrgb)
            });

        let width = width.max(1);
        let height = height.max(1);

        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width,
            height,
            present_mode: present_mode.to_wgpu(),
            desired_maximum_frame_latency: 2,
            alpha_mode: caps.alpha_modes[0],
            view_formats: vec![],
        };

        surface.configure(device, &config);

        Ok(Self {
            surface,
            config,
            size: UVec2::new(width, height),
        })
    }

    /// Resizes the swapchain surface to match window dimensions.
    pub fn resize(&mut self, device: &wgpu::Device, width: u32, height: u32) {
        let width = width.max(1);
        let height = height.max(1);

        if self.config.width == width && self.config.height == height {
            return;
        }

        self.config.width = width;
        self.config.height = height;
        self.size = UVec2::new(width, height);
        self.surface.configure(device, &self.config);
    }

    /// Updates the swapchain presentation mode.
    pub fn set_present_mode(&mut self, device: &wgpu::Device, present_mode: GpuPresentMode) {
        self.config.present_mode = present_mode.to_wgpu();
        self.surface.configure(device, &self.config);
    }

    /// Acquires the next swapchain texture for rendering and presentation.
    pub fn acquire_current_texture(&self) -> GpuResult<wgpu::SurfaceTexture> {
        self.surface
            .get_current_texture()
            .map_err(|e| GpuError::SurfaceTextureAcquisitionFailed(e.to_string()))
    }

    /// Returns the underlying surface texture format.
    pub fn format(&self) -> wgpu::TextureFormat {
        self.config.format
    }

    /// Returns current dimensions in physical pixels.
    pub fn size(&self) -> UVec2 {
        self.size
    }

    /// Returns a reference to the inner `wgpu::Surface`.
    pub fn raw_surface(&self) -> &wgpu::Surface<'static> {
        &self.surface
    }
}
