// SPDX-License-Identifier: Apache-2.0 OR MIT

fn write_fill(fill: &Option<Fill>, is_clip_path: bool, opt: &WriteOptions, xml: &mut XmlWriter) {
    if let Some(fill) = fill {
        write_paint(AId::Fill, &fill.paint, opt, xml);

        if fill.opacity != Opacity::ONE {
            xml.write_svg_attribute(AId::FillOpacity, &fill.opacity.get());
        }

        if !fill.rule.is_default() {
            let name = if is_clip_path {
                AId::ClipRule
            } else {
                AId::FillRule
            };

            xml.write_svg_attribute(name, "evenodd");
        }
    } else {
        xml.write_svg_attribute(AId::Fill, "none");
    }
}

fn write_stroke(stroke: &Option<Stroke>, opt: &WriteOptions, xml: &mut XmlWriter) {
    if let Some(stroke) = stroke {
        write_paint(AId::Stroke, &stroke.paint, opt, xml);

        if stroke.opacity != Opacity::ONE {
            xml.write_svg_attribute(AId::StrokeOpacity, &stroke.opacity.get());
        }

        if !stroke.dashoffset.approx_zero_ulps(4) {
            xml.write_svg_attribute(AId::StrokeDashoffset, &stroke.dashoffset);
        }

        if !stroke.miterlimit.is_default() {
            xml.write_svg_attribute(AId::StrokeMiterlimit, &stroke.miterlimit.get());
        }

        if stroke.width.get() != 1.0 {
            xml.write_svg_attribute(AId::StrokeWidth, &stroke.width.get());
        }

        match stroke.linecap {
            LineCap::Butt => {}
            LineCap::Round => xml.write_svg_attribute(AId::StrokeLinecap, "round"),
            LineCap::Square => xml.write_svg_attribute(AId::StrokeLinecap, "square"),
        }

        match stroke.linejoin {
            LineJoin::Miter => {}
            LineJoin::MiterClip => xml.write_svg_attribute(AId::StrokeLinejoin, "miter-clip"),
            LineJoin::Round => xml.write_svg_attribute(AId::StrokeLinejoin, "round"),
            LineJoin::Bevel => xml.write_svg_attribute(AId::StrokeLinejoin, "bevel"),
        }

        if let Some(ref array) = stroke.dasharray {
            xml.write_numbers(AId::StrokeDasharray, array);
        }
    } else {
        // Always set `stroke` to `none` to override the parent value.
        // In 99.9% of the cases it's redundant, but a group with `filter` with `StrokePaint`
        // will set `stroke`, which will interfere with children nodes.
        xml.write_svg_attribute(AId::Stroke, "none");
    }
}

fn write_paint(aid: AId, paint: &Paint, opt: &WriteOptions, xml: &mut XmlWriter) {
    match paint {
        Paint::Color(c) => xml.write_color(aid, *c),
        Paint::LinearGradient(lg) => {
            xml.write_func_iri(aid, lg.id(), opt);
        }
        Paint::RadialGradient(rg) => {
            xml.write_func_iri(aid, rg.id(), opt);
        }
        Paint::Pattern(patt) => {
            xml.write_func_iri(aid, patt.id(), opt);
        }
    }
}

