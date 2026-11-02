// SPDX-License-Identifier: Apache-2.0 OR MIT

trait XmlWriterExt {
    fn start_svg_element(&mut self, id: EId);
    fn write_svg_attribute<V: Display + ?Sized>(&mut self, id: AId, value: &V);
    fn write_id_attribute(&mut self, id: &str, opt: &WriteOptions);
    fn write_color(&mut self, id: AId, color: Color);
    fn write_units(&mut self, id: AId, units: Units, def: Units);
    fn write_transform(&mut self, id: AId, units: Transform, opt: &WriteOptions);
    fn write_visibility(&mut self, value: bool);
    fn write_func_iri(&mut self, aid: AId, id: &str, opt: &WriteOptions);
    fn write_rect_attrs(&mut self, r: NonZeroRect);
    fn write_numbers(&mut self, aid: AId, list: &[f32]);
    fn write_image_data(&mut self, kind: &ImageKind);
    fn write_filter_input(&mut self, id: AId, input: &filter::Input);
    fn write_filter_primitive_attrs(&mut self, parent_rect: NonZeroRect, fe: &filter::Primitive);
    fn write_filter_transfer_function(&mut self, eid: EId, fe: &filter::TransferFunction);
}

impl XmlWriterExt for XmlWriter {
    #[inline(never)]
    fn start_svg_element(&mut self, id: EId) {
        self.start_element(id.to_str());
    }

    #[inline(never)]
    fn write_svg_attribute<V: Display + ?Sized>(&mut self, id: AId, value: &V) {
        self.write_attribute(id.to_str(), value);
    }

    #[inline(never)]
    fn write_id_attribute(&mut self, id: &str, opt: &WriteOptions) {
        debug_assert!(!id.is_empty());

        if let Some(ref prefix) = opt.id_prefix {
            let full_id = format!("{}{}", prefix, id);
            self.write_attribute("id", &full_id);
        } else {
            self.write_attribute("id", id);
        }
    }

    #[inline(never)]
    fn write_color(&mut self, id: AId, c: Color) {
        static CHARS: &[u8] = b"0123456789abcdef";

        #[inline]
        fn int2hex(n: u8) -> (u8, u8) {
            (CHARS[(n >> 4) as usize], CHARS[(n & 0xf) as usize])
        }

        let (r1, r2) = int2hex(c.red);
        let (g1, g2) = int2hex(c.green);
        let (b1, b2) = int2hex(c.blue);

        self.write_attribute_raw(id.to_str(), |buf| {
            buf.extend_from_slice(&[b'#', r1, r2, g1, g2, b1, b2]);
        });
    }

    fn write_units(&mut self, id: AId, units: Units, def: Units) {
        if units != def {
            self.write_attribute(id.to_str(), &units);
        }
    }

    fn write_transform(&mut self, id: AId, ts: Transform, opt: &WriteOptions) {
        if !ts.is_default() {
            self.write_attribute_raw(id.to_str(), |buf| {
                buf.extend_from_slice(b"matrix(");
                write_num(ts.sx, buf, opt.transforms_precision);
                buf.push(b' ');
                write_num(ts.ky, buf, opt.transforms_precision);
                buf.push(b' ');
                write_num(ts.kx, buf, opt.transforms_precision);
                buf.push(b' ');
                write_num(ts.sy, buf, opt.transforms_precision);
                buf.push(b' ');
                write_num(ts.tx, buf, opt.transforms_precision);
                buf.push(b' ');
                write_num(ts.ty, buf, opt.transforms_precision);
                buf.extend_from_slice(b")");
            });
        }
    }

    fn write_visibility(&mut self, value: bool) {
        if !value {
            self.write_attribute(AId::Visibility.to_str(), "hidden");
        }
    }

    fn write_func_iri(&mut self, aid: AId, id: &str, opt: &WriteOptions) {
        debug_assert!(!id.is_empty());
        let prefix = opt.id_prefix.as_deref().unwrap_or_default();
        self.write_attribute_fmt(aid.to_str(), format_args!("url(#{}{})", prefix, id));
    }

    fn write_rect_attrs(&mut self, r: NonZeroRect) {
        self.write_svg_attribute(AId::X, &r.x());
        self.write_svg_attribute(AId::Y, &r.y());
        self.write_svg_attribute(AId::Width, &r.width());
        self.write_svg_attribute(AId::Height, &r.height());
    }

