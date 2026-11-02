// SPDX-License-Identifier: Apache-2.0 OR MIT

fn write_defs(tree: &Tree, opt: &WriteOptions, xml: &mut XmlWriter, write_text_paths: bool) {
    xml.start_svg_element(EId::Defs);
    for lg in tree.linear_gradients() {
        xml.start_svg_element(EId::LinearGradient);
        xml.write_id_attribute(lg.id(), opt);
        xml.write_svg_attribute(AId::X1, &lg.x1);
        xml.write_svg_attribute(AId::Y1, &lg.y1);
        xml.write_svg_attribute(AId::X2, &lg.x2);
        xml.write_svg_attribute(AId::Y2, &lg.y2);
        write_base_grad(&lg.base, opt, xml);
        xml.end_element();
    }

    for rg in tree.radial_gradients() {
        xml.start_svg_element(EId::RadialGradient);
        xml.write_id_attribute(rg.id(), opt);
        xml.write_svg_attribute(AId::Cx, &rg.cx);
        xml.write_svg_attribute(AId::Cy, &rg.cy);
        xml.write_svg_attribute(AId::R, &rg.r.get());
        xml.write_svg_attribute(AId::Fx, &rg.fx);
        xml.write_svg_attribute(AId::Fy, &rg.fy);
        write_base_grad(&rg.base, opt, xml);
        xml.end_element();
    }

    for pattern in tree.patterns() {
        xml.start_svg_element(EId::Pattern);
        xml.write_id_attribute(pattern.id(), opt);
        xml.write_rect_attrs(pattern.rect);
        xml.write_units(AId::PatternUnits, pattern.units, Units::ObjectBoundingBox);
        xml.write_units(
            AId::PatternContentUnits,
            pattern.content_units,
            Units::UserSpaceOnUse,
        );
        xml.write_transform(AId::PatternTransform, pattern.transform, opt);

        write_elements(&pattern.root, false, opt, xml);

        xml.end_element();
    }

    if write_text_paths {
        write_text_path_paths(&tree.root, opt, xml);
    }

    write_filters(tree, opt, xml);

    for clip in tree.clip_paths() {
        xml.start_svg_element(EId::ClipPath);
        xml.write_id_attribute(clip.id(), opt);
        xml.write_transform(AId::Transform, clip.transform, opt);

        if let Some(ref clip) = clip.clip_path {
            xml.write_func_iri(AId::ClipPath, clip.id(), opt);
        }

        write_elements(&clip.root, true, opt, xml);

        xml.end_element();
    }

    for mask in tree.masks() {
        xml.start_svg_element(EId::Mask);
        xml.write_id_attribute(mask.id(), opt);
        if mask.kind == MaskType::Alpha {
            xml.write_svg_attribute(AId::MaskType, "alpha");
        }
        xml.write_units(
            AId::MaskUnits,
            Units::UserSpaceOnUse,
            Units::ObjectBoundingBox,
        );
        xml.write_rect_attrs(mask.rect);

        if let Some(ref mask) = mask.mask {
            xml.write_func_iri(AId::Mask, mask.id(), opt);
        }

        write_elements(&mask.root, false, opt, xml);

        xml.end_element();
    }
    xml.end_element(); // end EId::Defs
}

fn has_text_paths(parent: &Group) -> bool {
    for node in &parent.children {
        if let Node::Group(group) = node {
            if has_text_paths(group) {
                return true;
            }
        } else if let Node::Text(text) = node {
            for chunk in &text.chunks {
                if let TextFlow::Path(text_path) = &chunk.text_flow {
                    let path = Path::new(
                        text_path.id().to_string(),
                        true,
                        None,
                        None,
                        PaintOrder::default(),
                        ShapeRendering::default(),
                        text_path.path.clone(),
                        Transform::default(),
                    );
                    if path.is_some() {
                        return true;
                    }
                }
            }
        }
        let mut need_path = false;
        node.subroots(|subroot| {
            if !need_path && has_text_paths(subroot) {
                need_path = true;
            }
        });
        if need_path {
            return true;
        }
    }
    false
}

