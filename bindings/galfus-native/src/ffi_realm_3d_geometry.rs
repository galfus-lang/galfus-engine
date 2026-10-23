//! Binary geometry and primitive FFI entry points.

use galfus_realm_3d::Realm3DContext;
use galfus_realm_3d_resources::geometry::{
    Geometry3D, MorphTarget3D, MorphVertex3D, PrimitiveTopology3D, Vertex3D,
};

use crate::ffi::set_last_error;
use crate::state::with_multiverse_mut;

/// Registers or updates 3D geometry from interleaved binary vertex data and u32 indices.
///
/// Vertex data uses the 136-byte canonical `Vertex3D` C layout: position, normal, `uv0`, `uv1`,
/// tangent, color, `joints0`, `weights0`, `joints1`, and `weights1`. `topology` is one of:
/// `0` points, `1` lines, `2` line strip, `3` triangles, or `4` triangle strip.
/// Indices must reference an existing vertex.
///
/// # Safety
/// `vertices_ptr` must be valid for `vertices_len` bytes and `indices_ptr` must be valid for
/// `indices_len` u32 elements when their respective lengths are non-zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_create_geometry(
    realm_id: u32,
    geometry_id: u32,
    topology: u32,
    vertices_ptr: *const u8,
    vertices_len: usize,
    indices_ptr: *const u32,
    indices_len: usize,
) -> i32 {
    const VERTEX3D_BYTES: usize = std::mem::size_of::<Vertex3D>();

    let topology = match PrimitiveTopology3D::try_from(topology) {
        Ok(topology) => topology,
        Err(e) => {
            set_last_error(e);
            return -1;
        }
    };

    if vertices_len == 0 || !vertices_len.is_multiple_of(VERTEX3D_BYTES) {
        set_last_error("Vertex data length must be a non-zero multiple of 136 bytes");
        return -1;
    }
    if vertices_ptr.is_null() || (indices_len != 0 && indices_ptr.is_null()) {
        set_last_error("Null geometry data pointer");
        return -1;
    }

    let vertex_bytes = unsafe { std::slice::from_raw_parts(vertices_ptr, vertices_len) };
    let vertices = vertex_bytes
        .as_chunks::<VERTEX3D_BYTES>()
        .0
        .iter()
        .map(|chunk| unsafe { std::ptr::read_unaligned(chunk.as_ptr().cast::<Vertex3D>()) })
        .collect::<Vec<_>>();
    let indices = if indices_len == 0 {
        Vec::new()
    } else {
        unsafe { std::slice::from_raw_parts(indices_ptr, indices_len) }.to_vec()
    };

    if indices
        .iter()
        .any(|&index| index as usize >= vertices.len())
    {
        set_last_error("Geometry index is outside the vertex buffer");
        return -1;
    }

    let geometry = Geometry3D::new_with_topology(vertices, indices, topology, None);
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_geometry(geometry_id, geometry)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Replaces a geometry's directly-uploadable packed morph target data.
///
/// `target_data` contains target-major `MorphVertex3D` records (48 bytes each). Each target
/// must contain exactly one record per vertex in the already registered geometry.
///
/// # Safety
/// `target_data` must be valid for `target_data_len` bytes when that length is non-zero.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_realm_3d_set_geometry_morph_targets(
    realm_id: u32,
    geometry_id: u32,
    target_data: *const u8,
    target_data_len: usize,
    target_count: usize,
) -> i32 {
    const MORPH_VERTEX_BYTES: usize = std::mem::size_of::<MorphVertex3D>();

    if target_count == 0 && target_data_len != 0 {
        set_last_error("Morph target data must be empty when target count is zero");
        return -1;
    }
    if target_data_len != 0
        && (target_data.is_null() || !target_data_len.is_multiple_of(MORPH_VERTEX_BYTES))
    {
        set_last_error("Morph target data must be a non-null multiple of 48 bytes");
        return -1;
    }

    let flat_deltas = if target_data_len == 0 {
        Vec::new()
    } else {
        let bytes = unsafe { std::slice::from_raw_parts(target_data, target_data_len) };
        bytes
            .as_chunks::<MORPH_VERTEX_BYTES>()
            .0
            .iter()
            .map(|chunk| unsafe {
                std::ptr::read_unaligned(chunk.as_ptr().cast::<MorphVertex3D>())
            })
            .collect::<Vec<_>>()
    };

    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        let vertex_count = realm
            .geometries
            .get(&geometry_id)
            .ok_or_else(|| format!("Geometry {geometry_id} not found"))?
            .0
            .vertices
            .len();
        let expected_count = target_count.saturating_mul(vertex_count);
        if flat_deltas.len() != expected_count {
            return Err(format!(
                "Morph target data has {} records; expected {expected_count}",
                flat_deltas.len()
            ));
        }
        let morph_targets = if target_count == 0 {
            Vec::new()
        } else if vertex_count == 0 {
            vec![MorphTarget3D::new(Vec::new()); target_count]
        } else {
            flat_deltas
                .chunks(vertex_count)
                .map(|deltas| MorphTarget3D::new(deltas.to_vec()))
                .collect()
        };
        realm
            .set_geometry_morph_targets(geometry_id, morph_targets)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

fn register_primitive_geometry(realm_id: u32, geometry_id: u32, geometry: Geometry3D) -> i32 {
    match with_multiverse_mut(|mv| {
        let realm = mv
            .get_realm_mut::<Realm3DContext>(realm_id)
            .ok_or_else(|| format!("Realm3D {realm_id} not found"))?;
        realm
            .create_geometry(geometry_id, geometry)
            .map_err(|e| e.to_string())
    }) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Creates a cube primitive centered at the origin.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_create_cube(realm_id: u32, geometry_id: u32, size: f32) -> i32 {
    register_primitive_geometry(realm_id, geometry_id, Geometry3D::cube(size))
}

/// Creates a horizontal plane primitive centered at the origin.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_create_plane(
    realm_id: u32,
    geometry_id: u32,
    width: f32,
    depth: f32,
) -> i32 {
    register_primitive_geometry(realm_id, geometry_id, Geometry3D::plane(width, depth))
}

/// Creates a vertical quad primitive centered at the origin and facing +Z.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_create_quad(
    realm_id: u32,
    geometry_id: u32,
    width: f32,
    height: f32,
) -> i32 {
    register_primitive_geometry(realm_id, geometry_id, Geometry3D::quad(width, height))
}

