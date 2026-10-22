use crate::error::RealmResult;
use crate::realm::Realm;
use crate::types::{RealmInvocationContext, RealmKind, RealmPrepareContext};
use glam::UVec4;

/// A simple test/mock Realm that clears or tints its render target with a solid color.
///
/// Useful for testing graph scheduling, split-screen viewports, offscreen render targets,
/// and connector post-processing pipelines without requiring geometry or scene assets.
pub struct ColorRealm {
    id: u32,
    color: [f32; 4],
    render_count: u64,
    last_viewport: Option<UVec4>,
}

impl ColorRealm {
    /// Creates a new `ColorRealm` with a logical ID and RGBA color `[r, g, b, a]`.
    pub fn new(id: u32, color: [f32; 4]) -> Self {
        Self {
            id,
            color,
            render_count: 0,
            last_viewport: None,
        }
    }

    /// Updates the active RGBA color.
    pub fn set_color(&mut self, color: [f32; 4]) {
        self.color = color;
    }

    /// Returns the current RGBA color.
    pub fn color(&self) -> [f32; 4] {
        self.color
    }

    /// Returns the total number of render passes executed by this realm.
    pub fn render_count(&self) -> u64 {
        self.render_count
    }

    /// Returns the viewport coordinates from the last render invocation.
    pub fn last_viewport(&self) -> Option<UVec4> {
        self.last_viewport
    }
}

impl Realm for ColorRealm {
    fn id(&self) -> u32 {
        self.id
    }

    fn kind(&self) -> RealmKind {
        RealmKind::Custom
    }

    fn prepare(&mut self, _context: &RealmPrepareContext<'_>) -> RealmResult<()> {
        Ok(())
    }

    fn render(&mut self, context: &RealmInvocationContext<'_>) -> RealmResult<()> {
        self.render_count = self.render_count.saturating_add(1);
        self.last_viewport = Some(context.viewport);
        Ok(())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_color_realm_lifecycle() {
        let mut realm = ColorRealm::new(42, [0.1, 0.2, 0.3, 1.0]);
        assert_eq!(realm.id(), 42);
        assert_eq!(realm.kind(), RealmKind::Custom);
        assert_eq!(realm.color(), [0.1, 0.2, 0.3, 1.0]);
        assert_eq!(realm.render_count(), 0);
        assert_eq!(realm.last_viewport(), None);

        realm.set_color([0.5, 0.6, 0.7, 1.0]);
        assert_eq!(realm.color(), [0.5, 0.6, 0.7, 1.0]);

        let instance = wgpu::Instance::default();
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::LowPower,
            compatible_surface: None,
            force_fallback_adapter: false,
        }));

        let Ok(adapter) = adapter else {
            return;
        };
        let Ok((device, queue)) =
            pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
        else {
            return;
        };

        let prep = RealmPrepareContext {
            frame_id: 1,
            delta_time: 0.016,
            device: &device,
            queue: &queue,
            textures: &|_| None,
        };
        assert!(realm.prepare(&prep).is_ok());

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Test Texture"),
            size: wgpu::Extent3d {
                width: 100,
                height: 100,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let target_view = texture.create_view(&wgpu::TextureViewDescriptor::default());

        let inv = RealmInvocationContext {
            frame_id: 1,
            invocation_id: 10,
            target_id: 100,
            camera_slot: None,
            viewport: UVec4::new(0, 0, 800, 600),
            subpixel_jitter: None,
            device: &device,
            queue: &queue,
            target_view: &target_view,
            target_format: wgpu::TextureFormat::Rgba8Unorm,
        };
        assert!(realm.render(&inv).is_ok());
        assert_eq!(realm.render_count(), 1);
        assert_eq!(realm.last_viewport(), Some(UVec4::new(0, 0, 800, 600)));
    }
}
