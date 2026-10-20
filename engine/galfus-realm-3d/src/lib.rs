//! # Galfus Realm 3D
//!
//! Autonomous 3D Realm implementing the `galfus-realm-core` contract with
//! Reverse-Z rendering, PBR-like lighting, and declarative entity management.

pub mod api;
pub mod bloom;
pub mod collector;
pub mod context;
pub mod gizmo;
pub mod light_cull;
pub mod outline;
pub mod particle;
pub mod pipeline;
pub mod portal;
pub mod postprocess;
pub mod realm_impl;
pub mod refraction;
pub mod shader;
pub mod shadow;
pub mod skybox;
pub mod ssao;
pub mod ssao_shader;
pub mod surface_effect;
pub mod types;

pub use bloom::BloomPipeline3D;
pub use collector::{DrawCollector, render_draw_items};
pub use context::Realm3DContext;
pub use gizmo::{GizmoPipeline3D, GizmoSystem3D, GizmoVertex};
pub use light_cull::LightCullingPipeline3D;
pub use outline::OutlinePipeline3D;
pub use particle::ParticleRenderer3D;
pub use pipeline::Pipeline3D;
pub use portal::PortalPipeline3D;
pub use refraction::RefractionPipeline3D;
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
    fn test_realm3d_strict_camera_resolution() {
        let mut realm = Realm3DContext::new(10);

        // Add camera at slot 2
        let cam2 = Camera3D::perspective(60.0, 0.1, 1000.0, 2);
        let cam_transform = Transform3D::from_position(Vec3::new(0.0, 2.0, -5.0));
        assert!(realm.create_camera(20, cam2, cam_transform).is_ok());

        let select_camera = |realm: &Realm3DContext, slot: Option<u32>| {
            if let Some(s) = slot {
                realm
                    .cameras
                    .iter()
                    .find(|(id, (c, _))| c.active && (c.camera_slot == s || **id == s))
                    .map(|(id, _)| *id)
            } else {
                realm
                    .cameras
                    .values()
                    .find(|(c, _)| c.active && c.camera_slot == 0)
                    .map(|(c, _)| c.camera_slot)
            }
        };

        // Explicit slot 2 requested -> matches camera 20
        assert_eq!(select_camera(&realm, Some(2)), Some(20));

        // Non-existent slot 999 requested -> NO fallback, returns None!
        assert_eq!(select_camera(&realm, Some(999)), None);

        // Default slot None requested, but no camera has camera_slot == 0 -> NO fallback, returns None!
        assert_eq!(select_camera(&realm, None), None);

        // Add default camera (slot 0)
        let cam0 = Camera3D::perspective(45.0, 0.1, 1000.0, 0);
        assert!(realm.create_camera(10, cam0, cam_transform).is_ok());
        assert_eq!(select_camera(&realm, None), Some(0));
    }

    #[test]
    fn test_camera_look_at_lifecycle() {
        let mut realm = Realm3DContext::new(10);
        realm
            .create_camera(1, Camera3D::default(), Transform3D::default())
            .unwrap();

        realm.set_camera_look_at(1, Vec3::NEG_Z, Vec3::Y).unwrap();
        let look_at = realm.get_camera_look_at(1).unwrap().unwrap();
        assert_eq!(look_at.target, Vec3::NEG_Z);
        assert_eq!(look_at.up, Vec3::Y);

        realm.clear_camera_look_at(1).unwrap();
        assert!(realm.get_camera_look_at(1).unwrap().is_none());
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

        // Setup instanced model with 10 instances
        realm
            .create_instanced_model(
                2,
                galfus_realm_3d_resources::model::InstancedModel3D::new(1, 1, 10),
            )
            .unwrap();
        let instances: Vec<galfus_realm_3d_resources::model::InstanceData3D> = (0..10)
            .map(|i| galfus_realm_3d_resources::model::InstanceData3D {
                transform: glam::Mat4::from_translation(glam::Vec3::new(i as f32, 0.0, 0.0)),
                color: glam::Vec4::new(1.0, 0.5, 0.2, 1.0),
                emissive: glam::Vec4::new(0.1, 0.1, 0.1, 1.0),
                pbr: glam::Vec4::new(0.0, 0.5, 0.5, 1.0),
                custom: glam::Vec4::new(1.0, 2.0, 0.0, 0.0),
            })
            .collect();
        realm.set_instanced_model_data(2, instances).unwrap();

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
            textures: &|_| None,
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

        // 3. Render invocation frame 1
        let inv = RealmInvocationContext {
            frame_id: 1,
            invocation_id: 100,
            target_id: 1,
            camera_slot: Some(1),
            viewport: UVec4::new(0, 0, 200, 200),
            subpixel_jitter: None,
            device: &device,
            queue: &queue,
            target_view: &target_view,
            target_format: wgpu::TextureFormat::Rgba8Unorm,
        };
        assert!(realm.render(&inv).is_ok());

        // Verify buffers are allocated
        assert!(realm.models.get(&1).unwrap().2.is_some());
        assert!(realm.models.get(&1).unwrap().3.is_some());
        assert!(realm.materials.get(&1).unwrap().1.is_some());

        // Frame 2: Update model transform and material in-place (must stay persistent)
        realm
            .set_model_transform(1, Transform3D::from_position(Vec3::new(5.0, 0.0, 0.0)))
            .unwrap();
        // Model GPU buffer and bind group remain persistent (not dropped to None)
        assert!(realm.models.get(&1).unwrap().2.is_some());
        assert!(realm.models.get(&1).unwrap().3.is_some());

        // Modify material property dynamically
        realm.materials.get_mut(&1).unwrap().0.base_color = Vec4::new(0.9, 0.1, 0.1, 1.0);

        // Frame 2 prepare updates buffers in-place via queue.write_buffer
        let prep2 = RealmPrepareContext {
            frame_id: 2,
            delta_time: 0.016,
            device: &device,
            queue: &queue,
            textures: &|_| None,
        };
        assert!(realm.prepare(&prep2).is_ok());

        let inv2 = RealmInvocationContext {
            frame_id: 2,
            invocation_id: 100,
            target_id: 1,
            camera_slot: Some(1),
            viewport: UVec4::new(0, 0, 200, 200),
            subpixel_jitter: None,
            device: &device,
            queue: &queue,
            target_view: &target_view,
            target_format: wgpu::TextureFormat::Rgba8Unorm,
        };
        assert!(realm.render(&inv2).is_ok());
    }

    #[test]
    fn test_realm3d_clear_clears_models_and_instanced_models() {
        let mut realm = Realm3DContext::new(10);
        realm.create_geometry(1, Geometry3D::cube(1.0)).unwrap();
        realm
            .create_material(1, Material3D::solid_color(Vec4::ONE))
            .unwrap();

        // 1. Create standard model
        realm
            .create_model(10, Model3D::new(1, 1), Transform3D::default())
            .unwrap();

        // 2. Create instanced model
        realm
            .create_instanced_model(
                20,
                galfus_realm_3d_resources::model::InstancedModel3D::new(1, 1, 5),
            )
            .unwrap();

        assert_eq!(realm.models.len(), 1);
        assert_eq!(realm.instanced_models.len(), 1);

        // 3. Clear realm -> BOTH models and instanced_models must be cleared
        assert!(realm.clear().is_ok());
        assert!(
            realm.models.is_empty(),
            "models must be empty after clear()"
        );
        assert!(
            realm.instanced_models.is_empty(),
            "instanced_models must be empty after clear()"
        );
    }

    #[test]
    fn test_realm3d_entity_not_found_errors() {
        let mut realm = Realm3DContext::new(10);

        // Accessing non-existent entities returns appropriate errors
        assert!(
            realm
                .set_model_transform(999, Transform3D::default())
                .is_err()
        );
        assert!(realm.get_model_aabb(999).is_err());
        assert!(
            realm
                .set_camera_transform(999, Transform3D::default())
                .is_err()
        );
        assert!(realm.destroy_model(999).is_err());
        assert!(realm.destroy_camera(999).is_err());
        assert!(realm.destroy_light(999).is_err());
        assert!(realm.destroy_geometry(999).is_err());
        assert!(realm.destroy_material(999).is_err());
    }
}
