//! Distribution of flexible item sizes along a linear layout axis.

use galfus_realm_2d_resources::ui::Model2DUI;

pub(crate) fn distribute(
    ui: &Model2DUI,
    children: &[u32],
    is_row: bool,
    available: f32,
    used: f32,
    allow_shrink: bool,
) -> Vec<f32> {
    let mut sizes: Vec<f32> = children
        .iter()
        .map(|id| {
            let rect = ui.computed[id].absolute_rect;
            if is_row { rect[2] } else { rect[3] }
        })
        .collect();
    let shrinking = allow_shrink && used > available;
    let mut remaining = if shrinking {
        used - available
    } else {
        (available - used).max(0.0)
    };
    let weights: Vec<f32> = children
        .iter()
        .enumerate()
        .map(|(index, id)| {
            let layout = &ui.nodes[id].layout;
            let weight = if shrinking {
                layout.flex_shrink * sizes[index]
            } else {
                layout.flex_grow
            };
            if weight.is_finite() && weight > 0.0 {
                weight
            } else {
                0.0
            }
        })
        .collect();
    let mut active: Vec<bool> = weights.iter().map(|&weight| weight > 0.0).collect();
    while remaining > 0.0001 {
        let total: f32 = weights
            .iter()
            .zip(&active)
            .filter(|(_, active)| **active)
            .map(|(weight, _)| weight)
            .sum();
        if total <= 0.0 || !total.is_finite() {
            break;
        }
        let mut consumed = 0.0;
        for (index, id) in children.iter().enumerate() {
            if !active[index] {
                continue;
            }
            let layout = &ui.nodes[id].layout;
            let amount = remaining * weights[index] / total;
            let limit = if shrinking {
                if is_row {
                    layout.min_width
                } else {
                    layout.min_height
                }
                .unwrap_or(0.0)
                .min(sizes[index])
            } else {
                if is_row {
                    layout.max_width
                } else {
                    layout.max_height
                }
                .unwrap_or(f32::INFINITY)
                .max(sizes[index])
            };
            let new_size = if shrinking {
                (sizes[index] - amount).max(limit)
            } else {
                (sizes[index] + amount).min(limit)
            };
            consumed += (sizes[index] - new_size).abs();
            sizes[index] = new_size;
            if new_size == limit {
                active[index] = false;
            }
        }
        if consumed <= 0.0001 {
            break;
        }
        remaining = (remaining - consumed).max(0.0);
    }
    sizes
}
