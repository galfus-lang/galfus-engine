//! Foundational collision geometries, raycasting, and hit testing contracts.

use glam::{Vec2, Vec3};
use serde::{Deserialize, Serialize};

/// 2D geometric shape definition for colliders.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ColliderShape2D {
    /// Axis-aligned rectangle defined by its half extents `(half_w, half_h)`.
    #[serde(rename_all = "camelCase")]
    Rectangle {
        /// Half dimensions along X and Y.
        half_extents: [f32; 2],
    },
    /// Circular boundary defined by its radius.
    #[serde(rename_all = "camelCase")]
    Circle {
        /// Radius of the circle.
        radius: f32,
    },
    /// Simple polygon in collider-local coordinates, including concave polygons.
    Polygon { vertices: Vec<[f32; 2]> },
}

/// 3D geometric shape definition for colliders.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ColliderShape3D {
    /// Axis-aligned box defined by its half extents `(half_x, half_y, half_z)`.
    #[serde(rename_all = "camelCase")]
    Box {
        /// Half dimensions along X, Y, and Z.
        half_extents: [f32; 3],
    },
    /// Spherical boundary defined by its radius.
    #[serde(rename_all = "camelCase")]
    Sphere {
        /// Radius of the sphere.
        radius: f32,
    },
    /// Y-axis aligned cylinder in collider-local coordinates.
    Cylinder {
        radius: f32,
        #[serde(rename = "halfHeight")]
        half_height: f32,
    },
    /// Y-axis aligned capsule in collider-local coordinates.
    Capsule {
        radius: f32,
        #[serde(rename = "halfHeight")]
        half_height: f32,
    },
    /// Finite plane in the local XY plane.
    Rectangle {
        #[serde(rename = "halfExtents")]
        half_extents: [f32; 2],
    },
    /// Planar boundary defined by normal and distance.
    #[serde(rename_all = "camelCase")]
    Plane {
        /// Normal vector of the plane.
        normal: [f32; 3],
        /// Distance from origin along the normal.
        distance: f32,
    },
}

/// 2D collision component attached to a logical model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collider2D {
    /// Logical identifier of the collider.
    pub id: u32,
    /// Identifier of the model this collider belongs to.
    pub model_id: u32,
    /// Geometric shape of the collider.
    pub shape: ColliderShape2D,
    /// Local offset relative to model position.
    #[serde(default)]
    pub offset: [f32; 2],
    /// Optional column-major affine local transform, applied before the offset.
    #[serde(default)]
    pub local_matrix: Option<[f32; 6]>,
    /// Whether this collider participates in queries.
    #[serde(default = "default_active")]
    pub active: bool,
    /// Whether this collider is a sensor.
    #[serde(default)]
    pub sensor: bool,
    /// Collision layer bitmask.
    #[serde(default = "default_layer")]
    pub layer: u32,
    /// Collision target mask.
    #[serde(default = "default_mask")]
    pub mask: u32,
}

/// 3D collision component attached to a logical model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collider3D {
    /// Logical identifier of the collider.
    pub id: u32,
    /// Identifier of the model this collider belongs to.
    pub model_id: u32,
    /// Geometric shape of the collider.
    pub shape: ColliderShape3D,
    /// Local offset relative to model position.
    #[serde(default)]
    pub offset: [f32; 3],
    /// Optional column-major affine local transform, applied before the offset.
    #[serde(default)]
    pub local_matrix: Option<[f32; 16]>,
    /// Whether this collider participates in queries.
    #[serde(default = "default_active")]
    pub active: bool,
    /// Whether this collider is a sensor.
    #[serde(default)]
    pub sensor: bool,
    /// Collision layer bitmask.
    #[serde(default = "default_layer")]
    pub layer: u32,
    /// Collision target mask.
    #[serde(default = "default_mask")]
    pub mask: u32,
}

const fn default_layer() -> u32 {
    1
}

const fn default_active() -> bool {
    true
}

impl Collider2D {
    /// Validates geometry and the optional affine transform before registration.
    pub fn is_valid(&self) -> bool {
        let geometry = match &self.shape {
            ColliderShape2D::Rectangle { half_extents } => {
                half_extents.iter().all(|v| v.is_finite() && *v > 0.0)
            }
            ColliderShape2D::Circle { radius } => radius.is_finite() && *radius > 0.0,
            ColliderShape2D::Polygon { vertices } => valid_polygon(vertices),
        };
        geometry
            && self.offset.iter().all(|v| v.is_finite())
            && self
                .local_matrix
                .as_ref()
                .is_none_or(|m| m.iter().all(|v| v.is_finite()))
    }
}

