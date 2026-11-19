//! Bounded, realm-local cache for decoded color glyphs.

use crate::ui_color_glyph::{UiColorGlyph, rasterize};
use std::collections::HashMap;
use std::sync::Arc;

const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_ENTRIES: usize = 512;

type Key = (fontdb::ID, u16, u32);

#[derive(Default)]
pub(crate) struct ColorGlyphCache {
    entries: HashMap<Key, (Arc<UiColorGlyph>, u64)>,
    bytes: usize,
    tick: u64,
    hits: usize,
}

impl ColorGlyphCache {
    pub(crate) fn get(
        &mut self,
        id: fontdb::ID,
        face: &ttf_parser::Face<'_>,
        glyph: ttf_parser::GlyphId,
        size: f32,
    ) -> Option<Arc<UiColorGlyph>> {
        let key = (id, glyph.0, size.to_bits());
        self.tick = self.tick.saturating_add(1);
        if let Some((cached, last_used)) = self.entries.get_mut(&key) {
            *last_used = self.tick;
            self.hits += 1;
            return Some(Arc::clone(cached));
        }
        let value = Arc::new(rasterize(face, glyph, size)?);
        let size = value.byte_size();
        if size > MAX_BYTES {
            return Some(value);
        }
        while !self.entries.is_empty()
            && (self.bytes + size > MAX_BYTES || self.entries.len() >= MAX_ENTRIES)
        {
            let oldest = *self
                .entries
                .iter()
                .min_by_key(|(_, (_, tick))| *tick)
                .unwrap()
                .0;
            let (removed, _) = self.entries.remove(&oldest).unwrap();
            self.bytes -= removed.byte_size();
        }
        self.bytes += size;
        self.entries.insert(key, (Arc::clone(&value), self.tick));
        Some(value)
    }

    pub(crate) fn clear(&mut self) {
        self.entries.clear();
        self.bytes = 0;
    }

    pub(crate) fn stats(&self) -> (usize, usize, usize) {
        (self.entries.len(), self.bytes, self.hits)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ui_fonts::UiFontLibrary;

    #[test]
    fn evicts_least_recently_used_glyph_when_entry_limit_is_reached() {
        let fonts = UiFontLibrary::default();
        let face_info = fonts
            .database
            .faces()
            .find(|face| {
                face.families
                    .iter()
                    .any(|(name, _)| name == "Noto Color Emoji")
            })
            .unwrap();
        let id = face_info.id;
        fonts
            .database
            .with_face_data(id, |data, index| {
                let face = ttf_parser::Face::parse(data, index).unwrap();
                let glyph = face.glyph_index('😀').unwrap();
                let mut cache = ColorGlyphCache::default();
                for index in 0..MAX_ENTRIES {
                    assert!(
                        cache
                            .get(id, &face, glyph, 1.0 + index as f32 / 10000.0)
                            .is_some()
                    );
                }
                assert_eq!(cache.entries.len(), MAX_ENTRIES);
                cache.get(id, &face, glyph, 1.0).unwrap();
                cache.get(id, &face, glyph, 2.0).unwrap();
                assert_eq!(cache.entries.len(), MAX_ENTRIES);
                assert!(cache.entries.contains_key(&(id, glyph.0, 1.0f32.to_bits())));
                assert!(!cache.entries.contains_key(&(
                    id,
                    glyph.0,
                    (1.0f32 + 1.0 / 10000.0).to_bits()
                )));
                assert!(cache.bytes <= MAX_BYTES);
                cache.clear();
                for index in 0..130 {
                    cache
                        .get(id, &face, glyph, 200.0 + index as f32 / 1000.0)
                        .unwrap();
                }
                assert!(cache.bytes <= MAX_BYTES);
                assert!(cache.entries.len() < 130);
                assert!(
                    !cache
                        .entries
                        .contains_key(&(id, glyph.0, 200.0f32.to_bits()))
                );
            })
            .unwrap();
    }
}
