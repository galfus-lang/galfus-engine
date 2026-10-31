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
    /// Fast Approximate Anti-Aliasing (FXAA 3.11) screen-space edge smoothing.
    Fxaa,
    /// Subpixel Morphological Anti-Aliasing (SMAA 1x).
    Smaa,
    /// Super-Sample Anti-Aliasing downsample filter.
    SsaaDownsample,
    /// Temporal Anti-Aliasing (TAA) with subpixel jitter and color clamping.
    Taa,
    /// Custom post-processing shader module ID with optional texture slots and sampler index.
    Custom {
        shader_id: u32,
        #[serde(default)]
        textures: [Option<u32>; 8],
        #[serde(default)]
        sampler_index: u32,
    },
}

/// Global and per-invocation Anti-Aliasing mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AntiAliasingMode {
    /// No anti-aliasing (single-sample, crisp pixel passthrough).
    #[default]
    None,
    /// Fast Approximate Anti-Aliasing (FXAA 3.11 screen-space edge smoothing).
    Fxaa,
    /// Subpixel Morphological Anti-Aliasing (pattern-based edge reconstruction).
    Smaa,
    /// Temporal Anti-Aliasing (TAA with subpixel projection jitter and color-clamped history).
    Taa,
    /// Super-Sample Anti-Aliasing 2x (renders at 2x resolution, downsamples with area filter).
    Ssaa2x,
    /// Super-Sample Anti-Aliasing 4x (renders at 4x resolution, downsamples with area filter).
    Ssaa4x,
    /// Hardware Multi-Sample Anti-Aliasing 2x.
    Msaa2x,
    /// Hardware Multi-Sample Anti-Aliasing 4x.
    Msaa4x,
    /// Hardware Multi-Sample Anti-Aliasing 8x.
    Msaa8x,
    /// Hardware Multi-Sample Anti-Aliasing 16x.
    Msaa16x,
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

/// Measurement unit for viewport sizing and positioning (physical pixels, target width % or target height %).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UnitValue {
    /// Fixed physical pixels.
    Px(f32),
    /// Percentage (0.0..=100.0) of target width (CSS vw).
    Vw(f32),
    /// Percentage (0.0..=100.0) of target height (CSS vh).
    Vh(f32),
}

impl Default for UnitValue {
    fn default() -> Self {
        Self::Px(0.0)
    }
}

impl UnitValue {
    /// Resolves the unit value to physical pixels given target dimensions.
    pub fn resolve(&self, target_size: UVec2) -> f32 {
        let val = match *self {
            Self::Px(val) => val,
            Self::Vw(pct) => (pct / 100.0) * target_size.x as f32,
            Self::Vh(pct) => (pct / 100.0) * target_size.y as f32,
        };
        if val.is_finite() { val } else { 0.0 }
    }
}

/// Horizontal viewport anchor point.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AnchorX {
    #[default]
    Left,
    Center,
    Right,
}

/// Vertical viewport anchor point.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AnchorY {
    #[default]
    Top,
    Center,
    Bottom,
}

/// Layout specification for a realm invocation's viewport using responsive CSS-like anchors and units.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportRect {
    /// Horizontal anchor point.
    #[serde(default)]
    pub anchor_x: AnchorX,
    /// Vertical anchor point.
    #[serde(default)]
    pub anchor_y: AnchorY,
    /// Horizontal offset relative to anchor point.
    #[serde(default)]
    pub offset_x: UnitValue,
    /// Vertical offset relative to anchor point.
    #[serde(default)]
    pub offset_y: UnitValue,
    /// Width in physical pixels (px), percentage of target width (vw) or target height (vh).
    pub width: UnitValue,
    /// Height in physical pixels (px), percentage of target width (vw) or target height (vh).
    pub height: UnitValue,
}

impl ViewportRect {
    /// Fullscreen viewport spanning 100vw and 100vh.
    pub const fn full() -> Self {
        Self {
            anchor_x: AnchorX::Left,
            anchor_y: AnchorY::Top,
            offset_x: UnitValue::Px(0.0),
            offset_y: UnitValue::Px(0.0),
            width: UnitValue::Vw(100.0),
            height: UnitValue::Vh(100.0),
        }
    }

    /// Creates an anchored viewport with CSS-like units.
    pub const fn anchored(
        anchor_x: AnchorX,
        anchor_y: AnchorY,
        offset_x: UnitValue,
        offset_y: UnitValue,
        width: UnitValue,
        height: UnitValue,
    ) -> Self {
        Self {
            anchor_x,
            anchor_y,
            offset_x,
            offset_y,
            width,
            height,
        }
    }

