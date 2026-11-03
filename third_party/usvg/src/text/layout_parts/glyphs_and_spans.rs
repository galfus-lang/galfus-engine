// SPDX-License-Identifier: Apache-2.0 OR MIT

use std::collections::{HashMap, HashSet};
use std::num::NonZeroU16;
use std::sync::Arc;

use fontdb::{Database, ID};
use harfrust::ShapeOptions;
use kurbo::{ParamCurve, ParamCurveArclen, ParamCurveDeriv};
use skrifa::MetadataProvider;
use skrifa::Tag;
use skrifa::prelude::Size;
use skrifa::raw::TableProvider;
use strict_num::NonZeroPositiveF32;
use tiny_skia_path::{NonZeroRect, Transform};
use unicode_script::UnicodeScript;

use crate::tree::{BBox, IsValidLength};
use crate::{
    AlignmentBaseline, ApproxZeroUlps, BaselineShift, DominantBaseline, Fill, FillRule, Font,
    FontResolver, GlyphId, LengthAdjust, PaintOrder, Path, ShapeRendering, Stroke, Text,
    TextAnchor, TextChunk, TextDecorationStyle, TextFlow, TextPath, TextSpan, WritingMode,
};

/// A glyph that has already been positioned correctly.
///
/// Note that the transform already takes the font size into consideration, so applying the
/// transform to the outline of the glyphs is all that is necessary to display it correctly.
#[derive(Clone, Debug)]
pub struct PositionedGlyph {
    /// Returns the transform of the glyph itself within the cluster. For example,
    /// for zalgo text, it contains the transform to position the glyphs above/below
    /// the main glyph.
    glyph_ts: Transform,
    /// Returns the transform of the whole cluster that the glyph is part of.
    cluster_ts: Transform,
    /// Returns the transform of the span that the glyph is a part of.
    span_ts: Transform,
    /// The units per em of the font the glyph belongs to.
    units_per_em: u16,
    /// The font size the glyph should be scaled to.
    font_size: f32,
    /// The ID of the glyph.
    pub id: GlyphId,
    /// The text from the original string that corresponds to that glyph.
    pub text: String,
    /// The ID of the font the glyph should be taken from. Can be used with the
    /// [font database of the tree](crate::Tree::fontdb) this glyph is part of.
    pub font: ID,
}

impl PositionedGlyph {
    /// Returns the font size for this glyph.
    pub fn font_size(&self) -> f32 {
        self.font_size
    }

    /// Returns the transform of glyph.
    pub fn transform(&self) -> Transform {
        let sx = self.font_size / self.units_per_em as f32;

        self.span_ts
            .pre_concat(self.cluster_ts)
            .pre_concat(Transform::from_scale(sx, sx))
            .pre_concat(self.glyph_ts)
    }

    /// Returns the transform of glyph, assuming that an outline
    /// glyph is being used (i.e. from the `glyf` or `CFF/CFF2` table).
    pub fn outline_transform(&self) -> Transform {
        // Outlines are mirrored by default.
        self.transform()
            .pre_concat(Transform::from_scale(1.0, -1.0))
    }

    /// Returns the transform for the glyph, assuming that a CBTD-based raster glyph
    /// is being used.
    pub fn cbdt_transform(&self, x: f32, y: f32, pixels_per_em: f32) -> Transform {
        self.transform()
            .pre_concat(Transform::from_scale(
                self.units_per_em as f32 / pixels_per_em,
                self.units_per_em as f32 / pixels_per_em,
            ))
            // Right now, the top-left corner of the image would be placed in
            // on the "text cursor", but we want the bottom-left corner to be there,
            // so we need to shift it up and also apply the x/y offset.
            .pre_translate(x, -y)
    }

