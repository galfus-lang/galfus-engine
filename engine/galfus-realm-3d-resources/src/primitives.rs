use glam::{Vec2, Vec3};

use crate::aabb::Aabb;
use crate::geometry::{Geometry3D, Vertex3D};

/// Generates a cylinder with circular caps centered at the origin.
pub fn cylinder(radius: f32, height: f32, sectors: u32) -> Geometry3D {
    let radius = radius.max(0.0001);
    let sectors = sectors.max(3);
    let half_h = height * 0.5;

    let mut vertices = Vec::new();
    let mut indices = Vec::new();

    // Side wall
    let angle_step = std::f32::consts::TAU / sectors as f32;
    for i in 0..=sectors {
        let u = i as f32 / sectors as f32;
        let angle = i as f32 * angle_step;
        let x = angle.cos() * radius;
        let z = angle.sin() * radius;
        let n = Vec3::new(angle.cos(), 0.0, angle.sin()).normalize_or_zero();

        // Top vertex
        vertices.push(Vertex3D::new([x, half_h, z], [n.x, n.y, n.z], [u, 0.0]));
        // Bottom vertex
        vertices.push(Vertex3D::new([x, -half_h, z], [n.x, n.y, n.z], [u, 1.0]));
    }

    for i in 0..sectors {
        let i0 = i * 2;
        let i1 = i0 + 1;
        let i2 = (i + 1) * 2;
        let i3 = i2 + 1;
        indices.extend_from_slice(&[i0, i2, i1, i1, i2, i3]);
    }

    // Top cap (winding CCW as viewed from +Y: center -> next -> curr)
    let top_center_idx = vertices.len() as u32;
    vertices.push(Vertex3D::new(
        [0.0, half_h, 0.0],
        [0.0, 1.0, 0.0],
        [0.5, 0.5],
    ));
    for i in 0..=sectors {
        let angle = i as f32 * angle_step;
        let x = angle.cos() * radius;
        let z = angle.sin() * radius;
        let u = angle.cos() * 0.5 + 0.5;
        let v = angle.sin() * 0.5 + 0.5;
        vertices.push(Vertex3D::new([x, half_h, z], [0.0, 1.0, 0.0], [u, v]));
    }
    for i in 0..sectors {
        indices.extend_from_slice(&[
            top_center_idx,
            top_center_idx + 2 + i,
            top_center_idx + 1 + i,
        ]);
    }

    // Bottom cap (winding CCW as viewed from -Y: center -> curr -> next)
    let bot_center_idx = vertices.len() as u32;
    vertices.push(Vertex3D::new(
        [0.0, -half_h, 0.0],
        [0.0, -1.0, 0.0],
        [0.5, 0.5],
    ));
    for i in 0..=sectors {
        let angle = i as f32 * angle_step;
        let x = angle.cos() * radius;
        let z = angle.sin() * radius;
        let u = angle.cos() * 0.5 + 0.5;
        let v = angle.sin() * 0.5 + 0.5;
        vertices.push(Vertex3D::new([x, -half_h, z], [0.0, -1.0, 0.0], [u, v]));
    }
    for i in 0..sectors {
        indices.extend_from_slice(&[
            bot_center_idx,
            bot_center_idx + 1 + i,
            bot_center_idx + 2 + i,
        ]);
    }

    let aabb = Aabb::from_vertices(&vertices);
    Geometry3D {
        label: Some("Cylinder3D".into()),
        aabb,
        vertices,
        indices,
    }
}

/// Generates a capsule (pill) along the Y axis composed of a cylinder and two hemispherical caps.
pub fn capsule(radius: f32, cylinder_height: f32, rings: u32, sectors: u32) -> Geometry3D {
    let radius = radius.max(0.0001);
    let sectors = sectors.max(3);
    let rings = rings.max(2);
    let half_h = cylinder_height.max(0.0) * 0.5;

    let mut profile: Vec<(f32, f32, f32)> = Vec::new(); // (y, ring_radius, normal_y)

    // Top hemisphere profile from north pole (y = half_h + radius) down to equator (y = half_h)
    for i in 0..=rings {
        let phi = (std::f32::consts::FRAC_PI_2) * (1.0 - i as f32 / rings as f32);
        let y = half_h + radius * phi.sin();
        let r = radius * phi.cos();
        let ny = phi.sin();
        profile.push((y, r, ny));
    }

    // Bottom hemisphere profile from equator (y = -half_h) down to south pole (y = -half_h - radius)
    for i in 0..=rings {
        let phi = -(std::f32::consts::FRAC_PI_2) * (i as f32 / rings as f32);
        let y = -half_h + radius * phi.sin();
        let r = radius * phi.cos();
        let ny = phi.sin();
        profile.push((y, r, ny));
    }

    let ring_count = profile.len();
    let mut vertices = Vec::with_capacity(ring_count * (sectors as usize + 1));
    let mut indices = Vec::with_capacity((ring_count - 1) * sectors as usize * 6);

    for (ring_idx, &(y, ring_r, ny)) in profile.iter().enumerate() {
        let v = ring_idx as f32 / (ring_count - 1) as f32;
        let nr = (1.0 - ny * ny).max(0.0).sqrt();

        for s in 0..=sectors {
            let u = s as f32 / sectors as f32;
            let theta = u * std::f32::consts::TAU;
            let (sin_t, cos_t) = theta.sin_cos();

            let x = ring_r * cos_t;
            let z = ring_r * sin_t;
            let normal = Vec3::new(nr * cos_t, ny, nr * sin_t).normalize_or_zero();

            vertices.push(Vertex3D::new(
                [x, y, z],
                [normal.x, normal.y, normal.z],
                [u, v],
            ));
        }
    }

    let stride = sectors + 1;
    for ring in 0..(ring_count as u32 - 1) {
        let row0 = ring * stride;
        let row1 = (ring + 1) * stride;
        for s in 0..sectors {
            let i0 = row0 + s;
            let i1 = row0 + s + 1;
            let i2 = row1 + s;
            let i3 = row1 + s + 1;
            indices.extend_from_slice(&[i0, i1, i2, i1, i3, i2]);
        }
    }

    let aabb = Aabb::from_vertices(&vertices);
    Geometry3D {
        label: Some("Capsule3D".into()),
        aabb,
        vertices,
        indices,
    }
}

