// SPDX-License-Identifier: Apache-2.0 OR MIT

#[inline(never)]
pub(crate) fn create_dummy_primitive() -> Kind {
    Kind::Flood(Flood {
        color: Color::black(),
        opacity: Opacity::ZERO,
    })
}

#[inline(never)]
fn resolve_input(node: SvgNode, aid: AId, primitives: &[Primitive]) -> Input {
    match node.attribute(aid) {
        Some(s) => {
            let input = parse_in(s);

            // If `in` references an unknown `result` than fallback
            // to previous result or `SourceGraphic`.
            if let Input::Reference(ref name) = input {
                if !primitives.iter().any(|p| p.result == *name) {
                    return if let Some(prev) = primitives.last() {
                        Input::Reference(prev.result.clone())
                    } else {
                        Input::SourceGraphic
                    };
                }
            }

            input
        }
        None => {
            if let Some(prev) = primitives.last() {
                // If `in` is not set and this is not the first primitive
                // than the input is a result of the previous primitive.
                Input::Reference(prev.result.clone())
            } else {
                // If `in` is not set and this is the first primitive
                // than the input is `SourceGraphic`.
                Input::SourceGraphic
            }
        }
    }
}

fn parse_in(s: &str) -> Input {
    match s {
        "SourceGraphic" => Input::SourceGraphic,
        "SourceAlpha" => Input::SourceAlpha,
        "BackgroundImage" | "BackgroundAlpha" | "FillPaint" | "StrokePaint" => {
            log::warn!("{} filter input isn't supported and not planed.", s);
            Input::SourceGraphic
        }
        _ => Input::Reference(s.to_string()),
    }
}

fn gen_result(node: SvgNode, results: &mut FilterResults) -> String {
    match node.attribute::<&str>(AId::Result) {
        Some(s) => {
            // Remember predefined result.
            results.names.insert(s.to_string());
            results.idx += 1;

            s.to_string()
        }
        None => {
            // Generate an unique name for `result`.
            loop {
                let name = format!("result{}", results.idx);
                results.idx += 1;

                if !results.names.contains(&name) {
                    return name;
                }
            }
        }
    }
}

fn convert_blend(fe: SvgNode, primitives: &[Primitive]) -> Kind {
    let mode = fe.attribute(AId::Mode).unwrap_or_default();
    let input1 = resolve_input(fe, AId::In, primitives);
    let input2 = resolve_input(fe, AId::In2, primitives);
    Kind::Blend(Blend {
        mode,
        input1,
        input2,
    })
}

fn convert_color_matrix(fe: SvgNode, primitives: &[Primitive]) -> Kind {
    let kind = convert_color_matrix_kind(fe).unwrap_or_default();
    Kind::ColorMatrix(ColorMatrix {
        input: resolve_input(fe, AId::In, primitives),
        kind,
    })
}

fn convert_color_matrix_kind(fe: SvgNode) -> Option<ColorMatrixKind> {
    match fe.attribute(AId::Type) {
        Some("saturate") => {
            if let Some(list) = fe.attribute::<Vec<f32>>(AId::Values) {
                if !list.is_empty() {
                    let n = crate::f32_bound(0.0, list[0], 1.0);
                    return Some(ColorMatrixKind::Saturate(PositiveF32::new(n).unwrap()));
                } else {
                    return Some(ColorMatrixKind::Saturate(PositiveF32::new(1.0).unwrap()));
                }
            }
        }
        Some("hueRotate") => {
            if let Some(list) = fe.attribute::<Vec<f32>>(AId::Values) {
                if !list.is_empty() {
                    return Some(ColorMatrixKind::HueRotate(list[0]));
                } else {
                    return Some(ColorMatrixKind::HueRotate(0.0));
                }
            }
        }
        Some("luminanceToAlpha") => {
            return Some(ColorMatrixKind::LuminanceToAlpha);
        }
        _ => {
            // Fallback to `matrix`.
            if let Some(list) = fe.attribute::<Vec<f32>>(AId::Values) {
                if list.len() == 20 {
                    return Some(ColorMatrixKind::Matrix(list));
                }
            }
        }
    }

    None
}

