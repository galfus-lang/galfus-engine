// SPDX-License-Identifier: Apache-2.0 OR MIT

use std::fmt::Display;
use std::sync::Arc;

pub use strict_num::{self, ApproxEqUlps, NonZeroPositiveF32, NormalizedF32, PositiveF32};

pub use tiny_skia_path;

pub use self::geom::*;
pub use self::text::*;

use crate::OptionLog;

/// An alias to `NormalizedF32`.
pub type Opacity = NormalizedF32;

// Must not be clone-able to preserve ID uniqueness.
#[derive(Debug)]
pub(crate) struct NonEmptyString(String);

impl NonEmptyString {
    pub(crate) fn new(string: String) -> Option<Self> {
        if string.trim().is_empty() {
            return None;
        }

        Some(NonEmptyString(string))
    }

    pub(crate) fn get(&self) -> &str {
        &self.0
    }

    pub(crate) fn take(self) -> String {
        self.0
    }
}

/// A non-zero `f32`.
///
/// Just like `f32` but immutable and guarantee to never be zero.
#[derive(Clone, Copy, Debug)]
pub struct NonZeroF32(f32);

impl NonZeroF32 {
    /// Creates a new `NonZeroF32` value.
    #[inline]
    pub fn new(n: f32) -> Option<Self> {
        if n.approx_eq_ulps(&0.0, 4) {
            None
        } else {
            Some(NonZeroF32(n))
        }
    }

    /// Returns an underlying value.
    #[inline]
    pub fn get(&self) -> f32 {
        self.0
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub(crate) enum Units {
    UserSpaceOnUse,
    ObjectBoundingBox,
}

// `Units` cannot have a default value, because it changes depending on an element.

impl std::fmt::Display for Units {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Units::UserSpaceOnUse => write!(f, "userSpaceOnUse"),
            Units::ObjectBoundingBox => write!(f, "objectBoundingBox"),
        }
    }
}

/// A visibility property.
///
/// `visibility` attribute in the SVG.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub(crate) enum Visibility {
    Visible,
    Hidden,
    Collapse,
}

impl Default for Visibility {
    fn default() -> Self {
        Self::Visible
    }
}

/// A shape rendering method.
///
/// `shape-rendering` attribute in the SVG.
#[derive(Clone, Copy, PartialEq, Debug)]
#[allow(missing_docs)]
pub enum ShapeRendering {
    OptimizeSpeed,
    CrispEdges,
    GeometricPrecision,
}

impl ShapeRendering {
    /// Checks if anti-aliasing should be enabled.
    pub fn use_shape_antialiasing(self) -> bool {
        match self {
            ShapeRendering::OptimizeSpeed => false,
            ShapeRendering::CrispEdges => false,
            ShapeRendering::GeometricPrecision => true,
        }
    }
}

impl Default for ShapeRendering {
    fn default() -> Self {
        Self::GeometricPrecision
    }
}

impl std::str::FromStr for ShapeRendering {
    type Err = &'static str;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "optimizeSpeed" => Ok(ShapeRendering::OptimizeSpeed),
            "crispEdges" => Ok(ShapeRendering::CrispEdges),
            "geometricPrecision" => Ok(ShapeRendering::GeometricPrecision),
            _ => Err("invalid"),
        }
    }
}

/// A text rendering method.
///
/// `text-rendering` attribute in the SVG.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum TextRendering {
    OptimizeSpeed,
    OptimizeLegibility,
    GeometricPrecision,
}

impl Default for TextRendering {
    fn default() -> Self {
        Self::OptimizeLegibility
    }
}

impl std::str::FromStr for TextRendering {
    type Err = &'static str;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "optimizeSpeed" => Ok(TextRendering::OptimizeSpeed),
            "optimizeLegibility" => Ok(TextRendering::OptimizeLegibility),
            "geometricPrecision" => Ok(TextRendering::GeometricPrecision),
            _ => Err("invalid"),
        }
    }
}

/// An image rendering method.
///
/// `image-rendering` attribute in the SVG.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum ImageRendering {
    OptimizeQuality,
    OptimizeSpeed,
    // The following can only appear as presentation attributes.
    Smooth,
    HighQuality,
    CrispEdges,
    Pixelated,
}

impl Default for ImageRendering {
    fn default() -> Self {
        Self::OptimizeQuality
    }
}

impl std::str::FromStr for ImageRendering {
    type Err = &'static str;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "optimizeQuality" => Ok(ImageRendering::OptimizeQuality),
            "optimizeSpeed" => Ok(ImageRendering::OptimizeSpeed),
            "smooth" => Ok(ImageRendering::Smooth),
            "high-quality" => Ok(ImageRendering::HighQuality),
            "crisp-edges" => Ok(ImageRendering::CrispEdges),
            "pixelated" => Ok(ImageRendering::Pixelated),
            _ => Err("invalid"),
        }
    }
}

