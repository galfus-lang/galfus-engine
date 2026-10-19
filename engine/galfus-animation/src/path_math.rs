//! Interpolation curves and orientation math helpers for path following.

use glam::{Quat, Vec3};

pub(crate) fn bezier_quad_3d(p0: Vec3, p1: Vec3, p2: Vec3, u: f32) -> Vec3 {
    let inv = 1.0 - u;
    inv * inv * p0 + 2.0 * inv * u * p1 + u * u * p2
}

pub(crate) fn bezier_quad_tangent_3d(p0: Vec3, p1: Vec3, p2: Vec3, u: f32) -> Vec3 {
    let inv = 1.0 - u;
    2.0 * inv * (p1 - p0) + 2.0 * u * (p2 - p1)
}

pub(crate) fn bezier_cubic_3d(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: f32) -> Vec3 {
    let inv = 1.0 - u;
    inv * inv * inv * p0 + 3.0 * inv * inv * u * p1 + 3.0 * inv * u * u * p2 + u * u * u * p3
}

pub(crate) fn bezier_cubic_tangent_3d(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: f32) -> Vec3 {
    let inv = 1.0 - u;
    3.0 * inv * inv * (p1 - p0) + 6.0 * inv * u * (p2 - p1) + 3.0 * u * u * (p3 - p2)
}

pub(crate) fn catmull_rom_3d(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: f32) -> Vec3 {
    let u2 = u * u;
    let u3 = u2 * u;
    0.5 * ((2.0 * p1)
        + (-p0 + p2) * u
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * u2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * u3)
}

pub(crate) fn catmull_rom_tangent_3d(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: f32) -> Vec3 {
    let u2 = u * u;
    0.5 * ((-p0 + p2)
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * (2.0 * u)
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * (3.0 * u2))
}

pub(crate) fn quat_look_at(eye: Vec3, target: Vec3, up: Vec3) -> Quat {
    let f = (target - eye).normalize_or_zero();
    if f.length_squared() < 1e-6 {
        return Quat::IDENTITY;
    }
    let mut s = f.cross(up).normalize_or_zero();
    if s.length_squared() < 1e-6 {
        s = f.cross(Vec3::Z).normalize_or_zero();
    }
    let u = s.cross(f).normalize_or_zero();
    let rot_mat = glam::Mat4::from_cols(
        s.extend(0.0),
        u.extend(0.0),
        (-f).extend(0.0),
        glam::Vec4::W,
    );
    Quat::from_mat4(&rot_mat)
}
