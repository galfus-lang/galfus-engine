// SPDX-License-Identifier: Apache-2.0 OR MIT

fn convert_diffuse_lighting(fe: SvgNode, primitives: &[Primitive]) -> Option<Kind> {
    let light_source = convert_light_source(fe)?;
    Some(Kind::DiffuseLighting(DiffuseLighting {
        input: resolve_input(fe, AId::In, primitives),
        surface_scale: fe.attribute(AId::SurfaceScale).unwrap_or(1.0),
        diffuse_constant: fe.attribute(AId::DiffuseConstant).unwrap_or(1.0),
        lighting_color: convert_lighting_color(fe),
        light_source,
    }))
}

fn convert_specular_lighting(fe: SvgNode, primitives: &[Primitive]) -> Option<Kind> {
    let light_source = convert_light_source(fe)?;

    let specular_exponent = fe.attribute(AId::SpecularExponent).unwrap_or(1.0);
    if !(1.0..=128.0).contains(&specular_exponent) {
        // When exponent is out of range, the whole filter primitive should be ignored.
        return None;
    }

    let specular_exponent = crate::f32_bound(1.0, specular_exponent, 128.0);

    Some(Kind::SpecularLighting(SpecularLighting {
        input: resolve_input(fe, AId::In, primitives),
        surface_scale: fe.attribute(AId::SurfaceScale).unwrap_or(1.0),
        specular_constant: fe.attribute(AId::SpecularConstant).unwrap_or(1.0),
        specular_exponent,
        lighting_color: convert_lighting_color(fe),
        light_source,
    }))
}

#[inline(never)]
fn convert_lighting_color(node: SvgNode) -> Color {
    // Color's alpha doesn't affect lighting-color. Simply skip it.
    match node.attribute(AId::LightingColor) {
        Some("currentColor") => {
            node.find_attribute(AId::Color)
                // Yes, a missing `currentColor` resolves to black and not white.
                .unwrap_or(svgtypes::Color::black())
                .split_alpha()
                .0
        }
        Some(value) => {
            if let Ok(c) = svgtypes::Color::from_str(value) {
                c.split_alpha().0
            } else {
                log::warn!("Failed to parse lighting-color value: '{}'.", value);
                Color::white()
            }
        }
        _ => Color::white(),
    }
}

#[inline(never)]
fn convert_light_source(parent: SvgNode) -> Option<LightSource> {
    let child = parent.children().find(|n| {
        matches!(
            n.tag_name(),
            Some(EId::FeDistantLight) | Some(EId::FePointLight) | Some(EId::FeSpotLight)
        )
    })?;

    match child.tag_name() {
        Some(EId::FeDistantLight) => Some(LightSource::DistantLight(DistantLight {
            azimuth: child.attribute(AId::Azimuth).unwrap_or(0.0),
            elevation: child.attribute(AId::Elevation).unwrap_or(0.0),
        })),
        Some(EId::FePointLight) => Some(LightSource::PointLight(PointLight {
            x: child.attribute(AId::X).unwrap_or(0.0),
            y: child.attribute(AId::Y).unwrap_or(0.0),
            z: child.attribute(AId::Z).unwrap_or(0.0),
        })),
        Some(EId::FeSpotLight) => {
            let specular_exponent = child.attribute(AId::SpecularExponent).unwrap_or(1.0);
            let specular_exponent = PositiveF32::new(specular_exponent)
                .unwrap_or_else(|| PositiveF32::new(1.0).unwrap());

            Some(LightSource::SpotLight(SpotLight {
                x: child.attribute(AId::X).unwrap_or(0.0),
                y: child.attribute(AId::Y).unwrap_or(0.0),
                z: child.attribute(AId::Z).unwrap_or(0.0),
                points_at_x: child.attribute(AId::PointsAtX).unwrap_or(0.0),
                points_at_y: child.attribute(AId::PointsAtY).unwrap_or(0.0),
                points_at_z: child.attribute(AId::PointsAtZ).unwrap_or(0.0),
                specular_exponent,
                limiting_cone_angle: child.attribute(AId::LimitingConeAngle),
            }))
        }
        _ => None,
    }
}

fn convert_merge(fe: SvgNode, primitives: &[Primitive]) -> Kind {
    let mut inputs = Vec::new();
    for child in fe.children() {
        inputs.push(resolve_input(child, AId::In, primitives));
    }

    Kind::Merge(Merge { inputs })
}

