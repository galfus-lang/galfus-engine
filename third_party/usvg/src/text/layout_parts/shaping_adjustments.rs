// SPDX-License-Identifier: Apache-2.0 OR MIT

/// Converts a text chunk into a list of outlined clusters.
///
/// This function will do the BIDI reordering, text shaping and glyphs outlining,
/// but not the text layouting. So all clusters are in the 0x0 position.
fn process_chunk(
    chunk: &TextChunk,
    fonts_cache: &FontsCache,
    resolver: &FontResolver,
    fontdb: &mut Arc<fontdb::Database>,
) -> Vec<GlyphCluster> {
    // The way this function works is a bit tricky.
    //
    // The first problem is BIDI reordering.
    // We cannot shape text span-by-span, because glyph clusters are not guarantee to be continuous.
    //
    // For example:
    // <text>Hel<tspan fill="url(#lg1)">lo של</tspan>ום.</text>
    //
    // Would be shaped as:
    // H e l l o   ש ל  ו  ם .   (characters)
    // 0 1 2 3 4 5 12 10 8 6 14  (cluster indices in UTF-8)
    //       ---         ---     (green span)
    //
    // As you can see, our continuous `lo של` span was split into two separated one.
    // So our 3 spans: black - green - black, become 5 spans: black - green - black - green - black.
    // If we shape `Hel`, then `lo של` an then `ום` separately - we would get an incorrect output.
    // To properly handle this we simply shape the whole chunk.
    //
    // But this introduces another issue - what to do when we have multiple fonts?
    // The easy solution would be to simply shape text with each font,
    // where the first font output is used as a base one and all others overwrite it.
    // This way in case of:
    // <text font-family="Arial">Hello <tspan font-family="Helvetica">world</tspan></text>
    // we would replace Arial glyphs for `world` with Helvetica one. Pretty simple.
    //
    // Well, it would work most of the time, but not always.
    // This is because different fonts can produce different amount of glyphs for the same text.
    // The most common example are ligatures. Some fonts can shape `fi` as two glyphs `f` and `i`,
    // but some can use `ﬁ` (U+FB01) instead.
    // Meaning that during merging we have to overwrite not individual glyphs, but clusters.

    // Glyph splitting assigns distinct glyphs to the same index in the original text, we need to
    // store previously used indices to make sure we do not re-use the same index while overwriting
    // span glyphs.
    let mut positions = HashSet::new();

    let mut glyphs = Vec::new();
    for span in &chunk.spans {
        let font = match fonts_cache.get(&span.font) {
            Some(v) => v.clone(),
            None => continue,
        };

        let tmp_glyphs = shape_text(
            &chunk.text,
            font,
            span.small_caps,
            span.apply_kerning,
            &span.font.variations,
            span.font_size.get(),
            span.font_optical_sizing,
            resolver,
            fontdb,
        );

        // Do nothing with the first run.
        if glyphs.is_empty() {
            glyphs = tmp_glyphs;
            continue;
        }

        positions.clear();

        // Overwrite span's glyphs.
        let mut iter = tmp_glyphs.into_iter();
        while let Some(new_glyph) = iter.next() {
            if !span_contains(span, new_glyph.byte_idx) {
                continue;
            }

            let Some(idx) = glyphs
                .iter()
                .position(|g| g.byte_idx == new_glyph.byte_idx)
                .filter(|pos| !positions.contains(pos))
            else {
                continue;
            };

            positions.insert(idx);

            let prev_cluster_len = glyphs[idx].cluster_len;
            if prev_cluster_len < new_glyph.cluster_len {
                // If the new font represents the same cluster with fewer glyphs
                // then remove remaining glyphs.
                for _ in 1..new_glyph.cluster_len {
                    glyphs.remove(idx + 1);
                }
            } else if prev_cluster_len > new_glyph.cluster_len {
                // If the new font represents the same cluster with more glyphs
                // then insert them after the current one.
                for j in 1..prev_cluster_len {
                    if let Some(g) = iter.next() {
                        glyphs.insert(idx + j, g);
                    }
                }
            }

            glyphs[idx] = new_glyph;
        }
    }

    // Convert glyphs to clusters.
    let mut clusters = Vec::new();
    for (range, byte_idx) in GlyphClusters::new(&glyphs) {
        if let Some(span) = chunk_span_at(chunk, byte_idx) {
            clusters.push(form_glyph_clusters(
                &glyphs[range],
                &chunk.text,
                span.font_size.get(),
            ));
        }
    }

    clusters
}

