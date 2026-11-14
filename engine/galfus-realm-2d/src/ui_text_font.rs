//! Font selection shared by formatted and plain UI text.

pub(crate) fn with_font_face_index<R>(
    font_db: &fontdb::Database,
    family: Option<&str>,
    default_family: &str,
    weight: u16,
    italic: bool,
    f: impl FnOnce(&ttf_parser::Face, u32) -> R,
) -> Option<R> {
    let id = select_font(font_db, family, default_family, weight, italic)?;
    font_db.with_face_data(id, |data, index| {
        let face = ttf_parser::Face::parse(data, index).ok()?;
        Some(f(&face, index))
    })?
}

pub(crate) fn select_font(
    font_db: &fontdb::Database,
    family: Option<&str>,
    default_family: &str,
    weight: u16,
    italic: bool,
) -> Option<fontdb::ID> {
    let query_family = family.unwrap_or(default_family);
    font_db
        .query(&fontdb::Query {
            families: &[fontdb::Family::Name(query_family)],
            weight: fontdb::Weight(weight),
            style: if italic {
                fontdb::Style::Italic
            } else {
                fontdb::Style::Normal
            },
            ..Default::default()
        })
        .or_else(|| {
            font_db.query(&fontdb::Query {
                families: &[fontdb::Family::Name(default_family)],
                ..Default::default()
            })
        })
        .or_else(|| font_db.faces().next().map(|face| face.id))
}
