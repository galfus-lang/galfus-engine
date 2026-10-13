use glam::UVec4;
use serde::{Deserialize, Serialize};

/// High-level realm category.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RealmKind {
    /// 2D Canvas / Sprite / Tilemap Realm.
    TwoD,
    /// 3D Mesh / PBR / Lighting Realm.
    ThreeD,
    /// Custom user/extension Realm.
    Custom,
}

/// Context provided to a realm during the preparation phase of a frame.
#[derive(Debug, Clone)]
pub struct RealmPrepareContext {
    /// Monotonically increasing frame counter.
    pub frame_id: u64,
    /// Delta time since the last frame in seconds.
    pub delta_time: f32,
}

/// Context passed to a realm when rendering a specific invocation.
#[derive(Debug, Clone)]
pub struct RealmInvocationContext {
    /// Monotonically increasing frame counter.
    pub frame_id: u64,
    /// Identifier of the invocation.
    pub invocation_id: u32,
    /// Target identifier where this invocation renders.
    pub target_id: u32,
    /// Active camera slot bound inside the realm, if any.
    pub camera_slot: Option<u32>,
    /// Resolved pixel viewport rectangle: `[x, y, width, height]`.
    pub viewport: UVec4,
}
