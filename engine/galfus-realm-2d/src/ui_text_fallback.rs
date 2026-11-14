//! Shared font fallback and shaping for UI text.

use galfus_realm_2d_resources::ui::{TextNode, UiText};
use harfrust::Direction;
use unicode_bidi::BidiInfo;

use crate::ui_text_font::select_font;
use crate::ui_text_shape::{ShapedGlyph, shape_directional_run};

pub(crate) struct FontRun {
    pub font: fontdb::ID,
    pub glyphs: Vec<ShapedGlyph>,
    pub scale: f32,
}

/// Shapes a paragraph in visual order, choosing a single font for each grapheme.
pub(crate) fn shape(
    fonts: &fontdb::Database,
    family: &str,
    node: &TextNode,
) -> Result<Vec<FontRun>, String> {
    let primary = select_font(
        fonts,
        node.font_family.as_deref(),
        family,
        node.font_weight,
        node.italic,
    )
    .ok_or_else(|| "No usable UI font".to_string())?;
    let mut candidates: Vec<_> = fonts.faces().filter(|face| face.id != primary).collect();
    candidates.sort_by_key(|face| {
        (
            (face.style
                != if node.italic {
                    fontdb::Style::Italic
                } else {
                    fontdb::Style::Normal
                }),
            face.weight.0.abs_diff(node.font_weight),
        )
    });
    let mut ordered = vec![primary];
    ordered.extend(candidates.into_iter().map(|face| face.id));
    let string = node.text.to_string();
    let bidi = BidiInfo::new(&string, None);
    if bidi.paragraphs.len() > 1 {
        return Err("Expected a single paragraph".to_string());
    }
    let Some(paragraph) = bidi.paragraphs.first() else {
        return Ok(Vec::new());
    };
    let (levels, runs) = bidi.visual_runs(paragraph, paragraph.range.clone());
    let mut result = Vec::new();
    let mut coverage = std::collections::HashMap::<Vec<u16>, fontdb::ID>::new();
    for run in runs {
        let rtl = levels[run.start].is_rtl();
        let run_start = string[..run.start].encode_utf16().count();
        let text = UiText::from(&string[run]);
        let mut groups: Vec<(fontdb::ID, usize, Vec<u16>)> = Vec::new();
        if supports(fonts, primary, text.as_utf16()) {
            groups.push((primary, run_start, text.as_utf16().to_vec()));
        } else {
            for range in text.grapheme_ranges() {
                let units = &text.as_utf16()[range.clone()];
                let font = *coverage.entry(units.to_vec()).or_insert_with(|| {
                    ordered
                        .iter()
                        .copied()
                        .find(|&id| supports(fonts, id, units))
                        .unwrap_or(primary)
                });
                if let Some((last, _, contents)) = groups.last_mut()
                    && *last == font
                {
                    contents.extend_from_slice(units);
                } else {
                    groups.push((font, run_start + range.start, units.to_vec()));
                }
            }
        }
        if rtl {
            groups.reverse();
        }
        for (font, start, units) in groups {
            let start = u32::try_from(start)
                .map_err(|_| "Text exceeds the supported UTF-16 offset range".to_string())?;
            let text = UiText::from_utf16(units).map_err(|e| e.to_string())?;
            let shaped = fonts
                .with_face_data(font, |data, index| {
                    let face = ttf_parser::Face::parse(data, index).map_err(|e| e.to_string())?;
                    let direction = if rtl {
                        Direction::RightToLeft
                    } else {
                        Direction::LeftToRight
                    };
                    let glyphs = shape_directional_run(data, index, &text, start, Some(direction))?;
                    Ok::<FontRun, String>(FontRun {
                        font,
                        glyphs,
                        scale: node.font_size / face.units_per_em() as f32,
                    })
                })
                .ok_or_else(|| "Font data unavailable".to_string())??;
            result.push(shaped);
        }
    }
    Ok(result)
}

