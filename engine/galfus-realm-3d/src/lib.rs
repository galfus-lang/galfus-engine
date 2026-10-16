//! # Galfus Realm 3D
//!
//! Autonomous 3D Realm implementing the `galfus-realm-core` contract with
//! Reverse-Z rendering, PBR-like lighting, and declarative entity management.

pub mod bloom;
pub mod collector;
pub mod context;
pub mod gizmo;
pub mod light_cull;
pub mod outline;
pub mod pipeline;
pub mod postprocess;
pub mod shader;
pub mod shadow;
pub mod skybox;
pub mod ssao;
pub mod ssao_shader;
pub mod surface_effect;
pub mod types;

pub use bloom::BloomPipeline3D;
pub use collector::DrawCollector;
pub use context::Realm3DContext;
pub use gizmo::{GizmoPipeline3D, GizmoSystem3D, GizmoVertex};
pub use light_cull::LightCullingPipeline3D;
pub use outline::OutlinePipeline3D;
pub use pipeline::Pipeline3D;
pub use shader::REALM_3D_SHADER;
pub use shadow::{ShadowMap3D, ShadowPipeline3D};
pub use skybox::SkyboxPipeline3D;
pub use ssao::SsaoPipeline3D;
pub use surface_effect::{
    BUILTIN_SURFACE_PASSTHROUGH, SURFACE_EFFECT_PRELUDE, compose_surface_shader,
};

#[cfg(test)]
mod tests {
    use super::*;
    use galfus_realm_3d_resources::camera::Camera3D;
    use galfus_realm_3d_resources::environment::EnvironmentRealm3D;
    use galfus_realm_3d_resources::geometry::Geometry3D;
    use galfus_realm_3d_resources::light::Light3D;
    use galfus_realm_3d_resources::material::Material3D;
    use galfus_realm_3d_resources::model::Model3D;
    use galfus_realm_3d_resources::transform::Transform3D;
    use galfus_realm_core::realm::Realm;
    use galfus_realm_core::types::{RealmInvocationContext, RealmKind, RealmPrepareContext};
    use glam::{UVec4, Vec3, Vec4};

    #[test]
    fn test_realm3d_context_crud() {
        let mut realm = Realm3DContext::new(10);
        assert_eq!(realm.id(), 10);
        assert_eq!(realm.kind(), RealmKind::ThreeD);

        // Add camera
        let cam = Camera3D::perspective(60.0, 0.1, 1000.0, 1);
        let cam_transform = Transform3D::from_position(Vec3::new(0.0, 2.0, -5.0));
        assert!(realm.create_camera(1, cam.clone(), cam_transform).is_ok());

        // Reserved ID should fail
        assert!(realm.create_camera(u32::MAX, cam, cam_transform).is_err());

        // Add geometry
        let cube = Geometry3D::cube(1.0);
        assert!(realm.create_geometry(1, cube).is_ok());

        // Add material
        let mat = Material3D::solid_color(Vec4::new(1.0, 0.0, 0.0, 1.0));
        assert!(realm.create_material(1, mat).is_ok());

        // Add model
        let model = Model3D::new(1, 1);
        let model_transform = Transform3D::default();
        assert!(realm.create_model(1, model, model_transform).is_ok());

        // Add light
        let light = Light3D::directional(Vec3::new(-1.0, -1.0, 0.0), 1.0, true);
        let light_transform = Transform3D::default();
        assert!(realm.create_light(1, light, light_transform).is_ok());

        // Test gizmo commands
        realm.draw_line(Vec3::ZERO, Vec3::Y, Vec4::ONE);
        realm.draw_aabb(
            Vec3::splat(-1.0),
            Vec3::splat(1.0),
            Vec4::new(1.0, 1.0, 0.0, 1.0),
        );
        realm.draw_polyline(
            &[Vec3::X, Vec3::Y, Vec3::Z],
            Vec4::new(0.0, 1.0, 1.0, 1.0),
            true,
        );

        // Update environment with bloom enabled
        let mut env = EnvironmentRealm3D::default();
        env.bloom.enabled = true;
        realm.set_environment(env);
    }

    #[test]
    fn test_gizmo_system_operations() {
        let mut gizmos = GizmoSystem3D::new();
        assert!(gizmos.vertices().is_empty());

        gizmos.draw_line(Vec3::ZERO, Vec3::ONE, Vec4::ONE);
        assert_eq!(gizmos.vertices().len(), 2);

        gizmos.draw_aabb(Vec3::ZERO, Vec3::ONE, Vec4::ONE);
        // 12 edges * 2 vertices = 24
        assert_eq!(gizmos.vertices().len(), 26);

        gizmos.clear();
        assert!(gizmos.vertices().is_empty());
    }

    #[test]
    fn test_realm3d_gpu_lifecycle() {
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

        let mut realm = Realm3DContext::new(10);

        // Setup entities
        let cam = Camera3D::perspective(60.0, 0.1, 1000.0, 1);
        realm
            .create_camera(
                1,
                cam,
                Transform3D::from_position(Vec3::new(0.0, 1.0, -3.0)),
            )
            .unwrap();
        realm.create_geometry(1, Geometry3D::cube(1.0)).unwrap();
        realm
            .create_material(1, Material3D::solid_color(Vec4::new(0.2, 0.6, 1.0, 1.0)))
            .unwrap();
        realm
            .create_model(1, Model3D::new(1, 1), Transform3D::default())
            .unwrap();
        realm
            .create_light(
                1,
                Light3D::directional(Vec3::new(0.0, -1.0, 1.0), 1.0, true),
                Transform3D::default(),
            )
            .unwrap();

        // Enable Bloom and queue Gizmo
        let mut env = EnvironmentRealm3D::default();
        env.bloom.enabled = true;
        realm.set_environment(env);
        realm.draw_line(Vec3::ZERO, Vec3::Y, Vec4::ONE);

        // 1. Prepare phase
        let prep = RealmPrepareContext {
            frame_id: 1,
            delta_time: 0.016,
            device: &device,
            queue: &queue,
        };
        assert!(realm.prepare(&prep).is_ok());

        // 2. Render target texture
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Test Realm3D Render Target"),
            size: wgpu::Extent3d {
                width: 200,
                height: 200,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let target_view = texture.create_view(&wgpu::TextureViewDescriptor::default());

        // 3. Render invocation
        let inv = RealmInvocationContext {
            frame_id: 1,
            invocation_id: 100,
            target_id: 1,
            camera_slot: Some(1),
            viewport: UVec4::new(0, 0, 200, 200),
            device: &device,
            queue: &queue,
            target_view: &target_view,
            target_format: wgpu::TextureFormat::Rgba8Unorm,
        };
        assert!(realm.render(&inv).is_ok());
    }
}