    /// Resolves the unclipped logical viewport [x, y, width, height] in target space.
    /// Supports coordinates partially or fully outside the Target during slide transitions,
    /// and does not clamp dimensions prematurely.
    pub fn resolve_logical(&self, target_size: UVec2) -> glam::IVec4 {
        let w = self.width.resolve(target_size).max(0.0).round() as i32;
        let h = self.height.resolve(target_size).max(0.0).round() as i32;

        let base_x = match self.anchor_x {
            AnchorX::Left => 0.0,
            AnchorX::Center => 0.5 * target_size.x as f32,
            AnchorX::Right => target_size.x as f32,
        };
        let pivot_x = match self.anchor_x {
            AnchorX::Left => 0.0,
            AnchorX::Center => 0.5,
            AnchorX::Right => 1.0,
        };

        let base_y = match self.anchor_y {
            AnchorY::Top => 0.0,
            AnchorY::Center => 0.5 * target_size.y as f32,
            AnchorY::Bottom => target_size.y as f32,
        };
        let pivot_y = match self.anchor_y {
            AnchorY::Top => 0.0,
            AnchorY::Center => 0.5,
            AnchorY::Bottom => 1.0,
        };

        let raw_x =
            (base_x - (pivot_x * w as f32) + self.offset_x.resolve(target_size)).round() as i32;
        let raw_y =
            (base_y - (pivot_y * h as f32) + self.offset_y.resolve(target_size)).round() as i32;

        glam::IVec4::new(raw_x, raw_y, w, h)
    }

    /// Resolves the visible clipped viewport rectangle intersecting the Target surface.
    /// Returns `None` if the logical viewport has zero size or is entirely off-screen.
    pub fn resolve_clipped(&self, target_size: UVec2) -> Option<UVec4> {
        let logical = self.resolve_logical(target_size);
        if logical.z <= 0 || logical.w <= 0 || target_size.x == 0 || target_size.y == 0 {
            return None;
        }

        let clip_left = logical.x.max(0);
        let clip_top = logical.y.max(0);
        let clip_right = (logical.x + logical.z).min(target_size.x as i32);
        let clip_bottom = (logical.y + logical.w).min(target_size.y as i32);

        if clip_right <= clip_left || clip_bottom <= clip_top {
            return None;
        }

        Some(UVec4::new(
            clip_left as u32,
            clip_top as u32,
            (clip_right - clip_left) as u32,
            (clip_bottom - clip_top) as u32,
        ))
    }

    /// Resolves the viewport against target dimensions into physical pixels [x, y, width, height].
    /// Returns UVec4::ZERO if empty or entirely off-screen.
    pub fn resolve(&self, target_size: UVec2) -> UVec4 {
        self.resolve_clipped(target_size).unwrap_or(UVec4::ZERO)
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
    /// Optional Anti-Aliasing mode. When None, automatically inherits the Multiverse global setting.
    #[serde(default)]
    pub anti_aliasing: Option<AntiAliasingMode>,
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
            anti_aliasing: None,
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
        let left_vp = ViewportRect::anchored(
            AnchorX::Left,
            AnchorY::Top,
            UnitValue::Px(0.0),
            UnitValue::Px(0.0),
            UnitValue::Vw(50.0),
            UnitValue::Vh(100.0),
        )
        .resolve(odd_size);
        let right_vp = ViewportRect::anchored(
            AnchorX::Right,
            AnchorY::Top,
            UnitValue::Px(0.0),
            UnitValue::Px(0.0),
            UnitValue::Vw(50.0),
            UnitValue::Vh(100.0),
        )
        .resolve(odd_size);

        assert!(left_vp.x + left_vp.z <= odd_size.x);
        assert!(left_vp.y + left_vp.w <= odd_size.y);
        assert!(right_vp.x + right_vp.z <= odd_size.x);
        assert!(right_vp.y + right_vp.w <= odd_size.y);

        assert_eq!(left_vp.x, 0);
        assert_eq!(left_vp.z, 453);
        assert_eq!(right_vp.x, 452);
        assert_eq!(right_vp.z, 453);
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

    #[test]
    fn test_anchored_viewport_resolution() {
        let target = UVec2::new(1000, 800);

        // 1. Top-Right minimap: 28vh x 28vh with 20px padding
        let minimap = ViewportRect::anchored(
            AnchorX::Right,
            AnchorY::Top,
            UnitValue::Px(-20.0),
            UnitValue::Px(20.0),
            UnitValue::Vh(25.0),
            UnitValue::Vh(25.0),
        );
        let resolved = minimap.resolve(target);
        // 25% of 800 = 200
        assert_eq!(resolved.z, 200);
        assert_eq!(resolved.w, 200);
        // x: 1000 - 200 - 20 = 780
        assert_eq!(resolved.x, 780);
        // y: 0 + 20 = 20
        assert_eq!(resolved.y, 20);

        // 2. Center HUD: 50vw x 40vh centered
        let center_hud = ViewportRect::anchored(
            AnchorX::Center,
            AnchorY::Center,
            UnitValue::Px(0.0),
            UnitValue::Px(0.0),
            UnitValue::Vw(50.0),
            UnitValue::Vh(40.0),
        );
        let hud_res = center_hud.resolve(target);
        assert_eq!(hud_res.z, 500);
        assert_eq!(hud_res.w, 320);
        assert_eq!(hud_res.x, 250);
        assert_eq!(hud_res.y, 240);

        // 3. Bottom-Right minimap: 200px x 200px with -20px padding
        let bottom_right = ViewportRect::anchored(
            AnchorX::Right,
            AnchorY::Bottom,
            UnitValue::Px(-20.0),
            UnitValue::Px(-20.0),
            UnitValue::Px(200.0),
            UnitValue::Px(200.0),
        );
        let br_res = bottom_right.resolve(target);
        assert_eq!(br_res.z, 200);
        assert_eq!(br_res.w, 200);
        assert_eq!(br_res.x, 780);
        assert_eq!(br_res.y, 580);
    }

    #[test]
    fn test_anchored_viewport_serde_json() {
        let json_anchored = r#"{
            "anchorX": "right",
            "anchorY": "top",
            "offsetX": {"px": -24.0},
            "offsetY": {"px": 24.0},
            "width": {"vh": 28.0},
            "height": {"vh": 28.0}
        }"#;
        let vp: ViewportRect = serde_json::from_str(json_anchored).unwrap();
        let target = UVec2::new(1920, 1080);
        let res = vp.resolve(target);
        // 28% of 1080 = 302.4 -> 302
        assert_eq!(res.w, 302);
        assert_eq!(res.z, 302);
        // x: 1920 - 302 - 24 = 1594
        assert_eq!(res.x, 1594);
        assert_eq!(res.y, 24);
    }