fn supports(fonts: &fontdb::Database, id: fontdb::ID, units: &[u16]) -> bool {
    fonts.with_face_data(id, |data, index| {
        let Ok(face) = ttf_parser::Face::parse(data, index) else { return false; };
        char::decode_utf16(units.iter().copied()).all(|c| c.is_ok_and(|c| {
            c.is_control() || matches!(c as u32, 0x200c..=0x200f | 0x202a..=0x202e | 0x2060..=0x206f | 0xfe00..=0xfe0f | 0xe0100..=0xe01ef) || face.glyph_index(c).is_some()
        }))
    }).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn fonts_with_limited_primary() -> (fontdb::Database, String, fontdb::ID, fontdb::ID) {
        let original = include_bytes!("../assets/default_font.ttf").to_vec();
        let face = ttf_parser::Face::parse(&original, 0).unwrap();
        let a = face.glyph_index('a').unwrap().0;
        let delta = a.wrapping_sub('a' as u16);
        // Replace cmap with a valid format 4 table containing only 'a'.
        let mut cmap = vec![
            0, 0, 0, 1, 0, 3, 0, 1, 0, 0, 0, 12, 0, 4, 0, 32, 0, 0, 0, 4, 0, 4, 0, 1, 0, 0, 0, 97,
            255, 255, 0, 0, 0, 97, 255, 255,
        ];
        cmap.extend(delta.to_be_bytes());
        cmap.extend([0, 1, 0, 0, 0, 0]);
        let mut limited = original.clone();
        let count = u16::from_be_bytes([limited[4], limited[5]]) as usize;
        let record = (0..count)
            .map(|index| 12 + index * 16)
            .find(|&index| &limited[index..index + 4] == b"cmap")
            .unwrap();
        let offset = limited.len() as u32;
        limited[record + 8..record + 12].copy_from_slice(&offset.to_be_bytes());
        limited[record + 12..record + 16].copy_from_slice(&(cmap.len() as u32).to_be_bytes());
        limited.extend(cmap);
        let mut fonts = fontdb::Database::new();
        let primary = fonts.load_font_source(fontdb::Source::Binary(Arc::new(limited)))[0];
        let fallback = fonts.load_font_source(fontdb::Source::Binary(Arc::new(original)))[0];
        let family = fonts.face(primary).unwrap().families[0].0.clone();
        (fonts, family, primary, fallback)
    }

    #[test]
    fn uses_a_fallback_for_missing_graphemes_and_keeps_metrics_consistent() {
        let (fonts, family, primary, fallback) = fonts_with_limited_primary();
        let node = TextNode {
            text: "ab".into(),
            ..Default::default()
        };
        let runs = shape(&fonts, &family, &node).unwrap();
        assert_eq!(
            runs.iter().map(|run| run.font).collect::<Vec<_>>(),
            [primary, fallback]
        );
        assert!(
            runs.iter()
                .flat_map(|run| &run.glyphs)
                .all(|glyph| glyph.glyph_id != 0)
        );
        let geometry =
            crate::ui_text_geometry::text_geometry(&node, &fonts, &family, [0.0, 0.0, 200.0, 50.0])
                .unwrap();
        let measurement = crate::ui_text::measure_text(&fonts, &family, &node, None);
        assert!(
            (geometry
                .clusters
                .iter()
                .map(|cluster| cluster.rect[2])
                .sum::<f32>()
                - measurement.width)
                .abs()
                < 0.001
        );
        let mut buffers = lyon_tessellation::VertexBuffers::new();
        crate::ui_text::tessellate_text_run(
            &mut buffers,
            &fonts,
            &family,
            &node,
            0.0,
            0.0,
            200.0,
            50.0,
            200.0,
            50.0,
            0.0,
            1.0,
            None,
        );
        assert!(!buffers.vertices.is_empty());
        assert!(
            buffers
                .vertices
                .iter()
                .any(|vertex| vertex[0] > geometry.clusters[1].rect[0] - 100.0)
        );
        let rich = galfus_realm_2d_resources::ui::RichText {
            spans: vec![galfus_realm_2d_resources::ui::RichTextSpan {
                text: "ab".into(),
                style: Default::default(),
            }],
            ..Default::default()
        };
        let rich_geometry = crate::ui_text_geometry::rich_text_geometry(
            &rich,
            &fonts,
            &family,
            [0.0, 0.0, 200.0, 50.0],
        )
        .unwrap();
        assert_eq!(rich_geometry.clusters.len(), 2);
        assert!((rich_geometry.clusters[1].rect[0] - geometry.clusters[1].rect[0]).abs() < 0.001);
    }

    #[test]
    fn keeps_combining_graphemes_in_one_font_and_preserves_bidi_order() {
        let (fonts, family, _primary, fallback) = fonts_with_limited_primary();
        let node = TextNode {
            text: "a\u{301} אב".into(),
            ..Default::default()
        };
        let runs = shape(&fonts, &family, &node).unwrap();
        assert_eq!(runs[0].font, fallback);
        let glyphs: Vec<_> = runs.iter().flat_map(|run| &run.glyphs).collect();
        assert!(glyphs.iter().all(|glyph| glyph.cluster != 1));
        let alef = glyphs.iter().position(|glyph| glyph.cluster == 3).unwrap();
        let bet = glyphs.iter().position(|glyph| glyph.cluster == 4).unwrap();
        assert!(bet < alef);
    }
}
