//! Native font-metrics measurement, line wrapping, and layout for UI text nodes.

use galfus_realm_2d_resources::ui::{TextAlign, TextNode, TextWrapMode};
use lyon_tessellation::math::point;
use lyon_tessellation::path::Path as LyonPath;
use lyon_tessellation::{
    BuffersBuilder, FillOptions, FillRule, FillTessellator, FillVertex, LineCap, LineJoin,
    StrokeOptions, StrokeTessellator, StrokeVertex, VertexBuffers,
};

use crate::ui_text_font::with_font_face_index;
use crate::vector_geometry::VectorVertex;

/// Measured line fragment of a text run.
#[derive(Debug, Clone, PartialEq)]
pub struct UiTextLine {
    /// Text slice of this line.
    pub text: String,
    /// Logical UTF-16 offsets, excluding a line break.
    pub start: usize,
    pub end: usize,
    /// Measured width of this line in pixels.
    pub width: f32,
    /// Y offset from the top of the text block to the baseline.
    pub baseline_y: f32,
    /// Top Y offset of this line box.
    pub top_y: f32,
}

/// Computed geometry of a measured text run.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct UiTextMeasurement {
    /// Maximum line width.
    pub width: f32,
    /// Total height across all lines.
    pub height: f32,
    /// Computed line height in pixels.
    pub line_height: f32,
    /// Individual line layout fragments.
    pub lines: Vec<UiTextLine>,
}

/// Resolves a font face from the database matching the requested family or fallback.
pub fn with_font_face<R>(
    font_db: &fontdb::Database,
    family: Option<&str>,
    default_family: &str,
    f: impl FnOnce(&ttf_parser::Face) -> R,
) -> Option<R> {
    with_font_face_index(font_db, family, default_family, 400, false, |face, _| {
        f(face)
    })
}

/// Measures text using actual font metrics and wraps lines to the specified max width constraint.
pub fn measure_text(
    font_db: &fontdb::Database,
    default_family: &str,
    node: &TextNode,
    max_width: Option<f32>,
) -> UiTextMeasurement {
    if node.font_size <= 0.0 {
        return UiTextMeasurement::default();
    }
    let text = node.text.to_string();
    let text = if node.multiline {
        text
    } else {
        text.replace(['\r', '\n'], " ")
    };

    let result = with_font_face_index(
        font_db,
        node.font_family.as_deref(),
        default_family,
        node.font_weight,
        node.italic,
        |face, _face_index| {
            let units = face.units_per_em() as f32;
            let scale = node.font_size / units;
            let ascender = face.ascender() as f32 * scale;
            let descender = (face.descender() as f32 * scale).abs();
            let default_lh = (ascender + descender).max(node.font_size * 1.2);
            let line_height = node.line_height.unwrap_or(default_lh);

            let char_advance = |c: char| -> f32 {
                let gid = face.glyph_index(c).unwrap_or(ttf_parser::GlyphId(0));
                let adv = face.glyph_hor_advance(gid).unwrap_or(0) as f32 * scale;
                if c == ' ' || c == '\u{00A0}' {
                    if adv > 0.0 { adv } else { node.font_size * 0.3 }
                } else {
                    adv
                }
            };

            let measure_word = |word: &str| -> f32 {
                let mut line_node = node.clone();
                line_node.text = word.into();
                crate::ui_text_fallback::shape(font_db, default_family, &line_node)
                    .map(|runs| {
                        runs.iter()
                            .flat_map(|run| {
                                run.glyphs
                                    .iter()
                                    .map(|glyph| glyph.x_advance as f32 * run.scale)
                            })
                            .sum()
                    })
                    .unwrap_or_else(|_| word.chars().map(char_advance).sum())
            };

            let limit = (node.wrap == TextWrapMode::WordWrap)
                .then_some(max_width)
                .flatten();
            let mut lines = crate::ui_text_lines::lines(&text, node.multiline, limit, measure_word);

            let line_count = lines.len().max(1);
            let mut max_line_w = 0.0f32;
            for (idx, line) in lines.iter_mut().enumerate() {
                max_line_w = max_line_w.max(line.width);
                line.top_y = idx as f32 * line_height;
                line.baseline_y = line.top_y + ascender;
            }

            let total_h = line_count as f32 * line_height;

            UiTextMeasurement {
                width: max_line_w,
                height: total_h,
                line_height,
                lines,
            }
        },
    );

    result.unwrap_or_else(|| {
        // Fallback approximation if font database has no face
        let char_w = node.font_size * 0.6;
        let line_h = node.line_height.unwrap_or(node.font_size * 1.2);
        let len = text.chars().count() as f32;
        UiTextMeasurement {
            width: len * char_w,
            height: line_h,
            line_height: line_h,
            lines: vec![UiTextLine {
                text: text.clone(),
                start: 0,
                end: text.encode_utf16().count(),
                width: len * char_w,
                baseline_y: node.font_size * 0.8,
                top_y: 0.0,
            }],
        }
    })
}

