// SPDX-License-Identifier: Apache-2.0 OR MIT

/// A convolve matrix representation.
///
/// Used primarily by [`ConvolveMatrix`].
#[derive(Clone, Debug)]
pub struct ConvolveMatrixData {
    pub(crate) target_x: u32,
    pub(crate) target_y: u32,
    pub(crate) columns: u32,
    pub(crate) rows: u32,
    pub(crate) data: Vec<f32>,
}

impl ConvolveMatrixData {
    /// Returns a matrix's X target.
    ///
    /// `targetX` in the SVG.
    pub fn target_x(&self) -> u32 {
        self.target_x
    }

    /// Returns a matrix's Y target.
    ///
    /// `targetY` in the SVG.
    pub fn target_y(&self) -> u32 {
        self.target_y
    }

    /// Returns a number of columns in the matrix.
    ///
    /// Part of the `order` attribute in the SVG.
    pub fn columns(&self) -> u32 {
        self.columns
    }

    /// Returns a number of rows in the matrix.
    ///
    /// Part of the `order` attribute in the SVG.
    pub fn rows(&self) -> u32 {
        self.rows
    }

    /// The actual matrix.
    pub fn data(&self) -> &[f32] {
        &self.data
    }
}

impl ConvolveMatrixData {
    /// Creates a new `ConvolveMatrixData`.
    ///
    /// Returns `None` when:
    ///
    /// - `columns` * `rows` != `data.len()`
    /// - `target_x` >= `columns`
    /// - `target_y` >= `rows`
    pub(crate) fn new(
        target_x: u32,
        target_y: u32,
        columns: u32,
        rows: u32,
        data: Vec<f32>,
    ) -> Option<Self> {
        if (columns * rows) as usize != data.len() || target_x >= columns || target_y >= rows {
            return None;
        }

        Some(ConvolveMatrixData {
            target_x,
            target_y,
            columns,
            rows,
            data,
        })
    }

    /// Returns a matrix value at the specified position.
    ///
    /// # Panics
    ///
    /// - When position is out of bounds.
    pub fn get(&self, x: u32, y: u32) -> f32 {
        self.data[(y * self.columns + x) as usize]
    }
}

/// An edges processing mode.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum EdgeMode {
    None,
    Duplicate,
    Wrap,
}

/// A displacement map filter primitive.
///
/// `feDisplacementMap` element in the SVG.
#[derive(Clone, Debug)]
pub struct DisplacementMap {
    pub(crate) input1: Input,
    pub(crate) input2: Input,
    pub(crate) scale: f32,
    pub(crate) x_channel_selector: ColorChannel,
    pub(crate) y_channel_selector: ColorChannel,
}

impl DisplacementMap {
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

    /// Scale factor.
    ///
    /// `scale` in the SVG.
    pub fn scale(&self) -> f32 {
        self.scale
    }

    /// Indicates a source color channel along the X-axis.
    ///
    /// `xChannelSelector` in the SVG.
    pub fn x_channel_selector(&self) -> ColorChannel {
        self.x_channel_selector
    }

    /// Indicates a source color channel along the Y-axis.
    ///
    /// `yChannelSelector` in the SVG.
    pub fn y_channel_selector(&self) -> ColorChannel {
        self.y_channel_selector
    }
}

/// A color channel.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum ColorChannel {
    R,
    G,
    B,
    A,
}

/// A drop shadow filter primitive.
///
/// This is essentially `feGaussianBlur`, `feOffset` and `feFlood` joined together.
///
/// `feDropShadow` element in the SVG.
#[derive(Clone, Debug)]
pub struct DropShadow {
    pub(crate) input: Input,
    pub(crate) dx: f32,
    pub(crate) dy: f32,
    pub(crate) std_dev_x: PositiveF32,
    pub(crate) std_dev_y: PositiveF32,
    pub(crate) color: Color,
    pub(crate) opacity: Opacity,
}

impl DropShadow {
    /// Identifies input for the given filter primitive.
    ///
    /// `in` in the SVG.
    pub fn input(&self) -> &Input {
        &self.input
    }

    /// The amount to offset the input graphic along the X-axis.
    pub fn dx(&self) -> f32 {
        self.dx
    }

    /// The amount to offset the input graphic along the Y-axis.
    pub fn dy(&self) -> f32 {
        self.dy
    }

    /// A standard deviation along the X-axis.
    ///
    /// `stdDeviation` in the SVG.
    pub fn std_dev_x(&self) -> PositiveF32 {
        self.std_dev_x
    }

    /// A standard deviation along the Y-axis.
    ///
    /// `stdDeviation` in the SVG.
    pub fn std_dev_y(&self) -> PositiveF32 {
        self.std_dev_y
    }

