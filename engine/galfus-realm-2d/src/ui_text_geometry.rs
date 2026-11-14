//! Geometry of shaped rich-text clusters in ModelUI coordinates.

use galfus_realm_2d_resources::ui::{RichText, TextAlign, TextNode};
use serde::{Deserialize, Serialize};

use crate::ui_rich_text::{layout, layout_with_lines};
use crate::ui_text::measure_text;

/// A shaped cluster and its advance rectangle. Indices are UTF-16 offsets.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiTextCluster {
    pub start: usize,
    pub end: usize,
    pub rect: [f32; 4],
    pub right_to_left: bool,
    /// Interior grapheme caret positions provided by the font's GDEF table.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub carets: Vec<UiClusterCaret>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UiClusterCaret {
    pub offset: usize,
    pub x: f32,
    /// True when the font does not provide a usable caret and its position was estimated.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub approximate: bool,
}

/// A visual line with a logical UTF-16 range excluding its line break.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiTextLineGeometry {
    pub start: usize,
    pub end: usize,
    pub rect: [f32; 4],
}

/// Line boxes and shaped clusters in UI-local coordinates.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiTextGeometry {
    pub lines: Vec<UiTextLineGeometry>,
    pub clusters: Vec<UiTextCluster>,
}

/// Computes geometry for all lines, including empty lines and trailing line breaks.
pub fn rich_text_geometry(
    text: &RichText,
    fonts: &fontdb::Database,
    family: &str,
    rect: [f32; 4],
) -> Result<UiTextGeometry, String> {
    let (_, size, layout_lines) = layout_with_lines(text, fonts, family, Some(rect[2]));
    let clusters = rich_text_clusters(text, fonts, family, rect)?;
    let line_height = size[1] / layout_lines.len().max(1) as f32;
    let lines = layout_lines
        .into_iter()
        .map(|line| {
            let y = rect[1] + line.y;
            let mut bounds = clusters.iter().filter(|cluster| cluster.rect[1] == y);
            let (x, width) = if let Some(first) = bounds.next() {
                let mut left = first.rect[0];
                let mut right = left + first.rect[2];
                for cluster in bounds {
                    left = left.min(cluster.rect[0]);
                    right = right.max(cluster.rect[0] + cluster.rect[2]);
                }
                (left, right - left)
            } else {
                let offset = match text.align {
                    TextAlign::Left => 0.0,
                    TextAlign::Center => rect[2].max(0.0) * 0.5,
                    TextAlign::Right => rect[2].max(0.0),
                };
                (rect[0] + offset, 0.0)
            };
            UiTextLineGeometry {
                start: line.start,
                end: line.end,
                rect: [x, y, width, line_height],
            }
        })
        .collect();
    Ok(UiTextGeometry { lines, clusters })
}

/// Computes the visual clusters using the same fragments and font faces as rendering.
/// Ligatures may contain more than one grapheme and are returned as one cluster.
pub fn rich_text_clusters(
    text: &RichText,
    fonts: &fontdb::Database,
    family: &str,
    rect: [f32; 4],
) -> Result<Vec<UiTextCluster>, String> {
    let (fragments, _) = layout(text, fonts, family, Some(rect[2]));
    let line_height = text
        .spans
        .iter()
        .map(|span| span.style.font_size * 1.2)
        .fold(0.0_f32, f32::max);
    let mut result = Vec::new();
    for fragment in fragments {
        result.extend(shape_clusters(
            &fragment.node,
            fonts,
            family,
            fragment.start,
            [rect[0] + fragment.x, rect[1] + fragment.y, line_height],
        )?);
    }
    let units: Vec<u16> = text
        .spans
        .iter()
        .flat_map(|span| span.text.as_utf16().iter().copied())
        .collect();
    merge_inline_crlf(&mut result, &units);
    Ok(result)
}

/// Computes simple text geometry from the same lines and fonts used for rendering.
pub fn text_geometry(
    node: &TextNode,
    fonts: &fontdb::Database,
    family: &str,
    rect: [f32; 4],
) -> Result<UiTextGeometry, String> {
    let measurement = measure_text(fonts, family, node, Some(rect[2]));
    let mut lines = Vec::new();
    let mut clusters = Vec::new();
    for line in measurement.lines {
        let free = (rect[2] - line.width).max(0.0);
        let offset = match node.align {
            TextAlign::Left => 0.0,
            TextAlign::Center => free * 0.5,
            TextAlign::Right => free,
        };
        let x = rect[0] + offset;
        let y = rect[1] + line.top_y;
        if !line.text.is_empty() {
            let mut line_node = node.clone();
            line_node.text = line.text.as_str().into();
            clusters.extend(shape_clusters(
                &line_node,
                fonts,
                family,
                line.start,
                [x, y, measurement.line_height],
            )?);
        }
        lines.push(UiTextLineGeometry {
            start: line.start,
            end: line.end,
            rect: [x, y, line.width, measurement.line_height],
        });
    }
    merge_inline_crlf(&mut clusters, node.text.as_utf16());
    Ok(UiTextGeometry { lines, clusters })
}