fn convert_component_transfer(fe: SvgNode, primitives: &[Primitive]) -> Kind {
    let mut kind = ComponentTransfer {
        input: resolve_input(fe, AId::In, primitives),
        func_r: TransferFunction::Identity,
        func_g: TransferFunction::Identity,
        func_b: TransferFunction::Identity,
        func_a: TransferFunction::Identity,
    };

    for child in fe.children().filter(|n| n.is_element()) {
        if let Some(func) = convert_transfer_function(child) {
            match child.tag_name().unwrap() {
                EId::FeFuncR => kind.func_r = func,
                EId::FeFuncG => kind.func_g = func,
                EId::FeFuncB => kind.func_b = func,
                EId::FeFuncA => kind.func_a = func,
                _ => {}
            }
        }
    }

    Kind::ComponentTransfer(kind)
}

fn convert_transfer_function(node: SvgNode) -> Option<TransferFunction> {
    match node.attribute(AId::Type)? {
        "identity" => Some(TransferFunction::Identity),
        "table" => match node.attribute::<Vec<f32>>(AId::TableValues) {
            Some(values) => Some(TransferFunction::Table(values)),
            None => Some(TransferFunction::Table(Vec::new())),
        },
        "discrete" => match node.attribute::<Vec<f32>>(AId::TableValues) {
            Some(values) => Some(TransferFunction::Discrete(values)),
            None => Some(TransferFunction::Discrete(Vec::new())),
        },
        "linear" => Some(TransferFunction::Linear {
            slope: node.attribute(AId::Slope).unwrap_or(1.0),
            intercept: node.attribute(AId::Intercept).unwrap_or(0.0),
        }),
        "gamma" => Some(TransferFunction::Gamma {
            amplitude: node.attribute(AId::Amplitude).unwrap_or(1.0),
            exponent: node.attribute(AId::Exponent).unwrap_or(1.0),
            offset: node.attribute(AId::Offset).unwrap_or(0.0),
        }),
        _ => None,
    }
}

fn convert_composite(fe: SvgNode, primitives: &[Primitive]) -> Kind {
    let operator = match fe.attribute(AId::Operator).unwrap_or("over") {
        "in" => CompositeOperator::In,
        "out" => CompositeOperator::Out,
        "atop" => CompositeOperator::Atop,
        "xor" => CompositeOperator::Xor,
        "arithmetic" => CompositeOperator::Arithmetic {
            k1: fe.attribute(AId::K1).unwrap_or(0.0),
            k2: fe.attribute(AId::K2).unwrap_or(0.0),
            k3: fe.attribute(AId::K3).unwrap_or(0.0),
            k4: fe.attribute(AId::K4).unwrap_or(0.0),
        },
        _ => CompositeOperator::Over,
    };

    let input1 = resolve_input(fe, AId::In, primitives);
    let input2 = resolve_input(fe, AId::In2, primitives);

    Kind::Composite(Composite {
        operator,
        input1,
        input2,
    })
}