fn apply_length_adjust(chunk: &TextChunk, clusters: &mut [GlyphCluster]) {
    let is_horizontal = matches!(chunk.text_flow, TextFlow::Linear);

    for span in &chunk.spans {
        let target_width = match span.text_length {
            Some(v) => v,
            None => continue,
        };

        let mut width = 0.0;
        let mut cluster_indexes = Vec::new();
        for i in span.start..span.end {
            if let Some(index) = clusters.iter().position(|c| c.byte_idx.value() == i) {
                cluster_indexes.push(index);
            }
        }
        // Complex scripts can have multi-codepoint clusters therefore we have to remove duplicates.
        cluster_indexes.sort();
        cluster_indexes.dedup();

        for i in &cluster_indexes {
            // Use the original cluster `width` and not `advance`.
            // This method essentially discards any `word-spacing` and `letter-spacing`.
            width += clusters[*i].width;
        }

        if cluster_indexes.is_empty() {
            continue;
        }

        if span.length_adjust == LengthAdjust::Spacing {
            let factor = if cluster_indexes.len() > 1 {
                (target_width - width) / (cluster_indexes.len() - 1) as f32
            } else {
                0.0
            };

            for i in cluster_indexes {
                clusters[i].advance = clusters[i].width + factor;
            }
        } else {
            let factor = target_width / width;
            // Prevent multiplying by zero.
            if factor < 0.001 {
                continue;
            }

            for i in cluster_indexes {
                clusters[i].transform = clusters[i].transform.pre_scale(factor, 1.0);

                // Technically just a hack to support the current text-on-path algorithm.
                if !is_horizontal {
                    clusters[i].advance *= factor;
                    clusters[i].width *= factor;
                }
            }
        }
    }
}

/// Rotates clusters according to
/// [Unicode Vertical_Orientation Property](https://www.unicode.org/reports/tr50/tr50-19.html).
fn apply_writing_mode(writing_mode: WritingMode, clusters: &mut [GlyphCluster]) {
    if writing_mode != WritingMode::TopToBottom {
        return;
    }

    for cluster in clusters {
        let orientation = unicode_vo::char_orientation(cluster.codepoint);
        if orientation == unicode_vo::Orientation::Upright {
            let mut ts = Transform::default();
            // Position glyph in the center of vertical axis.
            ts = ts.pre_translate(0.0, (cluster.ascent + cluster.descent) / 2.0);
            // Rotate by 90 degrees in the center.
            ts = ts.pre_rotate_at(
                -90.0,
                cluster.width / 2.0,
                -(cluster.ascent + cluster.descent) / 2.0,
            );

            cluster.path_transform = ts;

            // Move "baseline" to the middle and make height equal to width.
            cluster.ascent = cluster.width / 2.0;
            cluster.descent = -cluster.width / 2.0;
        } else {
            // Could not find a spec that explains this,
            // but this is how other applications are shifting the "rotated" characters
            // in the top-to-bottom mode.
            cluster.transform = cluster
                .transform
                .pre_translate(0.0, (cluster.ascent + cluster.descent) / 2.0);
        }
    }
}

