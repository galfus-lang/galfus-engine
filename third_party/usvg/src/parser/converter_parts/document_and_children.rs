// SPDX-License-Identifier: Apache-2.0 OR MIT

fn background_path(background_color: svgtypes::Color, area: Rect) -> Option<Path> {
    let path = PathBuilder::from_rect(area);

    let fill = Fill {
        paint: Paint::Color(Color::new_rgb(
            background_color.red,
            background_color.green,
            background_color.blue,
        )),
        opacity: NormalizedF32::new(background_color.alpha as f32 / 255.0)?,
        ..Default::default()
    };

    let mut path = Path::new_simple(Arc::new(path))?;
    path.fill = Some(fill);

    Some(path)
}

fn resolve_svg_size(svg: &SvgNode, opt: &Options) -> (Result<Size, Error>, bool) {
    let mut state = State {
        parent_clip_path: None,
        context_element: None,
        parent_markers: Vec::new(),
        fe_image_link: false,
        view_box: NonZeroRect::from_xywh(0.0, 0.0, 100.0, 100.0).unwrap(),
        use_size: (None, None),
        opt,
    };

    let def = Length::new(100.0, Unit::Percent);
    let mut width: Length = svg.attribute(AId::Width).unwrap_or(def);
    let mut height: Length = svg.attribute(AId::Height).unwrap_or(def);

    let view_box = svg.parse_viewbox();

    let restore_viewbox =
        if (width.unit == Unit::Percent || height.unit == Unit::Percent) && view_box.is_none() {
            // Apply the percentages to the fallback size.
            if width.unit == Unit::Percent {
                width = Length::new(
                    (width.number / 100.0) * state.opt.default_size.width() as f64,
                    Unit::None,
                );
            }

            if height.unit == Unit::Percent {
                height = Length::new(
                    (height.number / 100.0) * state.opt.default_size.height() as f64,
                    Unit::None,
                );
            }

            true
        } else {
            false
        };

    let size = if let Some(vbox) = view_box {
        state.view_box = vbox;

        let w = if width.unit == Unit::Percent {
            vbox.width() * (width.number as f32 / 100.0)
        } else {
            svg.convert_user_length(AId::Width, &state, def)
        };

        let h = if height.unit == Unit::Percent {
            vbox.height() * (height.number as f32 / 100.0)
        } else {
            svg.convert_user_length(AId::Height, &state, def)
        };

        // If exactly one of width and height is specified, compute the missing
        // dimension from the specified one and the viewBox aspect ratio.
        match (
            svg.attribute::<Length>(AId::Width),
            svg.attribute::<Length>(AId::Height),
        ) {
            (Some(_), None) => Size::from_wh(w, vbox.height() * w / vbox.width()),
            (None, Some(_)) => Size::from_wh(vbox.width() * h / vbox.height(), h),
            (_, _) => Size::from_wh(w, h),
        }
    } else {
        Size::from_wh(
            svg.convert_user_length(AId::Width, &state, def),
            svg.convert_user_length(AId::Height, &state, def),
        )
    };

    (size.ok_or(Error::InvalidSize), restore_viewbox)
}

/// Calculates SVG's size and viewBox in case there were not set.
///
/// Simply iterates over all nodes and calculates a bounding box.
fn calculate_svg_bbox(tree: &mut Tree) {
    let bbox = tree.root.abs_bounding_box();
    if let Some(size) = Size::from_wh(bbox.right(), bbox.bottom()) {
        tree.size = size;
    }
}

#[inline(never)]
pub(crate) fn convert_children(
    parent_node: SvgNode,
    state: &State,
    cache: &mut Cache,
    parent: &mut Group,
) {
    for node in parent_node.children() {
        convert_element(node, state, cache, parent);
    }
}

