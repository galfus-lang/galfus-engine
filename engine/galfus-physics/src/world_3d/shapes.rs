use galfus_realm_core::collision::ColliderShape3D;
use glam::Vec3;
use rapier3d::prelude::*;

/// Converts a canonical `ColliderShape3D` into a scaled Rapier `SharedShape`.
pub(super) fn build_rapier_shape_3d(
    shape: &ColliderShape3D,
    sx: f32,
    sy: f32,
    sz: f32,
    mesh_data: Option<(&[[f32; 3]], &[u32])>,
) -> Option<SharedShape> {
    match shape {
        ColliderShape3D::Box { half_extents } => Some(SharedShape::cuboid(
            half_extents[0] * sx,
            half_extents[1] * sy,
            half_extents[2] * sz,
        )),
        ColliderShape3D::Sphere { radius } => Some(SharedShape::ball(*radius * sx.max(sy).max(sz))),
        ColliderShape3D::Cylinder {
            radius,
            half_height,
        } => Some(SharedShape::cylinder(
            *half_height * sy,
            *radius * sx.max(sz),
        )),
        ColliderShape3D::Capsule {
            radius,
            half_height,
        } => Some(SharedShape::capsule_y(
            *half_height * sy,
            *radius * sx.max(sz),
        )),
        ColliderShape3D::Rectangle { half_extents } => Some(SharedShape::cuboid(
            half_extents[0] * sx,
            half_extents[1] * sy,
            0.01,
        )),
        ColliderShape3D::Plane { normal, .. } => {
            let n = Vec3::new(normal[0], normal[1], normal[2]).normalize_or_zero();
            Some(SharedShape::halfspace(n))
        }
        ColliderShape3D::TriMesh { .. } => {
            let (verts, indices) = mesh_data?;
            let pts: Vec<Vec3> = verts
                .iter()
                .map(|p| Vec3::new(p[0] * sx, p[1] * sy, p[2] * sz))
                .collect();
            let tris: Vec<[u32; 3]> = indices.as_chunks::<3>().0.to_vec();
            if tris.is_empty() {
                return None;
            }
            SharedShape::trimesh(pts, tris).ok()
        }
        ColliderShape3D::Heightfield {
            heights,
            nrows,
            ncols,
            scale: hf_scale,
        } => {
            if *nrows < 2 || *ncols < 2 || heights.len() != nrows * ncols {
                return None;
            }
            let matrix =
                rapier3d::geometry::Array2::from_fn(*nrows, *ncols, |r, c| heights[r * *ncols + c]);
            Some(SharedShape::heightfield(
                matrix,
                Vec3::new(hf_scale[0] * sx, hf_scale[1] * sy, hf_scale[2] * sz),
            ))
        }
    }
}