    fn write_numbers(&mut self, aid: AId, list: &[f32]) {
        self.write_attribute_raw(aid.to_str(), |buf| {
            for n in list {
                buf.write_fmt(format_args!("{} ", n)).unwrap();
            }

            if !list.is_empty() {
                buf.pop();
            }
        });
    }

    fn write_filter_input(&mut self, id: AId, input: &filter::Input) {
        self.write_attribute(
            id.to_str(),
            match input {
                filter::Input::SourceGraphic => "SourceGraphic",
                filter::Input::SourceAlpha => "SourceAlpha",
                filter::Input::Reference(s) => s,
            },
        );
    }

    fn write_filter_primitive_attrs(&mut self, parent_rect: NonZeroRect, fe: &filter::Primitive) {
        if parent_rect.x() != fe.rect().x() {
            self.write_svg_attribute(AId::X, &fe.rect().x());
        }
        if parent_rect.y() != fe.rect().y() {
            self.write_svg_attribute(AId::Y, &fe.rect().y());
        }
        if parent_rect.width() != fe.rect().width() {
            self.write_svg_attribute(AId::Width, &fe.rect().width());
        }
        if parent_rect.height() != fe.rect().height() {
            self.write_svg_attribute(AId::Height, &fe.rect().height());
        }

        self.write_attribute(
            AId::ColorInterpolationFilters.to_str(),
            match fe.color_interpolation {
                filter::ColorInterpolation::SRGB => "sRGB",
                filter::ColorInterpolation::LinearRGB => "linearRGB",
            },
        );
    }

    fn write_filter_transfer_function(&mut self, eid: EId, fe: &filter::TransferFunction) {
        self.start_svg_element(eid);

        match fe {
            filter::TransferFunction::Identity => {
                self.write_svg_attribute(AId::Type, "identity");
            }
            filter::TransferFunction::Table(values) => {
                self.write_svg_attribute(AId::Type, "table");
                self.write_numbers(AId::TableValues, values);
            }
            filter::TransferFunction::Discrete(values) => {
                self.write_svg_attribute(AId::Type, "discrete");
                self.write_numbers(AId::TableValues, values);
            }
            filter::TransferFunction::Linear { slope, intercept } => {
                self.write_svg_attribute(AId::Type, "linear");
                self.write_svg_attribute(AId::Slope, &slope);
                self.write_svg_attribute(AId::Intercept, &intercept);
            }
            filter::TransferFunction::Gamma {
                amplitude,
                exponent,
                offset,
            } => {
                self.write_svg_attribute(AId::Type, "gamma");
                self.write_svg_attribute(AId::Amplitude, &amplitude);
                self.write_svg_attribute(AId::Exponent, &exponent);
                self.write_svg_attribute(AId::Offset, &offset);
            }
        }

        self.end_element();
    }

    fn write_image_data(&mut self, kind: &ImageKind) {
        let svg_string;
        let (mime, data) = match kind {
            ImageKind::JPEG(data) => ("jpeg", data.as_slice()),
            ImageKind::PNG(data) => ("png", data.as_slice()),
            ImageKind::GIF(data) => ("gif", data.as_slice()),
            ImageKind::WEBP(data) => ("webp", data.as_slice()),
            ImageKind::SVG(tree) => {
                svg_string = tree.to_string(&WriteOptions::default());
                ("svg+xml", svg_string.as_bytes())
            }
        };

        self.write_attribute_raw("xlink:href", |buf| {
            buf.extend_from_slice(b"data:image/");
            buf.extend_from_slice(mime.as_bytes());
            buf.extend_from_slice(b";base64, ");

            let mut enc =
                base64::write::EncoderWriter::new(buf, &base64::engine::general_purpose::STANDARD);
            enc.write_all(data).unwrap();
            enc.finish().unwrap();
        });
    }
}

fn has_xlink(parent: &Group) -> bool {
    for node in &parent.children {
        match node {
            Node::Group(g) => {
                for filter in &g.filters {
                    if filter
                        .primitives
                        .iter()
                        .any(|p| matches!(p.kind, filter::Kind::Image(_)))
                    {
                        return true;
                    }
                }

                if let Some(mask) = &g.mask {
                    if has_xlink(mask.root()) {
                        return true;
                    }

                    if let Some(sub_mask) = &mask.mask {
                        if has_xlink(&sub_mask.root) {
                            return true;
                        }
                    }
                }

                if has_xlink(g) {
                    return true;
                }
            }
            Node::Image(_) => {
                return true;
            }
            Node::Text(text) => {
                if text
                    .chunks
                    .iter()
                    .any(|t| matches!(t.text_flow, TextFlow::Path(_)))
                {
                    return true;
                }
            }
            _ => {}
        }

        let mut present = false;
        node.subroots(|root| present |= has_xlink(root));
        if present {
            return true;
        }
    }

    false
}