    #[test]
    fn test_viewport_slide_clipping_and_zero_size() {
        let target = UVec2::new(800, 600);

        // 1. Partial slide-out to the left: 800x600 with offsetX = -300px
        let sliding_left = ViewportRect::anchored(
            AnchorX::Left,
            AnchorY::Top,
            UnitValue::Px(-300.0),
            UnitValue::Px(0.0),
            UnitValue::Px(800.0),
            UnitValue::Px(600.0),
        );
        let logical = sliding_left.resolve_logical(target);
        assert_eq!(logical, glam::IVec4::new(-300, 0, 800, 600));

        let clipped = sliding_left.resolve_clipped(target).unwrap();
        // Visible region on screen is from x=0 to x=500 (width = 500)
        assert_eq!(clipped, UVec4::new(0, 0, 500, 600));

        // 2. Completely off-screen to the left: offsetX = -900px
        let fully_offscreen = ViewportRect::anchored(
            AnchorX::Left,
            AnchorY::Top,
            UnitValue::Px(-900.0),
            UnitValue::Px(0.0),
            UnitValue::Px(800.0),
            UnitValue::Px(600.0),
        );
        assert_eq!(fully_offscreen.resolve_clipped(target), None);
        assert_eq!(fully_offscreen.resolve(target), UVec4::ZERO);

        // 3. Completely off-screen to the right: offsetX = 850px
        let fully_offscreen_right = ViewportRect::anchored(
            AnchorX::Left,
            AnchorY::Top,
            UnitValue::Px(850.0),
            UnitValue::Px(0.0),
            UnitValue::Px(800.0),
            UnitValue::Px(600.0),
        );
        assert_eq!(fully_offscreen_right.resolve_clipped(target), None);
        assert_eq!(fully_offscreen_right.resolve(target), UVec4::ZERO);

        // 4. Zero-size viewport: width = 0px
        let zero_size = ViewportRect::anchored(
            AnchorX::Left,
            AnchorY::Top,
            UnitValue::Px(0.0),
            UnitValue::Px(0.0),
            UnitValue::Px(0.0),
            UnitValue::Px(600.0),
        );
        assert_eq!(zero_size.resolve_clipped(target), None);
        assert_eq!(zero_size.resolve(target), UVec4::ZERO);

        // 5. Non-finite input protection: NaN / Infinity falls back safely to 0
        let nan_unit = UnitValue::Px(f32::NAN);
        assert_eq!(nan_unit.resolve(target), 0.0);
        let inf_unit = UnitValue::Vw(f32::INFINITY);
        assert_eq!(inf_unit.resolve(target), 0.0);
    }
}
