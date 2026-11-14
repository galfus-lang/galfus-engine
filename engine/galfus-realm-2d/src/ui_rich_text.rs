//! Layout and geometry for formatted UI text.

use galfus_realm_2d_resources::ui::{
    RichText, RichTextSpan, TextAlign, TextNode, TextWrapMode, UiText,
};
use lyon_tessellation::VertexBuffers;

use crate::ui_text::{measure_text, tessellate_rounded_panel, tessellate_text_run};
use crate::vector_geometry::VectorVertex;

#[derive(Clone)]
pub(crate) struct Fragment {
    pub(crate) node: TextNode,
    pub(crate) x: f32,
    pub(crate) y: f32,
    pub(crate) width: f32,
    /// Logical UTF-16 offset in the complete rich text.
    pub(crate) start: usize,
    pub(crate) underline: bool,
    pub(crate) strikethrough: bool,
}

/// Logical text range and vertical position of a laid-out line.
pub(crate) struct Line {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) y: f32,
}

fn node_for(span: &RichTextSpan, text: UiText) -> TextNode {
    TextNode {
        text,
        font_size: span.style.font_size,
        font_weight: span.style.font_weight,
        italic: span.style.italic,
        color: span.style.color,
        ..Default::default()
    }
}

pub(crate) fn layout(
    text: &RichText,
    fonts: &fontdb::Database,
    family: &str,
    limit: Option<f32>,
) -> (Vec<Fragment>, [f32; 2]) {
    let (fragments, size, _) = layout_with_lines(text, fonts, family, limit);
    (fragments, size)
}

pub(crate) fn layout_with_lines(
    text: &RichText,
    fonts: &fontdb::Database,
    family: &str,
    limit: Option<f32>,
) -> (Vec<Fragment>, [f32; 2], Vec<Line>) {
    let mut fragments = Vec::new();
    let line_height = text
        .spans
        .iter()
        .map(|span| span.style.font_size * 1.2)
        .fold(0.0_f32, f32::max)
        .max(if text.spans.is_empty() {
            14.0 * 1.2
        } else {
            0.0
        });
    if line_height <= 0.0 {
        return (fragments, [0.0, 0.0], Vec::new());
    }
    let mut lines = Vec::new();
    let mut line_start = 0;
    let mut x = 0.0_f32;
    let mut y = 0.0_f32;
    let mut width = 0.0_f32;
    let spans = text.grapheme_spans();
    let mut tokens: Vec<(usize, Vec<u16>, bool, bool, usize)> = Vec::new();
    let mut span_start = 0;
    for (span_index, span) in spans.iter().enumerate() {
        for range in span.text.grapheme_ranges() {
            let start = span_start + range.start;
            let units = &span.text.as_utf16()[range];
            let is_line_break = units == [10] || units == [13, 10];
            let newline = is_line_break && text.multiline;
            // Inline text preserves UTF-16 offsets while displaying line breaks as spaces.
            let inline_spaces;
            let units = if is_line_break && !text.multiline {
                inline_spaces = vec![b' ' as u16; units.len()];
                inline_spaces.as_slice()
            } else {
                units
            };
            let whitespace = !newline
                && UiText::from_utf16(units.to_vec())
                    .unwrap()
                    .to_string()
                    .chars()
                    .all(char::is_whitespace);
            if !newline
                && let Some((previous_index, previous, was_space, false, _)) = tokens.last_mut()
                && *previous_index == span_index
                && *was_space == whitespace
            {
                previous.extend_from_slice(units);
            } else {
                tokens.push((span_index, units.to_vec(), whitespace, newline, start));
            }
        }
        span_start += span.text.as_utf16().len();
    }
    let mut index = 0;
    while index < tokens.len() {
        let (_, units, whitespace, newline, start) = &tokens[index];
        if *newline {
            lines.push(Line {
                start: line_start,
                end: *start,
                y,
            });
            line_start = start + units.len();
            width = width.max(x);
            x = 0.0;
            y += line_height;
            index += 1;
            continue;
        }
        let mut end = index + 1;
        while end < tokens.len() && !tokens[end].3 && tokens[end].2 == *whitespace {
            end += 1;
        }
        let mut group = Vec::new();
        let mut group_width = 0.0;
        for (span_index, units, _, _, start) in &tokens[index..end] {
            let span = &spans[*span_index];
            let node = node_for(
                span,
                UiText::from_utf16(units.clone()).expect("valid UTF-16 token"),
            );
            let measured = measure_text(fonts, family, &node, None).width;
            group.push((span, node, measured, *start));
            group_width += measured;
        }
        if !*whitespace
            && text.multiline
            && text.wrap == TextWrapMode::WordWrap
            && x > 0.0
            && limit.is_some_and(|limit| x + group_width > limit)
        {
            lines.push(Line {
                start: line_start,
                end: *start,
                y,
            });
            line_start = *start;
            width = width.max(x);
            x = 0.0;
            y += line_height;
        }
        for (span, node, measured, start) in group {
            fragments.push(Fragment {
                node,
                x,
                y,
                width: measured,
                start,
                underline: span.style.underline,
                strikethrough: span.style.strikethrough,
            });
            x += measured;
        }
        index = end;
    }
    lines.push(Line {
        start: line_start,
        end: text.utf16_len().expect("valid text length"),
        y,
    });
    width = width.max(x);
    fragments = crate::ui_rich_bidi::reorder_lines(fragments, fonts, family);
    for fragment in &fragments {
        width = width.max(fragment.x + fragment.width);
    }
    if let Some(limit) = limit {
        let mut index = 0;
        while index < fragments.len() {
            let line_y = fragments[index].y;
            let mut end = index + 1;
            let mut line_width = fragments[index].x + fragments[index].width;
            while end < fragments.len() && fragments[end].y == line_y {
                line_width = line_width.max(fragments[end].x + fragments[end].width);
                end += 1;
            }
            let free = (limit - line_width).max(0.0);
            let offset = match text.align {
                TextAlign::Left => 0.0,
                TextAlign::Center => free * 0.5,
                TextAlign::Right => free,
            };
            for fragment in &mut fragments[index..end] {
                fragment.x += offset;
            }
            index = end;
        }
    }
    (fragments, [width, y + line_height], lines)
}

