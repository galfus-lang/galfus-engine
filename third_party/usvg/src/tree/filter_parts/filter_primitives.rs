// SPDX-License-Identifier: Apache-2.0 OR MIT

use strict_num::PositiveF32;

use crate::{BlendMode, Color, Group, NonEmptyString, NonZeroF32, NonZeroRect, Opacity};

/// A filter element.
///
/// `filter` element in the SVG.
#[derive(Debug)]
pub struct Filter {
    pub(crate) id: NonEmptyString,
    pub(crate) rect: NonZeroRect,
    pub(crate) primitives: Vec<Primitive>,
}

impl Filter {
    /// Element's ID.
    ///
    /// Taken from the SVG itself.
    /// Used only during SVG writing. `resvg` doesn't rely on this property.
    pub fn id(&self) -> &str {
        self.id.get()
    }

    /// Filter region.
    ///
    /// `x`, `y`, `width` and `height` in the SVG.
    pub fn rect(&self) -> NonZeroRect {
        self.rect
    }

    /// A list of filter primitives.
    pub fn primitives(&self) -> &[Primitive] {
        &self.primitives
    }
}

/// A filter primitive element.
#[derive(Clone, Debug)]
pub struct Primitive {
    pub(crate) rect: NonZeroRect,
    pub(crate) color_interpolation: ColorInterpolation,
    pub(crate) result: String,
    pub(crate) kind: Kind,
}

impl Primitive {
    /// Filter subregion.
    ///
    /// `x`, `y`, `width` and `height` in the SVG.
    pub fn rect(&self) -> NonZeroRect {
        self.rect
    }

    /// Color interpolation mode.
    ///
    /// `color-interpolation-filters` in the SVG.
    pub fn color_interpolation(&self) -> ColorInterpolation {
        self.color_interpolation
    }

    /// Assigned name for this filter primitive.
    ///
    /// `result` in the SVG.
    pub fn result(&self) -> &str {
        &self.result
    }

    /// Filter primitive kind.
    pub fn kind(&self) -> &Kind {
        &self.kind
    }
}

/// A filter kind.
#[allow(missing_docs)]
#[derive(Clone, Debug)]
pub enum Kind {
    Blend(Blend),
    ColorMatrix(ColorMatrix),
    ComponentTransfer(ComponentTransfer),
    Composite(Composite),
    ConvolveMatrix(ConvolveMatrix),
    DiffuseLighting(DiffuseLighting),
    DisplacementMap(DisplacementMap),
    DropShadow(DropShadow),
    Flood(Flood),
    GaussianBlur(GaussianBlur),
    Image(Image),
    Merge(Merge),
    Morphology(Morphology),
    Offset(Offset),
    SpecularLighting(SpecularLighting),
    Tile(Tile),
    Turbulence(Turbulence),
}

impl Kind {
    /// Checks that `FilterKind` has a specific input.
    pub fn has_input(&self, input: &Input) -> bool {
        match self {
            Kind::Blend(fe) => fe.input1 == *input || fe.input2 == *input,
            Kind::ColorMatrix(fe) => fe.input == *input,
            Kind::ComponentTransfer(fe) => fe.input == *input,
            Kind::Composite(fe) => fe.input1 == *input || fe.input2 == *input,
            Kind::ConvolveMatrix(fe) => fe.input == *input,
            Kind::DiffuseLighting(fe) => fe.input == *input,
            Kind::DisplacementMap(fe) => fe.input1 == *input || fe.input2 == *input,
            Kind::DropShadow(fe) => fe.input == *input,
            Kind::Flood(_) => false,
            Kind::GaussianBlur(fe) => fe.input == *input,
            Kind::Image(_) => false,
            Kind::Merge(fe) => fe.inputs.iter().any(|i| i == input),
            Kind::Morphology(fe) => fe.input == *input,
            Kind::Offset(fe) => fe.input == *input,
            Kind::SpecularLighting(fe) => fe.input == *input,
            Kind::Tile(fe) => fe.input == *input,
            Kind::Turbulence(_) => false,
        }
    }
}

/// Identifies input for a filter primitive.
#[allow(missing_docs)]
#[derive(Clone, PartialEq, Debug)]
pub enum Input {
    SourceGraphic,
    SourceAlpha,
    Reference(String),
}

/// A color interpolation mode.
///
/// The default is `ColorInterpolation::LinearRGB`.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug, Default)]
pub enum ColorInterpolation {
    SRGB,
    #[default]
    LinearRGB,
}

/// A blend filter primitive.
///
/// `feBlend` element in the SVG.
#[derive(Clone, Debug)]
pub struct Blend {
    pub(crate) input1: Input,
    pub(crate) input2: Input,
    pub(crate) mode: BlendMode,
}

impl Blend {
    /// Identifies input for the given filter primitive.
    ///
    /// `in` in the SVG.
    pub fn input1(&self) -> &Input {
        &self.input1
    }

    /// Identifies input for the given filter primitive.
    ///
    /// `in2` in the SVG.
    pub fn input2(&self) -> &Input {
        &self.input2
    }

    /// A blending mode.
    ///
    /// `mode` in the SVG.
    pub fn mode(&self) -> BlendMode {
        self.mode
    }
}