/// Write the `path` elements for text paths.
fn write_text_path_paths(parent: &Group, opt: &WriteOptions, xml: &mut XmlWriter) {
    for node in &parent.children {
        if let Node::Group(group) = node {
            write_text_path_paths(group, opt, xml);
        } else if let Node::Text(text) = node {
            for chunk in &text.chunks {
                if let TextFlow::Path(text_path) = &chunk.text_flow {
                    let path = Path::new(
                        text_path.id().to_string(),
                        true,
                        None,
                        None,
                        PaintOrder::default(),
                        ShapeRendering::default(),
                        text_path.path.clone(),
                        Transform::default(),
                    );
                    if let Some(path) = &path {
                        write_path(path, false, Transform::default(), None, opt, xml);
                    }
                }
            }
        }

        node.subroots(|subroot| write_text_path_paths(subroot, opt, xml));
    }
}

fn write_elements(parent: &Group, is_clip_path: bool, opt: &WriteOptions, xml: &mut XmlWriter) {
    for n in &parent.children {
        write_element(n, is_clip_path, opt, xml);
    }
}

fn write_element(node: &Node, is_clip_path: bool, opt: &WriteOptions, xml: &mut XmlWriter) {
    match node {
        Node::Path(p) => {
            write_path(p, is_clip_path, Transform::default(), None, opt, xml);
        }
        Node::Image(img) => {
            xml.start_svg_element(EId::Image);
            if !img.id.is_empty() {
                xml.write_id_attribute(&img.id, opt);
            }

            xml.write_svg_attribute(AId::Width, &img.size().width());
            xml.write_svg_attribute(AId::Height, &img.size().height());

            xml.write_visibility(img.visible);

            match img.rendering_mode {
                ImageRendering::OptimizeQuality => {}
                ImageRendering::OptimizeSpeed => {
                    xml.write_svg_attribute(AId::ImageRendering, "optimizeSpeed");
                }
                ImageRendering::Smooth => {
                    xml.write_attribute(AId::Style.to_str(), "image-rendering:smooth");
                }
                ImageRendering::HighQuality => {
                    xml.write_attribute(AId::Style.to_str(), "image-rendering:high-quality");
                }
                ImageRendering::CrispEdges => {
                    xml.write_attribute(AId::Style.to_str(), "image-rendering:crisp-edges");
                }
                ImageRendering::Pixelated => {
                    xml.write_attribute(AId::Style.to_str(), "image-rendering:pixelated");
                }
            }

            xml.write_image_data(&img.kind);

            xml.end_element();
        }
        Node::Group(g) => {
            write_group_element(g, is_clip_path, opt, xml);
        }
        Node::Text(text) => {
            if opt.preserve_text {
                xml.start_svg_element(EId::Text);

                if !text.id.is_empty() {
                    xml.write_id_attribute(&text.id, opt);
                }

                xml.write_attribute("xml:space", "preserve");

                match text.writing_mode {
                    WritingMode::LeftToRight => {}
                    WritingMode::TopToBottom => xml.write_svg_attribute(AId::WritingMode, "tb"),
                }

                match text.rendering_mode {
                    TextRendering::OptimizeSpeed => {
                        xml.write_svg_attribute(AId::TextRendering, "optimizeSpeed");
                    }
                    TextRendering::GeometricPrecision => {
                        xml.write_svg_attribute(AId::TextRendering, "geometricPrecision");
                    }
                    TextRendering::OptimizeLegibility => {}
                }

                if text.rotate.iter().any(|r| *r != 0.0) {
                    xml.write_numbers(AId::Rotate, &text.rotate);
                }

                if text.dx.iter().any(|dx| *dx != 0.0) {
                    xml.write_numbers(AId::Dx, &text.dx);
                }

                if text.dy.iter().any(|dy| *dy != 0.0) {
                    xml.write_numbers(AId::Dy, &text.dy);
                }

                xml.set_preserve_whitespaces(true);

                for chunk in &text.chunks {
                    if let TextFlow::Path(text_path) = &chunk.text_flow {
                        xml.start_svg_element(EId::TextPath);

                        let prefix = opt.id_prefix.as_deref().unwrap_or_default();
                        xml.write_attribute_fmt(
                            "xlink:href",
                            format_args!("#{}{}", prefix, text_path.id()),
                        );

                        if text_path.start_offset != 0.0 {
                            xml.write_svg_attribute(AId::StartOffset, &text_path.start_offset);
                        }
                    }

                    xml.start_svg_element(EId::Tspan);

                    if let Some(x) = chunk.x {
                        xml.write_svg_attribute(AId::X, &x);
                    }

                    if let Some(y) = chunk.y {
                        xml.write_svg_attribute(AId::Y, &y);
                    }

                    match chunk.anchor {
                        TextAnchor::Start => {}
                        TextAnchor::Middle => xml.write_svg_attribute(AId::TextAnchor, "middle"),
                        TextAnchor::End => xml.write_svg_attribute(AId::TextAnchor, "end"),
                    }

                    for span in &chunk.spans {
                        let decorations: Vec<_> = [
                            ("underline", &span.decoration.underline),
                            ("line-through", &span.decoration.line_through),
                            ("overline", &span.decoration.overline),
                        ]
                        .iter()
                        .filter_map(|&(key, option_value)| {
                            option_value.as_ref().map(|value| (key, value))
                        })
                        .collect();

                        // Decorations need to be dumped BEFORE we write the actual span data
                        // (so that for example stroke color of span doesn't affect the text
                        // itself while baseline shifts need to be written after (since they are
                        // affected by the font size)
                        for (deco_name, deco) in &decorations {
                            xml.start_svg_element(EId::Tspan);
                            xml.write_svg_attribute(AId::TextDecoration, deco_name);
                            write_fill(&deco.fill, false, opt, xml);
                            write_stroke(&deco.stroke, opt, xml);
                        }

                        write_span(is_clip_path, opt, xml, chunk, span);

                        // End for each tspan we needed to create for decorations
                        for _ in &decorations {
                            xml.end_element();
                        }
                    }
                    xml.end_element();

                    // End textPath element
                    if matches!(&chunk.text_flow, TextFlow::Path(_)) {
                        xml.end_element();
                    }
                }

                xml.end_element();
                xml.set_preserve_whitespaces(false);
            } else {
                write_group_element(text.flattened(), is_clip_path, opt, xml);
            }
        }
    }
}

