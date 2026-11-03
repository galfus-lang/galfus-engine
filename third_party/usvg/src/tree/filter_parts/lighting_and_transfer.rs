// SPDX-License-Identifier: Apache-2.0 OR MIT

/// A light source kind.
#[allow(missing_docs)]
#[derive(Clone, Copy, Debug)]
pub enum LightSource {
    DistantLight(DistantLight),
    PointLight(PointLight),
    SpotLight(SpotLight),
}

/// A distant light source.
///
/// `feDistantLight` element in the SVG.
#[derive(Clone, Copy, Debug)]
pub struct DistantLight {
    /// Direction angle for the light source on the XY plane (clockwise),
    /// in degrees from the x axis.
    ///
    /// `azimuth` in the SVG.
    pub azimuth: f32,

    /// Direction angle for the light source from the XY plane towards the z axis, in degrees.
    ///
    /// `elevation` in the SVG.
    pub elevation: f32,
}

/// A point light source.
///
/// `fePointLight` element in the SVG.
#[derive(Clone, Copy, Debug)]
pub struct PointLight {
    /// X location for the light source.
    ///
    /// `x` in the SVG.
    pub x: f32,

    /// Y location for the light source.
    ///
    /// `y` in the SVG.
    pub y: f32,

    /// Z location for the light source.
    ///
    /// `z` in the SVG.
    pub z: f32,
}

/// A spot light source.
///
/// `feSpotLight` element in the SVG.
#[derive(Clone, Copy, Debug)]
pub struct SpotLight {
    /// X location for the light source.
    ///
    /// `x` in the SVG.
    pub x: f32,

    /// Y location for the light source.
    ///
    /// `y` in the SVG.
    pub y: f32,

    /// Z location for the light source.
    ///
    /// `z` in the SVG.
    pub z: f32,

    /// X point at which the light source is pointing.
    ///
    /// `pointsAtX` in the SVG.
    pub points_at_x: f32,

    /// Y point at which the light source is pointing.
    ///
    /// `pointsAtY` in the SVG.
    pub points_at_y: f32,

    /// Z point at which the light source is pointing.
    ///
    /// `pointsAtZ` in the SVG.
    pub points_at_z: f32,

    /// Exponent value controlling the focus for the light source.
    ///
    /// `specularExponent` in the SVG.
    pub specular_exponent: PositiveF32,

    /// A limiting cone which restricts the region where the light is projected.
    ///
    /// `limitingConeAngle` in the SVG.
    pub limiting_cone_angle: Option<f32>,
}

/// A merge filter primitive.
///
/// `feMerge` element in the SVG.
#[derive(Clone, Debug)]
pub struct Merge {
    pub(crate) inputs: Vec<Input>,
}

impl Merge {
    /// List of input layers that should be merged.
    ///
    /// List of `feMergeNode`'s in the SVG.
    pub fn inputs(&self) -> &[Input] {
        &self.inputs
    }
}

/// A morphology filter primitive.
///
/// `feMorphology` element in the SVG.
#[derive(Clone, Debug)]
pub struct Morphology {
    pub(crate) input: Input,
    pub(crate) operator: MorphologyOperator,
    pub(crate) radius_x: PositiveF32,
    pub(crate) radius_y: PositiveF32,
}

impl Morphology {
    /// Identifies input for the given filter primitive.
    ///
    /// `in` in the SVG.
    pub fn input(&self) -> &Input {
        &self.input
    }

    /// A filter operator.
    ///
    /// `operator` in the SVG.
    pub fn operator(&self) -> MorphologyOperator {
        self.operator
    }

    /// A filter radius along the X-axis.
    ///
    /// A value of zero disables the effect of the given filter primitive.
    ///
    /// `radius` in the SVG.
    pub fn radius_x(&self) -> PositiveF32 {
        self.radius_x
    }

    /// A filter radius along the Y-axis.
    ///
    /// A value of zero disables the effect of the given filter primitive.
    ///
    /// `radius` in the SVG.
    pub fn radius_y(&self) -> PositiveF32 {
        self.radius_y
    }
}

/// A morphology operation.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum MorphologyOperator {
    Erode,
    Dilate,
}

/// An offset filter primitive.
///
/// `feOffset` element in the SVG.
#[derive(Clone, Debug)]
pub struct Offset {
    pub(crate) input: Input,
    pub(crate) dx: f32,
    pub(crate) dy: f32,
}

impl Offset {
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
}

/// A tile filter primitive.
///
/// `feTile` element in the SVG.
#[derive(Clone, Debug)]
pub struct Tile {
    pub(crate) input: Input,
}

impl Tile {
    /// Identifies input for the given filter primitive.
    ///
    /// `in` in the SVG.
    pub fn input(&self) -> &Input {
        &self.input
    }
}

/// A turbulence generation filter primitive.
///
/// `feTurbulence` element in the SVG.
#[derive(Clone, Copy, Debug)]
pub struct Turbulence {
    pub(crate) base_frequency_x: PositiveF32,
    pub(crate) base_frequency_y: PositiveF32,
    pub(crate) num_octaves: u32,
    pub(crate) seed: i32,
    pub(crate) stitch_tiles: bool,
    pub(crate) kind: TurbulenceKind,
}

impl Turbulence {
    /// Identifies the base frequency for the noise function.
    ///
    /// `baseFrequency` in the SVG.
    pub fn base_frequency_x(&self) -> PositiveF32 {
        self.base_frequency_x
    }

    /// Identifies the base frequency for the noise function.
    ///
    /// `baseFrequency` in the SVG.
    pub fn base_frequency_y(&self) -> PositiveF32 {
        self.base_frequency_y
    }

    /// Identifies the number of octaves for the noise function.
    ///
    /// `numOctaves` in the SVG.
    pub fn num_octaves(&self) -> u32 {
        self.num_octaves
    }

    /// The starting number for the pseudo random number generator.
    ///
    /// `seed` in the SVG.
    pub fn seed(&self) -> i32 {
        self.seed
    }

    /// Smooth transitions at the border of tiles.
    ///
    /// `stitchTiles` in the SVG.
    pub fn stitch_tiles(&self) -> bool {
        self.stitch_tiles
    }

    /// Indicates whether the filter primitive should perform a noise or turbulence function.
    ///
    /// `type` in the SVG.
    pub fn kind(&self) -> TurbulenceKind {
        self.kind
    }
}

/// A turbulence kind for the `feTurbulence` filter.
#[allow(missing_docs)]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum TurbulenceKind {
    FractalNoise,
    Turbulence,
}
