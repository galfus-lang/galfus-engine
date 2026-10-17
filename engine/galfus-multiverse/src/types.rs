use glam::{UVec2, UVec4};
use serde::{Deserialize, Serialize};

/// Type of render destination.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "type"
)]
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

/// Nature of post-processing filters applied to an invocation output.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum InvocationFilter {
    /// Sepia color grading post-processing filter.
    Sepia,
    /// Perceptual luminance grayscale filter.
    Grayscale,
    /// Color inversion filter.
    Invert,
    /// Radial vignette shading around borders.
    Vignette,
    /// ACES Filmic tonemapping curve for high dynamic range colors.
    TonemapAces,
    /// RGB channel split chromatic aberration.
    ChromaticAberration,
    /// Dynamic film grain texture.
    FilmGrain,
    /// High-contrast silhouette edge detector outline.
    EdgeOutline,
    /// Color posterization effect reducing color depth.
    Posterize,
    /// Box blur filter smoothing adjacent texels.
    Blur,
    /// High-pass unsharp masking filter enhancing edge sharpness.
    Sharpen,
    /// Custom post-processing shader module ID with optional texture slots and sampler index.
    Custom {
        shader_id: u32,
        #[serde(default)]
        textures: [Option<u32>; 8],
        #[serde(default)]
        sampler_index: u32,
    },
}

impl InvocationFilter {
    /// Creates a custom shader filter with no auxiliary textures and default linear repeat sampler.
    pub fn custom(shader_id: u32) -> Self {
        Self::Custom {
            shader_id,
            textures: [None; 8],
            sampler_index: 0,
        }
    }
}

/// Layout specification for a realm invocation's viewport.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "unit")]
pub enum ViewportRect {
    /// Physical pixel coordinates [x, y, width, height].
    Pixels {
        x: u32,
        y: u32,
        width: u32,
        height: u32,
    },
    /// Normalized coordinates in 0.0..=1.0 relative to target dimensions.
    Normalized {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    },
}

impl ViewportRect {
    /// Creates a viewport in physical pixels.
    pub const fn pixels(x: u32, y: u32, width: u32, height: u32) -> Self {
        Self::Pixels {
            x,
            y,
            width,
            height,
        }
    }

    /// Creates a viewport in normalized coordinates (0.0..=1.0).
    pub const fn normalized(x: f32, y: f32, width: f32, height: f32) -> Self {
        Self::Normalized {
            x,
            y,
            width,
            height,
        }
    }

    /// Fullscreen viewport spanning 100% of target dimensions.
    pub const fn full() -> Self {
        Self::Normalized {
            x: 0.0,
            y: 0.0,
            width: 1.0,
            height: 1.0,
        }
    }

    /// Resolves the viewport against target dimensions.
    pub fn resolve(&self, target_size: UVec2) -> UVec4 {
        match *self {
            Self::Pixels {
                x,
                y,
                width,
                height,
            } => {
                let px = x.min(target_size.x);
                let py = y.min(target_size.y);
                let w = if width == 0 {
                    target_size.x.saturating_sub(px).max(1)
                } else {
                    width.min(target_size.x.saturating_sub(px)).max(1)
                };
                let h = if height == 0 {
                    target_size.y.saturating_sub(py).max(1)
                } else {
                    height.min(target_size.y.saturating_sub(py)).max(1)
                };
                UVec4::new(px, py, w, h)
            }
            Self::Normalized {
                x,
                y,
                width,
                height,
            } => {
                let tw = target_size.x as f32;
                let th = target_size.y as f32;
                let px = ((x.clamp(0.0, 1.0) * tw).round() as u32).min(target_size.x);
                let py = ((y.clamp(0.0, 1.0) * th).round() as u32).min(target_size.y);
                let raw_w = ((width.clamp(0.0, 1.0) * tw).round() as u32).max(1);
                let raw_h = ((height.clamp(0.0, 1.0) * th).round() as u32).max(1);
                let pw = raw_w.min(target_size.x.saturating_sub(px)).max(1);
                let ph = raw_h.min(target_size.y.saturating_sub(py)).max(1);
                UVec4::new(px, py, pw, ph)
            }
        }
    }
}

impl Default for ViewportRect {
    fn default() -> Self {
        Self::full()
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
    /// Optional camera slot inside the realm (e.g. slot 0 for main camera, slot 1 for portal/split).
    pub camera_slot: Option<u32>,
    /// Viewport rectangle. Default spans the whole target (`ViewportRect::full()`).
    #[serde(default)]
    pub viewport: ViewportRect,
    /// Post-processing filters applied to the realm output before target presentation.
    #[serde(default)]
    pub filters: Vec<InvocationFilter>,
    /// Overlay stacking order within the same target (lower drawn first).
    #[serde(default)]
    pub z_index: i32,
    /// Whether this invocation is active. Disabled invocations cost zero GPU/CPU work.
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// Optional clear color `[r, g, b, a]`.
    pub clear_color: Option<[f32; 4]>,
}

impl Default for InvocationDesc {
    fn default() -> Self {
        Self {
            realm_id: 0,
            target_id: 0,
            camera_slot: None,
            viewport: ViewportRect::default(),
            filters: Vec::new(),
            z_index: 0,
            enabled: true,
            clear_color: None,
        }
    }
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

impl TargetDesc {
    /// Convenience helper to create a window target.
    pub fn window(window_id: u32) -> Self {
        Self {
            kind: TargetKind::Window { window_id },
            size: None,
        }
    }

    /// Convenience helper to create an offscreen texture target.
    pub fn texture(width: u32, height: u32) -> Self {
        Self {
            kind: TargetKind::Texture {
                width,
                height,
                format: default_texture_format(),
            },
            size: Some(UVec2::new(width, height)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_viewport_rect_odd_dimension_split() {
        let odd_size = UVec2::new(905, 1020);
        let left_vp = ViewportRect::normalized(0.0, 0.0, 0.5, 1.0).resolve(odd_size);
        let right_vp = ViewportRect::normalized(0.5, 0.0, 0.5, 1.0).resolve(odd_size);

        assert!(left_vp.x + left_vp.z <= odd_size.x);
        assert!(left_vp.y + left_vp.w <= odd_size.y);
        assert!(right_vp.x + right_vp.z <= odd_size.x);
        assert!(right_vp.y + right_vp.w <= odd_size.y);

        assert_eq!(left_vp.x, 0);
        assert_eq!(left_vp.z, 453);
        assert_eq!(right_vp.x, 453);
        assert_eq!(right_vp.z, 452);
        assert_eq!(left_vp.z + right_vp.z, odd_size.x);
    }

    #[test]
    fn test_target_desc_serde_camel_case() {
        let json_window = r#"{"kind":{"type":"window","windowId":1}}"#;
        let desc: TargetDesc = serde_json::from_str(json_window).unwrap();
        assert_eq!(desc.kind, TargetKind::Window { window_id: 1 });

        let json_filter = r#"{"custom":{"shaderId":500}}"#;
        let filter: InvocationFilter = serde_json::from_str(json_filter).unwrap();
        assert_eq!(
            filter,
            InvocationFilter::Custom {
                shader_id: 500,
                textures: [None; 8],
                sampler_index: 0,
            }
        );
    }
}
