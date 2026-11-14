//! Data types for a formatted UTF-16 text sequence.

use serde::{Deserialize, Serialize};

use super::{TextAlign, TextWrapMode, UiText};

/// Visual properties applied to a contiguous run of text.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RichTextStyle {
    pub font_size: f32,
    /// OpenType font weight in the range 1 through 1000.
    pub font_weight: u16,
    pub italic: bool,
    pub underline: bool,
    pub strikethrough: bool,
    pub color: [f32; 4],
}

impl Default for RichTextStyle {
    fn default() -> Self {
        Self {
            font_size: 14.0,
            font_weight: 400,
            italic: false,
            underline: false,
            strikethrough: false,
            color: [1.0; 4],
        }
    }
}

impl RichTextStyle {
    pub fn is_valid(&self) -> bool {
        self.font_size.is_finite()
            && self.font_size > 0.0
            && (1..=1000).contains(&self.font_weight)
            && self.color.iter().all(|channel| channel.is_finite())
    }
}

/// One formatted run. Text is stored in UTF-16, including after deserialization.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RichTextSpan {
    pub text: UiText,
    #[serde(default)]
    pub style: RichTextStyle,
}

/// An ordered collection of runs forming one logical UTF-16 text sequence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RichText {
    #[serde(default)]
    pub spans: Vec<RichTextSpan>,
    /// Text wrapping policy; defaults to no automatic wrapping.
    #[serde(default)]
    pub wrap: TextWrapMode,
    /// Horizontal alignment within the allocated text bounds.
    #[serde(default)]
    pub align: TextAlign,
    /// Whether this element participates in multiline layout.
    #[serde(default = "super::types::default_true")]
    pub multiline: bool,
}

impl Default for RichText {
    fn default() -> Self {
        Self {
            spans: Vec::new(),
            wrap: TextWrapMode::NoWrap,
            align: TextAlign::Left,
            multiline: true,
        }
    }
}

impl RichText {
    /// Total length in UTF-16 code units, or `None` if the length overflows.
    pub fn utf16_len(&self) -> Option<usize> {
        self.spans.iter().try_fold(0usize, |len, span| {
            len.checked_add(span.text.as_utf16().len())
        })
    }

    pub fn is_valid(&self) -> bool {
        self.utf16_len().is_some() && self.spans.iter().all(|span| span.style.is_valid())
    }

    /// Returns grapheme ranges across the complete text, including run boundaries.
    pub fn grapheme_ranges(&self) -> Vec<std::ops::Range<usize>> {
        let units = self
            .spans
            .iter()
            .flat_map(|span| span.text.as_utf16().iter().copied())
            .collect();
        // Each span is valid UTF-16, so concatenating them is valid as well.
        UiText::from_utf16(units)
            .expect("concatenated valid UTF-16 spans must be valid")
            .grapheme_ranges()
    }

    /// Groups complete graphemes into styled runs, using the style at each grapheme's start.
    pub fn grapheme_spans(&self) -> Vec<RichTextSpan> {
        let units: Vec<u16> = self
            .spans
            .iter()
            .flat_map(|span| span.text.as_utf16().iter().copied())
            .collect();
        let mut boundaries = Vec::with_capacity(self.spans.len());
        let mut offset = 0;
        for span in &self.spans {
            offset += span.text.as_utf16().len();
            boundaries.push(offset);
        }
        let mut result: Vec<(RichTextStyle, Vec<u16>)> = Vec::new();
        let mut span_index = 0;
        for range in self.grapheme_ranges() {
            while span_index < boundaries.len() && range.start >= boundaries[span_index] {
                span_index += 1;
            }
            let style = &self.spans[span_index].style;
            if let Some((last_style, last_units)) = result.last_mut()
                && last_style == style
            {
                last_units.extend_from_slice(&units[range]);
            } else {
                result.push((style.clone(), units[range].to_vec()));
            }
        }
        result
            .into_iter()
            .map(|(style, units)| RichTextSpan {
                text: UiText::from_utf16(units).expect("complete graphemes are valid UTF-16"),
                style,
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spans_form_one_utf16_sequence_with_independent_styles() {
        let text: RichText = serde_json::from_str(
            r#"{"spans":[{"text":"A😀"},{"text":"é","style":{"fontSize":20,"fontWeight":700,"italic":true,"underline":true,"strikethrough":true,"color":[1,0,0,1]}}]}"#,
        )
        .unwrap();
        assert!(text.is_valid());
        assert_eq!(text.utf16_len(), Some(4));
        assert_eq!(text.spans[0].text.as_utf16(), &[65, 0xd83d, 0xde00]);
        assert_eq!(text.spans[1].style.font_weight, 700);
        assert_eq!(text.spans[1].style.color, [1.0, 0.0, 0.0, 1.0]);
        assert_eq!(
            serde_json::from_str::<RichText>(&serde_json::to_string(&text).unwrap()).unwrap(),
            text
        );
    }

    #[test]
    fn rejects_invalid_style_and_invalid_utf16_json() {
        let mut style = RichTextStyle {
            font_weight: 0,
            ..Default::default()
        };
        assert!(!style.is_valid());
        style.font_weight = 400;
        style.font_size = f32::NAN;
        assert!(!style.is_valid());
        assert!(serde_json::from_str::<RichText>(r#"{"spans":[{"text":"\ud800"}]}"#).is_err());
    }

    #[test]
    fn grapheme_boundaries_span_formatting_runs() {
        let text = RichText {
            spans: vec![
                RichTextSpan {
                    text: "e".into(),
                    style: RichTextStyle::default(),
                },
                RichTextSpan {
                    text: "\u{301}😀".into(),
                    style: RichTextStyle::default(),
                },
            ],
            ..Default::default()
        };
        assert_eq!(text.grapheme_ranges(), vec![0..2, 2..4]);
        let spans = text.grapheme_spans();
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].text.as_utf16(), &[0x65, 0x301, 0xd83d, 0xde00]);
    }

    #[test]
    fn mixed_style_combining_graphemes_use_the_style_of_the_base() {
        let text = RichText {
            spans: vec![
                RichTextSpan {
                    text: "e".into(),
                    style: RichTextStyle::default(),
                },
                RichTextSpan {
                    text: "\u{301}b".into(),
                    style: RichTextStyle {
                        font_weight: 700,
                        ..Default::default()
                    },
                },
            ],
            ..Default::default()
        };
        let spans = text.grapheme_spans();
        assert_eq!(spans.len(), 2);
        assert_eq!(spans[0].text.as_utf16(), &[0x65, 0x301]);
        assert_eq!(spans[0].style.font_weight, 400);
        assert_eq!(spans[1].text.as_utf16(), &[0x62]);
        assert_eq!(spans[1].style.font_weight, 700);
    }

    #[test]
    fn text_layout_defaults_and_options_match_the_transport_contract() {
        let default: RichText = serde_json::from_str("{}").unwrap();
        assert_eq!(default, RichText::default());
        let text: RichText =
            serde_json::from_str(r#"{"multiline":false,"wrap":"wordWrap","align":"right"}"#)
                .unwrap();
        assert!(!text.multiline);
        assert_eq!(text.wrap, TextWrapMode::WordWrap);
        assert_eq!(text.align, TextAlign::Right);
    }
}
