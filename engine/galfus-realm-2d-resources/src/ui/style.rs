//! Style specifications, CSS shorthand parsing, and layout properties for UI nodes.

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(untagged)]
enum QuadInput {
    One(f32),
    Many(Vec<f32>),
}

pub(crate) fn deserialize_quad<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<[f32; 4], D::Error> {
    use serde::de::Error;
    let values = match QuadInput::deserialize(deserializer)? {
        QuadInput::One(value) => vec![value],
        QuadInput::Many(values) => values,
    };
    if !(1..=4).contains(&values.len()) {
        return Err(D::Error::custom("expected one to four values"));
    }
    Ok(normalize_border_widths(&values))
}

pub(crate) fn deserialize_border_colors<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<[[f32; 4]; 4]>, D::Error> {
    use serde::de::Error;
    let Some(colors) = Option::<Vec<[f32; 4]>>::deserialize(deserializer)? else {
        return Ok(None);
    };
    let result = match colors.as_slice() {
        [a] => [*a, *a, *a, *a],
        [a, b] => [*a, *b, *a, *b],
        [a, b, c] => [*a, *b, *c, *b],
        [a, b, c, d] => [*a, *b, *c, *d],
        _ => return Err(D::Error::custom("expected one to four border colors")),
    };
    Ok(Some(result))
}

/// Dimension specification for width and height constraints.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum UiDimension {
    /// Dimension determined automatically by layout and content.
    #[default]
    Auto,
    /// Exact fixed dimension in logical pixels.
    Exact(f32),
    /// Dimension proportional to parent content size `0.0..=100.0`.
    Percent(f32),
}

/// Sizing of one column in a grid layout.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum UiGridTrack {
    Auto,
    Exact(f32),
    Percent(f32),
    Fraction(f32),
}

/// Primary flow direction for children within a container panel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UiLayoutDirection {
    #[default]
    Column,
    Row,
}

/// Cross-axis alignment for items inside a layout.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UiAlign {
    #[default]
    Start,
    Center,
    End,
    Stretch,
}

/// Main-axis distribution for items inside a layout.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UiJustify {
    #[default]
    Start,
    Center,
    End,
    SpaceBetween,
    SpaceAround,
    SpaceEvenly,
}

/// Layout style defining sizing, flow, spacing, and constraints for a UI node.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiLayoutStyle {
    /// Width sizing specification.
    #[serde(default)]
    pub width: UiDimension,
    /// Height sizing specification.
    #[serde(default)]
    pub height: UiDimension,
    /// Minimum width constraint in pixels.
    #[serde(default)]
    pub min_width: Option<f32>,
    /// Maximum width constraint in pixels.
    #[serde(default)]
    pub max_width: Option<f32>,
    /// Minimum height constraint in pixels.
    #[serde(default)]
    pub min_height: Option<f32>,
    /// Maximum height constraint in pixels.
    #[serde(default)]
    pub max_height: Option<f32>,
    /// Inner padding `[top, right, bottom, left]` in pixels.
    #[serde(default = "super::types::default_zero_vec4")]
    pub padding: [f32; 4],
    /// Inter-element spacing `[gap_x, gap_y]` in pixels.
    #[serde(default)]
    pub gap: [f32; 2],
    /// Child flow direction.
    #[serde(default)]
    pub direction: UiLayoutDirection,
    /// Cross-axis child alignment.
    #[serde(default)]
    pub align_items: UiAlign,
    /// Main-axis child distribution.
    #[serde(default)]
    pub justify_content: UiJustify,
    /// Flex grow weight.
    #[serde(default)]
    pub flex_grow: f32,
    /// Flex shrink weight.
    #[serde(default = "default_shrink")]
    pub flex_shrink: f32,
    /// When true, children are laid out as a stack (overlaid) rather than sequenced.
    #[serde(default)]
    pub is_stack: bool,
    /// Non-empty column tracks select grid layout instead of a linear flow.
    #[serde(default)]
    pub grid_columns: Vec<UiGridTrack>,
    /// Optional fixed height for each grid row; omitted rows use intrinsic height.
    #[serde(default)]
    pub grid_row_height: Option<f32>,
    /// Optional manual positioning offset `[x, y]` relative to parent.
    #[serde(default)]
    pub position_offset: Option<[f32; 2]>,
}

impl Default for UiLayoutStyle {
    fn default() -> Self {
        Self {
            width: UiDimension::Auto,
            height: UiDimension::Auto,
            min_width: None,
            max_width: None,
            min_height: None,
            max_height: None,
            padding: [0.0; 4],
            gap: [0.0; 2],
            direction: UiLayoutDirection::default(),
            align_items: UiAlign::default(),
            justify_content: UiJustify::default(),
            flex_grow: 0.0,
            flex_shrink: default_shrink(),
            is_stack: false,
            grid_columns: Vec::new(),
            grid_row_height: None,
            position_offset: None,
        }
    }
}

fn default_shrink() -> f32 {
    1.0
}

/// Normalizes 1, 2, or 4 CSS-style border width inputs into canonical `[top, right, bottom, left]`.
pub fn normalize_border_widths(slice: &[f32]) -> [f32; 4] {
    match slice.len() {
        0 => [0.0; 4],
        1 => [slice[0], slice[0], slice[0], slice[0]],
        2 => [slice[0], slice[1], slice[0], slice[1]],
        3 => [slice[0], slice[1], slice[2], slice[1]],
        _ => [slice[0], slice[1], slice[2], slice[3]],
    }
}

/// Normalizes 1, 2, or 4 CSS-style corner radii into canonical `[top_left, top_right, bottom_right, bottom_left]`.
pub fn normalize_corner_radii(slice: &[f32]) -> [f32; 4] {
    match slice.len() {
        0 => [0.0; 4],
        1 => [slice[0], slice[0], slice[0], slice[0]],
        2 => [slice[0], slice[1], slice[0], slice[1]],
        3 => [slice[0], slice[1], slice[2], slice[1]],
        _ => [slice[0], slice[1], slice[2], slice[3]],
    }
}

/// Normalizes 1, 2, or 4 padding values into canonical `[top, right, bottom, left]`.
pub fn normalize_padding(slice: &[f32]) -> [f32; 4] {
    normalize_border_widths(slice)
}