#[inline(never)]
pub(crate) fn convert_element(node: SvgNode, state: &State, cache: &mut Cache, parent: &mut Group) {
    let tag_name = match node.tag_name() {
        Some(v) => v,
        None => return,
    };

    if !tag_name.is_graphic() && !matches!(tag_name, EId::G | EId::Switch | EId::Svg) {
        return;
    }

    if !node.is_visible_element(state.opt) {
        return;
    }

    if tag_name == EId::Use {
        super::use_node::convert(node, state, cache, parent);
        return;
    }

    if tag_name == EId::Switch {
        super::switch::convert(node, state, cache, parent);
        return;
    }

    // A nested `svg` is handled just like `use`: it must not be wrapped in an
    // additional `convert_group`, otherwise its `transform` (and other group
    // properties) would be applied twice, since `convert_svg`
    // already creates its own group. The outermost `svg` (no parent element)
    // is intentionally not handled here - it's processed directly in
    // `convert_doc`.
    if tag_name == EId::Svg && node.parent_element().is_some() {
        super::use_node::convert_svg(node, state, cache, parent);

        return;
    }

    if let Some(g) = convert_group(node, state, false, cache, parent, &|cache, g| {
        convert_element_impl(tag_name, node, state, cache, g);
    }) {
        parent.children.push(Node::Group(Box::new(g)));
    }
}

#[inline(never)]
fn convert_element_impl(
    tag_name: EId,
    node: SvgNode,
    state: &State,
    cache: &mut Cache,
    parent: &mut Group,
) {
    match tag_name {
        EId::Rect
        | EId::Circle
        | EId::Ellipse
        | EId::Line
        | EId::Polyline
        | EId::Polygon
        | EId::Path => {
            if let Some(path) = super::shapes::convert(node, state) {
                convert_path(node, path, state, cache, parent);
            }
        }
        EId::Image => {
            super::image::convert(node, state, cache, parent);
        }
        EId::Text => {
            #[cfg(feature = "text")]
            {
                super::text::convert(node, state, cache, parent);
            }
        }
        EId::Svg => {
            // Only the outermost `svg` reaches this point; nested `svg` elements are
            // handled earlier in `convert_element`. The root `svg` itself is
            // skipped and only its children are converted.
            convert_children(node, state, cache, parent);
        }
        EId::G => {
            convert_children(node, state, cache, parent);
        }
        _ => {}
    }
}

// `clipPath` can have only shape and `text` children.
//
// `line` doesn't impact rendering because stroke is always disabled
// for `clipPath` children.
#[inline(never)]
pub(crate) fn convert_clip_path_elements(
    clip_node: SvgNode,
    state: &State,
    cache: &mut Cache,
    parent: &mut Group,
) {
    for node in clip_node.children() {
        let tag_name = match node.tag_name() {
            Some(v) => v,
            None => continue,
        };

        if !tag_name.is_graphic() {
            continue;
        }

        if !node.is_visible_element(state.opt) {
            continue;
        }

        if tag_name == EId::Use {
            super::use_node::convert(node, state, cache, parent);
            continue;
        }

        if let Some(g) = convert_group(node, state, false, cache, parent, &|cache, g| {
            convert_clip_path_elements_impl(tag_name, node, state, cache, g);
        }) {
            parent.children.push(Node::Group(Box::new(g)));
        }
    }
}

#[inline(never)]
fn convert_clip_path_elements_impl(
    tag_name: EId,
    node: SvgNode,
    state: &State,
    cache: &mut Cache,
    parent: &mut Group,
) {
    match tag_name {
        EId::Rect | EId::Circle | EId::Ellipse | EId::Polyline | EId::Polygon | EId::Path => {
            if let Some(path) = super::shapes::convert(node, state) {
                convert_path(node, path, state, cache, parent);
            }
        }
        EId::Text => {
            #[cfg(feature = "text")]
            {
                super::text::convert(node, state, cache, parent);
            }
        }
        _ => {
            log::warn!("'{}' is no a valid 'clip-path' child.", tag_name);
        }
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Isolation {
    Auto,
    Isolate,
}

impl Default for Isolation {
    fn default() -> Self {
        Self::Auto
    }
}

impl<'a, 'input: 'a> FromValue<'a, 'input> for Isolation {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        match value {
            "auto" => Some(Isolation::Auto),
            "isolate" => Some(Isolation::Isolate),
            _ => None,
        }
    }
}