    /// Returns the transform for the glyph, assuming that a sbix-based raster glyph
    /// is being used.
    pub fn sbix_transform(
        &self,
        x: f32,
        y: f32,
        x_min: f32,
        y_min: f32,
        pixels_per_em: f32,
        height: f32,
    ) -> Transform {
        // In contrast to CBDT, we also need to look at the outline bbox of the glyph and add a shift if necessary.
        let bbox_x_shift = -x_min;

        let bbox_y_shift = if y_min.approx_zero_ulps(4) {
            // For unknown reasons, using Apple Color Emoji will lead to a vertical shift on MacOS, but this shift
            // doesn't seem to be coming from the font and most likely is somehow hardcoded. On Windows,
            // this shift will not be applied. However, if this shift is not applied the emojis are a bit
            // too high up when being together with other text, so we try to imitate this.
            // See also https://github.com/harfbuzz/harfbuzz/issues/2679#issuecomment-1345595425
            // So whenever the y-shift is 0, we approximate this vertical shift that seems to be produced by it.
            // This value seems to be pretty close to what is happening on MacOS.
            // We can still remove this if it turns out to be a problem, but Apple Color Emoji is pretty
            // much the only `sbix` font out there and they all seem to have a y-shift of 0, so it
            // makes sense to keep it.
            0.128 * self.units_per_em as f32
        } else {
            -y_min
        };

        self.transform()
            .pre_concat(Transform::from_translate(bbox_x_shift, bbox_y_shift))
            .pre_concat(Transform::from_scale(
                self.units_per_em as f32 / pixels_per_em,
                self.units_per_em as f32 / pixels_per_em,
            ))
            // Right now, the top-left corner of the image would be placed in
            // on the "text cursor", but we want the bottom-left corner to be there,
            // so we need to shift it up and also apply the x/y offset.
            .pre_translate(x, -height - y)
    }

    /// Returns the transform for the glyph, assuming that an SVG glyph is
    /// being used.
    pub fn svg_transform(&self) -> Transform {
        self.transform()
    }

    /// Returns the transform for the glyph, assuming that a COLR glyph is
    /// being used.
    pub fn colr_transform(&self) -> Transform {
        self.outline_transform()
    }
}

/// A span contains a number of layouted glyphs that share the same fill, stroke, paint order and
/// visibility.
#[derive(Clone, Debug)]
pub struct Span {
    /// The fill of the span.
    pub fill: Option<Fill>,
    /// The stroke of the span.
    pub stroke: Option<Stroke>,
    /// The paint order of the span.
    pub paint_order: PaintOrder,
    /// The font size of the span.
    pub font_size: NonZeroPositiveF32,
    /// Font variation settings for variable fonts.
    pub variations: Vec<crate::FontVariation>,
    /// Font optical sizing mode.
    pub font_optical_sizing: crate::FontOpticalSizing,
    /// The visibility of the span.
    pub visible: bool,
    /// The glyphs that make up the span.
    pub positioned_glyphs: Vec<PositionedGlyph>,
    /// Cluster metrics retained when `Options::collect_text_clusters` is enabled.
    pub clusters: Vec<LayoutCluster>,
    /// An underline text decoration of the span.
    /// Needs to be rendered before all glyphs.
    pub underline: Option<Path>,
    /// An overline text decoration of the span.
    /// Needs to be rendered before all glyphs.
    pub overline: Option<Path>,
    /// A line-through text decoration of the span.
    /// Needs to be rendered after all glyphs.
    pub line_through: Option<Path>,
}

/// Layout of a shaped text cluster before the text element's absolute transform.
#[derive(Clone, Debug)]
pub struct LayoutCluster {
    /// Index of the text chunk containing this cluster.
    pub chunk_index: usize,
    /// Start and end byte offsets in the normalized text chunk.
    pub byte_range: std::ops::Range<usize>,
    /// Transform from cluster coordinates into the text element's coordinate space.
    pub transform: Transform,
    /// Cluster advance in its local horizontal coordinate system.
    pub advance: f32,
    /// Font ascent in local coordinates.
    pub ascent: f32,
    /// Font descent in local coordinates, usually negative.
    pub descent: f32,
    /// Whether the cluster belongs to a right-to-left shaping run.
    pub right_to_left: bool,
}