fn convert_convolve_matrix(fe: SvgNode, primitives: &[Primitive]) -> Option<Kind> {
    fn parse_target(target: Option<f32>, order: u32) -> Option<u32> {
        let default_target = (order as f32 / 2.0).floor() as u32;
        let target = target.unwrap_or(default_target as f32) as i32;
        if target < 0 || target >= order as i32 {
            None
        } else {
            Some(target as u32)
        }
    }

    let mut order_x = 3;
    let mut order_y = 3;
    if let Some(value) = fe.attribute::<&str>(AId::Order) {
        let mut s = svgtypes::NumberListParser::from(value);
        let x = s.next().and_then(|a| a.ok()).map(|n| n as i32).unwrap_or(3);
        let y = s.next().and_then(|a| a.ok()).map(|n| n as i32).unwrap_or(x);
        if x > 0 && y > 0 {
            order_x = x as u32;
            order_y = y as u32;
        }
    }

    let mut matrix = Vec::new();
    if let Some(list) = fe.attribute::<Vec<f32>>(AId::KernelMatrix) {
        if list.len() == (order_x * order_y) as usize {
            matrix = list;
        }
    }

    let mut kernel_sum: f32 = matrix.iter().sum();
    // Round up to prevent float precision issues.
    kernel_sum = (kernel_sum * 1_000_000.0).round() / 1_000_000.0;
    if kernel_sum.approx_zero_ulps(4) {
        kernel_sum = 1.0;
    }

    let divisor = fe.attribute(AId::Divisor).unwrap_or(kernel_sum);
    if divisor.approx_zero_ulps(4) {
        return None;
    }

    let bias = fe.attribute(AId::Bias).unwrap_or(0.0);

    let target_x = parse_target(fe.attribute(AId::TargetX), order_x)?;
    let target_y = parse_target(fe.attribute(AId::TargetY), order_y)?;

    let kernel_matrix = ConvolveMatrixData::new(target_x, target_y, order_x, order_y, matrix)?;

    let edge_mode = match fe.attribute(AId::EdgeMode).unwrap_or("duplicate") {
        "none" => EdgeMode::None,
        "wrap" => EdgeMode::Wrap,
        _ => EdgeMode::Duplicate,
    };

    let preserve_alpha = fe.attribute(AId::PreserveAlpha).unwrap_or("false") == "true";

    Some(Kind::ConvolveMatrix(ConvolveMatrix {
        input: resolve_input(fe, AId::In, primitives),
        matrix: kernel_matrix,
        divisor: NonZeroF32::new(divisor).unwrap(),
        bias,
        edge_mode,
        preserve_alpha,
    }))
}

fn convert_displacement_map(fe: SvgNode, scale: Size, primitives: &[Primitive]) -> Kind {
    let parse_channel = |aid| match fe.attribute(aid).unwrap_or("A") {
        "R" => ColorChannel::R,
        "G" => ColorChannel::G,
        "B" => ColorChannel::B,
        _ => ColorChannel::A,
    };

    // TODO: should probably split scale to scale_x and scale_y,
    //       but resvg doesn't support displacement map anyway...
    let scale = (scale.width() + scale.height()) / 2.0;

    Kind::DisplacementMap(DisplacementMap {
        input1: resolve_input(fe, AId::In, primitives),
        input2: resolve_input(fe, AId::In2, primitives),
        scale: fe.attribute(AId::Scale).unwrap_or(0.0) * scale,
        x_channel_selector: parse_channel(AId::XChannelSelector),
        y_channel_selector: parse_channel(AId::YChannelSelector),
    })
}

fn convert_drop_shadow(fe: SvgNode, scale: Size, primitives: &[Primitive]) -> Kind {
    let (std_dev_x, std_dev_y) = convert_std_dev_attr(fe, scale, "2 2");

    let (color, opacity) = fe
        .attribute(AId::FloodColor)
        .unwrap_or_else(svgtypes::Color::black)
        .split_alpha();

    let flood_opacity = fe
        .attribute::<Opacity>(AId::FloodOpacity)
        .unwrap_or(Opacity::ONE);

    Kind::DropShadow(DropShadow {
        input: resolve_input(fe, AId::In, primitives),
        dx: fe.attribute(AId::Dx).unwrap_or(2.0) * scale.width(),
        dy: fe.attribute(AId::Dy).unwrap_or(2.0) * scale.height(),
        std_dev_x,
        std_dev_y,
        color,
        opacity: opacity * flood_opacity,
    })
}

fn convert_flood(fe: SvgNode) -> Kind {
    let (color, opacity) = fe
        .attribute(AId::FloodColor)
        .unwrap_or_else(svgtypes::Color::black)
        .split_alpha();

    let flood_opacity = fe
        .attribute::<Opacity>(AId::FloodOpacity)
        .unwrap_or(Opacity::ONE);

    Kind::Flood(Flood {
        color,
        opacity: opacity * flood_opacity,
    })
}

