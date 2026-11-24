//! Shared culling policy and distance-range helpers for 2D and 3D realms.

use serde::{Deserialize, Serialize};

/// Controls how a renderable entity participates in frustum, distance, and occlusion culling.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CullingMode {
    /// Apply frustum/viewport, distance, and occlusion culling (default).
    #[default]
    Auto,
    /// Apply frustum/viewport and distance culling, but skip occlusion culling.
    FrustumOnly,
    /// Bypass frustum/viewport, distance, and occlusion culling (still respects `active` and `layer_mask`).
    AlwaysRender,
}

/// Evaluates whether a squared distance falls within the half-open interval `[start, end)`.
///
/// - `None` returns `true` (unbounded).
/// - Non-positive or non-finite `end` means no upper bound.
/// - Negative or non-finite `start` is treated as `0.0`.
#[inline]
pub fn distance_sq_in_range(dist_sq: f32, range: Option<[f32; 2]>) -> bool {
    let Some([start, end]) = range else {
        return true;
    };
    let min_d = if start.is_finite() && start > 0.0 {
        start
    } else {
        0.0
    };
    if dist_sq < min_d * min_d {
        return false;
    }
    if end.is_finite() && end > 0.0 && dist_sq >= end * end {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn half_open_lod_bands_have_no_overlap_or_gap() {
        let lod0 = Some([0.0, 10.0]);
        let lod1 = Some([10.0, 100.0]);
        let lod2 = Some([100.0, f32::INFINITY]);

        assert!(distance_sq_in_range(0.0, lod0));
        assert!(distance_sq_in_range(9.99 * 9.99, lod0));
        assert!(!distance_sq_in_range(10.0 * 10.0, lod0));

        assert!(!distance_sq_in_range(9.99 * 9.99, lod1));
        assert!(distance_sq_in_range(10.0 * 10.0, lod1));
        assert!(distance_sq_in_range(99.9 * 99.9, lod1));
        assert!(!distance_sq_in_range(100.0 * 100.0, lod1));

        assert!(distance_sq_in_range(100.0 * 100.0, lod2));
        assert!(distance_sq_in_range(5000.0 * 5000.0, lod2));
        assert!(distance_sq_in_range(999.0, None));
    }
}
