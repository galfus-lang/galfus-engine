// SPDX-License-Identifier: Apache-2.0 OR MIT

#[inline(never)]
pub(crate) fn resolve_number(
    node: SvgNode,
    name: AId,
    units: Units,
    state: &converter::State,
    def: Length,
) -> f32 {
    resolve_attr(node, name).convert_length(name, units, state, def)
}

fn resolve_attr<'a, 'input: 'a>(node: SvgNode<'a, 'input>, name: AId) -> SvgNode<'a, 'input> {
    if node.has_attribute(name) {
        return node;
    }

    match node.tag_name().unwrap() {
        EId::LinearGradient => resolve_lg_attr(node, name),
        EId::RadialGradient => resolve_rg_attr(node, name),
        EId::Pattern => resolve_pattern_attr(node, name),
        EId::Filter => resolve_filter_attr(node, name),
        _ => node,
    }
}

fn resolve_lg_attr<'a, 'input: 'a>(node: SvgNode<'a, 'input>, name: AId) -> SvgNode<'a, 'input> {
    for link in node.href_iter() {
        let tag_name = match link.tag_name() {
            Some(v) => v,
            None => return node,
        };

        match (name, tag_name) {
            // Coordinates can be resolved only from
            // ref element with the same type.
              (AId::X1, EId::LinearGradient)
            | (AId::Y1, EId::LinearGradient)
            | (AId::X2, EId::LinearGradient)
            | (AId::Y2, EId::LinearGradient)
            // Other attributes can be resolved
            // from any kind of gradient.
            | (AId::GradientUnits, EId::LinearGradient)
            | (AId::GradientUnits, EId::RadialGradient)
            | (AId::SpreadMethod, EId::LinearGradient)
            | (AId::SpreadMethod, EId::RadialGradient)
            | (AId::GradientTransform, EId::LinearGradient)
            | (AId::GradientTransform, EId::RadialGradient) => {
                if link.has_attribute(name) {
                    return link;
                }
            }
            _ => break,
        }
    }

    node
}

fn resolve_rg_attr<'a, 'input>(node: SvgNode<'a, 'input>, name: AId) -> SvgNode<'a, 'input> {
    for link in node.href_iter() {
        let tag_name = match link.tag_name() {
            Some(v) => v,
            None => return node,
        };

        match (name, tag_name) {
            // Coordinates can be resolved only from
            // ref element with the same type.
              (AId::Cx, EId::RadialGradient)
            | (AId::Cy, EId::RadialGradient)
            | (AId::R,  EId::RadialGradient)
            | (AId::Fx, EId::RadialGradient)
            | (AId::Fy, EId::RadialGradient)
            | (AId::Fr, EId::RadialGradient)
            // Other attributes can be resolved
            // from any kind of gradient.
            | (AId::GradientUnits, EId::LinearGradient)
            | (AId::GradientUnits, EId::RadialGradient)
            | (AId::SpreadMethod, EId::LinearGradient)
            | (AId::SpreadMethod, EId::RadialGradient)
            | (AId::GradientTransform, EId::LinearGradient)
            | (AId::GradientTransform, EId::RadialGradient) => {
                if link.has_attribute(name) {
                    return link;
                }
            }
            _ => break,
        }
    }

    node
}

fn resolve_pattern_attr<'a, 'input: 'a>(
    node: SvgNode<'a, 'input>,
    name: AId,
) -> SvgNode<'a, 'input> {
    for link in node.href_iter() {
        let tag_name = match link.tag_name() {
            Some(v) => v,
            None => return node,
        };

        if tag_name != EId::Pattern {
            break;
        }

        if link.has_attribute(name) {
            return link;
        }
    }

    node
}

fn resolve_filter_attr<'a, 'input: 'a>(node: SvgNode<'a, 'input>, aid: AId) -> SvgNode<'a, 'input> {
    for link in node.href_iter() {
        let tag_name = match link.tag_name() {
            Some(v) => v,
            None => return node,
        };

        if tag_name != EId::Filter {
            break;
        }

        if link.has_attribute(aid) {
            return link;
        }
    }

    node
}

fn stops_to_color(stops: &[Stop]) -> Option<ServerOrColor> {
    if stops.is_empty() {
        None
    } else {
        Some(ServerOrColor::Color {
            color: stops[0].color,
            opacity: stops[0].opacity,
        })
    }
}

// Update paints servers by doing the following:
// 1. Replace context fills/strokes that are linked to
// a use node with their actual values.
// 2. Convert all object units to UserSpaceOnUse
pub fn update_paint_servers(
    group: &mut Group,
    context_transform: Transform,
    context_bbox: Option<Rect>,
    text_bbox: Option<Rect>,
    cache: &mut Cache,
) {
    for child in &mut group.children {
        // Set context transform and bbox if applicable if the
        // current group is a use node.
        let (context_transform, context_bbox) = if group.is_context_element {
            (group.abs_transform, Some(group.bounding_box))
        } else {
            (context_transform, context_bbox)
        };

        node_to_user_coordinates(child, context_transform, context_bbox, text_bbox, cache);
    }
}

