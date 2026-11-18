//! Color bitmap glyphs represented as colored UI geometry.

use crate::vector_geometry::VectorVertex;
use image::imageops::FilterType;
use lyon_tessellation::VertexBuffers;

/// A decoded and resized color glyph, independent of its position and opacity.
pub struct UiColorGlyph {
    pixels: image::RgbaImage,
    x: i16,
    y: i16,
    width: f32,
    height: f32,
    scale: f32,
}

pub(crate) fn rasterize(
    face: &ttf_parser::Face<'_>,
    glyph: ttf_parser::GlyphId,
    font_size: f32,
) -> Option<UiColorGlyph> {
    let bitmap =
        face.glyph_raster_image(glyph, font_size.ceil().clamp(1.0, u16::MAX as f32) as u16)?;
    if bitmap.format != ttf_parser::RasterImageFormat::PNG || bitmap.pixels_per_em == 0 {
        return None;
    }
    let mut reader =
        image::ImageReader::with_format(std::io::Cursor::new(bitmap.data), image::ImageFormat::Png);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(1024);
    limits.max_image_height = Some(1024);
    limits.max_alloc = Some(16 * 1024 * 1024);
    reader.limits(limits);
    let decoded = reader.decode().ok()?.to_rgba8();
    if decoded.width() == 0 || decoded.height() == 0 {
        return None;
    }
    let scale = font_size / f32::from(bitmap.pixels_per_em);
    let width = f32::from(bitmap.width) * scale;
    let height = f32::from(bitmap.height) * scale;
    let cols = width.ceil().clamp(1.0, 128.0) as u32;
    let rows = height.ceil().clamp(1.0, 128.0) as u32;
    let pixels = image::imageops::resize(&decoded, cols, rows, FilterType::Triangle);
    Some(UiColorGlyph {
        pixels,
        x: bitmap.x,
        y: bitmap.y,
        width,
        height,
        scale,
    })
}

impl UiColorGlyph {
    pub(crate) fn byte_size(&self) -> usize {
        self.pixels.as_raw().len()
    }
}

