//! Typed node definitions for 2D UI elements.

use serde::{Deserialize, Serialize};

/// Image scaling and distribution mode for `SpritePanel`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SpriteImageMode {
    /// Stretch texture to fill element bounds.
    #[default]
    Stretch,
    /// Scale texture uniformly to fit inside element bounds preserving aspect ratio.
    Contain,
    /// Scale texture uniformly to cover element bounds preserving aspect ratio.
    Cover,
    /// Nine-slice scaling using corner/edge border insets.
    NineSlice,
}

/// Text wrapping behavior for `TextNode`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TextWrapMode {
    /// Do not wrap; text may overflow its bounds.
    #[default]
    NoWrap,
    /// Wrap text at whitespace boundaries when exceeding available width.
    WordWrap,
}

/// Text horizontal alignment within its allocated bounds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TextAlign {
    #[default]
    Left,
    Center,
    Right,
}

/// Base panel node: a rectangular visual box and the exclusive receiver of pointer events.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelNode {
    /// Solid background color `[r, g, b, a]`.
    #[serde(default = "default_panel_bg")]
    pub background_color: [f32; 4],
    /// Element opacity in `0.0..=1.0`, compounded down the subtree.
    #[serde(default = "default_one")]
    pub opacity: f32,
    /// Border color `[r, g, b, a]`.
    #[serde(default = "default_zero_vec4")]
    pub border_color: [f32; 4],
    /// Optional individual border colors `[top, right, bottom, left]`.
    #[serde(default, deserialize_with = "super::style::deserialize_border_colors")]
    pub border_colors: Option<[[f32; 4]; 4]>,
    /// Border thickness `[top, right, bottom, left]`.
    #[serde(
        default = "default_zero_vec4",
        deserialize_with = "super::style::deserialize_quad"
    )]
    pub border_width: [f32; 4],
    /// Corner radii `[top_left, top_right, bottom_right, bottom_left]`.
    #[serde(
        default = "default_zero_vec4",
        deserialize_with = "super::style::deserialize_quad"
    )]
    pub border_radius: [f32; 4],
    /// Whether children are clipped to this panel's inner bounds.
    #[serde(default)]
    pub clip: bool,
}

impl Default for PanelNode {
    fn default() -> Self {
        Self {
            background_color: default_panel_bg(),
            opacity: 1.0,
            border_color: [0.0; 4],
            border_colors: None,
            border_width: [0.0; 4],
            border_radius: [0.0; 4],
            clip: false,
        }
    }
}

/// Sprite panel variant: displays a textured image or 9-slice frame within a panel box.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpritePanelNode {
    /// Underlying panel styling (background tint, borders, radius, clipping).
    #[serde(flatten)]
    pub panel: PanelNode,
    /// Logical texture handle/ID.
    #[serde(default)]
    pub texture_id: Option<u32>,
    /// Source texture UV rectangle `[u0, v0, u1, v1]`.
    #[serde(default = "default_unit_vec4")]
    pub uv_rect: [f32; 4],
    /// Sampler index (0 = LinearRepeat, 1 = LinearClamp, 2 = NearestRepeat, 3 = NearestClamp).
    #[serde(default)]
    pub sampler_index: u32,
    /// Tint color applied over the texture.
    #[serde(default = "default_white_vec4")]
    pub tint_color: [f32; 4],
    /// Nine-slice border margins `[top, right, bottom, left]` in texture pixels.
    #[serde(default = "default_zero_vec4")]
    pub slice_border: [f32; 4],
    /// Sizing mode for image display.
    #[serde(default)]
    pub image_mode: SpriteImageMode,
}

impl Default for SpritePanelNode {
    fn default() -> Self {
        Self {
            panel: PanelNode::default(),
            texture_id: None,
            uv_rect: default_unit_vec4(),
            sampler_index: 0,
            tint_color: default_white_vec4(),
            slice_border: default_zero_vec4(),
            image_mode: SpriteImageMode::default(),
        }
    }
}

