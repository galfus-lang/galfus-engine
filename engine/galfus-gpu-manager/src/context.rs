use crate::GpuShared;
use crate::error::{GpuError, GpuResult};

/// Global graphics context holding `wgpu` device, queue, and instance state.
pub struct GpuContext {
    instance: GpuShared<wgpu::Instance>,
    adapter: GpuShared<wgpu::Adapter>,
    device: GpuShared<wgpu::Device>,
    queue: GpuShared<wgpu::Queue>,
    adapter_info: wgpu::AdapterInfo,
}

impl GpuContext {
    /// Synchronously initializes a new `GpuContext`, optionally compatible with an existing surface.
    pub fn new(compatible_surface: Option<&wgpu::Surface>) -> GpuResult<Self> {
        pollster::block_on(Self::new_async(compatible_surface))
    }

    /// Synchronously initializes a headless `GpuContext` without any surface compatibility requirements.
    pub fn new_headless() -> GpuResult<Self> {
        Self::new(None)
    }

    /// Synchronously initializes a new `GpuContext` reusing an existing `wgpu::Instance`.
    pub fn with_instance(
        instance: GpuShared<wgpu::Instance>,
        compatible_surface: Option<&wgpu::Surface>,
    ) -> GpuResult<Self> {
        pollster::block_on(Self::with_instance_async(instance, compatible_surface))
    }

    /// Asynchronously initializes a new `GpuContext` reusing an existing `wgpu::Instance`.
    pub async fn with_instance_async(
        instance: GpuShared<wgpu::Instance>,
        compatible_surface: Option<&wgpu::Surface<'_>>,
    ) -> GpuResult<Self> {
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface,
                force_fallback_adapter: false,
            })
            .await
            .map(GpuShared::new)
            .map_err(|e| GpuError::AdapterRequestFailed(e.to_string()))?;

        let adapter_info = adapter.get_info();
        log::info!(
            "Selected GPU adapter: {} ({:?}, backend: {:?})",
            adapter_info.name,
            adapter_info.device_type,
            adapter_info.backend
        );

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("Galfus GPU Device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                memory_hints: wgpu::MemoryHints::default(),
                trace: wgpu::Trace::default(),
                ..Default::default()
            })
            .await
            .map_err(|e| GpuError::DeviceRequestFailed(e.to_string()))?;

        Ok(Self {
            instance,
            adapter,
            device: GpuShared::new(device),
            queue: GpuShared::new(queue),
            adapter_info,
        })
    }

    /// Asynchronously initializes a new `GpuContext`.
    pub async fn new_async(compatible_surface: Option<&wgpu::Surface<'_>>) -> GpuResult<Self> {
        let instance = GpuShared::new(wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            flags: wgpu::InstanceFlags::default(),
            backend_options: wgpu::BackendOptions::default(),
            ..Default::default()
        }));
        Self::with_instance_async(instance, compatible_surface).await
    }

    /// Returns a reference to the `wgpu::Instance`.
    pub fn instance(&self) -> &wgpu::Instance {
        &self.instance
    }

    /// Returns a reference to the `wgpu::Adapter`.
    pub fn adapter(&self) -> &wgpu::Adapter {
        &self.adapter
    }

    /// Returns a reference to the `wgpu::Device`.
    pub fn device(&self) -> &wgpu::Device {
        &self.device
    }

    /// Returns a cloned shared device reference.
    pub fn device_arc(&self) -> GpuShared<wgpu::Device> {
        GpuShared::clone(&self.device)
    }

    /// Returns a reference to the `wgpu::Queue`.
    pub fn queue(&self) -> &wgpu::Queue {
        &self.queue
    }

    /// Returns a cloned shared queue reference.
    pub fn queue_arc(&self) -> GpuShared<wgpu::Queue> {
        GpuShared::clone(&self.queue)
    }

    /// Returns the active adapter information.
    pub fn adapter_info(&self) -> &wgpu::AdapterInfo {
        &self.adapter_info
    }

    /// Returns limits supported by the active device.
    pub fn limits(&self) -> wgpu::Limits {
        self.device.limits()
    }
}