/// Appends cached glyph pixels with this occurrence's position and opacity.
pub(crate) fn append(
    buffers: &mut VertexBuffers<VectorVertex, u32>,
    glyph: &UiColorGlyph,
    origin: [f32; 2],
    z: f32,
    opacity: f32,
) {
    let UiColorGlyph {
        pixels,
        x,
        y,
        width,
        height,
        scale,
    } = glyph;
    let (cols, rows) = pixels.dimensions();
    let x0 = origin[0] + f32::from(*x) * scale;
    let bottom = origin[1] + f32::from(*y) * scale;
    let dx = width / cols as f32;
    let dy = height / rows as f32;
    for row in 0..rows {
        for col in 0..cols {
            let [r, g, b, a] = pixels.get_pixel(col, row).0;
            if a == 0 {
                continue;
            }
            let x = x0 + col as f32 * dx;
            let y = bottom + height - (row + 1) as f32 * dy;
            let rgba = [
                r as f32 / 255.0,
                g as f32 / 255.0,
                b as f32 / 255.0,
                a as f32 / 255.0 * opacity,
            ];
            let base = buffers.vertices.len() as u32;
            for (vx, vy) in [(x, y), (x + dx, y), (x + dx, y + dy), (x, y + dy)] {
                buffers
                    .vertices
                    .push([vx, vy, z, 0.0, 0.0, rgba[0], rgba[1], rgba[2], rgba[3]]);
            }
            buffers.indices.extend_from_slice(&[
                base,
                base + 1,
                base + 2,
                base,
                base + 2,
                base + 3,
            ]);
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::ui_fonts::UiFontLibrary;
    use galfus_realm_2d_resources::ui::TextNode;

    #[test]
    fn repeated_glyphs_are_cached_per_realm_and_font_changes_clear_them() {
        let mut fonts = UiFontLibrary::default();
        let other = UiFontLibrary::default();
        let render = |fonts: &UiFontLibrary, text: &str, size: f32, x: f32, opacity: f32| {
            let node = TextNode {
                text: text.into(),
                font_size: size,
                ..Default::default()
            };
            let mut buffers = lyon_tessellation::VertexBuffers::new();
            crate::ui_text::tessellate_text_run(
                &mut buffers,
                fonts,
                &fonts.default_family,
                &node,
                x,
                0.0,
                200.0,
                50.0,
                200.0,
                50.0,
                0.0,
                opacity,
                None,
            );
            buffers.vertices
        };
        let first = render(&fonts, "😀😀", 20.0, 0.0, 1.0);
        let (entries, bytes, hits) = fonts.color_glyph_cache.lock().unwrap().stats();
        assert_eq!(entries, 1);
        assert!(bytes > 0);
        assert!(hits >= 1);
        let second = render(&fonts, "😀", 20.0, 10.0, 0.5);
        assert!(fonts.color_glyph_cache.lock().unwrap().stats().2 > hits);
        assert!(!first.is_empty() && !second.is_empty());
        assert!((second[0][0] - first[0][0] - 10.0).abs() < 0.001);
        assert!((second[0][8] - first[0][8] * 0.5).abs() < 0.001);
        render(&fonts, "😀", 30.0, 0.0, 1.0);
        assert_eq!(fonts.color_glyph_cache.lock().unwrap().stats().0, 2);
        assert_eq!(other.color_glyph_cache.lock().unwrap().stats().0, 0);
        fonts
            .register_group(
                "Extra",
                &[include_bytes!(
                    "../tests/fixtures/NotoSans-Test-Regular.ttf"
                )],
            )
            .unwrap();
        assert_eq!(fonts.color_glyph_cache.lock().unwrap().stats().0, 0);
        render(&fonts, "😀", 20.0, 0.0, 1.0);
        assert_eq!(fonts.color_glyph_cache.lock().unwrap().stats().0, 1);
        fonts.remove_group("Extra").unwrap();
        assert_eq!(fonts.color_glyph_cache.lock().unwrap().stats().0, 0);
    }

    #[test]
    fn emoji_is_selected_measured_and_drawn_in_color() {
        let fonts = UiFontLibrary::default();
        let node = TextNode {
            text: "A😀B".into(),
            font_size: 24.0,
            ..Default::default()
        };
        let runs = crate::ui_text_fallback::shape(&fonts, &fonts.default_family, &node).unwrap();
        assert!(runs.len() >= 3);
        let emoji_face = fonts.database.face(runs[1].font).unwrap();
        assert!(
            emoji_face
                .families
                .iter()
                .any(|(name, _)| name == "Noto Color Emoji")
        );
        let geometry = crate::ui_text_geometry::text_geometry(
            &node,
            &fonts,
            &fonts.default_family,
            [0.0, 0.0, 200.0, 50.0],
        )
        .unwrap();
        assert!(
            geometry
                .clusters
                .iter()
                .any(|cluster| cluster.start == 1 && cluster.end == 3 && cluster.rect[2] > 0.0)
        );
        let mut buffers = lyon_tessellation::VertexBuffers::new();
        crate::ui_text::tessellate_text_run(
            &mut buffers,
            &fonts,
            &fonts.default_family,
            &node,
            0.0,
            0.0,
            200.0,
            50.0,
            200.0,
            50.0,
            0.0,
            0.5,
            None,
        );
        assert!(buffers.vertices.iter().any(|vertex| vertex[3] == 0.0
            && vertex[5] > 0.5
            && vertex[6] > 0.2
            && vertex[7] < 0.2
            && vertex[8] <= 0.5));
    }

    #[test]
    fn emoji_sequences_and_emoji_presentation_use_color_face() {
        let fonts = UiFontLibrary::default();
        for value in ["❤️", "👍🏽", "🇧🇷", "👩‍👩‍👧‍👦"] {
            let node = TextNode {
                text: value.into(),
                font_size: 20.0,
                ..Default::default()
            };
            let runs =
                crate::ui_text_fallback::shape(&fonts, &fonts.default_family, &node).unwrap();
            assert!(!runs.is_empty(), "{value}");
            assert!(
                runs.iter().all(|run| fonts
                    .database
                    .face(run.font)
                    .unwrap()
                    .families
                    .iter()
                    .any(|(name, _)| name == "Noto Color Emoji")),
                "{value}"
            );
            assert!(
                runs.iter()
                    .flat_map(|run| &run.glyphs)
                    .any(|glyph| glyph.glyph_id != 0),
                "{value}"
            );
            let geometry = crate::ui_text_geometry::text_geometry(
                &node,
                &fonts,
                &fonts.default_family,
                [0.0, 0.0, 100.0, 50.0],
            )
            .unwrap();
            assert_eq!(geometry.clusters.len(), 1, "{value}");
            assert_eq!(
                geometry.clusters[0].end,
                value.encode_utf16().count(),
                "{value}"
            );
            let mut buffers = lyon_tessellation::VertexBuffers::new();
            crate::ui_text::tessellate_text_run(
                &mut buffers,
                &fonts,
                &fonts.default_family,
                &node,
                0.0,
                0.0,
                100.0,
                50.0,
                100.0,
                50.0,
                0.0,
                1.0,
                None,
            );
            assert!(!buffers.vertices.is_empty(), "{value}");
        }
    }
}