/// Generates a pyramid with a rectangular base on the XZ plane and an apex at `+height/2`.
pub fn pyramid(width: f32, depth: f32, height: f32) -> Geometry3D {
    let hw = width * 0.5;
    let hd = depth * 0.5;
    let hh = height * 0.5;

    let apex = Vec3::new(0.0, hh, 0.0);
    let p0 = Vec3::new(-hw, -hh, hd); // Front-left
    let p1 = Vec3::new(hw, -hh, hd); // Front-right
    let p2 = Vec3::new(hw, -hh, -hd); // Back-right
    let p3 = Vec3::new(-hw, -hh, -hd); // Back-left

    let mut vertices = Vec::new();
    let mut indices = Vec::new();

    // Helper to add a triangle face with flat normal
    let mut add_tri = |a: Vec3, b: Vec3, c: Vec3, uva: Vec2, uvb: Vec2, uvc: Vec2| {
        let start = vertices.len() as u32;
        let n = (b - a).cross(c - a).normalize_or_zero();
        vertices.push(Vertex3D::new(
            [a.x, a.y, a.z],
            [n.x, n.y, n.z],
            [uva.x, uva.y],
        ));
        vertices.push(Vertex3D::new(
            [b.x, b.y, b.z],
            [n.x, n.y, n.z],
            [uvb.x, uvb.y],
        ));
        vertices.push(Vertex3D::new(
            [c.x, c.y, c.z],
            [n.x, n.y, n.z],
            [uvc.x, uvc.y],
        ));
        indices.extend_from_slice(&[start, start + 1, start + 2]);
    };

    // Front face
    add_tri(
        apex,
        p0,
        p1,
        Vec2::new(0.5, 1.0),
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 0.0),
    );
    // Right face
    add_tri(
        apex,
        p1,
        p2,
        Vec2::new(0.5, 1.0),
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 0.0),
    );
    // Back face
    add_tri(
        apex,
        p2,
        p3,
        Vec2::new(0.5, 1.0),
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 0.0),
    );
    // Left face
    add_tri(
        apex,
        p3,
        p0,
        Vec2::new(0.5, 1.0),
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 0.0),
    );

    // Bottom face (quad)
    let bot_start = vertices.len() as u32;
    let bot_n = [0.0, -1.0, 0.0];
    vertices.push(Vertex3D::new([p0.x, p0.y, p0.z], bot_n, [0.0, 1.0]));
    vertices.push(Vertex3D::new([p3.x, p3.y, p3.z], bot_n, [0.0, 0.0]));
    vertices.push(Vertex3D::new([p2.x, p2.y, p2.z], bot_n, [1.0, 0.0]));
    vertices.push(Vertex3D::new([p1.x, p1.y, p1.z], bot_n, [1.0, 1.0]));
    indices.extend_from_slice(&[
        bot_start,
        bot_start + 1,
        bot_start + 2,
        bot_start,
        bot_start + 2,
        bot_start + 3,
    ]);

    let aabb = Aabb::from_vertices(&vertices);
    Geometry3D {
        label: Some("Pyramid3D".into()),
        aabb,
        vertices,
        indices,
    }
}

/// Generates a torus (doughnut) centered on the origin in the XZ plane.
pub fn torus(
    major_radius: f32,
    minor_radius: f32,
    major_segments: u32,
    minor_segments: u32,
) -> Geometry3D {
    let major_segments = major_segments.max(3);
    let minor_segments = minor_segments.max(3);

    let mut vertices = Vec::new();
    let mut indices = Vec::new();

    let major_step = std::f32::consts::TAU / major_segments as f32;
    let minor_step = std::f32::consts::TAU / minor_segments as f32;

    for i in 0..=major_segments {
        let u = i as f32 / major_segments as f32;
        let major_angle = i as f32 * major_step;
        let (sin_maj, cos_maj) = major_angle.sin_cos();

        for j in 0..=minor_segments {
            let v = j as f32 / minor_segments as f32;
            let minor_angle = j as f32 * minor_step;
            let (sin_min, cos_min) = minor_angle.sin_cos();

            let x = (major_radius + minor_radius * cos_min) * cos_maj;
            let y = minor_radius * sin_min;
            let z = (major_radius + minor_radius * cos_min) * sin_maj;

            let normal =
                Vec3::new(cos_min * cos_maj, sin_min, cos_min * sin_maj).normalize_or_zero();

            vertices.push(Vertex3D::new(
                [x, y, z],
                [normal.x, normal.y, normal.z],
                [u, v],
            ));
        }
    }

    for i in 0..major_segments {
        let base0 = i * (minor_segments + 1);
        let base1 = (i + 1) * (minor_segments + 1);
        for j in 0..minor_segments {
            let row0 = base0 + j;
            let row1 = base1 + j;
            indices.extend_from_slice(&[row0, row0 + 1, row1, row0 + 1, row1 + 1, row1]);
        }
    }

    let aabb = Aabb::from_vertices(&vertices);
    Geometry3D {
        label: Some("Torus3D".into()),
        aabb,
        vertices,
        indices,
    }
}
