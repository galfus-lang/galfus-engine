// SPDX-License-Identifier: Apache-2.0 OR MIT

fn convert_span(
    span: &TextSpan,
    clusters: &[GlyphCluster],
    text_ts: Transform,
) -> Option<(Vec<GlyphCluster>, NonZeroRect)> {
    let mut span_clusters = vec![];
    let mut bboxes_builder = tiny_skia_path::PathBuilder::new();

    for cluster in clusters {
        if !cluster.visible {
            continue;
        }

        if span_contains(span, cluster.byte_idx) {
            span_clusters.push(cluster.clone());
        }

        let mut advance = cluster.advance;
        if advance <= 0.0 {
            advance = 1.0;
        }

        // We have to calculate text bbox using font metrics and not glyph shape.
        if let Some(r) = NonZeroRect::from_xywh(0.0, -cluster.ascent, advance, cluster.height()) {
            if let Some(r) = r.transform(cluster.transform()) {
                bboxes_builder.push_rect(r.to_rect());
            }
        }
    }

    let mut bboxes = bboxes_builder.finish()?;
    bboxes = bboxes.transform(text_ts)?;
    let bbox = bboxes.compute_tight_bounds()?.to_non_zero_rect()?;

    Some((span_clusters, bbox))
}

fn collect_decoration_spans(span: &TextSpan, clusters: &[GlyphCluster]) -> Vec<DecorationSpan> {
    let mut spans = Vec::new();

    let mut started = false;
    let mut width = 0.0;
    let mut transform = Transform::default();

    for cluster in clusters {
        if span_contains(span, cluster.byte_idx) {
            if started && cluster.has_relative_shift {
                started = false;
                spans.push(DecorationSpan { width, transform });
            }

            if !started {
                width = cluster.advance;
                started = true;
                transform = cluster.transform;
            } else {
                width += cluster.advance;
            }
        } else if started {
            spans.push(DecorationSpan { width, transform });
            started = false;
        }
    }

    if started {
        spans.push(DecorationSpan { width, transform });
    }

    spans
}

pub(crate) fn convert_decoration(
    dy: f32,
    span: &TextSpan,
    font: &ResolvedFont,
    mut decoration: TextDecorationStyle,
    decoration_spans: &[DecorationSpan],
    transform: Transform,
) -> Option<Path> {
    debug_assert!(!decoration_spans.is_empty());

    let thickness = font.underline_thickness(span.font_size.get());

    let mut builder = tiny_skia_path::PathBuilder::new();
    for dec_span in decoration_spans {
        let rect = match NonZeroRect::from_xywh(0.0, -thickness / 2.0, dec_span.width, thickness) {
            Some(v) => v,
            None => {
                log::warn!("a decoration span has a malformed bbox");
                continue;
            }
        };

        let ts = dec_span.transform.pre_translate(0.0, dy);

        let mut path = tiny_skia_path::PathBuilder::from_rect(rect.to_rect());
        path = match path.transform(ts) {
            Some(v) => v,
            None => continue,
        };

        builder.push_path(&path);
    }

    let mut path_data = builder.finish()?;
    path_data = path_data.transform(transform)?;

    Path::new(
        String::new(),
        span.visible,
        decoration.fill.take(),
        decoration.stroke.take(),
        PaintOrder::default(),
        ShapeRendering::default(),
        Arc::new(path_data),
        Transform::default(),
    )
}

/// A text decoration span.
///
/// Basically a horizontal line, that will be used for underline, overline and line-through.
/// It doesn't have a height, since it depends on the Font metrics.
#[derive(Clone, Copy)]
pub(crate) struct DecorationSpan {
    pub(crate) width: f32,
    pub(crate) transform: Transform,
}

/// Resolves clusters positions.
///
/// Mainly sets the `transform` property.
///
/// Returns the last text position. The next text chunk should start from that position.
fn resolve_clusters_positions(
    text: &Text,
    chunk: &TextChunk,
    char_offset: usize,
    writing_mode: WritingMode,
    fonts_cache: &FontsCache,
    clusters: &mut [GlyphCluster],
) -> (f32, f32) {
    match chunk.text_flow {
        TextFlow::Linear => {
            resolve_clusters_positions_horizontal(text, chunk, char_offset, writing_mode, clusters)
        }
        TextFlow::Path(ref path) => resolve_clusters_positions_path(
            text,
            chunk,
            char_offset,
            path,
            writing_mode,
            fonts_cache,
            clusters,
        ),
    }
}

fn clusters_length(clusters: &[GlyphCluster]) -> f32 {
    clusters.iter().fold(0.0, |w, cluster| w + cluster.advance)
}