impl Collider3D {
    /// Validates geometry and the optional affine transform before registration.
    pub fn is_valid(&self) -> bool {
        let positive = |v: &f32| v.is_finite() && *v > 0.0;
        let geometry = match &self.shape {
            ColliderShape3D::Box { half_extents } => half_extents.iter().all(positive),
            ColliderShape3D::Sphere { radius } => positive(radius),
            ColliderShape3D::Cylinder {
                radius,
                half_height,
            }
            | ColliderShape3D::Capsule {
                radius,
                half_height,
            } => positive(radius) && positive(half_height),
            ColliderShape3D::Rectangle { half_extents } => half_extents.iter().all(positive),
            ColliderShape3D::Plane { normal, distance } => {
                Vec3::from(*normal).is_finite()
                    && Vec3::from(*normal).length_squared() > 0.0
                    && distance.is_finite()
            }
        };
        geometry
            && self.offset.iter().all(|v| v.is_finite())
            && self.local_matrix.as_ref().is_none_or(|m| {
                m.iter().all(|v| v.is_finite())
                    && m[3] == 0.0
                    && m[7] == 0.0
                    && m[11] == 0.0
                    && m[15] == 1.0
            })
    }
}

fn valid_polygon(vertices: &[[f32; 2]]) -> bool {
    if vertices.len() < 3 || vertices.iter().flatten().any(|v| !v.is_finite()) {
        return false;
    }
    let mut area = 0.0;
    for i in 0..vertices.len() {
        let a = Vec2::from(vertices[i]);
        let b = Vec2::from(vertices[(i + 1) % vertices.len()]);
        if a == b {
            return false;
        }
        area += a.perp_dot(b);
        for j in i + 1..vertices.len() {
            if j == i + 1 || (i == 0 && j + 1 == vertices.len()) {
                continue;
            }
            let c = Vec2::from(vertices[j]);
            let d = Vec2::from(vertices[(j + 1) % vertices.len()]);
            if a.x.min(b.x) <= c.x.max(d.x)
                && c.x.min(d.x) <= a.x.max(b.x)
                && a.y.min(b.y) <= c.y.max(d.y)
                && c.y.min(d.y) <= a.y.max(b.y)
                && (b - a).perp_dot(c - a) * (b - a).perp_dot(d - a) <= 0.0
                && (d - c).perp_dot(a - c) * (d - c).perp_dot(b - c) <= 0.0
            {
                return false;
            }
        }
    }
    area.is_finite() && area.abs() > 1e-9
}

const fn default_mask() -> u32 {
    u32::MAX
}

/// Normalized 3D ray for raycasting and picking.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ray3D {
    /// Starting origin of the ray.
    pub origin: Vec3,
    /// Normalized direction of the ray.
    pub direction: Vec3,
}

impl Ray3D {
    /// Creates a new ray with normalized direction.
    #[inline]
    pub fn new(origin: Vec3, direction: Vec3) -> Self {
        Self {
            origin,
            direction: direction.normalize_or_zero(),
        }
    }

    /// Evaluates a point along the ray at parameter `t`.
    #[inline]
    pub fn at(self, t: f32) -> Vec3 {
        self.origin + self.direction * t
    }
}

/// Result of a successful 2D hit test.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HitResult2D {
    /// Identifier of the hit model.
    pub model_id: u32,
    /// Identifier of the hit collider.
    pub collider_id: u32,
    /// World position of the hit.
    pub point: Vec2,
    /// Surface normal vector at the hit point.
    pub normal: Vec2,
    /// Normalized UV coordinates within the shape `[0..1, 0..1]`.
    pub uv: Vec2,
    /// Z-layer for sorting (higher = closer to camera).
    pub z_layer: f32,
    /// Optional logical sub-element identifier (e.g. topmost hit UI Panel).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub element_id: Option<u32>,
}

/// Result of a successful 3D hit test.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HitResult3D {
    /// Identifier of the hit model.
    pub model_id: u32,
    /// Identifier of the hit collider.
    pub collider_id: u32,
    /// World position of the hit point.
    pub point: Vec3,
    /// Surface normal vector at the hit point.
    pub normal: Vec3,
    /// Distance from ray origin to the hit point.
    pub distance: f32,
    /// Normalized UV coordinates on the hit surface.
    pub uv: Vec2,
}

/// A 2D spatial query result in world coordinates.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColliderQueryHit2D {
    pub model_id: u32,
    pub collider_id: u32,
    pub point: Vec2,
    pub normal: Vec2,
    pub distance: f32,
    pub sensor: bool,
}

/// A 3D spatial query result in world coordinates.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColliderQueryHit3D {
    pub model_id: u32,
    pub collider_id: u32,
    pub point: Vec3,
    pub normal: Vec3,
    pub distance: f32,
    pub sensor: bool,
}
