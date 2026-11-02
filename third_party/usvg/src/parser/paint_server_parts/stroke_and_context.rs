// SPDX-License-Identifier: Apache-2.0 OR MIT

fn process_stroke(
    stroke: &mut Option<Stroke>,
    path_transform: Transform,
    context_transform: Transform,
    context_bbox: Option<Rect>,
    bbox: Rect,
    cache: &mut Cache,
) {
    let mut ok = false;
    if let Some(stroke) = stroke.as_mut() {
        // Path context elements (i.e. for  markers) have already been resolved,
        // so we only care about use nodes.
        ok = process_paint(
            &mut stroke.paint,
            matches!(stroke.context_element, Some(ContextElement::UseNode)),
            context_transform,
            context_bbox,
            path_transform,
            bbox,
            cache,
        );
    }
    if !ok {
        *stroke = None;
    }
}

fn process_context_paint(
    paint: &mut Paint,
    context_transform: Transform,
    path_transform: Transform,
    cache: &mut Cache,
) -> Option<()> {
    // The idea is the following: We have a certain context element that has
    // a transform A, and further below in the tree we have for example a path
    // whose paint has a transform C. In order to get from A to C, there is some
    // transformation matrix B such that A x B = C. We now need to figure out
    // a way to get from C back to A, so that the transformation of the paint
    // matches the one from the context element, even if B was applied. How
    // do we do that? We calculate CxB^(-1), which will overall then have
    // the same effect as A. How do we calculate B^(-1)?
    // --> (A^(-1)xC)^(-1)
    let rev_transform = context_transform
        .invert()?
        .pre_concat(path_transform)
        .invert()?;

    match paint {
        Paint::Color(_) => {}
        Paint::LinearGradient(lg) => {
            let transform = lg.transform.post_concat(rev_transform);
            *paint = Paint::LinearGradient(Arc::new(LinearGradient {
                x1: lg.x1,
                y1: lg.y1,
                x2: lg.x2,
                y2: lg.y2,
                base: BaseGradient {
                    id: cache.gen_linear_gradient_id(),
                    units: lg.units,
                    transform,
                    spread_method: lg.spread_method,
                    stops: lg.stops.clone(),
                },
            }));
        }
        Paint::RadialGradient(rg) => {
            let transform = rg.transform.post_concat(rev_transform);
            *paint = Paint::RadialGradient(Arc::new(RadialGradient {
                cx: rg.cx,
                cy: rg.cy,
                r: rg.r,
                fx: rg.fx,
                fy: rg.fy,
                fr: rg.fr,
                base: BaseGradient {
                    id: cache.gen_radial_gradient_id(),
                    units: rg.units,
                    transform,
                    spread_method: rg.spread_method,
                    stops: rg.stops.clone(),
                },
            }));
        }
        Paint::Pattern(pat) => {
            let transform = pat.transform.post_concat(rev_transform);
            *paint = Paint::Pattern(Arc::new(Pattern {
                id: cache.gen_pattern_id(),
                units: pat.units,
                content_units: pat.content_units,
                transform,
                rect: pat.rect,
                view_box: pat.view_box,
                root: pat.root.clone(),
            }));
        }
    }

    Some(())
}

pub(crate) fn process_paint(
    paint: &mut Paint,
    has_context: bool,
    context_transform: Transform,
    context_bbox: Option<Rect>,
    path_transform: Transform,
    bbox: Rect,
    cache: &mut Cache,
) -> bool {
    if paint.units() == Units::ObjectBoundingBox
        || paint.content_units() == Units::ObjectBoundingBox
    {
        let bbox = if has_context {
            let Some(bbox) = context_bbox else {
                return false;
            };
            bbox
        } else {
            bbox
        };

        if paint.to_user_coordinates(bbox, cache).is_none() {
            return false;
        }
    }

    if let Paint::Pattern(patt) = paint {
        if let Some(patt) = Arc::get_mut(patt) {
            update_paint_servers(&mut patt.root, Transform::default(), None, None, cache);
        }
    }

    if has_context {
        process_context_paint(paint, context_transform, path_transform, cache);
    }

    true
}

fn process_text_decoration(style: &mut Option<TextDecorationStyle>, bbox: Rect, cache: &mut Cache) {
    if let Some(style) = style.as_mut() {
        process_fill(
            &mut style.fill,
            Transform::default(),
            Transform::default(),
            None,
            bbox,
            cache,
        );
        process_stroke(
            &mut style.stroke,
            Transform::default(),
            Transform::default(),
            None,
            bbox,
            cache,
        );
    }
}