fn resolve_clusters_positions_horizontal(
    text: &Text,
    chunk: &TextChunk,
    offset: usize,
    writing_mode: WritingMode,
    clusters: &mut [GlyphCluster],
) -> (f32, f32) {
    let mut x = process_anchor(chunk.anchor, clusters_length(clusters));
    let mut y = 0.0;

    for cluster in clusters {
        let cp = offset + cluster.byte_idx.code_point_at(&chunk.text);
        if let (Some(dx), Some(dy)) = (text.dx.get(cp), text.dy.get(cp)) {
            if writing_mode == WritingMode::LeftToRight {
                x += dx;
                y += dy;
            } else {
                y -= dx;
                x += dy;
            }
            cluster.has_relative_shift = !dx.approx_zero_ulps(4) || !dy.approx_zero_ulps(4);
        }

        cluster.transform = cluster.transform.pre_translate(x, y);

        if let Some(angle) = text.rotate.get(cp).cloned() {
            if !angle.approx_zero_ulps(4) {
                cluster.transform = cluster.transform.pre_rotate(angle);
                cluster.has_relative_shift = true;
            }
        }

        x += cluster.advance;
    }

    (x, y)
}

// Baseline resolving in SVG is a mess.
// Not only it's poorly documented, but as soon as you start mixing
// `dominant-baseline` and `alignment-baseline` each application/browser will produce
// different results.
//
// For now, resvg simply tries to match Chrome's output and not the mythical SVG spec output.
//
// See `alignment_baseline_shift` method comment for more details.
pub(crate) fn resolve_baseline(
    span: &TextSpan,
    font: &ResolvedFont,
    writing_mode: WritingMode,
) -> f32 {
    let mut shift = -resolve_baseline_shift(&span.baseline_shift, font, span.font_size.get());

    // TODO: support vertical layout as well
    if writing_mode == WritingMode::LeftToRight {
        if span.alignment_baseline == AlignmentBaseline::Auto
            || span.alignment_baseline == AlignmentBaseline::Baseline
        {
            shift += font.dominant_baseline_shift(span.dominant_baseline, span.font_size.get());
        } else {
            shift += font.alignment_baseline_shift(span.alignment_baseline, span.font_size.get());
        }
    }

    shift
}

fn resolve_baseline_shift(baselines: &[BaselineShift], font: &ResolvedFont, font_size: f32) -> f32 {
    let mut shift = 0.0;
    for baseline in baselines.iter().rev() {
        match baseline {
            BaselineShift::Baseline => {}
            BaselineShift::Subscript => shift -= font.subscript_offset(font_size),
            BaselineShift::Superscript => shift += font.superscript_offset(font_size),
            BaselineShift::Number(n) => shift += n,
        }
    }

    shift
}

fn resolve_clusters_positions_path(
    text: &Text,
    chunk: &TextChunk,
    char_offset: usize,
    path: &TextPath,
    writing_mode: WritingMode,
    fonts_cache: &FontsCache,
    clusters: &mut [GlyphCluster],
) -> (f32, f32) {
    let mut last_x = 0.0;
    let mut last_y = 0.0;

    let mut dy = 0.0;

    // In the text path mode, chunk's x/y coordinates provide an additional offset along the path.
    // The X coordinate is used in a horizontal mode, and Y in vertical.
    let chunk_offset = match writing_mode {
        WritingMode::LeftToRight => chunk.x.unwrap_or(0.0),
        WritingMode::TopToBottom => chunk.y.unwrap_or(0.0),
    };

    let start_offset =
        chunk_offset + path.start_offset + process_anchor(chunk.anchor, clusters_length(clusters));

    let normals = collect_normals(text, chunk, clusters, &path.path, char_offset, start_offset);
    for (cluster, normal) in clusters.iter_mut().zip(normals) {
        let (x, y, angle) = match normal {
            Some(normal) => (normal.x, normal.y, normal.angle),
            None => {
                // Hide clusters that are outside the text path.
                cluster.visible = false;
                continue;
            }
        };

        // We have to break a decoration line for each cluster during text-on-path.
        cluster.has_relative_shift = true;

        let orig_ts = cluster.transform;

        // Clusters should be rotated by the x-midpoint x baseline position.
        let half_width = cluster.width / 2.0;
        cluster.transform = Transform::default();
        cluster.transform = cluster.transform.pre_translate(x - half_width, y);
        cluster.transform = cluster.transform.pre_rotate_at(angle, half_width, 0.0);

        let cp = char_offset + cluster.byte_idx.code_point_at(&chunk.text);
        dy += text.dy.get(cp).cloned().unwrap_or(0.0);

        let baseline_shift = chunk_span_at(chunk, cluster.byte_idx)
            .map(|span| {
                let font = match fonts_cache.get(&span.font) {
                    Some(v) => v,
                    None => return 0.0,
                };
                -resolve_baseline(span, font, writing_mode)
            })
            .unwrap_or(0.0);

        // Shift only by `dy` since we already applied `dx`
        // during offset along the path calculation.
        if !dy.approx_zero_ulps(4) || !baseline_shift.approx_zero_ulps(4) {
            let shift = kurbo::Vec2::new(0.0, (dy - baseline_shift) as f64);
            cluster.transform = cluster
                .transform
                .pre_translate(shift.x as f32, shift.y as f32);
        }

        if let Some(angle) = text.rotate.get(cp).cloned() {
            if !angle.approx_zero_ulps(4) {
                cluster.transform = cluster.transform.pre_rotate(angle);
            }
        }

        // The possible `lengthAdjust` transform should be applied after text-on-path positioning.
        cluster.transform = cluster.transform.pre_concat(orig_ts);

        last_x = x + cluster.advance;
        last_y = y;
    }

    (last_x, last_y)
}