fn write_base_grad(g: &BaseGradient, opt: &WriteOptions, xml: &mut XmlWriter) {
    xml.write_units(AId::GradientUnits, g.units, Units::ObjectBoundingBox);
    xml.write_transform(AId::GradientTransform, g.transform, opt);

    match g.spread_method {
        SpreadMethod::Pad => {}
        SpreadMethod::Reflect => xml.write_svg_attribute(AId::SpreadMethod, "reflect"),
        SpreadMethod::Repeat => xml.write_svg_attribute(AId::SpreadMethod, "repeat"),
    }

    for s in &g.stops {
        xml.start_svg_element(EId::Stop);
        xml.write_svg_attribute(AId::Offset, &s.offset.get());
        xml.write_color(AId::StopColor, s.color);
        if s.opacity != Opacity::ONE {
            xml.write_svg_attribute(AId::StopOpacity, &s.opacity.get());
        }

        xml.end_element();
    }
}

fn write_path(
    path: &Path,
    is_clip_path: bool,
    path_transform: Transform,
    clip_path: Option<&str>,
    opt: &WriteOptions,
    xml: &mut XmlWriter,
) {
    xml.start_svg_element(EId::Path);
    if !path.id.is_empty() {
        xml.write_id_attribute(&path.id, opt);
    }

    write_fill(&path.fill, is_clip_path, opt, xml);
    write_stroke(&path.stroke, opt, xml);

    xml.write_visibility(path.visible);

    if path.paint_order == PaintOrder::StrokeAndFill {
        xml.write_svg_attribute(AId::PaintOrder, "stroke");
    }

    match path.rendering_mode {
        ShapeRendering::OptimizeSpeed => {
            xml.write_svg_attribute(AId::ShapeRendering, "optimizeSpeed");
        }
        ShapeRendering::CrispEdges => xml.write_svg_attribute(AId::ShapeRendering, "crispEdges"),
        ShapeRendering::GeometricPrecision => {}
    }

    if let Some(id) = clip_path {
        xml.write_func_iri(AId::ClipPath, id, opt);
    }

    xml.write_transform(AId::Transform, path_transform, opt);

    xml.write_attribute_raw("d", |buf| {
        use tiny_skia_path::PathSegment;

        for seg in path.data.segments() {
            match seg {
                PathSegment::MoveTo(p) => {
                    buf.extend_from_slice(b"M ");
                    write_num(p.x, buf, opt.coordinates_precision);
                    buf.push(b' ');
                    write_num(p.y, buf, opt.coordinates_precision);
                    buf.push(b' ');
                }
                PathSegment::LineTo(p) => {
                    buf.extend_from_slice(b"L ");
                    write_num(p.x, buf, opt.coordinates_precision);
                    buf.push(b' ');
                    write_num(p.y, buf, opt.coordinates_precision);
                    buf.push(b' ');
                }
                PathSegment::QuadTo(p1, p) => {
                    buf.extend_from_slice(b"Q ");
                    write_num(p1.x, buf, opt.coordinates_precision);
                    buf.push(b' ');
                    write_num(p1.y, buf, opt.coordinates_precision);
                    buf.push(b' ');
                    write_num(p.x, buf, opt.coordinates_precision);
                    buf.push(b' ');
                    write_num(p.y, buf, opt.coordinates_precision);
                    buf.push(b' ');
                }
                PathSegment::CubicTo(p1, p2, p) => {
                    buf.extend_from_slice(b"C ");
                    write_num(p1.x, buf, opt.coordinates_precision);
                    buf.push(b' ');
                    write_num(p1.y, buf, opt.coordinates_precision);
                    buf.push(b' ');
                    write_num(p2.x, buf, opt.coordinates_precision);
                    buf.push(b' ');
                    write_num(p2.y, buf, opt.coordinates_precision);
                    buf.push(b' ');
                    write_num(p.x, buf, opt.coordinates_precision);
                    buf.push(b' ');
                    write_num(p.y, buf, opt.coordinates_precision);
                    buf.push(b' ');
                }
                PathSegment::Close => {
                    buf.extend_from_slice(b"Z ");
                }
            }
        }

        buf.pop();
    });

    xml.end_element();
}

