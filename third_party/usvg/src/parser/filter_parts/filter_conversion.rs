// SPDX-License-Identifier: Apache-2.0 OR MIT

use std::collections::HashSet;
use std::str::FromStr;
use std::sync::Arc;

use strict_num::PositiveF32;
use svgtypes::{AspectRatio, Length, LengthUnit as Unit};

use crate::{
    ApproxZeroUlps, Color, Group, Node, NonEmptyString, NonZeroF32, NonZeroRect, Opacity, Size,
    Units,
    filter::{self, *},
};

use super::OptionLog;
use super::converter::{self, SvgColorExt};
use super::paint_server::{convert_units, resolve_number};
use super::svgtree::{AId, EId, FromValue, SvgNode};

impl<'a, 'input: 'a> FromValue<'a, 'input> for filter::ColorInterpolation {
    fn parse(_: SvgNode, _: AId, value: &str) -> Option<Self> {
        match value {
            "sRGB" => Some(filter::ColorInterpolation::SRGB),
            "linearRGB" => Some(filter::ColorInterpolation::LinearRGB),
            _ => None,
        }
    }
}

pub(crate) fn convert(
    node: SvgNode,
    state: &converter::State,
    object_bbox: Option<NonZeroRect>,
    cache: &mut converter::Cache,
) -> Result<Vec<Arc<Filter>>, ()> {
    let value = match node.attribute::<&str>(AId::Filter) {
        Some(v) => v,
        None => return Ok(Vec::new()),
    };

    let mut has_invalid_urls = false;
    let mut filters = Vec::new();

    let create_base_filter_func =
        |kind, filters: &mut Vec<Arc<Filter>>, cache: &mut converter::Cache| {
            // Filter functions, unlike `filter` elements, do not have a filter region.
            // We're currently do not support an unlimited region, so we simply use a fairly large one.
            // This if far from ideal, but good for now.
            // TODO: Should be fixed eventually.
            let mut rect = match kind {
                Kind::DropShadow(_) | Kind::GaussianBlur(_) => {
                    NonZeroRect::from_xywh(-0.5, -0.5, 2.0, 2.0).unwrap()
                }
                _ => NonZeroRect::from_xywh(-0.1, -0.1, 1.2, 1.2).unwrap(),
            };

            let object_bbox = match object_bbox {
                Some(v) => v,
                None => {
                    log::warn!(
                        "Filter '{}' has an invalid region. Skipped.",
                        node.element_id()
                    );
                    return;
                }
            };

            rect = rect.bbox_transform(object_bbox);

            filters.push(Arc::new(Filter {
                id: cache.gen_filter_id(),
                rect,
                primitives: vec![Primitive {
                    rect,
                    // Unlike `filter` elements, filter functions use sRGB colors by default.
                    color_interpolation: ColorInterpolation::SRGB,
                    result: "result".to_string(),
                    kind,
                }],
            }));
        };

    for func in svgtypes::FilterValueListParser::from(value) {
        let func = match func {
            Ok(v) => v,
            Err(e) => {
                // Skip the whole attribute list on error.
                log::warn!("Failed to parse a filter value cause {}. Skipping.", e);
                return Ok(Vec::new());
            }
        };

        match func {
            svgtypes::FilterValue::Blur(std_dev) => create_base_filter_func(
                convert_blur_function(node, std_dev, state),
                &mut filters,
                cache,
            ),
            svgtypes::FilterValue::DropShadow {
                color,
                dx,
                dy,
                std_dev,
            } => create_base_filter_func(
                convert_drop_shadow_function(node, color, dx, dy, std_dev, state),
                &mut filters,
                cache,
            ),
            svgtypes::FilterValue::Brightness(amount) => {
                create_base_filter_func(convert_brightness_function(amount), &mut filters, cache);
            }
            svgtypes::FilterValue::Contrast(amount) => {
                create_base_filter_func(convert_contrast_function(amount), &mut filters, cache);
            }
            svgtypes::FilterValue::Grayscale(amount) => {
                create_base_filter_func(convert_grayscale_function(amount), &mut filters, cache);
            }
            svgtypes::FilterValue::HueRotate(angle) => {
                create_base_filter_func(convert_hue_rotate_function(angle), &mut filters, cache);
            }
            svgtypes::FilterValue::Invert(amount) => {
                create_base_filter_func(convert_invert_function(amount), &mut filters, cache);
            }
            svgtypes::FilterValue::Opacity(amount) => {
                create_base_filter_func(convert_opacity_function(amount), &mut filters, cache);
            }
            svgtypes::FilterValue::Sepia(amount) => {
                create_base_filter_func(convert_sepia_function(amount), &mut filters, cache);
            }
            svgtypes::FilterValue::Saturate(amount) => {
                create_base_filter_func(convert_saturate_function(amount), &mut filters, cache);
            }
            svgtypes::FilterValue::Url(url) => {
                if let Some(link) = node.document().element_by_id(url) {
                    if let Ok(res) = convert_url(link, state, object_bbox, cache) {
                        if let Some(f) = res {
                            filters.push(f);
                        }
                    } else {
                        has_invalid_urls = true;
                    }
                } else {
                    has_invalid_urls = true;
                }
            }
        }
    }

    // If a `filter` attribute had urls pointing to a missing elements
    // and there are no valid filters at all - this is an error.
    //
    // Note that an invalid url is not an error in general.
    if filters.is_empty() && has_invalid_urls {
        return Err(());
    }

    Ok(filters)
}