/// A color matrix filter primitive.
///
/// `feColorMatrix` element in the SVG.
#[derive(Clone, Debug)]
pub struct ColorMatrix {
    pub(crate) input: Input,
    pub(crate) kind: ColorMatrixKind,
}

impl ColorMatrix {
    /// Identifies input for the given filter primitive.
    ///
    /// `in` in the SVG.
    pub fn input(&self) -> &Input {
        &self.input
    }

    /// A matrix kind.
    ///
    /// `type` in the SVG.
    pub fn kind(&self) -> &ColorMatrixKind {
        &self.kind
    }
}

/// A color matrix filter primitive kind.
#[derive(Clone, Debug)]
#[allow(missing_docs)]
pub enum ColorMatrixKind {
    Matrix(Vec<f32>), // Guarantee to have 20 numbers.
    Saturate(PositiveF32),
    HueRotate(f32),
    LuminanceToAlpha,
}

impl Default for ColorMatrixKind {
    fn default() -> Self {
        ColorMatrixKind::Matrix(vec![
            1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
        ])
    }
}

/// A component-wise remapping filter primitive.
///
/// `feComponentTransfer` element in the SVG.
#[derive(Clone, Debug)]
pub struct ComponentTransfer {
    pub(crate) input: Input,
    pub(crate) func_r: TransferFunction,
    pub(crate) func_g: TransferFunction,
    pub(crate) func_b: TransferFunction,
    pub(crate) func_a: TransferFunction,
}

impl ComponentTransfer {
    /// Identifies input for the given filter primitive.
    ///
    /// `in` in the SVG.
    pub fn input(&self) -> &Input {
        &self.input
    }

    /// `feFuncR` in the SVG.
    pub fn func_r(&self) -> &TransferFunction {
        &self.func_r
    }

    /// `feFuncG` in the SVG.
    pub fn func_g(&self) -> &TransferFunction {
        &self.func_g
    }

    /// `feFuncB` in the SVG.
    pub fn func_b(&self) -> &TransferFunction {
        &self.func_b
    }

    /// `feFuncA` in the SVG.
    pub fn func_a(&self) -> &TransferFunction {
        &self.func_a
    }
}

/// A transfer function used by `FeComponentTransfer`.
///
/// <https://www.w3.org/TR/SVG11/filters.html#transferFuncElements>
#[derive(Clone, Debug)]
pub enum TransferFunction {
    /// Keeps a component as is.
    Identity,

    /// Applies a linear interpolation to a component.
    ///
    /// The number list can be empty.
    Table(Vec<f32>),

    /// Applies a step function to a component.
    ///
    /// The number list can be empty.
    Discrete(Vec<f32>),

    /// Applies a linear shift to a component.
    #[allow(missing_docs)]
    Linear { slope: f32, intercept: f32 },

    /// Applies an exponential shift to a component.
    #[allow(missing_docs)]
    Gamma {
        amplitude: f32,
        exponent: f32,
        offset: f32,
    },
}

/// A composite filter primitive.
///
/// `feComposite` element in the SVG.
#[derive(Clone, Debug)]
pub struct Composite {
    pub(crate) input1: Input,
    pub(crate) input2: Input,
    pub(crate) operator: CompositeOperator,
}

impl Composite {
    /// Identifies input for the given filter primitive.
    ///
    /// `in` in the SVG.
    pub fn input1(&self) -> &Input {
        &self.input1
    }

    /// Identifies input for the given filter primitive.
    ///
    /// `in2` in the SVG.
    pub fn input2(&self) -> &Input {
        &self.input2
    }

    /// A compositing operation.
    ///
    /// `operator` in the SVG.
    pub fn operator(&self) -> CompositeOperator {
        self.operator
    }
}

/// An images compositing operation.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum CompositeOperator {
    Over,
    In,
    Out,
    Atop,
    Xor,
    Arithmetic { k1: f32, k2: f32, k3: f32, k4: f32 },
}

/// A matrix convolution filter primitive.
///
/// `feConvolveMatrix` element in the SVG.
#[derive(Clone, Debug)]
pub struct ConvolveMatrix {
    pub(crate) input: Input,
    pub(crate) matrix: ConvolveMatrixData,
    pub(crate) divisor: NonZeroF32,
    pub(crate) bias: f32,
    pub(crate) edge_mode: EdgeMode,
    pub(crate) preserve_alpha: bool,
}

impl ConvolveMatrix {
    /// Identifies input for the given filter primitive.
    ///
    /// `in` in the SVG.
    pub fn input(&self) -> &Input {
        &self.input
    }

    /// A convolve matrix.
    pub fn matrix(&self) -> &ConvolveMatrixData {
        &self.matrix
    }

    /// A matrix divisor.
    ///
    /// `divisor` in the SVG.
    pub fn divisor(&self) -> NonZeroF32 {
        self.divisor
    }

    /// A kernel matrix bias.
    ///
    /// `bias` in the SVG.
    pub fn bias(&self) -> f32 {
        self.bias
    }

    /// An edges processing mode.
    ///
    /// `edgeMode` in the SVG.
    pub fn edge_mode(&self) -> EdgeMode {
        self.edge_mode
    }

    /// An alpha preserving flag.
    ///
    /// `preserveAlpha` in the SVG.
    pub fn preserve_alpha(&self) -> bool {
        self.preserve_alpha
    }
}