#[derive(Clone, Debug)]
struct GlyphCluster {
    byte_idx: ByteIndex,
    right_to_left: bool,
    codepoint: char,
    width: f32,
    advance: f32,
    ascent: f32,
    descent: f32,
    has_relative_shift: bool,
    glyphs: Vec<PositionedGlyph>,
    transform: Transform,
    path_transform: Transform,
    visible: bool,
}

impl GlyphCluster {
    pub(crate) fn height(&self) -> f32 {
        self.ascent - self.descent
    }

    pub(crate) fn transform(&self) -> Transform {
        self.path_transform.post_concat(self.transform)
    }
}

pub(crate) fn layout_text(
    text_node: &Text,
    resolver: &FontResolver,
    fontdb: &mut Arc<fontdb::Database>,
    collect_clusters: bool,
) -> Option<(Vec<Span>, NonZeroRect)> {
    let mut fonts_cache: FontsCache = HashMap::new();

    for chunk in &text_node.chunks {
        for span in &chunk.spans {
            if !fonts_cache.contains_key(&span.font) {
                if let Some(font) = (resolver.select_font)(&span.font, fontdb)
                    .and_then(|id| fontdb.load_font(id, &span.font.variations))
                {
                    fonts_cache.insert(span.font.clone(), Arc::new(font));
                }
            }
        }
    }

    let mut spans = vec![];
    let mut char_offset = 0;
    let mut last_x = 0.0;
    let mut last_y = 0.0;
    let mut bbox = BBox::default();
    for (chunk_index, chunk) in text_node.chunks.iter().enumerate() {
        let (x, y) = match chunk.text_flow {
            TextFlow::Linear => (chunk.x.unwrap_or(last_x), chunk.y.unwrap_or(last_y)),
            TextFlow::Path(_) => (0.0, 0.0),
        };

        let mut clusters = process_chunk(chunk, &fonts_cache, resolver, fontdb);
        if clusters.is_empty() {
            char_offset += chunk.text.chars().count();
            continue;
        }

        let boundaries = if collect_clusters {
            let mut offsets: Vec<usize> = clusters
                .iter()
                .map(|cluster| cluster.byte_idx.value())
                .collect();
            offsets.push(chunk.text.len());
            offsets.sort_unstable();
            offsets.dedup();
            offsets
        } else {
            Vec::new()
        };

        apply_writing_mode(text_node.writing_mode, &mut clusters);
        apply_letter_spacing(chunk, &mut clusters);
        apply_word_spacing(chunk, &mut clusters);

        apply_length_adjust(chunk, &mut clusters);
        let mut curr_pos = resolve_clusters_positions(
            text_node,
            chunk,
            char_offset,
            text_node.writing_mode,
            &fonts_cache,
            &mut clusters,
        );

        let mut text_ts = Transform::default();
        if text_node.writing_mode == WritingMode::TopToBottom {
            if let TextFlow::Linear = chunk.text_flow {
                text_ts = text_ts.pre_rotate_at(90.0, x, y);
            }
        }

        for span in &chunk.spans {
            let font = match fonts_cache.get(&span.font) {
                Some(v) => v,
                None => continue,
            };

            let decoration_spans = collect_decoration_spans(span, &clusters);

            let mut span_ts = text_ts;
            span_ts = span_ts.pre_translate(x, y);
            if let TextFlow::Linear = chunk.text_flow {
                let shift = resolve_baseline(span, font, text_node.writing_mode);

                // In case of a horizontal flow, shift transform and not clusters,
                // because clusters can be rotated and an additional shift will lead
                // to invalid results.
                span_ts = span_ts.pre_translate(0.0, shift);
            }

            let mut underline = None;
            let mut overline = None;
            let mut line_through = None;

            if let Some(decoration) = span.decoration.underline.clone() {
                // TODO: No idea what offset should be used for top-to-bottom layout.
                // There is
                // https://www.w3.org/TR/css-text-decor-3/#text-underline-position-property
                // but it doesn't go into details.
                let offset = match text_node.writing_mode {
                    WritingMode::LeftToRight => -font.underline_position(span.font_size.get()),
                    WritingMode::TopToBottom => font.height(span.font_size.get()) / 2.0,
                };

                if let Some(path) =
                    convert_decoration(offset, span, font, decoration, &decoration_spans, span_ts)
                {
                    bbox = bbox.expand(path.data.bounds());
                    underline = Some(path);
                }
            }

            if let Some(decoration) = span.decoration.overline.clone() {
                let offset = match text_node.writing_mode {
                    WritingMode::LeftToRight => -font.ascent(span.font_size.get()),
                    WritingMode::TopToBottom => -font.height(span.font_size.get()) / 2.0,
                };

                if let Some(path) =
                    convert_decoration(offset, span, font, decoration, &decoration_spans, span_ts)
                {
                    bbox = bbox.expand(path.data.bounds());
                    overline = Some(path);
                }
            }

            if let Some(decoration) = span.decoration.line_through.clone() {
                let offset = match text_node.writing_mode {
                    WritingMode::LeftToRight => -font.line_through_position(span.font_size.get()),
                    WritingMode::TopToBottom => 0.0,
                };

                if let Some(path) =
                    convert_decoration(offset, span, font, decoration, &decoration_spans, span_ts)
                {
                    bbox = bbox.expand(path.data.bounds());
                    line_through = Some(path);
                }
            }

            let mut fill = span.fill.clone();
            if let Some(ref mut fill) = fill {
                // The `fill-rule` should be ignored.
                // https://www.w3.org/TR/SVG2/text.html#TextRenderingOrder
                //
                // 'Since the fill-rule property does not apply to SVG text elements,
                // the specific order of the subpaths within the equivalent path does not matter.'
                fill.rule = FillRule::NonZero;
            }

            if let Some((span_fragments, span_bbox)) = convert_span(span, &clusters, span_ts) {
                bbox = bbox.expand(span_bbox);

                let cluster_metrics = if collect_clusters {
                    span_fragments
                        .iter()
                        .map(|cluster| {
                            let start = cluster.byte_idx.value();
                            let end = boundaries
                                .get(boundaries.partition_point(|offset| *offset <= start))
                                .copied()
                                .unwrap_or(chunk.text.len());
                            LayoutCluster {
                                chunk_index,
                                byte_range: start..end,
                                transform: span_ts.pre_concat(cluster.transform()),
                                advance: cluster.advance,
                                ascent: cluster.ascent,
                                descent: cluster.descent,
                                right_to_left: cluster.right_to_left,
                            }
                        })
                        .collect()
                } else {
                    Vec::new()
                };

                let positioned_glyphs = span_fragments
                    .into_iter()
                    .flat_map(|mut gc| {
                        let cluster_ts = gc.transform();
                        gc.glyphs.iter_mut().for_each(|pg| {
                            pg.cluster_ts = cluster_ts;
                            pg.span_ts = span_ts;
                        });
                        gc.glyphs
                    })
                    .collect();

                spans.push(Span {
                    fill,
                    stroke: span.stroke.clone(),
                    paint_order: span.paint_order,
                    font_size: span.font_size,
                    variations: span.font.variations.clone(),
                    font_optical_sizing: span.font_optical_sizing,
                    visible: span.visible,
                    positioned_glyphs,
                    clusters: cluster_metrics,
                    underline,
                    overline,
                    line_through,
                });
            }
        }

        char_offset += chunk.text.chars().count();

        if text_node.writing_mode == WritingMode::TopToBottom {
            if let TextFlow::Linear = chunk.text_flow {
                std::mem::swap(&mut curr_pos.0, &mut curr_pos.1);
            }
        }

        last_x = x + curr_pos.0;
        last_y = y + curr_pos.1;
    }

    let bbox = bbox.to_non_zero_rect()?;

    Some((spans, bbox))
}

