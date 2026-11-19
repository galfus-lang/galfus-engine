//! Font database for the native UI renderer.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::{Arc, Mutex};

pub(crate) struct UiFontLibrary {
    pub(crate) database: Arc<fontdb::Database>,
    pub(crate) default_family: String,
    groups: HashMap<String, FontGroup>,
    families: HashMap<String, UiFontFamily>,
    pub(crate) color_glyph_cache: Mutex<crate::ui_color_glyph_cache::ColorGlyphCache>,
}

struct FontGroup {
    faces: Vec<fontdb::ID>,
    database: fontdb::Database,
}

/// Ordered font groups and default OpenType variation coordinates for a UI family.
#[derive(Debug, Clone, PartialEq)]
pub struct UiFontFamily {
    pub groups: Vec<String>,
    pub axes: BTreeMap<String, f32>,
}

impl Default for UiFontLibrary {
    fn default() -> Self {
        let mut db = fontdb::Database::new();
        db.load_font_data(include_bytes!("../assets/NotoSans-Variable.ttf").to_vec());
        let family = db
            .faces()
            .last()
            .and_then(|face| face.families.first())
            .map(|(family, _)| family.clone())
            .unwrap_or_else(|| "Noto Sans".to_string());
        db.load_font_data(include_bytes!("../assets/NotoSans-Italic-Variable.ttf").to_vec());
        db.set_sans_serif_family(&family);
        db.set_serif_family(&family);
        db.set_monospace_family(&family);
        db.set_cursive_family(&family);
        db.set_fantasy_family(&family);
        let noto_group = FontGroup {
            faces: db.faces().map(|face| face.id).collect(),
            database: db.clone(),
        };
        let existing: HashSet<_> = db.faces().map(|face| face.id).collect();
        db.load_font_data(include_bytes!("../assets/NotoColorEmoji.ttf").to_vec());
        let emoji_faces: Vec<_> = db
            .faces()
            .filter(|face| !existing.contains(&face.id))
            .map(|face| face.id)
            .collect();
        let mut emoji_db = db.clone();
        for id in existing {
            emoji_db.remove_face(id);
        }
        let groups = HashMap::from([
            ("Noto Sans".to_string(), noto_group),
            (
                "Noto Color Emoji".to_string(),
                FontGroup {
                    faces: emoji_faces,
                    database: emoji_db,
                },
            ),
        ]);
        let families = HashMap::from([(
            "default".to_string(),
            UiFontFamily {
                groups: vec!["Noto Sans".to_string(), "Noto Color Emoji".to_string()],
                axes: BTreeMap::new(),
            },
        )]);
        Self {
            database: Arc::new(db),
            default_family: family,
            groups,
            families,
            color_glyph_cache: Mutex::default(),
        }
    }
}

impl UiFontLibrary {
    /// Creates an empty font library without loading bundled fonts.
    pub(crate) fn empty() -> Self {
        Self {
            database: Arc::new(fontdb::Database::new()),
            default_family: String::new(),
            groups: HashMap::new(),
            families: HashMap::new(),
            color_glyph_cache: Mutex::default(),
        }
    }

    /// Replaces a family only after validating all references and coordinates.
    pub(crate) fn set_family(&mut self, name: &str, family: UiFontFamily) -> Result<(), String> {
        if name.trim().is_empty() || name != name.trim() {
            return Err("Font family name must not be empty or have surrounding whitespace".into());
        }
        if family.groups.is_empty() {
            return Err("Font family must contain at least one font group".into());
        }
        let mut seen = HashSet::new();
        for group in &family.groups {
            if !self.groups.contains_key(group) {
                return Err(format!("Unknown font group: {group}"));
            }
            if !seen.insert(group) {
                return Err(format!("Duplicate font group: {group}"));
            }
        }
        crate::ui_variations::validate_axes(&family.axes)?;
        self.families.insert(name.to_owned(), family);
        // Existing geometry caches track the database snapshot by Arc identity.
        self.database = Arc::new((*self.database).clone());
        Ok(())
    }

    pub(crate) fn family(&self, name: &str) -> Option<&UiFontFamily> {
        self.families.get(name)
    }

    pub(crate) fn remove_family(&mut self, name: &str) -> Result<(), String> {
        if name == "default" {
            return Err("The default font family cannot be removed".into());
        }
        self.families
            .remove(name)
            .ok_or_else(|| format!("Unknown font family: {name}"))?;
        self.database = Arc::new((*self.database).clone());
        Ok(())
    }

    pub(crate) fn remove_group(&mut self, name: &str) -> Result<(), String> {
        if !self.groups.contains_key(name) {
            return Err(format!("Unknown font group: {name}"));
        }
        if self
            .families
            .values()
            .any(|family| family.groups.iter().any(|group| group == name))
        {
            return Err(format!("Font group is used by a family: {name}"));
        }
        let group = self.groups.remove(name).expect("font group exists");
        let database = Arc::make_mut(&mut self.database);
        for id in group.faces {
            database.remove_face(id);
        }
        self.color_glyph_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clear();
        Ok(())
    }