fn convert_url(
    node: SvgNode,
    state: &converter::State,
    object_bbox: Option<NonZeroRect>,
    cache: &mut converter::Cache,
) -> Result<Option<Arc<Filter>>, ()> {
    let units = convert_units(node, AId::FilterUnits, Units::ObjectBoundingBox);
    let primitive_units = convert_units(node, AId::PrimitiveUnits, Units::UserSpaceOnUse);

    // Check if this element was already converted.
    //
    // Only `userSpaceOnUse` clipPaths can be shared,
    // because `objectBoundingBox` one will be converted into user one
    // and will become node-specific.
    let cacheable = units == Units::UserSpaceOnUse && primitive_units == Units::UserSpaceOnUse;
    if cacheable {
        if let Some(filter) = cache.filters.get(node.element_id()) {
            return Ok(Some(filter.clone()));
        }
    }

    let rect = NonZeroRect::from_xywh(
        resolve_number(
            node,
            AId::X,
            units,
            state,
            Length::new(-10.0, Unit::Percent),
        ),
        resolve_number(
            node,
            AId::Y,
            units,
            state,
            Length::new(-10.0, Unit::Percent),
        ),
        resolve_number(
            node,
            AId::Width,
            units,
            state,
            Length::new(120.0, Unit::Percent),
        ),
        resolve_number(
            node,
            AId::Height,
            units,
            state,
            Length::new(120.0, Unit::Percent),
        ),
    );

    let mut rect = rect
        .log_none(|| {
            log::warn!(
                "Filter '{}' has an invalid region. Skipped.",
                node.element_id()
            );
        })
        .ok_or(())?;

    if units == Units::ObjectBoundingBox {
        if let Some(object_bbox) = object_bbox {
            rect = rect.bbox_transform(object_bbox);
        } else {
            log::warn!("Filters on zero-sized shapes are not allowed.");
            return Err(());
        }
    }

    let node_with_primitives = match find_filter_with_primitives(node) {
        Some(v) => v,
        None => return Err(()),
    };
    let primitives = collect_children(
        &node_with_primitives,
        primitive_units,
        state,
        object_bbox,
        rect,
        cache,
    );
    if primitives.is_empty() {
        return Err(());
    }

    let mut id = NonEmptyString::new(node.element_id().to_string()).ok_or(())?;
    // Generate ID only when we're parsing `objectBoundingBox` filter for the second time.
    if !cacheable && cache.filters.contains_key(id.get()) {
        id = cache.gen_filter_id();
    }
    let id_copy = id.get().to_string();

    let filter = Arc::new(Filter {
        id,
        rect,
        primitives,
    });

    cache.filters.insert(id_copy, filter.clone());

    Ok(Some(filter))
}

fn find_filter_with_primitives<'a>(node: SvgNode<'a, 'a>) -> Option<SvgNode<'a, 'a>> {
    for link in node.href_iter() {
        if link.tag_name() != Some(EId::Filter) {
            log::warn!(
                "Filter '{}' cannot reference '{}' via 'xlink:href'.",
                node.element_id(),
                link.tag_name().unwrap()
            );
            return None;
        }

        if link.has_children() {
            return Some(link);
        }
    }

    None
}

struct FilterResults {
    names: HashSet<String>,
    idx: usize,
}

