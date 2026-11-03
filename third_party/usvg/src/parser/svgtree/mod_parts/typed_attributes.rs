// SPDX-License-Identifier: Apache-2.0 OR MIT

impl<'a, 'input: 'a> FromValue<'a, 'input> for Transform {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        let ts = match svgtypes::Transform::from_str(value) {
            Ok(v) => v,
            Err(_) => return None,
        };

        let ts = Transform::from_row(
            ts.a as f32,
            ts.b as f32,
            ts.c as f32,
            ts.d as f32,
            ts.e as f32,
            ts.f as f32,
        );

        if ts.is_valid() {
            Some(ts)
        } else {
            Some(Transform::default())
        }
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for svgtypes::TransformOrigin {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        Self::from_str(value).ok()
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for svgtypes::ViewBox {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        Self::from_str(value).ok()
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for Units {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        match value {
            "userSpaceOnUse" => Some(Units::UserSpaceOnUse),
            "objectBoundingBox" => Some(Units::ObjectBoundingBox),
            _ => None,
        }
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for svgtypes::AspectRatio {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        Self::from_str(value).ok()
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for svgtypes::PaintOrder {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        Self::from_str(value).ok()
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for svgtypes::Color {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        Self::from_str(value).ok()
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for svgtypes::Angle {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        Self::from_str(value).ok()
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for svgtypes::EnableBackground {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        Self::from_str(value).ok()
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for svgtypes::Paint<'a> {
    fn parse(_: SvgNode, _: AId, value: &'a str) -> Option<Self> {
        Self::from_str(value).ok()
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for Vec<f32> {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        let mut list = Vec::new();
        for n in svgtypes::NumberListParser::from(value) {
            list.push(n.ok()? as f32);
        }

        Some(list)
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for Vec<svgtypes::Length> {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        let mut list = Vec::new();
        for n in svgtypes::LengthListParser::from(value) {
            list.push(n.ok()?);
        }

        Some(list)
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for Visibility {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        match value {
            "visible" => Some(Visibility::Visible),
            "hidden" => Some(Visibility::Hidden),
            "collapse" => Some(Visibility::Collapse),
            _ => None,
        }
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for SpreadMethod {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        match value {
            "pad" => Some(SpreadMethod::Pad),
            "reflect" => Some(SpreadMethod::Reflect),
            "repeat" => Some(SpreadMethod::Repeat),
            _ => None,
        }
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for ShapeRendering {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        match value {
            "optimizeSpeed" => Some(ShapeRendering::OptimizeSpeed),
            "crispEdges" => Some(ShapeRendering::CrispEdges),
            "auto" | "geometricPrecision" => Some(ShapeRendering::GeometricPrecision),
            _ => None,
        }
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for TextRendering {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        match value {
            "optimizeSpeed" => Some(TextRendering::OptimizeSpeed),
            "auto" | "optimizeLegibility" => Some(TextRendering::OptimizeLegibility),
            "geometricPrecision" => Some(TextRendering::GeometricPrecision),
            _ => None,
        }
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for ImageRendering {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        match value {
            "auto" | "optimizeQuality" => Some(ImageRendering::OptimizeQuality),
            "optimizeSpeed" => Some(ImageRendering::OptimizeSpeed),
            "smooth" => Some(ImageRendering::Smooth),
            "high-quality" => Some(ImageRendering::HighQuality),
            "crisp-edges" => Some(ImageRendering::CrispEdges),
            "pixelated" => Some(ImageRendering::Pixelated),
            _ => None,
        }
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for BlendMode {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        match value {
            "normal" => Some(BlendMode::Normal),
            "multiply" => Some(BlendMode::Multiply),
            "screen" => Some(BlendMode::Screen),
            "overlay" => Some(BlendMode::Overlay),
            "darken" => Some(BlendMode::Darken),
            "lighten" => Some(BlendMode::Lighten),
            "color-dodge" => Some(BlendMode::ColorDodge),
            "color-burn" => Some(BlendMode::ColorBurn),
            "hard-light" => Some(BlendMode::HardLight),
            "soft-light" => Some(BlendMode::SoftLight),
            "difference" => Some(BlendMode::Difference),
            "exclusion" => Some(BlendMode::Exclusion),
            "hue" => Some(BlendMode::Hue),
            "saturation" => Some(BlendMode::Saturation),
            "color" => Some(BlendMode::Color),
            "luminosity" => Some(BlendMode::Luminosity),
            _ => None,
        }
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for SvgNode<'a, 'input> {
    fn parse(node: SvgNode<'a, 'input>, aid: AId, value: &str) -> Option<Self> {
        let id = if aid == AId::Href {
            svgtypes::IRI::from_str(value).ok().map(|v| v.0)
        } else {
            svgtypes::FuncIRI::from_str(value).ok().map(|v| v.0)
        }?;

        node.document().element_by_id(id)
    }
}
