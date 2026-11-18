//! Line breaking for simple text, preserving the original UTF-16 offsets and whitespace.

use crate::ui_text::UiTextLine;

pub(crate) fn lines(
    text: &str,
    multiline: bool,
    limit: Option<f32>,
    measure: impl Fn(&str) -> f32,
) -> Vec<UiTextLine> {
    let mut lines = Vec::new();
    let mut paragraph_byte = 0;
    for raw in text.split('\n') {
        let paragraph = raw.strip_suffix('\r').unwrap_or(raw);
        let mut start = 0;
        let mut token_start = 0;
        let mut previous_space = None;
        let mut tokens = Vec::new();
        for (byte, character) in paragraph.char_indices() {
            let space = character.is_whitespace();
            if previous_space.is_some_and(|previous| previous != space) {
                tokens.push((token_start, byte, previous_space.unwrap()));
                token_start = byte;
            }
            previous_space = Some(space);
        }
        if let Some(space) = previous_space {
            tokens.push((token_start, paragraph.len(), space));
        }
        for (begin, end, space) in tokens {
            if !space
                && multiline
                && limit
                    .is_some_and(|width| begin > start && measure(&paragraph[start..end]) > width)
            {
                push_line(
                    &mut lines,
                    text,
                    paragraph_byte + start,
                    paragraph_byte + begin,
                    &measure,
                );
                start = begin;
            }
        }
        push_line(
            &mut lines,
            text,
            paragraph_byte + start,
            paragraph_byte + paragraph.len(),
            &measure,
        );
        paragraph_byte += raw.len() + 1;
    }
    lines
}

fn push_line(
    lines: &mut Vec<UiTextLine>,
    text: &str,
    start: usize,
    end: usize,
    measure: &impl Fn(&str) -> f32,
) {
    let slice = &text[start..end];
    let utf16_start = text[..start].encode_utf16().count();
    lines.push(UiTextLine {
        text: slice.to_string(),
        start: utf16_start,
        end: utf16_start + slice.encode_utf16().count(),
        width: measure(slice),
        baseline_y: 0.0,
        top_y: 0.0,
    });
}
