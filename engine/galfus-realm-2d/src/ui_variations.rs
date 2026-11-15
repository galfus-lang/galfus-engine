//! Resolution of OpenType variation coordinates.

use std::collections::BTreeMap;

/// A resolved axis in the design coordinate space of a font face.
#[derive(Clone, Debug, PartialEq)]
pub struct UiFontAxis {
    pub tag: String,
    pub min: f32,
    pub default: f32,
    pub max: f32,
    pub value: f32,
}

pub(crate) fn validate_axes(axes: &BTreeMap<String, f32>) -> Result<(), String> {
    for (tag, value) in axes {
        if tag.len() != 4 || !tag.bytes().all(|byte| (0x20..=0x7e).contains(&byte)) {
            return Err(format!("Invalid OpenType axis tag: {tag}"));
        }
        if !value.is_finite() {
            return Err(format!("Non-finite axis value: {tag}"));
        }
    }
    Ok(())
}

pub(crate) fn resolve(
    face: &ttf_parser::Face<'_>,
    family_axes: &BTreeMap<String, f32>,
    element_axes: &BTreeMap<String, f32>,
    weight: u16,
    italic: bool,
) -> Result<Vec<UiFontAxis>, String> {
    validate_axes(family_axes)?;
    validate_axes(element_axes)?;
    Ok(face
        .variation_axes()
        .into_iter()
        .map(|axis| {
            let tag = String::from_utf8_lossy(&axis.tag.to_bytes()).into_owned();
            let requested = match tag.as_str() {
                "wght" => f32::from(weight),
                "ital" => {
                    if italic {
                        1.0
                    } else {
                        0.0
                    }
                }
                _ => element_axes
                    .get(&tag)
                    .or_else(|| family_axes.get(&tag))
                    .copied()
                    .unwrap_or(axis.def_value),
            };
            UiFontAxis {
                tag,
                min: axis.min_value,
                default: axis.def_value,
                max: axis.max_value,
                value: requested.clamp(axis.min_value, axis.max_value),
            }
        })
        .collect())
}

pub(crate) fn apply(face: &mut ttf_parser::Face<'_>, axes: &[UiFontAxis]) {
    for axis in axes {
        let Ok(tag) = <[u8; 4]>::try_from(axis.tag.as_bytes()) else {
            continue;
        };
        face.set_variation(ttf_parser::Tag::from_bytes(&tag), axis.value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_variable_axes_with_precedence_and_bounds() {
        // Attach a small fvar table to a valid test font; no font binary fixture is needed.
        let mut font = include_bytes!("../tests/fixtures/NotoSans-Test-Regular.ttf").to_vec();
        let count = u16::from_be_bytes([font[4], font[5]]) as usize;
        let record = (0..count)
            .map(|index| 12 + index * 16)
            .find(|&index| &font[index..index + 4] == b"gasp")
            .unwrap();
        let mut table = vec![0, 1, 0, 0, 0, 16, 0, 2, 0, 4, 0, 20, 0, 0, 0, 0];
        for (tag, min, default, max) in [
            (b"wght", 100i32, 400i32, 900i32),
            (b"wdth", 75, 100, 125),
            (b"ital", 0, 0, 1),
            (b"opsz", 8, 14, 72),
        ] {
            table.extend(tag);
            for value in [min, default, max] {
                table.extend((value << 16).to_be_bytes());
            }
            table.extend([0, 0, 1, 0]);
        }
        let offset = font.len() as u32;
        font[record..record + 4].copy_from_slice(b"fvar");
        font[record + 8..record + 12].copy_from_slice(&offset.to_be_bytes());
        font[record + 12..record + 16].copy_from_slice(&(table.len() as u32).to_be_bytes());
        font.extend(table);
        let face = ttf_parser::Face::parse(&font, 0).unwrap();
        let family = BTreeMap::from([("wdth".to_owned(), 85.0), ("wght".to_owned(), 200.0)]);
        let element = BTreeMap::from([("wdth".to_owned(), 150.0), ("ital".to_owned(), 0.0)]);
        let axes = resolve(&face, &family, &element, 650, true).unwrap();
        let value = |tag: &str| axes.iter().find(|axis| axis.tag == tag).unwrap().value;
        assert_eq!(axes.len(), 4);
        assert_eq!(value("wght"), 650.0);
        assert_eq!(value("wdth"), 125.0);
        assert_eq!(value("ital"), 1.0);
        assert_eq!(value("opsz"), 14.0);
        assert!(
            resolve(
                &face,
                &family,
                &BTreeMap::from([("bad".into(), 0.0)]),
                400,
                false
            )
            .is_err()
        );
        assert!(
            resolve(
                &face,
                &family,
                &BTreeMap::from([("wdth".into(), f32::NAN)]),
                400,
                false
            )
            .is_err()
        );
    }
}
