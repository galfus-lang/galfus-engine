// SPDX-License-Identifier: Apache-2.0 OR MIT

use std::fmt::Display;
use std::io::Write;

use svgtypes::{FontFamily, parse_font_families};
use xmlwriter::XmlWriter;

use crate::parser::{AId, EId};
use crate::*;

impl Tree {
    /// Writes `usvg::Tree` back to SVG.
    pub fn to_string(&self, opt: &WriteOptions) -> String {
        convert(self, opt)
    }
}

/// Checks that type has a default value.
trait IsDefault: Default {
    /// Checks that type has a default value.
    fn is_default(&self) -> bool;
}

impl<T: Default + PartialEq + Copy> IsDefault for T {
    #[inline]
    fn is_default(&self) -> bool {
        *self == Self::default()
    }
}

/// XML writing options.
#[derive(Clone, Debug)]
pub struct WriteOptions {
    /// Used to add a custom prefix to each element ID during writing.
    pub id_prefix: Option<String>,

    /// Do not convert text into paths.
    ///
    /// Default: false
    pub preserve_text: bool,

    /// Set the coordinates numeric precision.
    ///
    /// Smaller precision can lead to a malformed output in some cases.
    ///
    /// Default: 8
    pub coordinates_precision: u8,

    /// Set the transform values numeric precision.
    ///
    /// Smaller precision can lead to a malformed output in some cases.
    ///
    /// Default: 8
    pub transforms_precision: u8,

    /// Use single quote marks instead of double quote.
    ///
    /// # Examples
    ///
    /// Before:
    ///
    /// ```text
    /// <rect fill="red"/>
    /// ```
    ///
    /// After:
    ///
    /// ```text
    /// <rect fill='red'/>
    /// ```
    ///
    /// Default: disabled
    pub use_single_quote: bool,

    /// Set XML nodes indention.
    ///
    /// # Examples
    ///
    /// `Indent::None`
    /// Before:
    ///
    /// ```text
    /// <svg>
    ///     <rect fill="red"/>
    /// </svg>
    /// ```
    ///
    /// After:
    ///
    /// ```text
    /// <svg><rect fill="red"/></svg>
    /// ```
    ///
    /// Default: 4 spaces
    pub indent: Indent,

    /// Set XML attributes indention.
    ///
    /// # Examples
    ///
    /// `Indent::Spaces(2)`
    ///
    /// Before:
    ///
    /// ```text
    /// <svg>
    ///     <rect fill="red" stroke="black"/>
    /// </svg>
    /// ```
    ///
    /// After:
    ///
    /// ```text
    /// <svg>
    ///     <rect
    ///       fill="red"
    ///       stroke="black"/>
    /// </svg>
    /// ```
    ///
    /// Default: `None`
    pub attributes_indent: Indent,
}

impl Default for WriteOptions {
    fn default() -> Self {
        Self {
            id_prefix: Default::default(),
            preserve_text: false,
            coordinates_precision: 8,
            transforms_precision: 8,
            use_single_quote: false,
            indent: Indent::Spaces(4),
            attributes_indent: Indent::None,
        }
    }
}

pub(crate) fn convert(tree: &Tree, opt: &WriteOptions) -> String {
    let mut xml = XmlWriter::new(xmlwriter::Options {
        use_single_quote: opt.use_single_quote,
        indent: opt.indent,
        attributes_indent: opt.attributes_indent,
    });

    xml.start_svg_element(EId::Svg);
    xml.write_svg_attribute(AId::Width, &tree.size.width());
    xml.write_svg_attribute(AId::Height, &tree.size.height());
    xml.write_attribute("xmlns", "http://www.w3.org/2000/svg");
    if has_xlink(&tree.root) {
        xml.write_attribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    }

    let has_text_paths = has_text_paths(&tree.root);
    if tree.has_defs_nodes() || has_text_paths {
        write_defs(tree, opt, &mut xml, has_text_paths);
    }

    write_elements(&tree.root, false, opt, &mut xml);

    xml.end_document()
}