    /// A flood color.
    ///
    /// `flood-color` in the SVG.
    pub fn color(&self) -> Color {
        self.color
    }

    /// A flood opacity.
    ///
    /// `flood-opacity` in the SVG.
    pub fn opacity(&self) -> Opacity {
        self.opacity
    }
}

/// A flood filter primitive.
///
/// `feFlood` element in the SVG.
#[derive(Clone, Copy, Debug)]
pub struct Flood {
    pub(crate) color: Color,
    pub(crate) opacity: Opacity,
}

impl Flood {
    /// A flood color.
    ///
    /// `flood-color` in the SVG.
    pub fn color(&self) -> Color {
        self.color
    }

    /// A flood opacity.
    ///
    /// `flood-opacity` in the SVG.
    pub fn opacity(&self) -> Opacity {
        self.opacity
    }
}

/// A Gaussian blur filter primitive.
///
/// `feGaussianBlur` element in the SVG.
#[derive(Clone, Debug)]
pub struct GaussianBlur {
    pub(crate) input: Input,
    pub(crate) std_dev_x: PositiveF32,
    pub(crate) std_dev_y: PositiveF32,
}

impl GaussianBlur {
    /// Identifies input for the given filter primitive.
    ///
    /// `in` in the SVG.
    pub fn input(&self) -> &Input {
        &self.input
    }

    /// A standard deviation along the X-axis.
    ///
    /// `stdDeviation` in the SVG.
    pub fn std_dev_x(&self) -> PositiveF32 {
        self.std_dev_x
    }

    /// A standard deviation along the Y-axis.
    ///
    /// `stdDeviation` in the SVG.
    pub fn std_dev_y(&self) -> PositiveF32 {
        self.std_dev_y
    }
}

/// An image filter primitive.
///
/// `feImage` element in the SVG.
#[derive(Clone, Debug)]
pub struct Image {
    pub(crate) root: Group,
}

impl Image {
    /// `feImage` children.
    pub fn root(&self) -> &Group {
        &self.root
    }
}

/// A diffuse lighting filter primitive.
///
/// `feDiffuseLighting` element in the SVG.
#[derive(Clone, Debug)]
pub struct DiffuseLighting {
    pub(crate) input: Input,
    pub(crate) surface_scale: f32,
    pub(crate) diffuse_constant: f32,
    pub(crate) lighting_color: Color,
    pub(crate) light_source: LightSource,
}

impl DiffuseLighting {
    /// Identifies input for the given filter primitive.
    ///
    /// `in` in the SVG.
    pub fn input(&self) -> &Input {
        &self.input
    }

    /// A surface scale.
    ///
    /// `surfaceScale` in the SVG.
    pub fn surface_scale(&self) -> f32 {
        self.surface_scale
    }

    /// A diffuse constant.
    ///
    /// `diffuseConstant` in the SVG.
    pub fn diffuse_constant(&self) -> f32 {
        self.diffuse_constant
    }

    /// A lighting color.
    ///
    /// `lighting-color` in the SVG.
    pub fn lighting_color(&self) -> Color {
        self.lighting_color
    }

    /// A light source.
    pub fn light_source(&self) -> LightSource {
        self.light_source
    }
}

/// A specular lighting filter primitive.
///
/// `feSpecularLighting` element in the SVG.
#[derive(Clone, Debug)]
pub struct SpecularLighting {
    pub(crate) input: Input,
    pub(crate) surface_scale: f32,
    pub(crate) specular_constant: f32,
    pub(crate) specular_exponent: f32,
    pub(crate) lighting_color: Color,
    pub(crate) light_source: LightSource,
}

impl SpecularLighting {
    /// Identifies input for the given filter primitive.
    ///
    /// `in` in the SVG.
    pub fn input(&self) -> &Input {
        &self.input
    }

    /// A surface scale.
    ///
    /// `surfaceScale` in the SVG.
    pub fn surface_scale(&self) -> f32 {
        self.surface_scale
    }

    /// A specular constant.
    ///
    /// `specularConstant` in the SVG.
    pub fn specular_constant(&self) -> f32 {
        self.specular_constant
    }

    /// A specular exponent.
    ///
    /// Should be in 1..128 range.
    ///
    /// `specularExponent` in the SVG.
    pub fn specular_exponent(&self) -> f32 {
        self.specular_exponent
    }

    /// A lighting color.
    ///
    /// `lighting-color` in the SVG.
    pub fn lighting_color(&self) -> Color {
        self.lighting_color
    }

    /// A light source.
    pub fn light_source(&self) -> LightSource {
        self.light_source
    }
}