/// Creates a UV sphere primitive centered at the origin.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_create_sphere(
    realm_id: u32,
    geometry_id: u32,
    radius: f32,
    rings: u32,
    sectors: u32,
) -> i32 {
    register_primitive_geometry(
        realm_id,
        geometry_id,
        Geometry3D::sphere(radius, rings, sectors),
    )
}

/// Creates a cylinder primitive centered at the origin along the Y axis.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_create_cylinder(
    realm_id: u32,
    geometry_id: u32,
    radius: f32,
    height: f32,
    sectors: u32,
) -> i32 {
    register_primitive_geometry(
        realm_id,
        geometry_id,
        Geometry3D::cylinder(radius, height, sectors),
    )
}

/// Creates a capsule primitive centered at the origin along the Y axis.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_create_capsule(
    realm_id: u32,
    geometry_id: u32,
    radius: f32,
    cylinder_height: f32,
    rings: u32,
    sectors: u32,
) -> i32 {
    register_primitive_geometry(
        realm_id,
        geometry_id,
        Geometry3D::capsule(radius, cylinder_height, rings, sectors),
    )
}

/// Creates a pyramid primitive centered at the origin with its apex on +Y.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_create_pyramid(
    realm_id: u32,
    geometry_id: u32,
    width: f32,
    depth: f32,
    height: f32,
) -> i32 {
    register_primitive_geometry(
        realm_id,
        geometry_id,
        Geometry3D::pyramid(width, depth, height),
    )
}

/// Creates a torus primitive centered at the origin in the XZ plane.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_realm_3d_create_torus(
    realm_id: u32,
    geometry_id: u32,
    major_radius: f32,
    minor_radius: f32,
    major_segments: u32,
    minor_segments: u32,
) -> i32 {
    register_primitive_geometry(
        realm_id,
        geometry_id,
        Geometry3D::torus(major_radius, minor_radius, major_segments, minor_segments),
    )
}