/// A blending mode property.
///
/// `mix-blend-mode` attribute in the SVG.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum BlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
    Darken,
    Lighten,
    ColorDodge,
    ColorBurn,
    HardLight,
    SoftLight,
    Difference,
    Exclusion,
    Hue,
    Saturation,
    Color,
    Luminosity,
}

impl Default for BlendMode {
    fn default() -> Self {
        Self::Normal
    }
}

impl Display for BlendMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let blend_mode = match self {
            BlendMode::Normal => "normal",
            BlendMode::Multiply => "multiply",
            BlendMode::Screen => "screen",
            BlendMode::Overlay => "overlay",
            BlendMode::Darken => "darken",
            BlendMode::Lighten => "lighten",
            BlendMode::ColorDodge => "color-dodge",
            BlendMode::ColorBurn => "color-burn",
            BlendMode::HardLight => "hard-light",
            BlendMode::SoftLight => "soft-light",
            BlendMode::Difference => "difference",
            BlendMode::Exclusion => "exclusion",
            BlendMode::Hue => "hue",
            BlendMode::Saturation => "saturation",
            BlendMode::Color => "color",
            BlendMode::Luminosity => "luminosity",
        };
        write!(f, "{blend_mode}")
    }
}

/// A spread method.
///
/// `spreadMethod` attribute in the SVG.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum SpreadMethod {
    Pad,
    Reflect,
    Repeat,
}

impl Default for SpreadMethod {
    fn default() -> Self {
        Self::Pad
    }
}

/// A generic gradient.
#[derive(Debug)]
pub struct BaseGradient {
    pub(crate) id: NonEmptyString,
    pub(crate) units: Units, // used only during parsing
    pub(crate) transform: Transform,
    pub(crate) spread_method: SpreadMethod,
    pub(crate) stops: Vec<Stop>,
}

impl BaseGradient {
    /// Element's ID.
    ///
    /// Taken from the SVG itself.
    /// Used only during SVG writing. `resvg` doesn't rely on this property.
    pub fn id(&self) -> &str {
        self.id.get()
    }

    /// Gradient transform.
    ///
    /// `gradientTransform` in SVG.
    pub fn transform(&self) -> Transform {
        self.transform
    }

    /// Gradient spreading method.
    ///
    /// `spreadMethod` in SVG.
    pub fn spread_method(&self) -> SpreadMethod {
        self.spread_method
    }

    /// A list of `stop` elements.
    pub fn stops(&self) -> &[Stop] {
        &self.stops
    }
}

/// A linear gradient.
///
/// `linearGradient` element in SVG.
#[derive(Debug)]
pub struct LinearGradient {
    pub(crate) base: BaseGradient,
    pub(crate) x1: f32,
    pub(crate) y1: f32,
    pub(crate) x2: f32,
    pub(crate) y2: f32,
}

impl LinearGradient {
    /// `x1` coordinate.
    pub fn x1(&self) -> f32 {
        self.x1
    }

    /// `y1` coordinate.
    pub fn y1(&self) -> f32 {
        self.y1
    }

    /// `x2` coordinate.
    pub fn x2(&self) -> f32 {
        self.x2
    }

    /// `y2` coordinate.
    pub fn y2(&self) -> f32 {
        self.y2
    }
}

impl std::ops::Deref for LinearGradient {
    type Target = BaseGradient;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

/// A radial gradient.
///
/// `radialGradient` element in SVG.
#[derive(Debug)]
pub struct RadialGradient {
    pub(crate) base: BaseGradient,
    pub(crate) cx: f32,
    pub(crate) cy: f32,
    pub(crate) r: PositiveF32,
    pub(crate) fx: f32,
    pub(crate) fy: f32,
    pub(crate) fr: PositiveF32,
}

impl RadialGradient {
    /// `cx` coordinate.
    pub fn cx(&self) -> f32 {
        self.cx
    }

    /// `cy` coordinate.
    pub fn cy(&self) -> f32 {
        self.cy
    }

    /// Gradient radius.
    pub fn r(&self) -> PositiveF32 {
        self.r
    }

    /// `fx` coordinate.
    pub fn fx(&self) -> f32 {
        self.fx
    }

    /// `fy` coordinate.
    pub fn fy(&self) -> f32 {
        self.fy
    }

    /// Focal radius.
    pub fn fr(&self) -> PositiveF32 {
        self.fr
    }
}