fn convert_morphology(fe: SvgNode, scale: Size, primitives: &[Primitive]) -> Kind {
    let operator = match fe.attribute(AId::Operator).unwrap_or("erode") {
        "dilate" => MorphologyOperator::Dilate,
        _ => MorphologyOperator::Erode,
    };

    let mut radius_x = PositiveF32::new(scale.width()).unwrap();
    let mut radius_y = PositiveF32::new(scale.height()).unwrap();
    if let Some(list) = fe.attribute::<Vec<f32>>(AId::Radius) {
        let mut rx = 0.0;
        let mut ry = 0.0;
        if list.len() == 2 {
            rx = list[0];
            ry = list[1];
        } else if list.len() == 1 {
            rx = list[0];
            ry = list[0]; // The same as `rx`.
        }

        if rx.approx_zero_ulps(4) && ry.approx_zero_ulps(4) {
            rx = 1.0;
            ry = 1.0;
        }

        // If only one of the values is zero, reset it to 1.0
        // This is not specified in the spec, but this is how Chrome and Safari work.
        if rx.approx_zero_ulps(4) && !ry.approx_zero_ulps(4) {
            rx = 1.0;
        }
        if !rx.approx_zero_ulps(4) && ry.approx_zero_ulps(4) {
            ry = 1.0;
        }

        // Both values must be positive.
        if rx.is_sign_positive() && ry.is_sign_positive() {
            radius_x = PositiveF32::new(rx * scale.width()).unwrap();
            radius_y = PositiveF32::new(ry * scale.height()).unwrap();
        }
    }

    Kind::Morphology(Morphology {
        input: resolve_input(fe, AId::In, primitives),
        operator,
        radius_x,
        radius_y,
    })
}

fn convert_offset(fe: SvgNode, scale: Size, primitives: &[Primitive]) -> Kind {
    Kind::Offset(Offset {
        input: resolve_input(fe, AId::In, primitives),
        dx: fe.attribute(AId::Dx).unwrap_or(0.0) * scale.width(),
        dy: fe.attribute(AId::Dy).unwrap_or(0.0) * scale.height(),
    })
}

fn convert_tile(fe: SvgNode, primitives: &[Primitive]) -> Kind {
    Kind::Tile(Tile {
        input: resolve_input(fe, AId::In, primitives),
    })
}

fn convert_turbulence(fe: SvgNode) -> Kind {
    let mut base_frequency_x = PositiveF32::ZERO;
    let mut base_frequency_y = PositiveF32::ZERO;
    if let Some(list) = fe.attribute::<Vec<f32>>(AId::BaseFrequency) {
        let mut x = 0.0;
        let mut y = 0.0;
        if list.len() == 2 {
            x = list[0];
            y = list[1];
        } else if list.len() == 1 {
            x = list[0];
            y = list[0]; // The same as `x`.
        }

        if x.is_sign_positive() && y.is_sign_positive() {
            base_frequency_x = PositiveF32::new(x).unwrap();
            base_frequency_y = PositiveF32::new(y).unwrap();
        }
    }

    let mut num_octaves = fe.attribute(AId::NumOctaves).unwrap_or(1.0);
    if num_octaves.is_sign_negative() {
        num_octaves = 0.0;
    }

    let kind = match fe.attribute(AId::Type).unwrap_or("turbulence") {
        "fractalNoise" => TurbulenceKind::FractalNoise,
        _ => TurbulenceKind::Turbulence,
    };

    Kind::Turbulence(Turbulence {
        base_frequency_x,
        base_frequency_y,
        num_octaves: num_octaves.round() as u32,
        seed: fe.attribute::<f32>(AId::Seed).unwrap_or(0.0).trunc() as i32,
        stitch_tiles: fe.attribute(AId::StitchTiles) == Some("stitch"),
        kind,
    })
}

#[inline(never)]
fn convert_grayscale_function(amount: f64) -> Kind {
    let amount = amount.min(1.0) as f32;
    Kind::ColorMatrix(ColorMatrix {
        input: Input::SourceGraphic,
        kind: ColorMatrixKind::Matrix(vec![
            (0.2126 + 0.7874 * (1.0 - amount)),
            (0.7152 - 0.7152 * (1.0 - amount)),
            (0.0722 - 0.0722 * (1.0 - amount)),
            0.0,
            0.0,
            (0.2126 - 0.2126 * (1.0 - amount)),
            (0.7152 + 0.2848 * (1.0 - amount)),
            (0.0722 - 0.0722 * (1.0 - amount)),
            0.0,
            0.0,
            (0.2126 - 0.2126 * (1.0 - amount)),
            (0.7152 - 0.7152 * (1.0 - amount)),
            (0.0722 + 0.9278 * (1.0 - amount)),
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
        ]),
    })
}