pub(crate) fn process_anchor(a: TextAnchor, text_width: f32) -> f32 {
    match a {
        TextAnchor::Start => 0.0, // Nothing.
        TextAnchor::Middle => -text_width / 2.0,
        TextAnchor::End => -text_width,
    }
}

pub(crate) struct PathNormal {
    pub(crate) x: f32,
    pub(crate) y: f32,
    pub(crate) angle: f32,
}

fn collect_normals(
    text: &Text,
    chunk: &TextChunk,
    clusters: &[GlyphCluster],
    path: &tiny_skia_path::Path,
    char_offset: usize,
    offset: f32,
) -> Vec<Option<PathNormal>> {
    let mut offsets = Vec::with_capacity(clusters.len());
    let mut normals = Vec::with_capacity(clusters.len());
    {
        let mut advance = offset;
        for cluster in clusters {
            // Clusters should be rotated by the x-midpoint x baseline position.
            let half_width = cluster.width / 2.0;

            // Include relative position.
            let cp = char_offset + cluster.byte_idx.code_point_at(&chunk.text);
            advance += text.dx.get(cp).cloned().unwrap_or(0.0);

            let offset = advance + half_width;

            // Clusters outside the path have no normals.
            if offset < 0.0 {
                normals.push(None);
            }

            offsets.push(offset as f64);
            advance += cluster.advance;
        }
    }

    let mut prev_mx = path.points()[0].x;
    let mut prev_my = path.points()[0].y;
    let mut prev_x = prev_mx;
    let mut prev_y = prev_my;

    fn create_curve_from_line(px: f32, py: f32, x: f32, y: f32) -> kurbo::CubicBez {
        let line = kurbo::Line::new(
            kurbo::Point::new(px as f64, py as f64),
            kurbo::Point::new(x as f64, y as f64),
        );
        let p1 = line.eval(0.33);
        let p2 = line.eval(0.66);
        kurbo::CubicBez {
            p0: line.p0,
            p1,
            p2,
            p3: line.p1,
        }
    }

    let mut length: f64 = 0.0;
    for seg in path.segments() {
        let curve = match seg {
            tiny_skia_path::PathSegment::MoveTo(p) => {
                prev_mx = p.x;
                prev_my = p.y;
                prev_x = p.x;
                prev_y = p.y;
                continue;
            }
            tiny_skia_path::PathSegment::LineTo(p) => {
                create_curve_from_line(prev_x, prev_y, p.x, p.y)
            }
            tiny_skia_path::PathSegment::QuadTo(p1, p) => kurbo::QuadBez {
                p0: kurbo::Point::new(prev_x as f64, prev_y as f64),
                p1: kurbo::Point::new(p1.x as f64, p1.y as f64),
                p2: kurbo::Point::new(p.x as f64, p.y as f64),
            }
            .raise(),
            tiny_skia_path::PathSegment::CubicTo(p1, p2, p) => kurbo::CubicBez {
                p0: kurbo::Point::new(prev_x as f64, prev_y as f64),
                p1: kurbo::Point::new(p1.x as f64, p1.y as f64),
                p2: kurbo::Point::new(p2.x as f64, p2.y as f64),
                p3: kurbo::Point::new(p.x as f64, p.y as f64),
            },
            tiny_skia_path::PathSegment::Close => {
                create_curve_from_line(prev_x, prev_y, prev_mx, prev_my)
            }
        };

        let arclen_accuracy = {
            let base_arclen_accuracy = 0.5;
            // Accuracy depends on a current scale.
            // When we have a tiny path scaled by a large value,
            // we have to increase out accuracy accordingly.
            let (sx, sy) = text.abs_transform.get_scale();
            // 1.0 acts as a threshold to prevent division by 0 and/or low accuracy.
            base_arclen_accuracy / (sx * sy).sqrt().max(1.0)
        };

        let curve_len = curve.arclen(arclen_accuracy as f64);

        for offset in &offsets[normals.len()..] {
            if *offset >= length && *offset <= length + curve_len {
                let mut offset = curve.inv_arclen(offset - length, arclen_accuracy as f64);
                // some rounding error may occur, so we give offset a little tolerance
                debug_assert!((-1.0e-3..=1.0 + 1.0e-3).contains(&offset));
                offset = offset.clamp(0.0, 1.0);

                let pos = curve.eval(offset);
                let d = curve.deriv().eval(offset);
                let d = kurbo::Vec2::new(-d.y, d.x); // tangent
                let angle = d.atan2().to_degrees() - 90.0;

                normals.push(Some(PathNormal {
                    x: pos.x as f32,
                    y: pos.y as f32,
                    angle: angle as f32,
                }));

                if normals.len() == offsets.len() {
                    break;
                }
            }
        }

        length += curve_len;
        prev_x = curve.p3.x as f32;
        prev_y = curve.p3.y as f32;
    }

    // If path ended and we still have unresolved normals - set them to `None`.
    for _ in 0..(offsets.len() - normals.len()) {
        normals.push(None);
    }

    normals
}