/// Scroll panel variant: provides a scrollable viewport over child elements.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollPanelNode {
    /// Underlying panel styling (background, borders, radius). Clipping is always enabled.
    #[serde(flatten)]
    pub panel: PanelNode,
    /// Current scroll offset `[scroll_x, scroll_y]` in content pixels.
    #[serde(default)]
    pub scroll_offset: [f32; 2],
    /// Whether horizontal scrolling is enabled.
    #[serde(default = "default_true")]
    pub scroll_x_enabled: bool,
    /// Whether vertical scrolling is enabled.
    #[serde(default = "default_true")]
    pub scroll_y_enabled: bool,
    /// Computed inner scrollable content extent `[content_width, content_height]`.
    #[serde(default)]
    pub content_size: [f32; 2],
}

impl Default for ScrollPanelNode {
    fn default() -> Self {
        Self {
            panel: PanelNode::default(),
            scroll_offset: [0.0; 2],
            scroll_x_enabled: true,
            scroll_y_enabled: true,
            content_size: [0.0; 2],
        }
    }
}

/// Text node: visual and layout element for text runs. Does NOT receive pointer events.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextNode {
    /// Raw text string.
    pub text: String,
    /// Font size in pixels.
    pub font_size: f32,
    /// Optional line height in pixels (defaults to `font_size * 1.2` when `None`).
    #[serde(default)]
    pub line_height: Option<f32>,
    /// Text color `[r, g, b, a]`.
    #[serde(default = "default_white_vec4")]
    pub color: [f32; 4],
    /// Optional font family name.
    #[serde(default)]
    pub font_family: Option<String>,
    /// Text wrapping behavior.
    #[serde(default)]
    pub wrap: TextWrapMode,
    /// Horizontal text alignment.
    #[serde(default)]
    pub align: TextAlign,
    /// Whether multiline text and explicit `\n` breaks are parsed.
    #[serde(default = "default_true")]
    pub multiline: bool,
}

impl Default for TextNode {
    fn default() -> Self {
        Self {
            text: String::new(),
            font_size: 14.0,
            line_height: None,
            color: default_white_vec4(),
            font_family: None,
            wrap: TextWrapMode::NoWrap,
            align: TextAlign::Left,
            multiline: true,
        }
    }
}

/// Specialized variant kinds of a UI node.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum UiNodeKind {
    /// Standard visual panel box.
    Panel(PanelNode),
    /// Textured or nine-slice panel.
    SpritePanel(SpritePanelNode),
    /// Scrollable viewport panel.
    ScrollPanel(ScrollPanelNode),
    /// Text layout and rendering node (non-interactive).
    Text(TextNode),
}

impl UiNodeKind {
    /// Returns true if this node type is a panel capable of receiving pointer events.
    pub fn is_panel(&self) -> bool {
        matches!(
            self,
            UiNodeKind::Panel(_) | UiNodeKind::SpritePanel(_) | UiNodeKind::ScrollPanel(_)
        )
    }

    /// Returns a reference to the inner `PanelNode` if this is a panel variant.
    pub fn as_panel(&self) -> Option<&PanelNode> {
        match self {
            UiNodeKind::Panel(p) => Some(p),
            UiNodeKind::SpritePanel(s) => Some(&s.panel),
            UiNodeKind::ScrollPanel(s) => Some(&s.panel),
            UiNodeKind::Text(_) => None,
        }
    }

    /// Returns a mutable reference to the inner `PanelNode` if this is a panel variant.
    pub fn as_panel_mut(&mut self) -> Option<&mut PanelNode> {
        match self {
            UiNodeKind::Panel(p) => Some(p),
            UiNodeKind::SpritePanel(s) => Some(&mut s.panel),
            UiNodeKind::ScrollPanel(s) => Some(&mut s.panel),
            UiNodeKind::Text(_) => None,
        }
    }
}

pub(crate) fn default_zero_vec4() -> [f32; 4] {
    [0.0, 0.0, 0.0, 0.0]
}

pub(crate) fn default_white_vec4() -> [f32; 4] {
    [1.0, 1.0, 1.0, 1.0]
}

pub(crate) fn default_unit_vec4() -> [f32; 4] {
    [0.0, 0.0, 1.0, 1.0]
}

pub(crate) fn default_panel_bg() -> [f32; 4] {
    [0.06, 0.11, 0.18, 1.0]
}

pub(crate) fn default_one() -> f32 {
    1.0
}

pub(crate) fn default_true() -> bool {
    true
}