impl Paint {
    fn to_user_coordinates(&mut self, bbox: Rect, cache: &mut Cache) -> Option<()> {
        let name = if matches!(self, Paint::Pattern(_)) {
            "Pattern"
        } else {
            "Gradient"
        };
        let bbox = bbox
            .to_non_zero_rect()
            .log_none(|| log::warn!("{} on zero-sized shapes is not allowed.", name))?;

        // `Arc::get_mut()` allow us to modify some paint servers in-place.
        // This reduces the amount of cloning and preserves the original ID as well.
        match self {
            Paint::Color(_) => {} // unreachable
            Paint::LinearGradient(lg) => {
                let transform = lg.transform.post_concat(Transform::from_bbox(bbox));
                if let Some(lg) = Arc::get_mut(lg) {
                    lg.base.transform = transform;
                    lg.base.units = Units::UserSpaceOnUse;
                } else {
                    *lg = Arc::new(LinearGradient {
                        x1: lg.x1,
                        y1: lg.y1,
                        x2: lg.x2,
                        y2: lg.y2,
                        base: BaseGradient {
                            id: cache.gen_linear_gradient_id(),
                            units: Units::UserSpaceOnUse,
                            transform,
                            spread_method: lg.spread_method,
                            stops: lg.stops.clone(),
                        },
                    });
                }
            }
            Paint::RadialGradient(rg) => {
                let transform = rg.transform.post_concat(Transform::from_bbox(bbox));
                if let Some(rg) = Arc::get_mut(rg) {
                    rg.base.transform = transform;
                    rg.base.units = Units::UserSpaceOnUse;
                } else {
                    *rg = Arc::new(RadialGradient {
                        cx: rg.cx,
                        cy: rg.cy,
                        r: rg.r,
                        fx: rg.fx,
                        fy: rg.fy,
                        fr: rg.fr,
                        base: BaseGradient {
                            id: cache.gen_radial_gradient_id(),
                            units: Units::UserSpaceOnUse,
                            transform,
                            spread_method: rg.spread_method,
                            stops: rg.stops.clone(),
                        },
                    });
                }
            }
            Paint::Pattern(patt) => {
                let rect = if patt.units == Units::ObjectBoundingBox {
                    patt.rect.bbox_transform(bbox)
                } else {
                    patt.rect
                };

                if let Some(patt) = Arc::get_mut(patt) {
                    patt.rect = rect;
                    patt.units = Units::UserSpaceOnUse;

                    if patt.content_units == Units::ObjectBoundingBox && patt.view_box.is_none() {
                        // No need to shift patterns.
                        let transform = Transform::from_scale(bbox.width(), bbox.height());
                        push_pattern_transform(&mut patt.root, transform);
                    }

                    if let Some(view_box) = patt.view_box {
                        push_pattern_transform(&mut patt.root, view_box.to_transform(rect.size()));
                    }

                    patt.content_units = Units::UserSpaceOnUse;
                } else {
                    let mut root = if patt.content_units == Units::ObjectBoundingBox
                        && patt.view_box.is_none()
                    {
                        // No need to shift patterns.
                        let transform = Transform::from_scale(bbox.width(), bbox.height());

                        let mut g = patt.root.clone();
                        push_pattern_transform(&mut g, transform);
                        g
                    } else {
                        patt.root.clone()
                    };

                    if let Some(view_box) = patt.view_box {
                        push_pattern_transform(&mut root, view_box.to_transform(rect.size()));
                    }

                    *patt = Arc::new(Pattern {
                        id: cache.gen_pattern_id(),
                        units: Units::UserSpaceOnUse,
                        content_units: Units::UserSpaceOnUse,
                        transform: patt.transform,
                        rect,
                        view_box: patt.view_box,
                        root,
                    });
                }
            }
        }

        Some(())
    }
}

fn push_pattern_transform(root: &mut Group, transform: Transform) {
    // TODO: we should update abs_transform in all descendants as well
    let mut g = std::mem::replace(root, Group::empty());
    g.transform = transform;
    g.abs_transform = transform;

    root.children.push(Node::Group(Box::new(g)));
    root.calculate_bounding_boxes();
}

impl Paint {
    #[inline]
    pub(crate) fn units(&self) -> Units {
        match self {
            Self::Color(_) => Units::UserSpaceOnUse,
            Self::LinearGradient(lg) => lg.units,
            Self::RadialGradient(rg) => rg.units,
            Self::Pattern(patt) => patt.units,
        }
    }

    #[inline]
    pub(crate) fn content_units(&self) -> Units {
        match self {
            Self::Pattern(patt) => patt.content_units,
            _ => Units::UserSpaceOnUse,
        }
    }
}