struct GlyphOutlineBuilder<'a> {
    builder: &'a mut lyon_tessellation::path::Builder,
    scale: f32,
    offset_x: f32,
    offset_y: f32,
    shear: f32,
}

impl<'a> ttf_parser::OutlineBuilder for GlyphOutlineBuilder<'a> {
    fn move_to(&mut self, x: f32, y: f32) {
        self.builder.begin(point(
            self.offset_x + (x + y * self.shear) * self.scale,
            self.offset_y + y * self.scale,
        ));
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.builder.line_to(point(
            self.offset_x + (x + y * self.shear) * self.scale,
            self.offset_y + y * self.scale,
        ));
    }
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        self.builder.quadratic_bezier_to(
            point(
                self.offset_x + (x1 + y1 * self.shear) * self.scale,
                self.offset_y + y1 * self.scale,
            ),
            point(
                self.offset_x + (x + y * self.shear) * self.scale,
                self.offset_y + y * self.scale,
            ),
        );
    }
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        self.builder.cubic_bezier_to(
            point(
                self.offset_x + (x1 + y1 * self.shear) * self.scale,
                self.offset_y + y1 * self.scale,
            ),
            point(
                self.offset_x + (x2 + y2 * self.shear) * self.scale,
                self.offset_y + y2 * self.scale,
            ),
            point(
                self.offset_x + (x + y * self.shear) * self.scale,
                self.offset_y + y * self.scale,
            ),
        );
    }
    fn close(&mut self) {
        self.builder.end(true);
    }
}

/// Constructs a 2D rounded rectangle Lyon path in standard cartesian coordinates (+Y is UP).
pub fn build_rounded_rectangle_path(
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    radii: [f32; 4], // [top_left, top_right, bottom_right, bottom_left]
) -> LyonPath {
    let mut builder = LyonPath::builder();
    let [mut rtl, mut rtr, mut rbr, mut rbl] = radii;
    let max_r = (w * 0.5).min(h * 0.5).max(0.0);
    rtl = rtl.clamp(0.0, max_r);
    rtr = rtr.clamp(0.0, max_r);
    rbr = rbr.clamp(0.0, max_r);
    rbl = rbl.clamp(0.0, max_r);

    let k = 0.552_284_8_f32;

    builder.begin(point(x + rbl, y));
    // Bottom edge
    builder.line_to(point(x + w - rbr, y));
    // Bottom-right corner
    if rbr > 0.0 {
        builder.cubic_bezier_to(
            point(x + w - rbr + rbr * k, y),
            point(x + w, y + rbr - rbr * k),
            point(x + w, y + rbr),
        );
    }
    // Right edge
    builder.line_to(point(x + w, y + h - rtr));
    // Top-right corner
    if rtr > 0.0 {
        builder.cubic_bezier_to(
            point(x + w, y + h - rtr + rtr * k),
            point(x + w - rtr + rtr * k, y + h),
            point(x + w - rtr, y + h),
        );
    }
    // Top edge
    builder.line_to(point(x + rtl, y + h));
    // Top-left corner
    if rtl > 0.0 {
        builder.cubic_bezier_to(
            point(x + rtl - rtl * k, y + h),
            point(x, y + h - rtl + rtl * k),
            point(x, y + h - rtl),
        );
    }
    // Left edge
    builder.line_to(point(x, y + rbl));
    // Bottom-left corner
    if rbl > 0.0 {
        builder.cubic_bezier_to(
            point(x, y + rbl - rbl * k),
            point(x + rbl - rbl * k, y),
            point(x + rbl, y),
        );
    }
    builder.end(true);
    builder.build()
}

