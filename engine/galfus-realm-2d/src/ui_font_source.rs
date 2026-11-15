//! Font selection shared by layout, rendering, and text geometry.

use std::collections::BTreeMap;

/// Provides a font database and the ordered faces used for a text family.
pub trait UiFontSource {
    fn database(&self) -> &fontdb::Database;

    fn ordered_faces(
        &self,
        family: Option<&str>,
        default: &str,
        weight: u16,
        italic: bool,
    ) -> Result<Vec<fontdb::ID>, String> {
        let db = self.database();
        let primary = crate::ui_text_font::select_font(db, family, default, weight, italic)
            .ok_or_else(|| "No usable UI font".to_string())?;
        let mut candidates: Vec<_> = db.faces().filter(|face| face.id != primary).collect();
        candidates.sort_by_key(|face| {
            (
                face.style
                    != if italic {
                        fontdb::Style::Italic
                    } else {
                        fontdb::Style::Normal
                    },
                face.weight.0.abs_diff(weight),
            )
        });
        Ok(std::iter::once(primary)
            .chain(candidates.into_iter().map(|face| face.id))
            .collect())
    }

    fn variations(
        &self,
        _family: Option<&str>,
        face: fontdb::ID,
        axes: &BTreeMap<String, f32>,
        weight: u16,
        italic: bool,
    ) -> Result<Vec<crate::UiFontAxis>, String> {
        self.database()
            .with_face_data(face, |data, index| {
                let parsed =
                    ttf_parser::Face::parse(data, index).map_err(|error| error.to_string())?;
                crate::ui_variations::resolve(&parsed, &BTreeMap::new(), axes, weight, italic)
            })
            .ok_or_else(|| "Font data unavailable".to_string())?
    }
}

impl UiFontSource for fontdb::Database {
    fn database(&self) -> &fontdb::Database {
        self
    }
}

impl UiFontSource for crate::ui_fonts::UiFontLibrary {
    fn database(&self) -> &fontdb::Database {
        &self.database
    }

    fn ordered_faces(
        &self,
        family: Option<&str>,
        _default: &str,
        weight: u16,
        italic: bool,
    ) -> Result<Vec<fontdb::ID>, String> {
        self.family_faces(family.unwrap_or("default"), weight, italic)
    }

    fn variations(
        &self,
        family: Option<&str>,
        face: fontdb::ID,
        axes: &BTreeMap<String, f32>,
        weight: u16,
        italic: bool,
    ) -> Result<Vec<crate::UiFontAxis>, String> {
        self.face_variations(family.unwrap_or("default"), face, axes, weight, italic)
    }
}