fn write_filters(tree: &Tree, opt: &WriteOptions, xml: &mut XmlWriter) {
    let mut written_fe_image_nodes: Vec<String> = Vec::new();
    for filter in tree.filters() {
        for fe in &filter.primitives {
            if let filter::Kind::Image(ref img) = fe.kind {
                if let Some(child) = img.root().children.first() {
                    if !written_fe_image_nodes.iter().any(|id| id == child.id()) {
                        write_element(child, false, opt, xml);
                        written_fe_image_nodes.push(child.id().to_string());
                    }
                }
            }
        }

        xml.start_svg_element(EId::Filter);
        xml.write_id_attribute(filter.id(), opt);
        xml.write_rect_attrs(filter.rect);
        xml.write_units(
            AId::FilterUnits,
            Units::UserSpaceOnUse,
            Units::ObjectBoundingBox,
        );

        for fe in &filter.primitives {
            match fe.kind {
                filter::Kind::DropShadow(ref shadow) => {
                    xml.start_svg_element(EId::FeDropShadow);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_filter_input(AId::In, &shadow.input);
                    xml.write_attribute_fmt(
                        AId::StdDeviation.to_str(),
                        format_args!("{} {}", shadow.std_dev_x.get(), shadow.std_dev_y.get()),
                    );
                    xml.write_svg_attribute(AId::Dx, &shadow.dx);
                    xml.write_svg_attribute(AId::Dy, &shadow.dy);
                    xml.write_color(AId::FloodColor, shadow.color);
                    xml.write_svg_attribute(AId::FloodOpacity, &shadow.opacity.get());
                    xml.write_svg_attribute(AId::Result, &fe.result);
                    xml.end_element();
                }
                filter::Kind::GaussianBlur(ref blur) => {
                    xml.start_svg_element(EId::FeGaussianBlur);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_filter_input(AId::In, &blur.input);
                    xml.write_attribute_fmt(
                        AId::StdDeviation.to_str(),
                        format_args!("{} {}", blur.std_dev_x.get(), blur.std_dev_y.get()),
                    );
                    xml.write_svg_attribute(AId::Result, &fe.result);
                    xml.end_element();
                }
                filter::Kind::Offset(ref offset) => {
                    xml.start_svg_element(EId::FeOffset);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_filter_input(AId::In, &offset.input);
                    xml.write_svg_attribute(AId::Dx, &offset.dx);
                    xml.write_svg_attribute(AId::Dy, &offset.dy);
                    xml.write_svg_attribute(AId::Result, &fe.result);
                    xml.end_element();
                }
                filter::Kind::Blend(ref blend) => {
                    xml.start_svg_element(EId::FeBlend);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_filter_input(AId::In, &blend.input1);
                    xml.write_filter_input(AId::In2, &blend.input2);
                    xml.write_svg_attribute(AId::Mode, &blend.mode.to_string());
                    xml.write_svg_attribute(AId::Result, &fe.result);
                    xml.end_element();
                }
                filter::Kind::Flood(ref flood) => {
                    xml.start_svg_element(EId::FeFlood);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_color(AId::FloodColor, flood.color);
                    xml.write_svg_attribute(AId::FloodOpacity, &flood.opacity.get());
                    xml.write_svg_attribute(AId::Result, &fe.result);
                    xml.end_element();
                }
                filter::Kind::Composite(ref composite) => {
                    xml.start_svg_element(EId::FeComposite);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_filter_input(AId::In, &composite.input1);
                    xml.write_filter_input(AId::In2, &composite.input2);
                    xml.write_svg_attribute(
                        AId::Operator,
                        match composite.operator {
                            filter::CompositeOperator::Over => "over",
                            filter::CompositeOperator::In => "in",
                            filter::CompositeOperator::Out => "out",
                            filter::CompositeOperator::Atop => "atop",
                            filter::CompositeOperator::Xor => "xor",
                            filter::CompositeOperator::Arithmetic { .. } => "arithmetic",
                        },
                    );

                    if let filter::CompositeOperator::Arithmetic { k1, k2, k3, k4 } =
                        composite.operator
                    {
                        xml.write_svg_attribute(AId::K1, &k1);
                        xml.write_svg_attribute(AId::K2, &k2);
                        xml.write_svg_attribute(AId::K3, &k3);
                        xml.write_svg_attribute(AId::K4, &k4);
                    }

                    xml.write_svg_attribute(AId::Result, &fe.result);
                    xml.end_element();
                }
                filter::Kind::Merge(ref merge) => {
                    xml.start_svg_element(EId::FeMerge);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_svg_attribute(AId::Result, &fe.result);
                    for input in &merge.inputs {
                        xml.start_svg_element(EId::FeMergeNode);
                        xml.write_filter_input(AId::In, input);
                        xml.end_element();
                    }

                    xml.end_element();
                }
                filter::Kind::Tile(ref tile) => {
                    xml.start_svg_element(EId::FeTile);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_filter_input(AId::In, &tile.input);
                    xml.write_svg_attribute(AId::Result, &fe.result);
                    xml.end_element();
                }
                filter::Kind::Image(ref img) => {
                    xml.start_svg_element(EId::FeImage);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    if let Some(child) = img.root.children.first() {
                        let prefix = opt.id_prefix.as_deref().unwrap_or_default();
                        xml.write_attribute_fmt(
                            "xlink:href",
                            format_args!("#{}{}", prefix, child.id()),
                        );
                    }

                    xml.write_svg_attribute(AId::Result, &fe.result);
                    xml.end_element();
                }
                filter::Kind::ComponentTransfer(ref transfer) => {
                    xml.start_svg_element(EId::FeComponentTransfer);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_filter_input(AId::In, &transfer.input);
                    xml.write_svg_attribute(AId::Result, &fe.result);

                    xml.write_filter_transfer_function(EId::FeFuncR, &transfer.func_r);
                    xml.write_filter_transfer_function(EId::FeFuncG, &transfer.func_g);
                    xml.write_filter_transfer_function(EId::FeFuncB, &transfer.func_b);
                    xml.write_filter_transfer_function(EId::FeFuncA, &transfer.func_a);

                    xml.end_element();
                }
                filter::Kind::ColorMatrix(ref matrix) => {
                    xml.start_svg_element(EId::FeColorMatrix);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_filter_input(AId::In, &matrix.input);
                    xml.write_svg_attribute(AId::Result, &fe.result);

                    match matrix.kind {
                        filter::ColorMatrixKind::Matrix(ref values) => {
                            xml.write_svg_attribute(AId::Type, "matrix");
                            xml.write_numbers(AId::Values, values);
                        }
                        filter::ColorMatrixKind::Saturate(value) => {
                            xml.write_svg_attribute(AId::Type, "saturate");
                            xml.write_svg_attribute(AId::Values, &value.get());
                        }
                        filter::ColorMatrixKind::HueRotate(angle) => {
                            xml.write_svg_attribute(AId::Type, "hueRotate");
                            xml.write_svg_attribute(AId::Values, &angle);
                        }
                        filter::ColorMatrixKind::LuminanceToAlpha => {
                            xml.write_svg_attribute(AId::Type, "luminanceToAlpha");
                        }
                    }

                    xml.end_element();
                }
                filter::Kind::ConvolveMatrix(ref matrix) => {
                    xml.start_svg_element(EId::FeConvolveMatrix);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_filter_input(AId::In, &matrix.input);
                    xml.write_svg_attribute(AId::Result, &fe.result);

                    xml.write_attribute_fmt(
                        AId::Order.to_str(),
                        format_args!("{} {}", matrix.matrix.columns, matrix.matrix.rows),
                    );
                    xml.write_numbers(AId::KernelMatrix, &matrix.matrix.data);
                    xml.write_svg_attribute(AId::Divisor, &matrix.divisor.get());
                    xml.write_svg_attribute(AId::Bias, &matrix.bias);
                    xml.write_svg_attribute(AId::TargetX, &matrix.matrix.target_x);
                    xml.write_svg_attribute(AId::TargetY, &matrix.matrix.target_y);
                    xml.write_svg_attribute(
                        AId::EdgeMode,
                        match matrix.edge_mode {
                            filter::EdgeMode::None => "none",
                            filter::EdgeMode::Duplicate => "duplicate",
                            filter::EdgeMode::Wrap => "wrap",
                        },
                    );
                    xml.write_svg_attribute(
                        AId::PreserveAlpha,
                        if matrix.preserve_alpha {
                            "true"
                        } else {
                            "false"
                        },
                    );

                    xml.end_element();
                }
                filter::Kind::Morphology(ref morphology) => {
                    xml.start_svg_element(EId::FeMorphology);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_filter_input(AId::In, &morphology.input);
                    xml.write_svg_attribute(AId::Result, &fe.result);

                    xml.write_svg_attribute(
                        AId::Operator,
                        match morphology.operator {
                            filter::MorphologyOperator::Erode => "erode",
                            filter::MorphologyOperator::Dilate => "dilate",
                        },
                    );
                    xml.write_attribute_fmt(
                        AId::Radius.to_str(),
                        format_args!(
                            "{} {}",
                            morphology.radius_x.get(),
                            morphology.radius_y.get()
                        ),
                    );

                    xml.end_element();
                }
                filter::Kind::DisplacementMap(ref map) => {
                    xml.start_svg_element(EId::FeDisplacementMap);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_filter_input(AId::In, &map.input1);
                    xml.write_filter_input(AId::In2, &map.input2);
                    xml.write_svg_attribute(AId::Result, &fe.result);

                    xml.write_svg_attribute(AId::Scale, &map.scale);

                    let mut write_channel = |c, aid| {
                        xml.write_svg_attribute(
                            aid,
                            match c {
                                filter::ColorChannel::R => "R",
                                filter::ColorChannel::G => "G",
                                filter::ColorChannel::B => "B",
                                filter::ColorChannel::A => "A",
                            },
                        );
                    };
                    write_channel(map.x_channel_selector, AId::XChannelSelector);
                    write_channel(map.y_channel_selector, AId::YChannelSelector);

                    xml.end_element();
                }
                filter::Kind::Turbulence(ref turbulence) => {
                    xml.start_svg_element(EId::FeTurbulence);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_svg_attribute(AId::Result, &fe.result);

                    xml.write_attribute_fmt(
                        AId::BaseFrequency.to_str(),
                        format_args!(
                            "{} {}",
                            turbulence.base_frequency_x.get(),
                            turbulence.base_frequency_y.get()
                        ),
                    );
                    xml.write_svg_attribute(AId::NumOctaves, &turbulence.num_octaves);
                    xml.write_svg_attribute(AId::Seed, &turbulence.seed);
                    xml.write_svg_attribute(
                        AId::StitchTiles,
                        match turbulence.stitch_tiles {
                            true => "stitch",
                            false => "noStitch",
                        },
                    );
                    xml.write_svg_attribute(
                        AId::Type,
                        match turbulence.kind {
                            filter::TurbulenceKind::FractalNoise => "fractalNoise",
                            filter::TurbulenceKind::Turbulence => "turbulence",
                        },
                    );

                    xml.end_element();
                }
                filter::Kind::DiffuseLighting(ref light) => {
                    xml.start_svg_element(EId::FeDiffuseLighting);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_svg_attribute(AId::Result, &fe.result);

                    xml.write_svg_attribute(AId::SurfaceScale, &light.surface_scale);
                    xml.write_svg_attribute(AId::DiffuseConstant, &light.diffuse_constant);
                    xml.write_color(AId::LightingColor, light.lighting_color);
                    write_light_source(&light.light_source, xml);

                    xml.end_element();
                }
                filter::Kind::SpecularLighting(ref light) => {
                    xml.start_svg_element(EId::FeSpecularLighting);
                    xml.write_filter_primitive_attrs(filter.rect(), fe);
                    xml.write_svg_attribute(AId::Result, &fe.result);

                    xml.write_svg_attribute(AId::SurfaceScale, &light.surface_scale);
                    xml.write_svg_attribute(AId::SpecularConstant, &light.specular_constant);
                    xml.write_svg_attribute(AId::SpecularExponent, &light.specular_exponent);
                    xml.write_color(AId::LightingColor, light.lighting_color);
                    write_light_source(&light.light_source, xml);

                    xml.end_element();
                }
            };
        }

        xml.end_element();
    }
}

