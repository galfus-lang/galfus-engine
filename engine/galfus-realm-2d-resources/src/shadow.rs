use glam::Vec2;
use serde::{Deserialize, Serialize};

/// Global configuration for the 2D soft shadow renderer.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shadow2DConfig {
    /// Contact offset distance to eliminate self-shadowing acne at base corners.
    pub shadow_contact_offset: f32,
    /// Light index filter for shadow debugging (-1 disables debug override).
    pub shadow_debug_light_index: i32,
    /// Debug mode switch: 0 = standard lighting, 1 = shadow attenuation only.
    pub shadow_debug_mode: i32,
    /// Base ambient light factor when illuminated surfaces are fully shadowed.
    pub ambient: f32,
    /// Default physical emitter disk radius used when not overridden per light.
    pub light_radius: f32,
    /// Maximum shadow mask updates processed per frame to balance CPU/GPU load.
    pub max_shadow_updates_per_frame: u32,
    /// Angular resolution of the 1D polar shadow buffer (128..4096).
    pub angular_resolution: u32,
    /// Map resolution for shadow storage cache.
    pub map_resolution: u32,
}

impl Default for Shadow2DConfig {
    fn default() -> Self {
        Self {
            shadow_contact_offset: 0.0,
            shadow_debug_light_index: -1,
            shadow_debug_mode: 0,
            ambient: 0.06,
            light_radius: 0.25,
            max_shadow_updates_per_frame: 16,
            angular_resolution: 1024,
            map_resolution: 512,
        }
    }
}

impl Shadow2DConfig {
    /// Sanitizes parameters ensuring bounds and validity.
    pub fn sanitized(self) -> Self {
        Self {
            shadow_contact_offset: self.shadow_contact_offset.max(0.0),
            shadow_debug_light_index: self.shadow_debug_light_index.max(-1),
            shadow_debug_mode: self.shadow_debug_mode.clamp(0, 1),
            ambient: self.ambient.max(0.0),
            light_radius: self.light_radius.max(0.01),
            max_shadow_updates_per_frame: self.max_shadow_updates_per_frame.clamp(1, 64),
            angular_resolution: self.angular_resolution.clamp(128, 4096),
            map_resolution: self.map_resolution.clamp(64, 2048),
        }
    }
}

/// Linear 2D occluder boundary segment between points A and B.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OccluderEdge2D {
    pub a: Vec2,
    pub b: Vec2,
}

/// 4-Vertex quad silhouette for 2D shadow caster geometry in world space.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OccluderSilhouette2D {
    pub vertices: [Vec2; 4],
    pub edges: [OccluderEdge2D; 4],
}

impl OccluderSilhouette2D {
    /// Constructs a silhouette from four counter-clockwise or clockwise quad corners.
    pub fn from_quad(corners: [Vec2; 4]) -> Self {
        Self {
            vertices: corners,
            edges: [
                OccluderEdge2D {
                    a: corners[0],
                    b: corners[1],
                },
                OccluderEdge2D {
                    a: corners[1],
                    b: corners[2],
                },
                OccluderEdge2D {
                    a: corners[2],
                    b: corners[3],
                },
                OccluderEdge2D {
                    a: corners[3],
                    b: corners[0],
                },
            ],
        }
    }
}

/// Prepared 2D occluder ready for polar shadow cone projection.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Occluder2D {
    /// Source entity identifier.
    pub entity_id: u32,
    /// World-space geometric silhouette.
    pub silhouette: OccluderSilhouette2D,
    /// Shadow layer filter mask.
    pub shadow_layer_mask: u32,
    /// Shadow projection height scalar.
    pub shadow_height: f32,
    /// Optional vertical height interval [min_z, max_z] where this occluder blocks light.
    #[serde(default)]
    pub height_range: Option<[f32; 2]>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_occluder_silhouette_edges() {
        let quad = [
            Vec2::new(0.0, 0.0),
            Vec2::new(1.0, 0.0),
            Vec2::new(1.0, 1.0),
            Vec2::new(0.0, 1.0),
        ];
        let sil = OccluderSilhouette2D::from_quad(quad);
        assert_eq!(sil.edges[0].a, Vec2::new(0.0, 0.0));
        assert_eq!(sil.edges[0].b, Vec2::new(1.0, 0.0));
        assert_eq!(sil.edges[3].b, Vec2::new(0.0, 0.0));
    }
}
