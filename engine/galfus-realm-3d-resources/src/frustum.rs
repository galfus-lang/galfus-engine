use glam::{Mat4, Vec3, Vec4};

/// 6-plane viewing frustum configured for Reverse-Z depth projection.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Frustum {
    /// Normalized plane equations `[Ax + By + Cz + D = 0]` for [Left, Right, Bottom, Top, Near, Far].
    pub planes: [Vec4; 6],
}

impl Frustum {
    /// Extracts the 6 normalized clipping planes from a view-projection matrix configured for Reverse-Z.
    pub fn from_view_projection(view_projection: Mat4) -> Self {
        let m = view_projection.to_cols_array_2d();
        let row0 = Vec4::new(m[0][0], m[1][0], m[2][0], m[3][0]);
        let row1 = Vec4::new(m[0][1], m[1][1], m[2][1], m[3][1]);
        let row2 = Vec4::new(m[0][2], m[1][2], m[2][2], m[3][2]);
        let row3 = Vec4::new(m[0][3], m[1][3], m[2][3], m[3][3]);

        let planes = [
            normalize_plane(row3 + row0), // left:   w + x >= 0
            normalize_plane(row3 - row0), // right:  w - x >= 0
            normalize_plane(row3 + row1), // bottom: w + y >= 0
            normalize_plane(row3 - row1), // top:    w - y >= 0
            normalize_plane(row3 - row2), // near (Reverse-Z: z <= w => w - z >= 0)
            normalize_plane(row2),        // far (Reverse-Z: z >= 0)
        ];

        Self { planes }
    }

    /// Tests whether an AABB intersects or is contained within the viewing frustum.
    /// Returns `true` if visible, `false` if completely outside.
    pub fn intersects_aabb(&self, min: Vec3, max: Vec3) -> bool {
        for plane in &self.planes {
            let mut p = min;
            if plane.x >= 0.0 {
                p.x = max.x;
            }
            if plane.y >= 0.0 {
                p.y = max.y;
            }
            if plane.z >= 0.0 {
                p.z = max.z;
            }

            // Test if the most positive corner along the plane normal is behind the plane
            if plane.x * p.x + plane.y * p.y + plane.z * p.z + plane.w < 0.0 {
                return false;
            }
        }
        true
    }
}

fn normalize_plane(plane: Vec4) -> Vec4 {
    let normal = plane.truncate();
    let len = normal.length();
    if len > 0.0 { plane / len } else { plane }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frustum_culling_center_object() {
        let view = Mat4::look_at_rh(Vec3::new(0.0, 0.0, 10.0), Vec3::ZERO, Vec3::Y);
        // Reverse-Z perspective: near at 0.1 maps to 1.0, far at 100.0 maps to 0.0
        let proj = Mat4::perspective_infinite_reverse_rh(1.0, 1.0, 0.1);
        let frustum = Frustum::from_view_projection(proj * view);

        // An object centered at origin [ -1..1 ] should be inside
        assert!(frustum.intersects_aabb(Vec3::splat(-1.0), Vec3::splat(1.0)));

        // An object far behind the camera [ Z = 15..20 ] should be culled
        assert!(!frustum.intersects_aabb(Vec3::new(-1.0, -1.0, 15.0), Vec3::new(1.0, 1.0, 20.0)));

        // An object far to the side [ X = 50..60 ] should be culled
        assert!(!frustum.intersects_aabb(Vec3::new(50.0, -1.0, -5.0), Vec3::new(60.0, 1.0, 5.0)));
    }
}