// When parsing clipPaths, masks and filters we already know group's bounding box.
// But with gradients and patterns we don't, because we have to know text bounding box
// before we even parsed it. Which is impossible.
// Therefore our only choice is to parse gradients and patterns preserving their units
// and then replace them with `userSpaceOnUse` after the whole tree parsing is finished.
// So while gradients and patterns do still store their units,
// they are not exposed in the public API and for the caller they are always `userSpaceOnUse`.
fn node_to_user_coordinates(
    node: &mut Node,
    context_transform: Transform,
    context_bbox: Option<Rect>,
    text_bbox: Option<Rect>,
    cache: &mut Cache,
) {
    match node {
        Node::Group(g) => {
            // No need to check clip paths, because they cannot have paint servers.
            if let Some(mask) = &mut g.mask {
                if let Some(mask) = Arc::get_mut(mask) {
                    update_paint_servers(
                        &mut mask.root,
                        context_transform,
                        context_bbox,
                        None,
                        cache,
                    );

                    if let Some(sub_mask) = &mut mask.mask {
                        if let Some(sub_mask) = Arc::get_mut(sub_mask) {
                            update_paint_servers(
                                &mut sub_mask.root,
                                context_transform,
                                context_bbox,
                                None,
                                cache,
                            );
                        }
                    }
                }
            }

            for filter in &mut g.filters {
                if let Some(filter) = Arc::get_mut(filter) {
                    for primitive in &mut filter.primitives {
                        if let filter::Kind::Image(image) = &mut primitive.kind {
                            update_paint_servers(
                                &mut image.root,
                                context_transform,
                                context_bbox,
                                None,
                                cache,
                            );
                        }
                    }
                }
            }

            update_paint_servers(g, context_transform, context_bbox, text_bbox, cache);
        }
        Node::Path(path) => {
            // Paths inside `Text::flattened` are special and must use text's bounding box
            // instead of their own.
            let bbox = text_bbox.unwrap_or(path.bounding_box);

            process_fill(
                &mut path.fill,
                path.abs_transform,
                context_transform,
                context_bbox,
                bbox,
                cache,
            );
            process_stroke(
                &mut path.stroke,
                path.abs_transform,
                context_transform,
                context_bbox,
                bbox,
                cache,
            );
        }
        Node::Image(image) => {
            if let ImageKind::SVG(tree) = &mut image.kind {
                update_paint_servers(&mut tree.root, context_transform, context_bbox, None, cache);
            }
        }
        Node::Text(text) => {
            // By the SVG spec, `tspan` doesn't have a bbox and uses the parent `text` bbox.
            // Therefore we have to use text's bbox when converting tspan and flatted text
            // paint servers.
            let bbox = text.bounding_box;

            // We need to update three things:
            // 1. The fills/strokes of the original elements in the usvg tree.
            // 2. The fills/strokes of the layouted elements of the text.
            // 3. The fills/strokes of the outlined text.

            // 1.
            for chunk in &mut text.chunks {
                for span in &mut chunk.spans {
                    process_fill(
                        &mut span.fill,
                        text.abs_transform,
                        context_transform,
                        context_bbox,
                        bbox,
                        cache,
                    );
                    process_stroke(
                        &mut span.stroke,
                        text.abs_transform,
                        context_transform,
                        context_bbox,
                        bbox,
                        cache,
                    );
                    process_text_decoration(&mut span.decoration.underline, bbox, cache);
                    process_text_decoration(&mut span.decoration.overline, bbox, cache);
                    process_text_decoration(&mut span.decoration.line_through, bbox, cache);
                }
            }

            // 2.
            #[cfg(feature = "text")]
            for span in &mut text.layouted {
                process_fill(
                    &mut span.fill,
                    text.abs_transform,
                    context_transform,
                    context_bbox,
                    bbox,
                    cache,
                );
                process_stroke(
                    &mut span.stroke,
                    text.abs_transform,
                    context_transform,
                    context_bbox,
                    bbox,
                    cache,
                );

                let mut process_decoration = |path: &mut Path| {
                    process_fill(
                        &mut path.fill,
                        text.abs_transform,
                        context_transform,
                        context_bbox,
                        bbox,
                        cache,
                    );
                    process_stroke(
                        &mut path.stroke,
                        text.abs_transform,
                        context_transform,
                        context_bbox,
                        bbox,
                        cache,
                    );
                };

                if let Some(path) = &mut span.overline {
                    process_decoration(path);
                }

                if let Some(path) = &mut span.underline {
                    process_decoration(path);
                }

                if let Some(path) = &mut span.line_through {
                    process_decoration(path);
                }
            }

            // 3.
            update_paint_servers(
                &mut text.flattened,
                context_transform,
                context_bbox,
                Some(bbox),
                cache,
            );
        }
    }
}

fn process_fill(
    fill: &mut Option<Fill>,
    path_transform: Transform,
    context_transform: Transform,
    context_bbox: Option<Rect>,
    bbox: Rect,
    cache: &mut Cache,
) {
    let mut ok = false;
    if let Some(fill) = fill.as_mut() {
        // Path context elements (i.e. for  markers) have already been resolved,
        // so we only care about use nodes.
        ok = process_paint(
            &mut fill.paint,
            matches!(fill.context_element, Some(ContextElement::UseNode)),
            context_transform,
            context_bbox,
            path_transform,
            bbox,
            cache,
        );
    }
    if !ok {
        *fill = None;
    }
}