// TODO: explain
pub(crate) fn convert_group(
    node: SvgNode,
    state: &State,
    force: bool,
    cache: &mut Cache,
    parent: &mut Group,
    collect_children: &dyn Fn(&mut Cache, &mut Group),
) -> Option<Group> {
    // A `clipPath` child cannot have an opacity.
    let opacity = if state.parent_clip_path.is_none() {
        node.attribute::<Opacity>(AId::Opacity)
            .unwrap_or(Opacity::ONE)
    } else {
        Opacity::ONE
    };

    let transform = node.resolve_transform(AId::Transform, state);
    let blend_mode: BlendMode = node.attribute(AId::MixBlendMode).unwrap_or_default();
    let isolation: Isolation = node.attribute(AId::Isolation).unwrap_or_default();
    let isolate = isolation == Isolation::Isolate;

    // Nodes generated by markers must not have an ID. Otherwise we would have duplicates.
    let is_g_or_use = matches!(node.tag_name(), Some(EId::G) | Some(EId::Use));
    let id = if is_g_or_use && state.parent_markers.is_empty() {
        node.element_id().to_string()
    } else {
        String::new()
    };

    let abs_transform = parent.abs_transform.pre_concat(transform);
    let dummy = Rect::from_xywh(0.0, 0.0, 0.0, 0.0).unwrap();
    let mut g = Group {
        id,
        transform,
        abs_transform,
        opacity,
        blend_mode,
        isolate,
        clip_path: None,
        mask: None,
        filters: Vec::new(),
        is_context_element: false,
        bounding_box: dummy,
        abs_bounding_box: dummy,
        stroke_bounding_box: dummy,
        abs_stroke_bounding_box: dummy,
        layer_bounding_box: NonZeroRect::from_xywh(0.0, 0.0, 1.0, 1.0).unwrap(),
        abs_layer_bounding_box: NonZeroRect::from_xywh(0.0, 0.0, 1.0, 1.0).unwrap(),
        children: Vec::new(),
    };
    collect_children(cache, &mut g);

    // We need to know group's bounding box before converting
    // clipPaths, masks and filters.
    let object_bbox = g.calculate_object_bbox();

    // `mask` and `filter` cannot be set on `clipPath` children.
    // But `clip-path` can.

    let mut clip_path = None;
    if let Some(link) = node.attribute::<SvgNode>(AId::ClipPath) {
        clip_path = super::clippath::convert(link, state, object_bbox, cache);
        if clip_path.is_none() {
            return None;
        }
    }

    let mut mask = None;
    if state.parent_clip_path.is_none() {
        if let Some(link) = node.attribute::<SvgNode>(AId::Mask) {
            mask = super::mask::convert(link, state, object_bbox, cache);
            if mask.is_none() {
                return None;
            }
        }
    }

    let filters = {
        let mut filters = Vec::new();
        if state.parent_clip_path.is_none() {
            if node.attribute(AId::Filter) == Some("none") {
                // Do nothing.
            } else if node.has_attribute(AId::Filter) {
                if let Ok(f) = super::filter::convert(node, state, object_bbox, cache) {
                    filters = f;
                } else {
                    // A filter that not a link or a filter with a link to a non existing element.
                    //
                    // Unlike `clip-path` and `mask`, when a `filter` link is invalid
                    // then the whole element should be ignored.
                    //
                    // This is kinda an undefined behaviour.
                    // In most cases, Chrome, Firefox and rsvg will ignore such elements,
                    // but in some cases Chrome allows it. Not sure why.
                    // Inkscape (0.92) simply ignores such attributes, rendering element as is.
                    // Batik (1.12) crashes.
                    //
                    // Test file: e-filter-051.svg
                    return None;
                }
            }
        }

        filters
    };

    let required = opacity.get().approx_ne_ulps(&1.0, 4)
        || clip_path.is_some()
        || mask.is_some()
        || !filters.is_empty()
        || !transform.is_identity()
        || blend_mode != BlendMode::Normal
        || isolate
        || is_g_or_use
        || force;

    if !required {
        parent.children.append(&mut g.children);
        return None;
    }

    g.clip_path = clip_path;
    g.mask = mask;
    g.filters = filters;

    // Must be called after we set Group::filters
    g.calculate_bounding_boxes();

    Some(g)
}

