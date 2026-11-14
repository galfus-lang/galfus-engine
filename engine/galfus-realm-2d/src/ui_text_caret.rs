//! OpenType ligature caret coordinates in font design units.

use crate::ui_text_geometry::{UiClusterCaret, UiTextCluster};
use galfus_realm_2d_resources::ui::UiText;
use read_fonts::types::GlyphId;
use read_fonts::{
    FontRef, TableProvider,
    tables::gdef::{CaretValue, LigCaretList},
};

pub(crate) fn ligature_carets(data: &[u8], face_index: u32, glyph: u32) -> Option<Vec<i16>> {
    let font = FontRef::from_index(data, face_index).ok()?;
    let gdef = font.gdef().ok()?;
    coordinates(&gdef.lig_caret_list()?.ok()?, glyph, |point| {
        let loca = font.loca(None).ok()?;
        let glyf = font.glyf().ok()?;
        match loca.get_glyf(GlyphId::new(glyph), &glyf).ok()?? {
            read_fonts::tables::glyf::Glyph::Simple(glyph) => {
                glyph.points().nth(point as usize).map(|point| point.x)
            }
            _ => None,
        }
    })
}

fn coordinates(
    table: &LigCaretList<'_>,
    glyph: u32,
    point: impl Fn(u16) -> Option<i16>,
) -> Option<Vec<i16>> {
    let coverage = table.coverage().ok()?.get(GlyphId::new(glyph))?;
    let ligature = table.lig_glyphs().get(coverage as usize).ok()?;
    ligature
        .caret_values()
        .iter()
        .map(|value| match value.ok()? {
            CaretValue::Format1(value) => Some(value.coordinate()),
            CaretValue::Format2(value) => point(value.caret_value_point_index()),
            // Rendering is unhinted at default variation coordinates.
            CaretValue::Format3(value) => Some(value.coordinate()),
        })
        .collect()
}

/// Estimates interior caret positions from the isolated grapheme advances when GDEF is absent.
pub(crate) fn estimate_carets(
    fonts: &fontdb::Database,
    font: fontdb::ID,
    text: &UiText,
    graphemes: &[std::ops::Range<usize>],
    offset: usize,
    cluster: &UiTextCluster,
) -> Vec<UiClusterCaret> {
    let start = cluster.start - offset;
    let end = cluster.end - offset;
    let first = graphemes.partition_point(|range| range.start < start);
    let last = graphemes.partition_point(|range| range.end <= end);
    if first >= last {
        return Vec::new();
    }
    let ranges = &graphemes[first..last];
    if ranges.len() < 2
        || ranges.first().is_none_or(|range| range.start != start)
        || ranges.last().is_none_or(|range| range.end != end)
        || cluster.rect[2] <= 0.0
    {
        return Vec::new();
    }
    let weights = fonts
        .with_face_data(font, |data, face_index| {
            ranges
                .iter()
                .map(|range| {
                    let piece = UiText::from_utf16(text.as_utf16()[range.clone()].to_vec()).ok()?;
                    let direction = if cluster.right_to_left {
                        harfrust::Direction::RightToLeft
                    } else {
                        harfrust::Direction::LeftToRight
                    };
                    let glyphs = crate::ui_text_shape::shape_directional_run(
                        data,
                        face_index,
                        &piece,
                        0,
                        Some(direction),
                    )
                    .ok()?;
                    Some(
                        glyphs
                            .iter()
                            .map(|glyph| glyph.x_advance.max(0) as f32)
                            .sum::<f32>(),
                    )
                })
                .collect::<Option<Vec<_>>>()
        })
        .flatten();
    let Some(mut weights) = weights else {
        return Vec::new();
    };
    let mut total: f32 = weights.iter().sum();
    if total <= 0.0 {
        weights.fill(1.0);
        total = weights.len() as f32;
    }
    let mut advance = 0.0;
    ranges
        .iter()
        .zip(weights)
        .take(ranges.len() - 1)
        .map(|(range, width)| {
            advance += width;
            let fraction = advance / total;
            UiClusterCaret {
                offset: offset + range.end,
                x: cluster.rect[0]
                    + cluster.rect[2]
                        * if cluster.right_to_left {
                            1.0 - fraction
                        } else {
                            fraction
                        },
                approximate: true,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use read_fonts::{FontData, FontRead};

    #[test]
    fn reads_caret_coordinates_for_a_covered_ligature() {
        // LigCaretList, coverage for glyph 7, and two coordinate-format carets.
        let bytes = [
            0, 8, 0, 1, 0, 14, 0, 0, 0, 1, 0, 1, 0, 7, 0, 2, 0, 6, 0, 10, 0, 1, 1, 44, 0, 1, 2, 88,
        ];
        let table = LigCaretList::read(FontData::new(&bytes)).unwrap();
        assert_eq!(coordinates(&table, 7, |_| None), Some(vec![300, 600]));
        assert_eq!(coordinates(&table, 8, |_| None), None);
    }

    #[test]
    fn resolves_point_and_unhinted_device_coordinates() {
        let bytes = [
            0, 8, 0, 1, 0, 14, 0, 0, 0, 1, 0, 1, 0, 7, 0, 2, 0, 6, 0, 10, 0, 2, 0, 3, 0, 3, 1, 244,
            0, 0,
        ];
        let table = LigCaretList::read(FontData::new(&bytes)).unwrap();
        assert_eq!(
            coordinates(&table, 7, |point| (point == 3).then_some(200)),
            Some(vec![200, 500])
        );
        assert_eq!(coordinates(&table, 7, |_| None), None);
    }
}