fn write_light_source(light: &filter::LightSource, xml: &mut XmlWriter) {
    match light {
        filter::LightSource::DistantLight(light) => {
            xml.start_svg_element(EId::FeDistantLight);
            xml.write_svg_attribute(AId::Azimuth, &light.azimuth);
            xml.write_svg_attribute(AId::Elevation, &light.elevation);
        }
        filter::LightSource::PointLight(light) => {
            xml.start_svg_element(EId::FePointLight);
            xml.write_svg_attribute(AId::X, &light.x);
            xml.write_svg_attribute(AId::Y, &light.y);
            xml.write_svg_attribute(AId::Z, &light.z);
        }
        filter::LightSource::SpotLight(light) => {
            xml.start_svg_element(EId::FeSpotLight);
            xml.write_svg_attribute(AId::X, &light.x);
            xml.write_svg_attribute(AId::Y, &light.y);
            xml.write_svg_attribute(AId::Z, &light.z);
            xml.write_svg_attribute(AId::PointsAtX, &light.points_at_x);
            xml.write_svg_attribute(AId::PointsAtY, &light.points_at_y);
            xml.write_svg_attribute(AId::PointsAtZ, &light.points_at_z);
            xml.write_svg_attribute(AId::SpecularExponent, &light.specular_exponent);
            if let Some(n) = light.limiting_cone_angle {
                xml.write_svg_attribute(AId::LimitingConeAngle, &n);
            }
        }
    }

    xml.end_element();
}

static POW_VEC: &[f32] = &[
    1.0,
    10.0,
    100.0,
    1_000.0,
    10_000.0,
    100_000.0,
    1_000_000.0,
    10_000_000.0,
    100_000_000.0,
    1_000_000_000.0,
    10_000_000_000.0,
    100_000_000_000.0,
    1_000_000_000_000.0,
];

fn write_num(num: f32, buf: &mut Vec<u8>, precision: u8) {
    // If number is an integer, it's faster to write it as i32.
    if num.fract().approx_zero_ulps(4) {
        write!(buf, "{}", num as i32).unwrap();
        return;
    }

    // Round numbers up to the specified precision to prevent writing
    // ugly numbers like 29.999999999999996.
    // It's not 100% correct, but differences are insignificant.
    //
    // Note that at least in Rust 1.64 the number formatting in debug and release modes
    // can be slightly different. So having a lower precision makes
    // our output and tests reproducible.
    let v = (num * POW_VEC[precision as usize]).round() / POW_VEC[precision as usize];

    write!(buf, "{}", v).unwrap();
}

