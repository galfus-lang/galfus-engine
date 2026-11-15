//! Font database for the native UI renderer.

use std::sync::Arc;

pub(crate) struct UiFontLibrary {
    pub(crate) database: Arc<fontdb::Database>,
    pub(crate) default_family: String,
}

impl Default for UiFontLibrary {
    fn default() -> Self {
        let mut db = fontdb::Database::new();
        db.load_font_data(include_bytes!("../assets/Nunito-Regular.ttf").to_vec());
        let family = db
            .faces()
            .last()
            .and_then(|face| face.families.first())
            .map(|(family, _)| family.clone())
            .unwrap_or_else(|| "Nunito".to_string());
        db.load_font_data(include_bytes!("../assets/Nunito-Bold.ttf").to_vec());
        db.load_font_data(include_bytes!("../assets/Nunito-Italic.ttf").to_vec());
        db.load_font_data(include_bytes!("../assets/Nunito-BoldItalic.ttf").to_vec());
        db.set_sans_serif_family(&family);
        db.set_serif_family(&family);
        db.set_monospace_family(&family);
        db.set_cursive_family(&family);
        db.set_fantasy_family(&family);
        Self {
            database: Arc::new(db),
            default_family: family,
        }
    }
}

impl UiFontLibrary {
    pub(crate) fn load(&mut self, data: &[u8]) -> Result<String, String> {
        let db = Arc::make_mut(&mut self.database);
        let previous = db.faces().count();
        db.load_font_data(data.to_vec());
        if db.faces().count() == previous {
            return Err("No valid font faces found in binary data".to_string());
        }
        let family = db
            .faces()
            .last()
            .and_then(|face| face.families.first())
            .map(|(family, _)| family.clone())
            .unwrap_or_else(|| self.default_family.clone());
        Ok(family)
    }
}

#[cfg(test)]
mod tests {
    use super::UiFontLibrary;
    use galfus_realm_2d_resources::ui::TextNode;

    #[test]
    fn default_nunito_has_regular_bold_and_italic_faces() {
        let library = UiFontLibrary::default();
        assert_eq!(library.default_family, "Nunito");
        for (weight, italic) in [(400, false), (700, false), (400, true), (700, true)] {
            let id = crate::ui_text_font::select_font(
                &library.database,
                None,
                &library.default_family,
                weight,
                italic,
            )
            .unwrap();
            let face = library.database.face(id).unwrap();
            assert!(face.families.iter().any(|(name, _)| name == "Nunito"));
            assert_eq!(face.weight.0, weight);
            assert_eq!(face.style == fontdb::Style::Italic, italic);
        }
    }

    #[test]
    fn nunito_covers_portuguese_without_bundled_fallbacks() {
        let library = UiFontLibrary::default();
        assert_eq!(library.database.faces().count(), 4);
        let node = TextNode {
            text: "Olá, ação e café".into(),
            ..Default::default()
        };
        let runs =
            crate::ui_text_fallback::shape(&library.database, &library.default_family, &node)
                .unwrap();
        assert!(!runs.is_empty());
        assert!(
            runs.iter()
                .flat_map(|run| &run.glyphs)
                .all(|glyph| glyph.glyph_id != 0)
        );
        library
            .database
            .with_face_data(runs[0].font, |data, index| {
                let face = ttf_parser::Face::parse(data, index).unwrap();
                assert!(face.glyph_index('😀').is_none());
                assert!(face.glyph_index('م').is_none());
            })
            .unwrap();
    }
}