/// Applies the `letter-spacing` property to a text chunk clusters.
///
/// [In the CSS spec](https://www.w3.org/TR/css-text-3/#letter-spacing-property).
fn apply_letter_spacing(chunk: &TextChunk, clusters: &mut [GlyphCluster]) {
    // At least one span should have a non-zero spacing.
    if !chunk
        .spans
        .iter()
        .any(|span| !span.letter_spacing.approx_zero_ulps(4))
    {
        return;
    }

    let num_clusters = clusters.len();
    for (i, cluster) in clusters.iter_mut().enumerate() {
        // Spacing must be applied only to characters that belongs to the script
        // that supports spacing.
        // We are checking only the first code point, since it should be enough.
        // https://www.w3.org/TR/css-text-3/#cursive-tracking
        let script = cluster.codepoint.script();
        if script_supports_letter_spacing(script) {
            if let Some(span) = chunk_span_at(chunk, cluster.byte_idx) {
                // A space after the last cluster should be ignored,
                // since it affects the bbox and text alignment.
                if i != num_clusters - 1 {
                    cluster.advance += span.letter_spacing;
                }

                // If the cluster advance became negative - clear it.
                // This is an UB so we can do whatever we want, and we mimic Chrome's behavior.
                if !cluster.advance.is_valid_length() {
                    cluster.width = 0.0;
                    cluster.advance = 0.0;
                    cluster.glyphs = vec![];
                }
            }
        }
    }
}

/// Applies the `word-spacing` property to a text chunk clusters.
///
/// [In the CSS spec](https://www.w3.org/TR/css-text-3/#propdef-word-spacing).
fn apply_word_spacing(chunk: &TextChunk, clusters: &mut [GlyphCluster]) {
    // At least one span should have a non-zero spacing.
    if !chunk
        .spans
        .iter()
        .any(|span| !span.word_spacing.approx_zero_ulps(4))
    {
        return;
    }

    for cluster in clusters {
        if is_word_separator_characters(cluster.codepoint) {
            if let Some(span) = chunk_span_at(chunk, cluster.byte_idx) {
                // Technically, word spacing 'should be applied half on each
                // side of the character', but it doesn't affect us in any way,
                // so we are ignoring this.
                cluster.advance += span.word_spacing;

                // After word spacing, `advance` can be negative.
            }
        }
    }
}

fn form_glyph_clusters(glyphs: &[Glyph], text: &str, font_size: f32) -> GlyphCluster {
    debug_assert!(!glyphs.is_empty());

    let mut x = 0.0;
    let mut width = 0.0;
    let mut advance = 0.0;

    let mut positioned_glyphs = vec![];

    for glyph in glyphs {
        let sx = glyph.font.scale(font_size);

        // Apply offset.
        //
        // The first glyph in the cluster will have an offset from 0x0,
        // but the later one will have an offset from the "current position".
        // So we have to keep an advance.
        // TODO: should be done only inside a single text span
        let ts = Transform::from_translate(x + glyph.dx as f32, -glyph.dy as f32);

        positioned_glyphs.push(PositionedGlyph {
            glyph_ts: ts,
            // Will be set later.
            cluster_ts: Transform::default(),
            // Will be set later.
            span_ts: Transform::default(),
            units_per_em: glyph.font.units_per_em.get(),
            font_size,
            font: glyph.font.id,
            text: glyph.text.clone(),
            id: glyph.id,
        });

        x += glyph.width as f32;

        let glyph_width = glyph.width as f32 * sx;
        advance += glyph_width;
        if glyph_width > width {
            width = glyph_width;
        }
    }

    let byte_idx = glyphs[0].byte_idx;
    let font = glyphs[0].font.clone();
    GlyphCluster {
        byte_idx,
        right_to_left: glyphs[0].right_to_left,
        codepoint: byte_idx.char_from(text),
        width,
        advance,
        ascent: font.ascent(font_size),
        descent: font.descent(font_size),
        has_relative_shift: false,
        transform: Transform::default(),
        path_transform: Transform::default(),
        glyphs: positioned_glyphs,
        visible: true,
    }
}

pub(crate) trait DatabaseExt {
    fn load_font(&self, id: ID, variations: &[crate::FontVariation]) -> Option<ResolvedFont>;
    fn has_char(&self, id: ID, c: char) -> bool;
}

