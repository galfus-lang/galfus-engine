use glam::{UVec2, UVec4};
use serde::{Deserialize, Serialize};

/// Type of render destination.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum TargetKind {
    /// Presentation window managed by the platform.
    Window { window_id: u32 },
    /// Offscreen render texture.
    Texture {
        width: u32,
        height: u32,
        #[serde(default = "default_texture_format")]
        format: String,
    },
}

fn default_texture_format() -> String {
    "rgba8unorm".to_string()
}

/// Description of a Target created by the host.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetDesc {
    /// Nature and configuration of the target.
    pub kind: TargetKind,
    /// Explicit pixel resolution (required for textures, fallback for windows).
    pub size: Option<UVec2>,
}

/// Layout specification for a realm invocation's viewport.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

impl ViewportRect {
    /// Resolves the viewport against target dimensions.
    /// If width or height are zero, fills the entire target dimensions.
    pub fn resolve(&self, target_size: UVec2) -> UVec4 {
        let w = if self.width == 0 {
            target_size.x.saturating_sub(self.x).max(1)
        } else {
            self.width
        };
        let h = if self.height == 0 {
            target_size.y.saturating_sub(self.y).max(1)
        } else {
            self.height
        };
        UVec4::new(self.x, self.y, w, h)
    }
}

/// Description of an Invocation linking a Realm to a Target.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvocationDesc {
    /// ID of the producing Realm.
    pub realm_id: u32,
    /// ID of the destination Target.
    pub target_id: u32,
    /// Optional specific camera inside the realm (e.g. portal camera vs player camera).
    pub camera_id: Option<u32>,
    /// Viewport rectangle. Default (0,0,0,0) spans the whole target.
    #[serde(default)]
    pub viewport: ViewportRect,
    /// Overlay stacking order within the same target (lower drawn first).
    #[serde(default)]
    pub z_index: i32,
    /// Whether this invocation is active. Disabled invocations cost zero GPU/CPU work.
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// Optional clear color `[r, g, b, a]`.
    pub clear_color: Option<[f32; 4]>,
}

fn default_enabled() -> bool {
    true
}

/// Binding declaring that a Realm reads the output texture of a Target.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetTextureBinding {
    /// Logical ID of the target whose rendered texture is consumed.
    pub source_target_id: u32,
    /// Logical ID of the realm that consumes this texture.
    pub realm_id: u32,
    /// Name or identifier of the texture slot inside the realm (e.g. "portal_surface").
    pub slot: String,
}
