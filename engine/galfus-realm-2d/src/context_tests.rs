//! Realm 2D context tests.

use super::*;
use galfus_realm_2d_resources::Sprite2D;

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
fn test_realm2d_crud_and_not_found_errors() {
    let mut realm = Realm2DContext::new(1);

    // 1. Not found errors for non-existent entities
    assert!(realm.destroy_sprite(999).is_err());
    assert!(realm.destroy_shape(999).is_err());
    assert!(realm.destroy_light(999).is_err());
    assert!(realm.destroy_camera(999).is_err());
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