fn convert_gaussian_blur(fe: SvgNode, scale: Size, primitives: &[Primitive]) -> Kind {
    let (std_dev_x, std_dev_y) = convert_std_dev_attr(fe, scale, "0 0");
    Kind::GaussianBlur(GaussianBlur {
        input: resolve_input(fe, AId::In, primitives),
        std_dev_x,
        std_dev_y,
    })
}

fn convert_std_dev_attr(fe: SvgNode, scale: Size, default: &str) -> (PositiveF32, PositiveF32) {
    let text = fe.attribute(AId::StdDeviation).unwrap_or(default);
    let mut parser = svgtypes::NumberListParser::from(text);

    let n1 = parser.next().and_then(|n| n.ok());
    let n2 = parser.next().and_then(|n| n.ok());
    // `stdDeviation` must have no more than two values.
    // Otherwise we should fallback to `0 0`.
    let n3 = parser.next().and_then(|n| n.ok());

    let (std_dev_x, std_dev_y) = match (n1, n2, n3) {
        (Some(n1), Some(n2), None) => (n1, n2),
        (Some(n1), None, None) => (n1, n1),
        _ => (0.0, 0.0),
    };

    let std_dev_x = (std_dev_x as f32) * scale.width();
    let std_dev_y = (std_dev_y as f32) * scale.height();

    let std_dev_x = PositiveF32::new(std_dev_x).unwrap_or(PositiveF32::ZERO);
    let std_dev_y = PositiveF32::new(std_dev_y).unwrap_or(PositiveF32::ZERO);

    (std_dev_x, std_dev_y)
}

fn convert_image(
    fe: SvgNode,
    filter_subregion: NonZeroRect,
    state: &converter::State,
    cache: &mut converter::Cache,
) -> Kind {
    match convert_image_inner(fe, filter_subregion, state, cache) {
        Some(kind) => kind,
        None => create_dummy_primitive(),
    }
}

fn convert_image_inner(
    fe: SvgNode,
    filter_subregion: NonZeroRect,
    state: &converter::State,
    cache: &mut converter::Cache,
) -> Option<Kind> {
    let rendering_mode = fe
        .find_attribute(AId::ImageRendering)
        .unwrap_or(state.opt.image_rendering);

    if let Some(node) = fe.try_attribute::<SvgNode>(AId::Href) {
        let mut state = state.clone();
        state.fe_image_link = true;
        let mut root = Group::empty();
        super::converter::convert_element(node, &state, cache, &mut root);
        return if root.has_children() {
            root.calculate_bounding_boxes();
            // Transfer node id from group's child to the group itself if needed.
            if let Some(Node::Group(g)) = root.children.first_mut() {
                if let Some(child2) = g.children.first_mut() {
                    g.id = child2.id().to_string();
                    match child2 {
                        Node::Group(g2) => g2.id.clear(),
                        Node::Path(path) => path.id.clear(),
                        Node::Image(image) => image.id.clear(),
                        Node::Text(text) => text.id.clear(),
                    }
                }
            }

            Some(Kind::Image(Image { root }))
        } else {
            None
        };
    }

    let href = fe.try_attribute(AId::Href).log_none(|| {
        log::warn!("The 'feImage' element lacks the 'xlink:href' attribute. Skipped.");
    })?;
    let img_data = super::image::get_href_data(href, state)?;
    let actual_size = img_data.actual_size()?;

    let aspect: AspectRatio = fe.attribute(AId::PreserveAspectRatio).unwrap_or_default();

    let mut root = Group::empty();
    super::image::convert_inner(
        img_data,
        cache.gen_image_id().take(),
        true,
        rendering_mode,
        aspect,
        actual_size,
        filter_subregion.translate_to(0.0, 0.0)?,
        cache,
        &mut root,
    );
    root.calculate_bounding_boxes();

    Some(Kind::Image(Image { root }))
}

