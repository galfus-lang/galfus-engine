//! Font database for the native UI renderer.

use std::sync::Arc;

pub(crate) struct UiFontLibrary {
    pub(crate) database: Arc<fontdb::Database>,
    pub(crate) default_family: String,
}

impl Default for UiFontLibrary {
    fn default() -> Self {
        let mut db = fontdb::Database::new();
        db.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
        let family = db
            .faces()
            .last()
            .and_then(|face| face.families.first())
            .map(|(family, _)| family.clone())
            .unwrap_or_else(|| "Liberation Sans".to_string());
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