/// Tessellates a panel's rounded background and borders into the destination vertex buffer.
#[allow(clippy::too_many_arguments)]
pub fn tessellate_rounded_panel(
    buffers: &mut VertexBuffers<VectorVertex, u32>,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    radii: [f32; 4],
    bg_color: [f32; 4],
    border_color: [f32; 4],
    border_width: [f32; 4],
    z_layer: f32,
) {
    tessellate_rounded_panel_sides(
        buffers,
        x,
        y,
        w,
        h,
        radii,
        bg_color,
        [border_color; 4],
        border_width,
        z_layer,
    );
}

#[allow(clippy::too_many_arguments)]
pub fn tessellate_rounded_panel_sides(
    buffers: &mut VertexBuffers<VectorVertex, u32>,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    radii: [f32; 4],
    bg_color: [f32; 4],
    border_colors: [[f32; 4]; 4],
    border_width: [f32; 4],
    z_layer: f32,
) {
    if w <= 0.0 || h <= 0.0 {
        return;
    }

    // 1. Fill background if visible
    if bg_color[3] > 0.0 {
        let path = build_rounded_rectangle_path(x, y, w, h, radii);
        let mut fill_tess = FillTessellator::new();
        let fill_opts = FillOptions::default()
            .with_fill_rule(FillRule::NonZero)
            .with_tolerance(0.05);
        let _ = fill_tess.tessellate_path(
            &path,
            &fill_opts,
            &mut BuffersBuilder::new(buffers, |vertex: FillVertex| {
                let p = vertex.position();
                [
                    p.x,
                    p.y,
                    z_layer,
                    0.0,
                    0.0,
                    bg_color[0],
                    bg_color[1],
                    bg_color[2],
                    bg_color[3],
                ]
            }),
        );

        // Fill Fringe: 1px analytic feathering band along boundary when no border is present
        let has_borders =
            border_width.iter().any(|&w| w > 0.0) && border_colors.iter().any(|c| c[3] > 0.0);
        if !has_borders {
            let mut stroke_tess = StrokeTessellator::new();
            let fringe_opt = StrokeOptions::default()
                .with_tolerance(0.05)
                .with_line_width(1.0)
                .with_line_cap(LineCap::Round)
                .with_line_join(LineJoin::Round);

            let _ = stroke_tess.tessellate_path(
                &path,
                &fringe_opt,
                &mut BuffersBuilder::new(buffers, |v: StrokeVertex| {
                    let p = v.position();
                    [
                        p.x,
                        p.y,
                        z_layer,
                        0.0,
                        0.0,
                        bg_color[0],
                        bg_color[1],
                        bg_color[2],
                        bg_color[3] * 0.45,
                    ]
                }),
            );
        }
    }

    crate::ui_borders::append_borders(
        buffers,
        [x, y, w, h],
        radii,
        border_width,
        border_colors,
        z_layer + 0.0001,
    );
}

