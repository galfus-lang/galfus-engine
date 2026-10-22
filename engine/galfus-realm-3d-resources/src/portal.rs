//! Planar mirror and visual portal resources for Realm3D.

use serde::{Deserialize, Serialize};

use crate::transform::Transform3D;

/// Planar reflection mirror or optical portal component.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Portal3D {
    /// Entrance model ID defining the portal surface geometry and world transform.
    pub model_id: u32,
    /// Optional exit transform. If None, the portal acts as a planar mirror.
    pub exit_transform: Option<Transform3D>,
    /// Whether the portal is actively reflecting/rendering.
    #[serde(default = "default_portal_active")]
    pub active: bool,
    /// Resolution scaling factor relative to the main viewport (e.g. 1.0 or 0.5).
    #[serde(default = "default_resolution_scale")]
    pub resolution_scale: f32,
}

fn default_portal_active() -> bool {
    true
}

fn default_resolution_scale() -> f32 {
    1.0
}

impl Portal3D {
    /// Creates a planar mirror reflecting across a model's plane.
    pub fn mirror(model_id: u32) -> Self {
        Self {
            model_id,
            exit_transform: None,
            active: true,
            resolution_scale: 1.0,
        }
    }

    /// Creates a visual portal leading to an exit transform.
    pub fn portal(model_id: u32, exit_transform: Transform3D) -> Self {
        Self {
            model_id,
            exit_transform: Some(exit_transform),
            active: true,
            resolution_scale: 1.0,
        }
    }
}
