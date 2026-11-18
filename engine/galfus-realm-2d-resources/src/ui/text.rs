//! UTF-16 text storage with string-compatible serialization at transport boundaries.

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use unicode_segmentation::UnicodeSegmentation;

/// Valid Unicode stored as UTF-16 code units. Indices refer to these code units.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct UiText(Vec<u16>);

impl UiText {
    /// Creates text from UTF-16, rejecting unpaired surrogates.
    pub fn from_utf16(units: Vec<u16>) -> Result<Self, std::string::FromUtf16Error> {
        String::from_utf16(&units)?;
        Ok(Self(units))
    }

    pub fn as_utf16(&self) -> &[u16] {
        &self.0
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Returns extended grapheme ranges as half-open UTF-16 code-unit offsets.
    pub fn grapheme_ranges(&self) -> Vec<std::ops::Range<usize>> {
        let text = self.to_string();
        let mut offset = 0;
        text.graphemes(true)
            .map(|grapheme| {
                let start = offset;
                offset += grapheme.encode_utf16().count();
                start..offset
            })
            .collect()
    }
}

impl From<&str> for UiText {
    fn from(value: &str) -> Self {
        Self(value.encode_utf16().collect())
    }
}

impl From<String> for UiText {
    fn from(value: String) -> Self {
        Self::from(value.as_str())
    }
}

impl std::fmt::Display for UiText {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        for character in char::decode_utf16(self.0.iter().copied()) {
            write!(f, "{}", character.map_err(|_| std::fmt::Error)?)?;
        }
        Ok(())
    }
}

impl Serialize for UiText {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for UiText {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let text = String::deserialize(deserializer)?;
        Ok(text.into())
    }
}

#[cfg(test)]
mod tests {
    use super::UiText;

    #[test]
    fn stores_utf16_and_round_trips_through_json() {
        let text = UiText::from("a😀e\u{301}");
        assert_eq!(text.as_utf16(), &[0x61, 0xd83d, 0xde00, 0x65, 0x301]);
        let json = serde_json::to_string(&text).unwrap();
        assert_eq!(serde_json::from_str::<UiText>(&json).unwrap(), text);
    }

    #[test]
    fn rejects_unpaired_surrogates() {
        assert!(UiText::from_utf16(vec![0xd800]).is_err());
        assert!(UiText::from_utf16(vec![0xdc00]).is_err());
        assert!(serde_json::from_str::<UiText>(r#""\ud800""#).is_err());
    }

    #[test]
    fn graphemes_use_utf16_offsets_without_splitting_clusters() {
        let text = UiText::from("a😀e\u{301}🇧🇷");
        assert_eq!(text.grapheme_ranges(), vec![0..1, 1..3, 3..5, 5..9]);
    }
}