    /// Select one face per group, retaining the family's explicit fallback order.
    pub(crate) fn family_faces(
        &self,
        name: &str,
        weight: u16,
        italic: bool,
    ) -> Result<Vec<fontdb::ID>, String> {
        let family = self
            .family(name)
            .ok_or_else(|| format!("Unknown font family: {name}"))?;
        family
            .groups
            .iter()
            .map(|group| {
                let group_db = &self.groups[group].database;
                // Groups can use an application-defined name, independent of the
                // OpenType family name embedded in their files.
                let names: Vec<_> = group_db
                    .faces()
                    .flat_map(|face| face.families.iter().map(|(name, _)| name.as_str()))
                    .collect();
                let families: Vec<_> = names
                    .iter()
                    .map(|name| fontdb::Family::Name(name))
                    .collect();
                group_db
                    .query(&fontdb::Query {
                        families: &families,
                        weight: fontdb::Weight(weight),
                        style: if italic {
                            fontdb::Style::Italic
                        } else {
                            fontdb::Style::Normal
                        },
                        ..Default::default()
                    })
                    .ok_or_else(|| format!("No usable face in font group: {group}"))
            })
            .collect()
    }

    pub(crate) fn face_variations(
        &self,
        name: &str,
        face_id: fontdb::ID,
        element_axes: &BTreeMap<String, f32>,
        weight: u16,
        italic: bool,
    ) -> Result<Vec<crate::UiFontAxis>, String> {
        let family = self
            .family(name)
            .ok_or_else(|| format!("Unknown font family: {name}"))?;
        if !family
            .groups
            .iter()
            .any(|group| self.groups[group].faces.contains(&face_id))
        {
            return Err("Font face is not a member of this family".into());
        }
        self.database
            .with_face_data(face_id, |data, index| {
                let face =
                    ttf_parser::Face::parse(data, index).map_err(|error| error.to_string())?;
                crate::ui_variations::resolve(&face, &family.axes, element_axes, weight, italic)
            })
            .ok_or_else(|| "Font data unavailable".to_string())?
    }
    /// Registers all faces atomically, so a bad file cannot leave a partial group.
    pub(crate) fn register_group(&mut self, name: &str, files: &[&[u8]]) -> Result<(), String> {
        if name.trim().is_empty() || name != name.trim() {
            return Err("Font group name must not be empty or have surrounding whitespace".into());
        }
        if self.groups.contains_key(name) {
            return Err(format!("Font group already exists: {name}"));
        }
        if files.is_empty() {
            return Err("Font group must contain at least one font file".into());
        }
        let mut database = (*self.database).clone();
        let mut registered = Vec::new();
        let mut styles = Vec::new();
        for data in files {
            let previous: HashSet<_> = database.faces().map(|face| face.id).collect();
            database.load_font_data(data.to_vec());
            let added: Vec<_> = database
                .faces()
                .filter(|face| !previous.contains(&face.id))
                .collect();
            if added.is_empty() {
                return Err("Font file contains no valid faces".into());
            }
            for face in added {
                let variable = database
                    .with_face_data(face.id, |data, index| {
                        ttf_parser::Face::parse(data, index)
                            .is_ok_and(|parsed| parsed.is_variable())
                    })
                    .unwrap_or(false);
                let style = (face.weight, face.stretch, face.style, variable);
                if styles.contains(&style) {
                    return Err("Font group contains duplicate face styles".into());
                }
                styles.push(style);
                registered.push(face.id);
            }
        }
        let mut group_db = database.clone();
        let remove: Vec<_> = group_db
            .faces()
            .filter(|face| !registered.contains(&face.id))
            .map(|face| face.id)
            .collect();
        for id in remove {
            group_db.remove_face(id);
        }
        self.database = Arc::new(database);
        self.groups.insert(
            name.to_owned(),
            FontGroup {
                faces: registered,
                database: group_db,
            },
        );
        self.color_glyph_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clear();
        Ok(())
    }

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
        self.color_glyph_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clear();
        Ok(family)
    }
    pub(crate) fn clear_color_glyph_cache(&self) {
        if let Ok(mut cache) = self.color_glyph_cache.lock() {
            cache.clear();
        }
    }

    pub(crate) fn diagnostic_counts(&self) -> (usize, usize, usize, usize, usize, usize) {
        let (glyph_entries, glyph_bytes, glyph_hits) = self
            .color_glyph_cache
            .lock()
            .map(|c| c.stats())
            .unwrap_or((0, 0, 0));
        (
            self.groups.len(),
            self.families.len(),
            self.database.len(),
            glyph_entries,
            glyph_bytes,
            glyph_hits,
        )
    }
}

#[cfg(test)]
#[path = "ui_font_tests.rs"]
mod tests;