/// Tessellates a text run directly into vector glyph triangles.
#[allow(clippy::too_many_arguments)]
pub fn tessellate_text_run(
    buffers: &mut VertexBuffers<VectorVertex, u32>,
    font_db: &fontdb::Database,
    default_family: &str,
    text_node: &TextNode,
    qx: f32,
    qy: f32,
    qw: f32,
    _qh: f32,
    ui_width: f32,
    ui_height: f32,
    z_layer: f32,
    opacity: f32,
    clip_rect: Option<[f32; 4]>,
) {
    if text_node.text.is_empty() || text_node.font_size <= 0.0 || opacity <= 0.0 {
        return;
    }
    let mut color = text_node.color;
    color[3] *= opacity;
    if color[3] <= 0.0 {
        return;
    }

    let measurement = measure_text(font_db, default_family, text_node, Some(qw));
    let geometry_start = buffers.indices.len();
    let mut tessellator = FillTessellator::new();
    let fill_opts = FillOptions::default()
        .with_fill_rule(FillRule::NonZero)
        .with_tolerance(0.05);
    let mut stroke_tess = StrokeTessellator::new();
    let fringe_opts = StrokeOptions::default()
        .with_tolerance(0.05)
        .with_line_width(1.2)
        .with_line_cap(LineCap::Round)
        .with_line_join(LineJoin::Round);

    for line in &measurement.lines {
        if line.text.is_empty() {
            continue;
        }

        let align_offset = match text_node.align {
            TextAlign::Center => ((qw - line.width) * 0.5).max(0.0),
            TextAlign::Right => (qw - line.width).max(0.0),
            TextAlign::Left => 0.0,
        };

        let line_start_ui_x = qx + align_offset;
        let line_base_ui_y = qy + line.baseline_y;

        let local_base_x = line_start_ui_x - ui_width * 0.5;
        let local_base_y = ui_height * 0.5 - line_base_ui_y;

        let mut current_x = 0.0f32;

        let mut line_node = text_node.clone();
        line_node.text = line.text.as_str().into();
        let Ok(runs) = crate::ui_text_fallback::shape(font_db, default_family, &line_node) else {
            continue;
        };
        for run in runs {
            let scale = run.scale;
            let _ = font_db.with_face_data(run.font, |data, index| {
                let Ok(face) = ttf_parser::Face::parse(data, index) else {
                    return;
                };
                for glyph in run.glyphs {
                    let gid = ttf_parser::GlyphId(glyph.glyph_id as u16);

                    let mut path_builder = LyonPath::builder();
                    let mut glyph_builder = GlyphOutlineBuilder {
                        builder: &mut path_builder,
                        scale,
                        offset_x: local_base_x + current_x + glyph.x_offset as f32 * scale,
                        offset_y: local_base_y + glyph.y_offset as f32 * scale,
                        shear: if text_node.italic && !face.is_italic() {
                            0.2
                        } else {
                            0.0
                        },
                    };

                    if face.outline_glyph(gid, &mut glyph_builder).is_some() {
                        let path = path_builder.build();
                        let _ = tessellator.tessellate_path(
                            &path,
                            &fill_opts,
                            &mut BuffersBuilder::new(buffers, |vertex: FillVertex| {
                                let p = vertex.position();
                                [
                                    p.x,
                                    p.y,
                                    z_layer + 0.0002,
                                    0.0,
                                    0.0,
                                    color[0],
                                    color[1],
                                    color[2],
                                    color[3],
                                ]
                            }),
                        );

                        if text_node.font_weight >= 600 && face.weight().to_number() < 600 {
                            let bold_opts = StrokeOptions::default()
                                .with_line_width(text_node.font_size * 0.035);
                            let _ = stroke_tess.tessellate_path(
                                &path,
                                &bold_opts,
                                &mut BuffersBuilder::new(buffers, |v: StrokeVertex| {
                                    let p = v.position();
                                    [
                                        p.x,
                                        p.y,
                                        z_layer + 0.0002,
                                        0.0,
                                        0.0,
                                        color[0],
                                        color[1],
                                        color[2],
                                        color[3],
                                    ]
                                }),
                            );
                        }

                        // Glyph edge feathering via Lyon StrokeTessellator (smooth fringe model)
                        let _ = stroke_tess.tessellate_path(
                            &path,
                            &fringe_opts,
                            &mut BuffersBuilder::new(buffers, |v: StrokeVertex| {
                                let p = v.position();
                                [
                                    p.x,
                                    p.y,
                                    z_layer + 0.0002,
                                    0.0,
                                    0.0,
                                    color[0],
                                    color[1],
                                    color[2],
                                    color[3] * 0.45,
                                ]
                            }),
                        );
                    }
                    current_x += glyph.x_advance as f32 * scale;
                }
            });
        }
    }
    crate::ui_clip::clip_new_geometry(buffers, geometry_start, clip_rect, ui_width, ui_height);
}