fn write_group_element(g: &Group, is_clip_path: bool, opt: &WriteOptions, xml: &mut XmlWriter) {
    if is_clip_path {
        // The `clipPath` element in SVG doesn't allow groups, only shapes and text.
        // The problem is that in `usvg` we can set a `clip-path` only on groups.
        // So in cases when a `clipPath` child has a `clip-path` as well,
        // it would be inside a group. And we have to skip this group during writing.
        //
        // Basically, the following SVG:
        //
        // <clipPath id="clip">
        //   <path clip-path="url(#clip-nested)"/>
        // </clipPath>
        //
        // will be represented in usvg as:
        //
        // <clipPath id="clip">
        //   <g clip-path="url(#clip-nested)">
        //      <path/>
        //   </g>
        // </clipPath>
        //
        //
        // Same with text. Text elements will be converted into groups,
        // but only the group's children should be written.
        for child in &g.children {
            match child {
                Node::Group(child_group) => {
                    write_group_element(child_group, is_clip_path, opt, xml);
                }
                Node::Path(child_path) => {
                    let clip_id = g.clip_path.as_ref().map(|cp| cp.id().to_string());
                    write_path(
                        child_path,
                        is_clip_path,
                        g.transform,
                        clip_id.as_deref(),
                        opt,
                        xml,
                    );
                }
                _ => {}
            }
        }
        return;
    }

    xml.start_svg_element(EId::G);
    if !g.id.is_empty() {
        xml.write_id_attribute(&g.id, opt);
    };

    if let Some(ref clip) = g.clip_path {
        xml.write_func_iri(AId::ClipPath, clip.id(), opt);
    }

    if let Some(ref mask) = g.mask {
        xml.write_func_iri(AId::Mask, mask.id(), opt);
    }

    if !g.filters.is_empty() {
        let prefix = opt.id_prefix.as_deref().unwrap_or_default();
        let ids: Vec<_> = g
            .filters
            .iter()
            .map(|filter| format!("url(#{}{})", prefix, filter.id()))
            .collect();
        xml.write_svg_attribute(AId::Filter, &ids.join(" "));
    }

    if g.opacity != Opacity::ONE {
        xml.write_svg_attribute(AId::Opacity, &g.opacity.get());
    }

    xml.write_transform(AId::Transform, g.transform, opt);

    if g.blend_mode != BlendMode::Normal || g.isolate {
        // For reasons unknown, `mix-blend-mode` and `isolation` must be written
        // as `style` attribute.
        let isolation = if g.isolate { "isolate" } else { "auto" };
        xml.write_attribute_fmt(
            AId::Style.to_str(),
            format_args!("mix-blend-mode:{};isolation:{}", g.blend_mode, isolation),
        );
    }

    write_elements(g, false, opt, xml);

    xml.end_element();
}

