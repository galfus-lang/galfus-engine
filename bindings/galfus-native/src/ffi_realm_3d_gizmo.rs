//! Debug-gizmo FFI entry points.

use galfus_realm_3d::Realm3DContext;

use crate::ffi::set_last_error;
use crate::state::with_multiverse_mut;

/// Queues a debug 3D line segment.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_draw_line(
    realm_id: u32,
    x0: f32,
    y0: f32,
    z0: f32,
    x1: f32,
    y1: f32,
    z1: f32,
    r: f32,
    g: f32,
    b: f32,
    a: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm.draw_line(
            glam::Vec3::new(x0, y0, z0),
            glam::Vec3::new(x1, y1, z1),
            glam::Vec4::new(r, g, b, a),
        );
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Queues a debug 3D Axis-Aligned Bounding Box (AABB).
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_draw_aabb(
    realm_id: u32,
    min_x: f32,
    min_y: f32,
    min_z: f32,
    max_x: f32,
    max_y: f32,
    max_z: f32,
    r: f32,
    g: f32,
    b: f32,
    a: f32,
) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm.draw_aabb(
            glam::Vec3::new(min_x, min_y, min_z),
            glam::Vec3::new(max_x, max_y, max_z),
            glam::Vec4::new(r, g, b, a),
        );
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Clears any queued gizmos in Realm 3D.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_clear_gizmos(realm_id: u32) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm.clear_gizmos();
        Ok(())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}