impl DatabaseExt for Database {
    #[inline(never)]
    fn load_font(&self, id: ID, variations: &[crate::FontVariation]) -> Option<ResolvedFont> {
        self.with_face_data(id, |data, face_index| -> Option<ResolvedFont> {
            let font = skrifa::FontRef::from_index(data, face_index).ok()?;

            // For variable fonts, metrics depend on the position in the design space,
            // so resolve the requested variations to a normalized location first.
            // Metrics are always in font units, so the size stays unscaled.
            let location = font.axes().location(
                variations
                    .iter()
                    .map(|v| (Tag::from_be_bytes(v.tag), v.value)),
            );
            let coords = location.coords();
            let metrics = font.metrics(Size::unscaled(), &location);

            // Reject fonts with an out-of-range unitsPerEm, like `ttf-parser` did.
            if !(16..=16384).contains(&metrics.units_per_em) {
                return None;
            }
            let units_per_em = NonZeroU16::new(metrics.units_per_em)?;

            let ascent = metrics.ascent;
            let descent = metrics.descent;

            let x_height = metrics
                .x_height
                .filter(|x| *x > 0.0)
                .and_then(|x| u16::try_from(x.round() as i32).ok())
                .and_then(NonZeroU16::new);
            let x_height = match x_height {
                Some(height) => height,
                None => {
                    // If not set - fallback to height * 45%.
                    // 45% is what Firefox uses.
                    u16::try_from(((ascent - descent) * 0.45).round() as i32)
                        .ok()
                        .and_then(NonZeroU16::new)?
                }
            };

            let line_through = metrics.strikeout;
            let line_through_position = match line_through {
                Some(metrics) => metrics.offset.round() as i16,
                None => x_height.get() as i16 / 2,
            };

            let (underline_position, underline_thickness) = match metrics.underline {
                Some(metrics) => {
                    let thickness = u16::try_from(metrics.thickness.round() as i32)
                        .ok()
                        .and_then(NonZeroU16::new)
                        // `skrifa` guarantees that units_per_em is > 0
                        .unwrap_or_else(|| NonZeroU16::new(units_per_em.get() / 12).unwrap());

                    (metrics.offset.round() as i16, thickness)
                }
                None => (
                    -(units_per_em.get() as i16) / 9,
                    NonZeroU16::new(units_per_em.get() / 12).unwrap(),
                ),
            };

            // 0.2 and 0.4 are generic offsets used by some applications (Inkscape/librsvg).
            let mut subscript_offset = (units_per_em.get() as f32 / 0.2).round() as i16;
            let mut superscript_offset = (units_per_em.get() as f32 / 0.4).round() as i16;

            // TODO: Consider upstreaming into skrifa
            if let Ok(os2) = font.os2() {
                subscript_offset = os2.y_subscript_y_offset();
                superscript_offset = os2.y_superscript_y_offset();
            }
            if let (Ok(mvar), true) = (font.mvar(), !coords.is_empty()) {
                use skrifa::raw::tables::mvar::tags::*;
                let metric_delta =
                    |tag| mvar.metric_delta(tag, coords).unwrap_or_default().to_f32();

                subscript_offset += metric_delta(SBYO).round() as i16;
                superscript_offset += metric_delta(SPYO).round() as i16;
            }

            Some(ResolvedFont {
                id,
                units_per_em,
                ascent: ascent.round() as i16,
                descent: descent.round() as i16,
                x_height,
                underline_position,
                underline_thickness,
                line_through_position,
                subscript_offset,
                superscript_offset,
            })
        })?
    }

    #[inline(never)]
    fn has_char(&self, id: ID, c: char) -> bool {
        let res = self.with_face_data(id, |font_data, face_index| -> Option<bool> {
            let font = skrifa::FontRef::from_index(font_data, face_index).ok()?;
            let char_map = skrifa::charmap::Charmap::new(&font);
            char_map.map(c)?;
            Some(true)
        });

        res == Some(Some(true))
    }
}

