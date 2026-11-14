//! Visual ordering of styled fragments within each laid-out line.

use unicode_bidi::BidiInfo;

use crate::ui_rich_text::Fragment;
use crate::ui_text::measure_text;

pub(crate) fn reorder_lines(
    fragments: Vec<Fragment>,
    fonts: &fontdb::Database,
    family: &str,
) -> Vec<Fragment> {
    let mut output = Vec::with_capacity(fragments.len());
    let mut start = 0;
    while start < fragments.len() {
        let mut end = start + 1;
        while end < fragments.len() && fragments[end].y == fragments[start].y {
            end += 1;
        }
        let line = &fragments[start..end];
        let mut text = String::new();
        let mut ranges = Vec::with_capacity(line.len());
        for fragment in line {
            let offset = text.len();
            text.push_str(&fragment.node.text.to_string());
            ranges.push(offset..text.len());
        }
        let bidi = BidiInfo::new(&text, None);
        if !bidi.has_rtl() {
            output.extend_from_slice(line);
            start = end;
            continue;
        }
        let mut x = 0.0;
        for paragraph in &bidi.paragraphs {
            let (levels, runs) = bidi.visual_runs(paragraph, paragraph.range.clone());
            for run in runs {
                let indices: Box<dyn Iterator<Item = usize>> = if levels[run.start].is_rtl() {
                    Box::new((0..line.len()).rev())
                } else {
                    Box::new(0..line.len())
                };
                for index in indices {
                    let range = &ranges[index];
                    let a = run.start.max(range.start);
                    let b = run.end.min(range.end);
                    if a >= b {
                        continue;
                    }
                    let mut fragment = line[index].clone();
                    fragment.start += text[range.start..a].encode_utf16().count();
                    fragment.node.text = text[a..b].into();
                    fragment.x = x;
                    fragment.width = measure_text(fonts, family, &fragment.node, None).width;
                    x += fragment.width;
                    output.push(fragment);
                }
            }
        }
        start = end;
    }
    output
}
