use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec2, Vec4};

/// Item drawing instance passed to GPU vertex shader via storage buffer or instance attributes.
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct Item2DInstanceRaw {
    /// 4x4 Model world matrix.
    pub model_matrix: Mat4,
    /// Base tint multiplier for this instance.
    pub tint: Vec4,
    /// Texture coordinate sub-rectangle `[u_min, v_min, u_max, v_max]`.
    pub uv_rect: Vec4,
    /// Shadow and lighting parameters: `[receive_shadow, cast_shadow, shadow_height, shadow_layer_mask]`.
    pub shadow_params: Vec4,
}

/// Single polar shadow sample candidate for soft 2D penumbra calculations (64 bytes).
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct ShadowSample2DRaw {
    /// Distance from light to closest blocker point.
    pub blocker_distance: f32,
    /// Left angular boundary of blocker interval in radians.
    pub blocker_left: f32,
    /// Right angular boundary of blocker interval in radians.
    pub blocker_right: f32,
    /// Active flag (1.0 = valid sample, 0.0 = empty).
    pub flags: f32,
    /// Left angular boundary of penumbra spread in radians.
    pub penumbra_left: f32,
    /// Right angular boundary of penumbra spread in radians.
    pub penumbra_right: f32,
    /// Distance to left support vertex.
    pub support_left_distance: f32,
    /// Distance to right support vertex.
    pub support_right_distance: f32,
    /// World-space position of occluder vertex 0.
    pub occluder_v0: Vec2,
    /// World-space position of occluder vertex 1.
    pub occluder_v1: Vec2,
    /// World-space position of occluder vertex 2.
    pub occluder_v2: Vec2,
    /// World-space position of occluder vertex 3.
    pub occluder_v3: Vec2,
}

impl Default for ShadowSample2DRaw {
    fn default() -> Self {
        Self {
            blocker_distance: 1e20,
            blocker_left: 0.0,
            blocker_right: 0.0,
            flags: 0.0,
            penumbra_left: 0.0,
            penumbra_right: 0.0,
            support_left_distance: 1e20,
            support_right_distance: 1e20,
            occluder_v0: Vec2::ZERO,
            occluder_v1: Vec2::ZERO,
            occluder_v2: Vec2::ZERO,
            occluder_v3: Vec2::ZERO,
        }
    }
}

/// Sorting and batching key for grouping 2D draw calls.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct BatchKey2D {
    /// Depth layer for back-to-front rendering.
    pub z_layer: i32,
    /// Material binding index.
    pub material_id: u32,
    /// Geometry mesh / quad index.
    pub geometry_id: u32,
    /// Surface blend type (0 = Opaque, 1 = Transparent, 2 = Masked).
    pub surface_type: u32,
}

/// Contiguous index range sharing the same `BatchKey2D`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BatchRange2D {
    pub key: BatchKey2D,
    pub start: u32,
    pub count: u32,
}

// Re-export common uniforms for convenience
pub use galfus_realm_2d_resources::{
    Camera2D, Camera2DUniform, Light2D, Light2DUniform, Material2D, Material2DUniform, Occluder2D,
    OccluderEdge2D, OccluderSilhouette2D, Shadow2DConfig, Shape2D, ShapeKind2D, Sprite2D,
    SurfaceType2D, Transform2D,
};