/// Write all of the tspan attributes except for decorations.
fn write_span(
    is_clip_path: bool,
    opt: &WriteOptions,
    xml: &mut XmlWriter,
    chunk: &TextChunk,
    span: &TextSpan,
) {
    xml.start_svg_element(EId::Tspan);

    let font_family_to_str = |font_family: &FontFamily| match font_family {
        FontFamily::Monospace => "monospace".to_string(),
        FontFamily::Serif => "serif".to_string(),
        FontFamily::SansSerif => "sans-serif".to_string(),
        FontFamily::Cursive => "cursive".to_string(),
        FontFamily::Fantasy => "fantasy".to_string(),
        FontFamily::Named(s) => {
            // Only quote if absolutely necessary
            match parse_font_families(s) {
                Ok(_) => s.clone(),
                Err(_) => {
                    if opt.use_single_quote {
                        format!("\"{}\"", s)
                    } else {
                        format!("'{}'", s)
                    }
                }
            }
        }
    };

    if !span.font.families.is_empty() {
        let families = span
            .font
            .families
            .iter()
            .map(font_family_to_str)
            .collect::<Vec<_>>()
            .join(", ");
        xml.write_svg_attribute(AId::FontFamily, &families);
    }

    match span.font.style {
        FontStyle::Normal => {}
        FontStyle::Italic => xml.write_svg_attribute(AId::FontStyle, "italic"),
        FontStyle::Oblique => xml.write_svg_attribute(AId::FontStyle, "oblique"),
    }

    if span.font.weight != 400 {
        xml.write_svg_attribute(AId::FontWeight, &span.font.weight);
    }

    if span.font.stretch != FontStretch::Normal {
        let name = match span.font.stretch {
            FontStretch::Condensed => "condensed",
            FontStretch::ExtraCondensed => "extra-condensed",
            FontStretch::UltraCondensed => "ultra-condensed",
            FontStretch::SemiCondensed => "semi-condensed",
            FontStretch::Expanded => "expanded",
            FontStretch::SemiExpanded => "semi-expanded",
            FontStretch::ExtraExpanded => "extra-expanded",
            FontStretch::UltraExpanded => "ultra-expanded",
            FontStretch::Normal => unreachable!(),
        };
        xml.write_svg_attribute(AId::FontStretch, name);
    }

    xml.write_svg_attribute(AId::FontSize, &span.font_size);

    xml.write_visibility(span.visible);

    if span.letter_spacing != 0.0 {
        xml.write_svg_attribute(AId::LetterSpacing, &span.letter_spacing);
    }

    if span.word_spacing != 0.0 {
        xml.write_svg_attribute(AId::WordSpacing, &span.word_spacing);
    }

    if let Some(text_length) = span.text_length {
        xml.write_svg_attribute(AId::TextLength, &text_length);
    }

    if span.length_adjust == LengthAdjust::SpacingAndGlyphs {
        xml.write_svg_attribute(AId::LengthAdjust, "spacingAndGlyphs");
    }

    if span.small_caps {
        xml.write_svg_attribute(AId::FontVariant, "small-caps");
    }

    if span.paint_order == PaintOrder::StrokeAndFill {
        xml.write_svg_attribute(AId::PaintOrder, "stroke fill");
    }

    if !span.apply_kerning {
        xml.write_attribute("style", "font-kerning:none");
    }

    if span.dominant_baseline != DominantBaseline::Auto {
        let name = match span.dominant_baseline {
            DominantBaseline::UseScript => "use-script",
            DominantBaseline::NoChange => "no-change",
            DominantBaseline::ResetSize => "reset-size",
            DominantBaseline::TextBeforeEdge => "text-before-edge",
            DominantBaseline::Middle => "middle",
            DominantBaseline::Central => "central",
            DominantBaseline::TextAfterEdge => "text-after-edge",
            DominantBaseline::Ideographic => "ideographic",
            DominantBaseline::Alphabetic => "alphabetic",
            DominantBaseline::Hanging => "hanging",
            DominantBaseline::Mathematical => "mathematical",
            DominantBaseline::Auto => unreachable!(),
        };
        xml.write_svg_attribute(AId::DominantBaseline, name);
    }

    if span.alignment_baseline != AlignmentBaseline::Auto {
        let name = match span.alignment_baseline {
            AlignmentBaseline::Baseline => "baseline",
            AlignmentBaseline::BeforeEdge => "before-edge",
            AlignmentBaseline::TextBeforeEdge => "text-before-edge",
            AlignmentBaseline::Middle => "middle",
            AlignmentBaseline::Central => "central",
            AlignmentBaseline::AfterEdge => "after-edge",
            AlignmentBaseline::TextAfterEdge => "text-after-edge",
            AlignmentBaseline::Ideographic => "ideographic",
            AlignmentBaseline::Alphabetic => "alphabetic",
            AlignmentBaseline::Hanging => "hanging",
            AlignmentBaseline::Mathematical => "mathematical",
            AlignmentBaseline::Auto => unreachable!(),
        };
        xml.write_svg_attribute(AId::AlignmentBaseline, name);
    }

    write_fill(&span.fill, is_clip_path, opt, xml);
    write_stroke(&span.stroke, opt, xml);

    for baseline_shift in &span.baseline_shift {
        xml.start_svg_element(EId::Tspan);
        match baseline_shift {
            BaselineShift::Baseline => {}
            BaselineShift::Number(num) => xml.write_svg_attribute(AId::BaselineShift, num),
            BaselineShift::Subscript => xml.write_svg_attribute(AId::BaselineShift, "sub"),
            BaselineShift::Superscript => xml.write_svg_attribute(AId::BaselineShift, "super"),
        }
    }

    let cur_text = &chunk.text[span.start..span.end];

    xml.write_text(&cur_text.replace('&', "&amp;"));

    // End for each tspan we needed to create for baseline_shift
    for _ in &span.baseline_shift {
        xml.end_element();
    }

    xml.end_element();
}
