//! CPU 2D opaque-panel occlusion culling for sprites and shapes strictly behind solid occluders.

use glam::Vec2;

/// An unrotated, fully opaque 2D rectangle capable of occluding items strictly behind it.
#[derive(Debug, Clone, Copy)]
pub(crate) struct OpaqueOccluder2D {
    pub min: Vec2,
    pub max: Vec2,
    pub z_layer: i32,
    pub draw_order: i32,
}

/// Returns `true` if the item's world AABB `[item_min, item_max]` (at `(z_layer, draw_order)`)
/// is 100% covered by at least one opaque occluder strictly in front of it.
#[inline]
pub(crate) fn is_occluded_by_opaque_2d(
    item_min: Vec2,
    item_max: Vec2,
    z_layer: i32,
    draw_order: i32,
    occluders: &[OpaqueOccluder2D],
) -> bool {
    const EPS: f32 = 1e-4;
    for occ in occluders {
        if (occ.z_layer, occ.draw_order) > (z_layer, draw_order)
            && item_min.x >= occ.min.x - EPS
            && item_min.y >= occ.min.y - EPS
            && item_max.x <= occ.max.x + EPS
            && item_max.y <= occ.max.y + EPS
        {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn occludes_items_strictly_behind_and_inside_opaque_rect() {
        let occluders = vec![OpaqueOccluder2D {
            min: Vec2::new(-5.0, -5.0),
            max: Vec2::new(5.0, 5.0),
            z_layer: 5,
            draw_order: 0,
        }];

        // Completely covered and behind -> occluded
        assert!(is_occluded_by_opaque_2d(
            Vec2::new(-2.0, -2.0),
            Vec2::new(2.0, 2.0),
            1,
            0,
            &occluders
        ));
        // In front of occluder -> NOT occluded
        assert!(!is_occluded_by_opaque_2d(
            Vec2::new(-2.0, -2.0),
            Vec2::new(2.0, 2.0),
            6,
            0,
            &occluders
        ));
        // Partially sticking out -> NOT occluded
        assert!(!is_occluded_by_opaque_2d(
            Vec2::new(3.0, -2.0),
            Vec2::new(6.0, 2.0),
            1,
            0,
            &occluders
        ));
        // Same z_layer and draw_order -> NOT occluded
        assert!(!is_occluded_by_opaque_2d(
            Vec2::new(-1.0, -1.0),
            Vec2::new(1.0, 1.0),
            5,
            0,
            &occluders
        ));
    }
}