pub(crate) fn measure(
    text: &RichText,
    fonts: &fontdb::Database,
    family: &str,
    limit: Option<f32>,
) -> [f32; 2] {
    layout(text, fonts, family, limit).1
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn tessellate(
    buffers: &mut VertexBuffers<VectorVertex, u32>,
    text: &RichText,
    fonts: &fontdb::Database,
    family: &str,
    rect: [f32; 4],
    dimensions: [f32; 2],
    z: f32,
    opacity: f32,
) {
    let (fragments, _) = layout(text, fonts, family, Some(rect[2]));
    for fragment in fragments {
        let x = rect[0] + fragment.x;
        let y = rect[1] + fragment.y;
        tessellate_text_run(
            buffers,
            fonts,
            family,
            &fragment.node,
            x,
            y,
            fragment.width.max(0.001),
            rect[3],
            dimensions[0],
            dimensions[1],
            z,
            opacity,
            None,
        );
        let mut color = fragment.node.color;
        color[3] *= opacity;
        let thickness = (fragment.node.font_size / 16.0).max(1.0);
        for (enabled, offset) in [
            (fragment.underline, fragment.node.font_size * 1.08),
            (fragment.strikethrough, fragment.node.font_size * 0.65),
        ] {
            if enabled && fragment.width > 0.0 {
                tessellate_rounded_panel(
                    buffers,
                    x - dimensions[0] * 0.5,
                    dimensions[1] * 0.5 - y - offset,
                    fragment.width,
                    thickness,
                    [0.0; 4],
                    color,
                    [0.0; 4],
                    [0.0; 4],
                    z + 0.0002,
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use galfus_realm_2d_resources::ui::{RichTextSpan, RichTextStyle};

    #[test]
    fn formats_fragments_and_wraps_with_the_same_measured_width() {
        let mut fonts = fontdb::Database::new();
        fonts.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
        let family = fonts.faces().next().unwrap().families[0].0.clone();
        let text = RichText {
            spans: vec![
                RichTextSpan {
                    text: "red ".into(),
                    style: RichTextStyle {
                        color: [1.0, 0.0, 0.0, 1.0],
                        underline: true,
                        ..Default::default()
                    },
                },
                RichTextSpan {
                    text: "green".into(),
                    style: RichTextStyle {
                        color: [0.0, 1.0, 0.0, 1.0],
                        font_size: 20.0,
                        strikethrough: true,
                        ..Default::default()
                    },
                },
            ],
            wrap: TextWrapMode::WordWrap,
            ..Default::default()
        };
        let (fragments, size) = layout(&text, &fonts, &family, None);
        assert_eq!(fragments.len(), 3);
        assert!(fragments[0].underline);
        assert!(fragments[2].strikethrough);
        assert_eq!(fragments[1].x, fragments[0].width);
        assert!(
            (size[0] - fragments.iter().map(|fragment| fragment.width).sum::<f32>()).abs() < 0.01
        );
        let (wrapped, _) = layout(
            &text,
            &fonts,
            &family,
            Some(fragments[0].width + fragments[1].width + 1.0),
        );
        assert!(wrapped.iter().any(|fragment| fragment.y > 0.0));
        let mut buffers = VertexBuffers::new();
        tessellate(
            &mut buffers,
            &text,
            &fonts,
            &family,
            [0.0, 0.0, size[0], size[1]],
            [200.0, 100.0],
            0.0,
            1.0,
        );
        assert!(
            buffers
                .vertices
                .iter()
                .any(|vertex| vertex[5] > 0.9 && vertex[6] < 0.1)
        );
        assert!(
            buffers
                .vertices
                .iter()
                .any(|vertex| vertex[6] > 0.9 && vertex[5] < 0.1)
        );
    }

    #[test]
    fn synthetic_weight_and_italic_change_glyph_geometry_when_font_has_no_variants() {
        let mut fonts = fontdb::Database::new();
        fonts.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
        let family = fonts.faces().next().unwrap().families[0].0.clone();
        let render = |style: RichTextStyle| {
            let text = RichText {
                spans: vec![RichTextSpan {
                    text: "Italic".into(),
                    style,
                }],
                ..Default::default()
            };
            let size = measure(&text, &fonts, &family, None);
            let mut buffers = VertexBuffers::new();
            tessellate(
                &mut buffers,
                &text,
                &fonts,
                &family,
                [0.0, 0.0, size[0], size[1]],
                [200.0, 100.0],
                0.0,
                1.0,
            );
            buffers
        };
        let regular = render(RichTextStyle::default());
        let italic = render(RichTextStyle {
            italic: true,
            ..Default::default()
        });
        let bold = render(RichTextStyle {
            font_weight: 700,
            ..Default::default()
        });
        assert_ne!(regular.vertices, italic.vertices);
        assert!(bold.indices.len() > regular.indices.len());
    }

    #[test]
    fn inline_and_multiline_preserve_intrinsic_size_and_alignment() {
        let mut fonts = fontdb::Database::new();
        fonts.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
        let family = fonts.faces().next().unwrap().families[0].0.clone();
        let mut text = RichText {
            spans: vec![RichTextSpan {
                text: "one two three".into(),
                style: RichTextStyle::default(),
            }],
            multiline: false,
            wrap: TextWrapMode::WordWrap,
            ..Default::default()
        };
        let (inline, inline_size) = layout(&text, &fonts, &family, Some(45.0));
        assert!(inline.iter().all(|fragment| fragment.y == 0.0));
        assert!(inline_size[0] > 45.0);
        text.multiline = true;
        let (multiline, multiline_size) = layout(&text, &fonts, &family, Some(45.0));
        assert!(multiline.iter().any(|fragment| fragment.y > 0.0));
        assert!(multiline_size[1] > inline_size[1]);
        text.align = TextAlign::Right;
        let (right, _) = layout(&text, &fonts, &family, Some(100.0));
        assert!(right.first().unwrap().x > 0.0);
    }

    #[test]
    fn inline_line_breaks_remain_on_one_line_and_keep_utf16_offsets() {
        let mut fonts = fontdb::Database::new();
        fonts.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
        let family = fonts.faces().next().unwrap().families[0].0.clone();
        let text = RichText {
            spans: vec![RichTextSpan {
                text: "a\r\n😀\nb".into(),
                style: RichTextStyle::default(),
            }],
            multiline: false,
            wrap: TextWrapMode::WordWrap,
            ..Default::default()
        };
        let (fragments, _, lines) = layout_with_lines(&text, &fonts, &family, Some(5.0));
        assert_eq!(lines.len(), 1);
        assert_eq!((lines[0].start, lines[0].end), (0, 7));
        assert_eq!(
            fragments
                .iter()
                .map(|part| part.node.text.to_string())
                .collect::<String>(),
            "a  😀 b"
        );
        assert!(fragments.iter().all(|fragment| fragment.y == 0.0));
    }

    #[test]
    fn bidi_reorders_styled_fragments_without_reversing_the_logical_text() {
        let mut fonts = fontdb::Database::new();
        fonts.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
        let family = fonts.faces().next().unwrap().families[0].0.clone();
        let text = RichText {
            spans: vec![
                RichTextSpan {
                    text: "A ".into(),
                    style: RichTextStyle::default(),
                },
                RichTextSpan {
                    text: "א".into(),
                    style: RichTextStyle {
                        color: [1.0, 0.0, 0.0, 1.0],
                        ..Default::default()
                    },
                },
                RichTextSpan {
                    text: "ב".into(),
                    style: RichTextStyle {
                        color: [0.0, 1.0, 0.0, 1.0],
                        ..Default::default()
                    },
                },
                RichTextSpan {
                    text: " C".into(),
                    style: RichTextStyle::default(),
                },
            ],
            ..Default::default()
        };
        let (fragments, _) = layout(&text, &fonts, &family, None);
        let visible: Vec<String> = fragments
            .iter()
            .map(|fragment| fragment.node.text.to_string())
            .collect();
        let alef = visible.iter().position(|text| text == "א").unwrap();
        let bet = visible.iter().position(|text| text == "ב").unwrap();
        assert!(
            bet < alef,
            "visual order should reverse the Hebrew run: {visible:?}"
        );
        assert_eq!(fragments[alef].start, 2);
        assert_eq!(fragments[bet].start, 3);
    }

    #[test]
    fn combining_across_styles_is_measured_as_one_grapheme() {
        let mut fonts = fontdb::Database::new();
        fonts.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
        let family = fonts.faces().next().unwrap().families[0].0.clone();
        let text = RichText {
            spans: vec![
                RichTextSpan {
                    text: "e".into(),
                    style: RichTextStyle::default(),
                },
                RichTextSpan {
                    text: "\u{301}x".into(),
                    style: RichTextStyle {
                        font_weight: 700,
                        ..Default::default()
                    },
                },
            ],
            ..Default::default()
        };
        let (fragments, _) = layout(&text, &fonts, &family, None);
        assert_eq!(fragments[0].node.text.to_string(), "e\u{301}");
        assert_eq!(fragments[1].node.text.to_string(), "x");
    }

    #[test]
    fn formatting_boundary_does_not_split_a_word_when_wrapping() {
        let mut fonts = fontdb::Database::new();
        fonts.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
        let family = fonts.faces().next().unwrap().families[0].0.clone();
        let text = RichText {
            spans: vec![
                RichTextSpan {
                    text: "a super".into(),
                    style: RichTextStyle::default(),
                },
                RichTextSpan {
                    text: "power".into(),
                    style: RichTextStyle {
                        font_weight: 700,
                        ..Default::default()
                    },
                },
            ],
            wrap: TextWrapMode::WordWrap,
            ..Default::default()
        };
        let (fragments, _) = layout(&text, &fonts, &family, Some(60.0));
        let super_part = fragments
            .iter()
            .find(|fragment| fragment.node.text.to_string() == "super")
            .unwrap();
        let power_part = fragments
            .iter()
            .find(|fragment| fragment.node.text.to_string() == "power")
            .unwrap();
        assert!(super_part.y > 0.0);
        assert_eq!(super_part.y, power_part.y);
    }

    #[test]
    fn fragments_keep_logical_utf16_offsets_across_styles_and_newlines() {
        let mut fonts = fontdb::Database::new();
        fonts.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
        let family = fonts.faces().next().unwrap().families[0].0.clone();
        let text = RichText {
            spans: vec![
                RichTextSpan {
                    text: "a😀\n".into(),
                    style: RichTextStyle::default(),
                },
                RichTextSpan {
                    text: "e\u{301}b".into(),
                    style: RichTextStyle {
                        font_weight: 700,
                        ..Default::default()
                    },
                },
            ],
            ..Default::default()
        };
        let (fragments, _) = layout(&text, &fonts, &family, None);
        assert_eq!(fragments.len(), 2);
        assert_eq!(fragments[0].start, 0);
        assert_eq!(fragments[0].node.text.as_utf16().len(), 3);
        assert_eq!(fragments[1].start, 4);
        assert_eq!(fragments[1].node.text.as_utf16().len(), 3);
        assert!(fragments[1].y > fragments[0].y);
    }
}