#[inline(never)]
fn convert_sepia_function(amount: f64) -> Kind {
    let amount = amount.min(1.0) as f32;
    Kind::ColorMatrix(ColorMatrix {
        input: Input::SourceGraphic,
        kind: ColorMatrixKind::Matrix(vec![
            (0.393 + 0.607 * (1.0 - amount)),
            (0.769 - 0.769 * (1.0 - amount)),
            (0.189 - 0.189 * (1.0 - amount)),
            0.0,
            0.0,
            (0.349 - 0.349 * (1.0 - amount)),
            (0.686 + 0.314 * (1.0 - amount)),
            (0.168 - 0.168 * (1.0 - amount)),
            0.0,
            0.0,
            (0.272 - 0.272 * (1.0 - amount)),
            (0.534 - 0.534 * (1.0 - amount)),
            (0.131 + 0.869 * (1.0 - amount)),
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
        ]),
    })
}

#[inline(never)]
fn convert_saturate_function(amount: f64) -> Kind {
    let amount = PositiveF32::new(amount as f32).unwrap_or(PositiveF32::ZERO);
    Kind::ColorMatrix(ColorMatrix {
        input: Input::SourceGraphic,
        kind: ColorMatrixKind::Saturate(amount),
    })
}

#[inline(never)]
fn convert_hue_rotate_function(amount: svgtypes::Angle) -> Kind {
    Kind::ColorMatrix(ColorMatrix {
        input: Input::SourceGraphic,
        kind: ColorMatrixKind::HueRotate(amount.to_degrees() as f32),
    })
}

#[inline(never)]
fn convert_invert_function(amount: f64) -> Kind {
    let amount = amount.min(1.0) as f32;
    Kind::ComponentTransfer(ComponentTransfer {
        input: Input::SourceGraphic,
        func_r: TransferFunction::Table(vec![amount, 1.0 - amount]),
        func_g: TransferFunction::Table(vec![amount, 1.0 - amount]),
        func_b: TransferFunction::Table(vec![amount, 1.0 - amount]),
        func_a: TransferFunction::Identity,
    })
}

#[inline(never)]
fn convert_opacity_function(amount: f64) -> Kind {
    let amount = amount.min(1.0) as f32;
    Kind::ComponentTransfer(ComponentTransfer {
        input: Input::SourceGraphic,
        func_r: TransferFunction::Identity,
        func_g: TransferFunction::Identity,
        func_b: TransferFunction::Identity,
        func_a: TransferFunction::Table(vec![0.0, amount]),
    })
}

#[inline(never)]
fn convert_brightness_function(amount: f64) -> Kind {
    let amount = amount as f32;
    Kind::ComponentTransfer(ComponentTransfer {
        input: Input::SourceGraphic,
        func_r: TransferFunction::Linear {
            slope: amount,
            intercept: 0.0,
        },
        func_g: TransferFunction::Linear {
            slope: amount,
            intercept: 0.0,
        },
        func_b: TransferFunction::Linear {
            slope: amount,
            intercept: 0.0,
        },
        func_a: TransferFunction::Identity,
    })
}

#[inline(never)]
fn convert_contrast_function(amount: f64) -> Kind {
    let amount = amount as f32;
    Kind::ComponentTransfer(ComponentTransfer {
        input: Input::SourceGraphic,
        func_r: TransferFunction::Linear {
            slope: amount,
            intercept: -(0.5 * amount) + 0.5,
        },
        func_g: TransferFunction::Linear {
            slope: amount,
            intercept: -(0.5 * amount) + 0.5,
        },
        func_b: TransferFunction::Linear {
            slope: amount,
            intercept: -(0.5 * amount) + 0.5,
        },
        func_a: TransferFunction::Identity,
    })
}

#[inline(never)]
fn convert_blur_function(node: SvgNode, std_dev: Length, state: &converter::State) -> Kind {
    let std_dev = PositiveF32::new(super::units::convert_user_length(
        std_dev,
        node,
        AId::Dx,
        state,
    ))
    .unwrap_or(PositiveF32::ZERO);
    Kind::GaussianBlur(GaussianBlur {
        input: Input::SourceGraphic,
        std_dev_x: std_dev,
        std_dev_y: std_dev,
    })
}

#[inline(never)]
fn convert_drop_shadow_function(
    node: SvgNode,
    color: Option<svgtypes::Color>,
    dx: Length,
    dy: Length,
    std_dev: Length,
    state: &converter::State,
) -> Kind {
    let std_dev = PositiveF32::new(super::units::convert_user_length(
        std_dev,
        node,
        AId::Dx,
        state,
    ))
    .unwrap_or(PositiveF32::ZERO);

    let (color, opacity) = color
        .unwrap_or_else(|| {
            node.find_attribute(AId::Color)
                .unwrap_or_else(svgtypes::Color::black)
        })
        .split_alpha();

    Kind::DropShadow(DropShadow {
        input: Input::SourceGraphic,
        dx: super::units::convert_user_length(dx, node, AId::Dx, state),
        dy: super::units::convert_user_length(dy, node, AId::Dy, state),
        std_dev_x: std_dev,
        std_dev_y: std_dev,
        color,
        opacity,
    })
}
