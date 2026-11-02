// SPDX-License-Identifier: Apache-2.0 OR MIT

fn convert_baseline_shift(node: SvgNode, state: &converter::State) -> Vec<BaselineShift> {
    let mut shift = Vec::new();
    let nodes: Vec<_> = node
        .ancestors()
        .take_while(|n| n.tag_name() != Some(EId::Text))
        .collect();
    for n in nodes {
        if let Some(len) = n.try_attribute::<Length>(AId::BaselineShift) {
            if len.unit == LengthUnit::Percent {
                let n = super::units::resolve_font_size(n, state) * (len.number as f32 / 100.0);
                shift.push(BaselineShift::Number(n));
            } else {
                let n = super::units::convert_length(
                    len,
                    n,
                    AId::BaselineShift,
                    Units::ObjectBoundingBox,
                    state,
                );
                shift.push(BaselineShift::Number(n));
            }
        } else if let Some(s) = n.attribute(AId::BaselineShift) {
            match s {
                "sub" => shift.push(BaselineShift::Subscript),
                "super" => shift.push(BaselineShift::Superscript),
                _ => shift.push(BaselineShift::Baseline),
            }
        }
    }

    if shift
        .iter()
        .all(|base| matches!(base, BaselineShift::Baseline))
    {
        shift.clear();
    }

    shift
}

fn count_chars(node: SvgNode) -> usize {
    node.descendants()
        .filter(|n| n.is_text())
        .fold(0, |w, n| w + n.text().chars().count())
}

/// Converts the writing mode.
///
/// [SVG 2] references [CSS Writing Modes Level 3] for the definition of the
/// 'writing-mode' property, there are only two writing modes:
/// horizontal left-to-right and vertical right-to-left.
///
/// That specification introduces new values for the property. The SVG 1.1
/// values are obsolete but must still be supported by converting the specified
/// values to computed values as follows:
///
/// - `lr`, `lr-tb`, `rl`, `rl-tb` => `horizontal-tb`
/// - `tb`, `tb-rl` => `vertical-rl`
///
/// The current `vertical-lr` behaves exactly the same as `vertical-rl`.
///
/// Also, looks like no one really supports the `rl` and `rl-tb`, except `Batik`.
/// And I'm not sure if its behaviour is correct.
///
/// So we will ignore it as well, mainly because I have no idea how exactly
/// it should affect the rendering.
///
/// [SVG 2]: https://www.w3.org/TR/SVG2/text.html#WritingModeProperty
/// [CSS Writing Modes Level 3]: https://www.w3.org/TR/css-writing-modes-3/#svg-writing-mode-css
fn convert_writing_mode(text_node: SvgNode) -> WritingMode {
    if let Some(n) = text_node
        .ancestors()
        .find(|n| n.has_attribute(AId::WritingMode))
    {
        match n.attribute(AId::WritingMode).unwrap_or("lr-tb") {
            "tb" | "tb-rl" | "vertical-rl" | "vertical-lr" => WritingMode::TopToBottom,
            _ => WritingMode::LeftToRight,
        }
    } else {
        WritingMode::LeftToRight
    }
}

fn path_length(path: &tiny_skia_path::Path) -> f64 {
    let mut prev_mx = path.points()[0].x;
    let mut prev_my = path.points()[0].y;
    let mut prev_x = prev_mx;
    let mut prev_y = prev_my;

    fn create_curve_from_line(px: f32, py: f32, x: f32, y: f32) -> kurbo::CubicBez {
        let line = kurbo::Line::new(
            kurbo::Point::new(px as f64, py as f64),
            kurbo::Point::new(x as f64, y as f64),
        );
        let p1 = line.eval(0.33);
        let p2 = line.eval(0.66);
        kurbo::CubicBez::new(line.p0, p1, p2, line.p1)
    }

    let mut length = 0.0;
    for seg in path.segments() {
        let curve = match seg {
            tiny_skia_path::PathSegment::MoveTo(p) => {
                prev_mx = p.x;
                prev_my = p.y;
                prev_x = p.x;
                prev_y = p.y;
                continue;
            }
            tiny_skia_path::PathSegment::LineTo(p) => {
                create_curve_from_line(prev_x, prev_y, p.x, p.y)
            }
            tiny_skia_path::PathSegment::QuadTo(p1, p) => kurbo::QuadBez::new(
                kurbo::Point::new(prev_x as f64, prev_y as f64),
                kurbo::Point::new(p1.x as f64, p1.y as f64),
                kurbo::Point::new(p.x as f64, p.y as f64),
            )
            .raise(),
            tiny_skia_path::PathSegment::CubicTo(p1, p2, p) => kurbo::CubicBez::new(
                kurbo::Point::new(prev_x as f64, prev_y as f64),
                kurbo::Point::new(p1.x as f64, p1.y as f64),
                kurbo::Point::new(p2.x as f64, p2.y as f64),
                kurbo::Point::new(p.x as f64, p.y as f64),
            ),
            tiny_skia_path::PathSegment::Close => {
                create_curve_from_line(prev_x, prev_y, prev_mx, prev_my)
            }
        };

        length += curve.arclen(0.5);
        prev_x = curve.p3.x as f32;
        prev_y = curve.p3.y as f32;
    }

    length
}
