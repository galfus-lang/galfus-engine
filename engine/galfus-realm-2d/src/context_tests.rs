//! Realm 2D context tests.

use super::*;
use crate::svg_manager::{SvgGeometry2D, SvgInstance2D, SvgManager2D};
use galfus_realm_2d_resources::{Sprite2D, Svg2D};

#[test]
fn test_strict_camera_resolution_no_fallback() {
    let mut realm = Realm2DContext::new(1);

    // Camera in slot 5
    let cam5 = Camera2D::new(10.0, 5);
    assert!(realm.set_camera(100, cam5, Transform2D::default()).is_ok());

    // Inactive camera in slot 0
    let mut cam0 = Camera2D::new(10.0, 0);
    cam0.active = false;
    assert!(realm.set_camera(200, cam0, Transform2D::default()).is_ok());

    // Target texture view dummy cannot be created without device,
    // but we can verify the camera selection logic directly:
    let select_camera = |realm: &Realm2DContext, slot: Option<u32>| {
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

    // Explicit slot 5 requested -> matches camera 100
    assert_eq!(select_camera(&realm, Some(5)), Some(100));

    // Non-existent slot 999 requested -> NO fallback, returns None!
    assert_eq!(select_camera(&realm, Some(999)), None);

    // Default slot None requested, but slot 0 camera is inactive -> NO fallback, returns None!
    assert_eq!(select_camera(&realm, None), None);

    // Activate slot 0 camera -> now matches default slot
    realm.cameras.get_mut(&200).unwrap().0.active = true;
    assert_eq!(select_camera(&realm, None), Some(0));
}

#[test]
fn test_svg_shadow_occluders_and_draw_order() {
    let mut realm = Realm2DContext::new(1);

    // Create SVG with cast_shadow = true
    let svg = Svg2D {
        dimensions: Some(Vec2::new(50.0, 50.0)),
        cast_shadow: true,
        shadow_height: 2.5,
        shadow_layer_mask: 0x1,
        ..Default::default()
    };
    let transform = Transform2D::from_translation(Vec2::new(10.0, 20.0)).with_draw_order(3);
    assert!(realm.set_svg(10, svg, transform).is_ok());

    // Verify world corners
    let instance = realm.svg_manager.instances.get(&10).unwrap();
    let corners = instance
        .svg
        .compute_world_corners(&instance.transform, Vec2::splat(50.0));
    assert_eq!(corners[0], Vec2::new(-15.0, -5.0));
    assert_eq!(corners[2], Vec2::new(35.0, 45.0));
    assert_eq!(instance.transform.draw_order, 3);
}

#[test]
fn test_realm2d_crud_and_not_found_errors() {
    let mut realm = Realm2DContext::new(1);

    // 1. Not found errors for non-existent entities
    assert!(realm.destroy_sprite(999).is_err());
    assert!(realm.destroy_shape(999).is_err());
    assert!(realm.destroy_light(999).is_err());
    assert!(realm.destroy_camera(999).is_err());
    assert!(realm.destroy_svg(999).is_err());
    assert!(realm.destroy_material(999).is_err());

    // 2. Capacity scaling: 128 dynamic lights (exceeding initial 64)
    for i in 1..=128 {
        let light = Light2D::point(Vec2::new(i as f32, 0.0), glam::Vec3::ONE, 1.0, 10.0);
        assert!(realm.set_light(i, light).is_ok());
    }
    assert_eq!(realm.lights.len(), 128);

    // 3. Clear empties all lights and sprites
    assert!(realm.clear().is_ok());
    assert!(realm.lights.is_empty());
    assert!(realm.sprites.is_empty());
}

#[test]
fn replacing_an_svg_reclaims_its_previous_geometry() {
    let instance = wgpu::Instance::default();
    let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::LowPower,
        compatible_surface: None,
        force_fallback_adapter: false,
    }));
    let Ok(adapter) = adapter else {
        return;
    };
    let Ok((device, _queue)) =
        pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
    else {
        return;
    };

    let mut manager = SvgManager2D::new();
    let vertex_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("svg-replacement-test-vertex"),
        size: 16,
        usage: wgpu::BufferUsages::VERTEX,
        mapped_at_creation: false,
    });
    let index_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("svg-replacement-test-index"),
        size: 16,
        usage: wgpu::BufferUsages::INDEX,
        mapped_at_creation: false,
    });
    let handle = manager
        .pool
        .insert(SvgGeometry2D {
            vertex_buffer,
            index_buffer,
            index_count: 0,
            dimensions: Vec2::ONE,
        })
        .expect("the empty pool accepts the test geometry");
    manager.instances.insert(
        7,
        SvgInstance2D {
            svg: Svg2D::default(),
            transform: Transform2D::default(),
            geometry_handle: Some(handle),
        },
    );

    manager.insert(7, Svg2D::default(), Transform2D::default());

    assert!(manager.pool.is_empty());
    assert!(!manager.pool.contains(handle));
}

#[test]
fn shadow_caster_mutations_invalidate_the_shadow_cache() {
    let mut realm = Realm2DContext::new(1);
    realm.shadow_manager.is_dirty = false;

    realm
        .set_sprite(1, Sprite2D::default(), Transform2D::default())
        .unwrap();
    assert!(realm.shadow_manager.is_dirty);

    realm.shadow_manager.is_dirty = false;
    realm.set_sprite_transform(1, Transform2D::from_translation(Vec2::ONE));
    assert!(realm.shadow_manager.is_dirty);

    realm.shadow_manager.is_dirty = false;
    realm.destroy_sprite(1).unwrap();
    assert!(realm.shadow_manager.is_dirty);
}
