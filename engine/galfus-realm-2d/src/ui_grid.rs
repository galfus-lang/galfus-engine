//! Core-owned grid placement and track sizing.

use galfus_realm_2d_resources::ui::{Model2DUI, UiDimension, UiGridTrack, UiLayoutStyle};

use crate::ui_layout::resolve_node_layout;

/// Measures grid tracks and lays out children, returning the content dimensions.
#[allow(clippy::too_many_arguments)]
pub(crate) fn layout_grid(
    ui: &mut Model2DUI,
    children: &[u32],
    style: &UiLayoutStyle,
    fonts: &fontdb::Database,
    family: &str,
    origin: [f32; 2],
    available: [f32; 2],
    clip: Option<[f32; 4]>,
    opacity: f32,
    measuring: bool,
) -> [f32; 2] {
    let count = style.grid_columns.len();
    if count == 0 || children.is_empty() {
        return [0.0; 2];
    }
    let gap_x = style.gap[0].max(0.0);
    let gap_y = style.gap[1].max(0.0);
    let rows = children.len().div_ceil(count);
    let mut intrinsic = vec![0.0_f32; count];
    for (index, &child) in children.iter().enumerate() {
        let rect = resolve_node_layout(
            ui,
            child,
            fonts,
            family,
            [0.0, 0.0, available[0], available[1]],
            origin,
            clip,
            opacity,
            [None, None],
            true,
        );
        intrinsic[index % count] = intrinsic[index % count].max(rect[2]);
    }
    let mut widths = vec![0.0_f32; count];
    let mut fixed = gap_x * count.saturating_sub(1) as f32;
    let mut fractions = 0.0;
    for (index, track) in style.grid_columns.iter().enumerate() {
        widths[index] = match *track {
            UiGridTrack::Auto => intrinsic[index],
            UiGridTrack::Exact(width) => width.max(0.0),
            UiGridTrack::Percent(percent) => available[0] * percent.max(0.0) / 100.0,
            UiGridTrack::Fraction(weight) => {
                fractions += weight.max(0.0);
                if available[0] <= 0.0 {
                    intrinsic[index]
                } else {
                    0.0
                }
            }
        };
        fixed += widths[index];
    }
    if available[0] > 0.0 && fractions > 0.0 {
        let free = (available[0] - fixed).max(0.0);
        for (index, track) in style.grid_columns.iter().enumerate() {
            if let UiGridTrack::Fraction(weight) = *track {
                widths[index] = free * weight.max(0.0) / fractions;
            }
        }
    }
    let mut heights = vec![style.grid_row_height.unwrap_or(0.0).max(0.0); rows];
    for (index, &child) in children.iter().enumerate() {
        let col = index % count;
        let row = index / count;
        let child_node = &ui.nodes[&child];
        let fill_width =
            matches!(child_node.layout.width, UiDimension::Auto) && child_node.kind.is_panel();
        let rect = resolve_node_layout(
            ui,
            child,
            fonts,
            family,
            [0.0, 0.0, widths[col], available[1]],
            origin,
            clip,
            opacity,
            [fill_width.then_some(widths[col]), None],
            true,
        );
        if style.grid_row_height.is_none() {
            heights[row] = heights[row].max(rect[3]);
        }
    }
    let mut y = origin[1];
    for (row, &height) in heights.iter().enumerate() {
        let mut x = origin[0];
        for (col, &width) in widths.iter().enumerate() {
            let index = row * count + col;
            if index >= children.len() {
                break;
            }
            let child = children[index];
            let child_node = &ui.nodes[&child];
            let is_panel = child_node.kind.is_panel();
            let fill_width = is_panel && matches!(child_node.layout.width, UiDimension::Auto);
            let fill_height = is_panel
                && style.grid_row_height.is_some()
                && matches!(child_node.layout.height, UiDimension::Auto);
            resolve_node_layout(
                ui,
                child,
                fonts,
                family,
                [0.0, 0.0, width, height],
                [x, y],
                clip,
                opacity,
                [fill_width.then_some(width), fill_height.then_some(height)],
                measuring,
            );
            x += width + gap_x;
        }
        y += height + gap_y;
    }
    [
        widths.iter().sum::<f32>() + gap_x * count.saturating_sub(1) as f32,
        heights.iter().sum::<f32>() + gap_y * rows.saturating_sub(1) as f32,
    ]
}
