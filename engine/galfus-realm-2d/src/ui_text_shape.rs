//! Shaping of individual directional runs with UTF-16 cluster indices.

use galfus_realm_2d_resources::ui::UiText;
use harfrust::{Direction, FontRef, ShapeOptions, ShaperData, UnicodeBuffer};
use unicode_bidi::BidiInfo;

/// A glyph positioned relative to the run, in font units.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ShapedGlyph {
    pub glyph_id: u32,
    /// Start of the input cluster in UTF-16 code units.
    pub cluster: u32,
    pub x_advance: i32,
    pub y_advance: i32,
    pub x_offset: i32,
    pub y_offset: i32,
    pub right_to_left: bool,
}

/// Shapes a single directional run. Callers must split mixed-direction paragraphs first.
///
/// The returned offsets refer to `text`, not the original UTF-8 transport representation.
pub fn shape_run(
    font_data: &[u8],
    face_index: u32,
    text: &UiText,
) -> Result<Vec<ShapedGlyph>, String> {
    shape_directional_run(font_data, face_index, text, 0, None)
}

pub(crate) fn shape_directional_run(
    font_data: &[u8],
    face_index: u32,
    text: &UiText,
    start: u32,
    direction: Option<Direction>,
) -> Result<Vec<ShapedGlyph>, String> {
    let font = FontRef::from_index(font_data, face_index).map_err(|error| error.to_string())?;
    let shaper_data = ShaperData::new(&font);
    let shaper = shaper_data.shaper(&font).build();
    let mut input = UnicodeBuffer::new();
    let mut utf16_offset = start;
    for decoded in char::decode_utf16(text.as_utf16().iter().copied()) {
        let character = decoded.map_err(|error| error.to_string())?;
        input.add(character, utf16_offset);
        utf16_offset = utf16_offset
            .checked_add(character.len_utf16() as u32)
            .ok_or_else(|| "Text exceeds the supported UTF-16 offset range".to_string())?;
    }
    input.guess_segment_properties();
    if let Some(direction) = direction {
        input.set_direction(direction);
    }
    let right_to_left = input.direction() == Direction::RightToLeft;
    let shaped = shaper.shape(input, ShapeOptions::new());
    Ok(shaped
        .glyph_infos()
        .iter()
        .zip(shaped.glyph_positions())
        .map(|(glyph, position)| ShapedGlyph {
            glyph_id: glyph.glyph_id,
            cluster: glyph.cluster,
            x_advance: position.x_advance,
            y_advance: position.y_advance,
            x_offset: position.x_offset,
            y_offset: position.y_offset,
            right_to_left,
        })
        .collect())
}

/// Shapes a single paragraph in visual order, retaining logical UTF-16 clusters.
/// Line wrapping and fallback font selection must be handled by the caller.
pub fn shape_paragraph(
    font_data: &[u8],
    face_index: u32,
    text: &UiText,
) -> Result<Vec<ShapedGlyph>, String> {
    let string = text.to_string();
    let bidi = BidiInfo::new(&string, None);
    if bidi.paragraphs.len() > 1 {
        return Err("Expected a single paragraph".to_string());
    }
    let Some(paragraph) = bidi.paragraphs.first() else {
        return Ok(Vec::new());
    };
    let (levels, runs) = bidi.visual_runs(paragraph, paragraph.range.clone());
    let mut result = Vec::new();
    for run in runs {
        let start = u32::try_from(string[..run.start].encode_utf16().count())
            .map_err(|_| "Text exceeds the supported UTF-16 offset range".to_string())?;
        let direction = if levels[run.start].is_rtl() {
            Direction::RightToLeft
        } else {
            Direction::LeftToRight
        };
        result.extend(shape_directional_run(
            font_data,
            face_index,
            &UiText::from(&string[run]),
            start,
            Some(direction),
        )?);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FONT: &[u8] = include_bytes!("../assets/default_font.ttf");

    #[test]
    fn clusters_are_utf16_offsets_not_utf8_byte_offsets() {
        let glyphs = shape_run(FONT, 0, &UiText::from("a😀b")).unwrap();
        assert_eq!(
            glyphs.iter().map(|glyph| glyph.cluster).collect::<Vec<_>>(),
            [0, 1, 3]
        );
    }

    #[test]
    fn combining_marks_share_their_base_cluster() {
        let glyphs = shape_run(FONT, 0, &UiText::from("a\u{301}b")).unwrap();
        assert!(glyphs.iter().all(|glyph| glyph.cluster != 1));
        assert_eq!(glyphs.last().unwrap().cluster, 2);
    }

    #[test]
    fn rejects_invalid_font_data() {
        assert!(shape_run(&[], 0, &UiText::from("a")).is_err());
    }

    #[test]
    fn mixed_direction_runs_keep_utf16_clusters_in_visual_order() {
        let glyphs = shape_paragraph(FONT, 0, &UiText::from("a😀 אב b")).unwrap();
        let indices: Vec<_> = glyphs.iter().map(|glyph| glyph.cluster).collect();
        let alef = indices.iter().position(|&index| index == 4).unwrap();
        let bet = indices.iter().position(|&index| index == 5).unwrap();
        assert!(bet < alef, "RTL run should be in visual order: {indices:?}");
        assert!(indices.contains(&3));
        assert!(indices.contains(&7));
    }
}