fn collect_children(
    filter: &SvgNode,
    units: Units,
    state: &converter::State,
    object_bbox: Option<NonZeroRect>,
    filter_region: NonZeroRect,
    cache: &mut converter::Cache,
) -> Vec<Primitive> {
    let mut primitives = Vec::new();

    let mut results = FilterResults {
        names: HashSet::new(),
        idx: 1,
    };

    let scale = if units == Units::ObjectBoundingBox {
        if let Some(object_bbox) = object_bbox {
            object_bbox.size()
        } else {
            // No need to warn. Already checked.
            return Vec::new();
        }
    } else {
        Size::from_wh(1.0, 1.0).unwrap()
    };

    for child in filter.children() {
        let tag_name = match child.tag_name() {
            Some(v) => v,
            None => continue,
        };

        let filter_subregion = match resolve_primitive_region(
            child,
            tag_name,
            units,
            state,
            object_bbox,
            filter_region,
        ) {
            Some(v) => v,
            None => break,
        };

        let kind =
            match tag_name {
                EId::FeDropShadow => convert_drop_shadow(child, scale, &primitives),
                EId::FeGaussianBlur => convert_gaussian_blur(child, scale, &primitives),
                EId::FeOffset => convert_offset(child, scale, &primitives),
                EId::FeBlend => convert_blend(child, &primitives),
                EId::FeFlood => convert_flood(child),
                EId::FeComposite => convert_composite(child, &primitives),
                EId::FeMerge => convert_merge(child, &primitives),
                EId::FeTile => convert_tile(child, &primitives),
                EId::FeImage => convert_image(child, filter_subregion, state, cache),
                EId::FeComponentTransfer => convert_component_transfer(child, &primitives),
                EId::FeColorMatrix => convert_color_matrix(child, &primitives),
                EId::FeConvolveMatrix => convert_convolve_matrix(child, &primitives)
                    .unwrap_or_else(create_dummy_primitive),
                EId::FeMorphology => convert_morphology(child, scale, &primitives),
                EId::FeDisplacementMap => convert_displacement_map(child, scale, &primitives),
                EId::FeTurbulence => convert_turbulence(child),
                EId::FeDiffuseLighting => convert_diffuse_lighting(child, &primitives)
                    .unwrap_or_else(create_dummy_primitive),
                EId::FeSpecularLighting => convert_specular_lighting(child, &primitives)
                    .unwrap_or_else(create_dummy_primitive),
                tag_name => {
                    log::warn!("'{}' is not a valid filter primitive. Skipped.", tag_name);
                    continue;
                }
            };

        let color_interpolation = child
            .find_attribute(AId::ColorInterpolationFilters)
            .unwrap_or_default();

        primitives.push(Primitive {
            rect: filter_subregion,
            color_interpolation,
            result: gen_result(child, &mut results),
            kind,
        });
    }

    // TODO: remove primitives which results are not used

    primitives
}

// TODO: rewrite/simplify/explain/whatever
fn resolve_primitive_region(
    fe: SvgNode,
    kind: EId,
    units: Units,
    state: &converter::State,
    bbox: Option<NonZeroRect>,
    filter_region: NonZeroRect,
) -> Option<NonZeroRect> {
    let x = fe.try_convert_length(AId::X, units, state);
    let y = fe.try_convert_length(AId::Y, units, state);
    let width = fe.try_convert_length(AId::Width, units, state);
    let height = fe.try_convert_length(AId::Height, units, state);

    let region = match kind {
        EId::FeFlood | EId::FeImage => {
            // `feImage` uses the object bbox.
            if units == Units::ObjectBoundingBox {
                let bbox = bbox?;

                // TODO: wrong
                // let ts_bbox = tiny_skia::Rect::new(ts.e, ts.f, ts.a, ts.d).unwrap();

                let r = NonZeroRect::from_xywh(
                    x.unwrap_or(0.0),
                    y.unwrap_or(0.0),
                    width.unwrap_or(1.0),
                    height.unwrap_or(1.0),
                )?;

                return Some(r.bbox_transform(bbox));
            } else {
                filter_region
            }
        }
        _ => filter_region,
    };

    // TODO: Wrong! Does not account rotate and skew.
    if units == Units::ObjectBoundingBox {
        let subregion_bbox = NonZeroRect::from_xywh(
            x.unwrap_or(0.0),
            y.unwrap_or(0.0),
            width.unwrap_or(1.0),
            height.unwrap_or(1.0),
        )?;

        Some(region.bbox_transform(subregion_bbox))
    } else {
        NonZeroRect::from_xywh(
            x.unwrap_or(region.x()),
            y.unwrap_or(region.y()),
            width.unwrap_or(region.width()),
            height.unwrap_or(region.height()),
        )
    }
}

// A malformed filter primitive usually should produce a transparent image.
// But since `FilterKind` structs are designed to always be valid,
// we are using `FeFlood` as fallback.
