//! 2D User Interface data structures and core-owned scene tree.

mod commands;
pub mod model;
mod rich_text;
pub mod style;
mod text;
pub mod tree;
pub mod types;
mod validation;

pub use commands::UiCommand;
pub use model::{Model2DUI, UiQuad2D, UiText2D};
pub use rich_text::{RichText, RichTextSpan, RichTextStyle};
pub use style::{
    UiAlign, UiDimension, UiGridTrack, UiJustify, UiLayoutDirection, UiLayoutStyle,
    normalize_border_widths, normalize_corner_radii, normalize_padding,
};
pub use text::UiText;
pub use tree::{UiComputedLayout, UiDirtyFlags, UiNode, UiTreeError};
pub use types::{
    PanelNode, ScrollPanelNode, SpriteImageMode, SpritePanelNode, TextAlign, TextNode,
    TextWrapMode, UiNodeKind,
};

#[cfg(test)]
mod tests;