fn merge_inline_crlf(clusters: &mut Vec<UiTextCluster>, units: &[u16]) {
    let mut index = 0;
    while index + 1 < clusters.len() {
        let first = &clusters[index];
        let second = &clusters[index + 1];
        let start = first.start.min(second.start);
        let end = first.end.max(second.end);
        if end == start + 2
            && units.get(start..end) == Some(&[13, 10])
            && first.end - first.start == 1
            && second.end - second.start == 1
            && first.rect[1] == second.rect[1]
            && first.right_to_left == second.right_to_left
        {
            let second = clusters.remove(index + 1);
            let first = &mut clusters[index];
            first.start = start;
            first.end = end;
            first.rect[0] = first.rect[0].min(second.rect[0]);
            first.rect[2] += second.rect[2];
        } else {
            index += 1;
        }
    }
}

fn shape_clusters(
    node: &TextNode,
    fonts: &fontdb::Database,
    family: &str,
    offset: usize,
    position: [f32; 3],
) -> Result<Vec<UiTextCluster>, String> {
    let runs = crate::ui_text_fallback::shape(fonts, family, node)?;
    let graphemes = node.text.grapheme_ranges();
    let mut counts = std::collections::HashMap::new();
    let mut boundaries = vec![node.text.as_utf16().len()];
    for glyph in runs.iter().flat_map(|run| &run.glyphs) {
        *counts.entry(glyph.cluster).or_insert(0usize) += 1;
        boundaries.push(glyph.cluster as usize);
    }
    boundaries.sort_unstable();
    boundaries.dedup();
    let mut clusters: Vec<UiTextCluster> = Vec::new();
    let mut cluster_fonts = Vec::new();
    let mut x = position[0];
    for run in runs {
        fonts
            .with_face_data(run.font, |data, index| {
                for glyph in run.glyphs {
                    let start = glyph.cluster as usize;
                    let end = boundaries
                        .get(boundaries.partition_point(|&boundary| boundary <= start))
                        .copied()
                        .unwrap_or(node.text.as_utf16().len());
                    let advance = glyph.x_advance as f32 * run.scale;
                    if let Some(previous) = clusters.last_mut()
                        && previous.start == offset + start
                        && previous.right_to_left == glyph.right_to_left
                    {
                        previous.rect[2] += advance;
                    } else {
                        let first = graphemes.partition_point(|range| range.end <= start);
                        let last = graphemes.partition_point(|range| range.end < end);
                        let interior = &graphemes[first..last];
                        let mut carets = Vec::new();
                        if !interior.is_empty()
                            && counts[&glyph.cluster] == 1
                            && let Some(mut coordinates) =
                                crate::ui_text_caret::ligature_carets(data, index, glyph.glyph_id)
                            && coordinates.len() == interior.len()
                        {
                            if glyph.right_to_left {
                                coordinates.reverse();
                            }
                            let positions: Vec<f32> = coordinates
                                .iter()
                                .map(|coordinate| {
                                    x + (glyph.x_offset + i32::from(*coordinate)) as f32 * run.scale
                                })
                                .collect();
                            if positions
                                .iter()
                                .all(|&caret_x| caret_x > x && caret_x < x + advance)
                            {
                                carets = interior
                                    .iter()
                                    .zip(positions)
                                    .map(|(range, caret_x)| UiClusterCaret {
                                        offset: offset + range.end,
                                        x: caret_x,
                                        approximate: false,
                                    })
                                    .collect();
                            }
                        }
                        clusters.push(UiTextCluster {
                            start: offset + start,
                            end: offset + end,
                            rect: [x, position[1], advance, position[2]],
                            right_to_left: glyph.right_to_left,
                            carets,
                        });
                        cluster_fonts.push(run.font);
                    }
                    x += advance;
                }
            })
            .ok_or_else(|| "Font data unavailable".to_string())?;
    }
    for (cluster, font) in clusters.iter_mut().zip(cluster_fonts) {
        if cluster.carets.is_empty() && cluster.end - cluster.start > 1 {
            cluster.carets = crate::ui_text_caret::estimate_carets(
                fonts, font, &node.text, &graphemes, offset, cluster,
            );
        }
    }
    Ok(clusters)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ui_text_shape::shape_paragraph;
    use galfus_realm_2d_resources::ui::{RichTextSpan, RichTextStyle};

    #[test]
    fn clusters_use_utf16_offsets_and_line_positions() {
        let mut fonts = fontdb::Database::new();
        fonts.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
        let family = fonts.faces().next().unwrap().families[0].0.clone();
        let text = RichText {
            spans: vec![RichTextSpan {
                text: "a😀\nb".into(),
                style: RichTextStyle::default(),
            }],
            ..Default::default()
        };
        let clusters =
            rich_text_clusters(&text, &fonts, &family, [10.0, 20.0, 200.0, 100.0]).unwrap();
        assert_eq!(
            clusters
                .iter()
                .map(|cluster| (cluster.start, cluster.end))
                .collect::<Vec<_>>(),
            [(0, 1), (1, 3), (4, 5)]
        );
        assert!(clusters[2].rect[1] > clusters[0].rect[1]);
        assert!(clusters.iter().all(|cluster| cluster.rect[0] >= 10.0));
    }

    #[test]
    fn bidi_clusters_keep_logical_indices_in_visual_order() {
        let mut fonts = fontdb::Database::new();
        fonts.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
        let family = fonts.faces().next().unwrap().families[0].0.clone();
        let text = RichText {
            spans: vec![RichTextSpan {
                text: "a אב".into(),
                style: RichTextStyle::default(),
            }],
            ..Default::default()
        };
        let clusters =
            rich_text_clusters(&text, &fonts, &family, [0.0, 0.0, 200.0, 100.0]).unwrap();
        let alef = clusters
            .iter()
            .position(|cluster| cluster.start == 2)
            .unwrap();
        let bet = clusters
            .iter()
            .position(|cluster| cluster.start == 3)
            .unwrap();
        assert!(bet < alef);
        assert!(clusters[bet].right_to_left && clusters[alef].right_to_left);
    }

    #[test]
    fn geometry_preserves_empty_lines_and_utf16_line_breaks() {
        let mut fonts = fontdb::Database::new();
        fonts.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
        let family = fonts.faces().next().unwrap().families[0].0.clone();
        let text = RichText {
            spans: vec![RichTextSpan {
                text: "😀\r\n\nb\n".into(),
                style: RichTextStyle::default(),
            }],
            ..Default::default()
        };
        let geometry =
            rich_text_geometry(&text, &fonts, &family, [10.0, 20.0, 200.0, 100.0]).unwrap();
        assert_eq!(
            geometry
                .lines
                .iter()
                .map(|line| (line.start, line.end))
                .collect::<Vec<_>>(),
            [(0, 2), (4, 4), (5, 6), (7, 7)]
        );
        assert!(
            geometry
                .lines
                .windows(2)
                .all(|pair| pair[1].rect[1] > pair[0].rect[1])
        );
        assert_eq!(geometry.lines[1].rect[2], 0.0);
        let empty = rich_text_geometry(
            &RichText::default(),
            &fonts,
            &family,
            [0.0, 0.0, 100.0, 100.0],
        )
        .unwrap();
        assert_eq!(empty.lines.len(), 1);
        assert!(empty.lines[0].rect[3] > 0.0);
        let inline = RichText {
            multiline: false,
            ..text
        };
        let geometry =
            rich_text_geometry(&inline, &fonts, &family, [0.0, 0.0, 200.0, 100.0]).unwrap();
        assert!(
            geometry
                .clusters
                .iter()
                .any(|cluster| (cluster.start, cluster.end) == (2, 4))
        );
    }

    #[test]
    fn simple_text_geometry_preserves_spaces_and_utf16_offsets_across_wrapping() {
        let mut fonts = fontdb::Database::new();
        fonts.load_font_data(include_bytes!("../assets/default_font.ttf").to_vec());
        let family = fonts.faces().next().unwrap().families[0].0.clone();
        let node = TextNode {
            text: "😀  b\r\n\nc".into(),
            wrap: galfus_realm_2d_resources::ui::TextWrapMode::WordWrap,
            ..Default::default()
        };
        let geometry = text_geometry(&node, &fonts, &family, [0.0, 0.0, 30.0, 100.0]).unwrap();
        assert_eq!(geometry.lines.first().unwrap().start, 0);
        assert!(
            geometry
                .lines
                .iter()
                .any(|line| line.start == 7 && line.end == 7)
        );
        assert_eq!(
            (
                geometry.lines.last().unwrap().start,
                geometry.lines.last().unwrap().end
            ),
            (8, 9)
        );
        assert!(
            geometry
                .clusters
                .iter()
                .any(|cluster| (cluster.start, cluster.end) == (0, 2))
        );
        assert!(
            geometry
                .clusters
                .iter()
                .any(|cluster| (cluster.start, cluster.end) == (8, 9))
        );
        let inline = TextNode {
            multiline: false,
            ..node
        };
        let geometry = text_geometry(&inline, &fonts, &family, [0.0, 0.0, 5.0, 100.0]).unwrap();
        assert_eq!(geometry.lines.len(), 1);
        assert_eq!(geometry.lines[0].end, 9);
        assert!(
            geometry
                .clusters
                .iter()
                .any(|cluster| (cluster.start, cluster.end) == (5, 7))
        );
        assert!(
            geometry
                .clusters
                .iter()
                .all(|cluster| cluster.start != 6 && cluster.end != 6)
        );
    }

    #[test]
    fn geometry_exposes_gdef_ligature_carets_from_the_rendered_font() {
        let mut data = include_bytes!("../assets/default_font.ttf").to_vec();
        let face = ttf_parser::Face::parse(&data, 0).unwrap();
        let glyph = face.glyph_index('f').unwrap().0;
        let second = face.glyph_index('i').unwrap().0;
        let coordinate =
            i16::try_from(face.glyph_hor_advance(ttf_parser::GlyphId(glyph)).unwrap() / 2).unwrap();
        // A minimal GSUB liga feature substitutes f+i with the existing f glyph.
        let mut gsub = vec![
            0, 1, 0, 0, 0, 10, 0, 30, 0, 44, 0, 1, b'D', b'F', b'L', b'T', 0, 8, 0, 4, 0, 0, 0, 0,
            255, 255, 0, 1, 0, 0, 0, 1, b'l', b'i', b'g', b'a', 0, 8, 0, 0, 0, 1, 0, 0, 0, 1, 0, 4,
            0, 4, 0, 0, 0, 1, 0, 8, 0, 1, 0, 8, 0, 1, 0, 14, 0, 1, 0, 1,
        ];
        gsub.extend(glyph.to_be_bytes());
        gsub.extend([0, 1, 0, 4]);
        gsub.extend(glyph.to_be_bytes());
        gsub.extend([0, 2]);
        gsub.extend(second.to_be_bytes());
        let mut gdef = vec![
            0, 1, 0, 0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 8, 0, 1, 0, 14, 0, 0, 0, 1, 0, 1,
        ];
        gdef.extend(glyph.to_be_bytes());
        gdef.extend([0, 1, 0, 4, 0, 1]);
        gdef.extend(coordinate.to_be_bytes());
        let count = u16::from_be_bytes([data[4], data[5]]) as usize;
        for (tag, table) in [(b"GDEF", gdef), (b"GSUB", gsub)] {
            let record = (0..count)
                .map(|index| 12 + index * 16)
                .find(|&index| &data[index..index + 4] == tag)
                .unwrap();
            let offset = u32::try_from(data.len()).unwrap();
            data[record + 8..record + 12].copy_from_slice(&offset.to_be_bytes());
            data[record + 12..record + 16].copy_from_slice(&(table.len() as u32).to_be_bytes());
            data.extend(table);
        }
        assert_eq!(shape_paragraph(&data, 0, &"fi".into()).unwrap().len(), 1);
        let mut without_carets = data.clone();
        let record = (0..count)
            .map(|index| 12 + index * 16)
            .find(|&index| &without_carets[index..index + 4] == b"GDEF")
            .unwrap();
        let table_offset =
            u32::from_be_bytes(without_carets[record + 8..record + 12].try_into().unwrap())
                as usize;
        without_carets[table_offset + 8..table_offset + 10].copy_from_slice(&[0, 0]);
        let mut fonts = fontdb::Database::new();
        fonts.load_font_data(data);
        let family = fonts.faces().next().unwrap().families[0].0.clone();
        let node = TextNode {
            text: "fi".into(),
            ..Default::default()
        };
        let geometry = text_geometry(&node, &fonts, &family, [10.0, 20.0, 100.0, 100.0]).unwrap();
        assert_eq!(geometry.clusters.len(), 1);
        let cluster = &geometry.clusters[0];
        assert_eq!(cluster.carets.len(), 1);
        assert_eq!(cluster.carets[0].offset, 1);
        assert!(!cluster.carets[0].approximate);
        assert!(cluster.carets[0].x > cluster.rect[0]);
        assert!(cluster.carets[0].x < cluster.rect[0] + cluster.rect[2]);
        let mut fonts_without_carets = fontdb::Database::new();
        fonts_without_carets.load_font_data(without_carets);
        let estimated = text_geometry(
            &node,
            &fonts_without_carets,
            &family,
            [10.0, 20.0, 100.0, 100.0],
        )
        .unwrap();
        let caret = &estimated.clusters[0].carets[0];
        assert_eq!(caret.offset, 1);
        assert!(caret.approximate);
        assert!(
            caret.x > estimated.clusters[0].rect[0]
                && caret.x < estimated.clusters[0].rect[0] + estimated.clusters[0].rect[2]
        );
    }
}
