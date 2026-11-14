//! Core UI layout solver: resolves hierarchical flex, stack, scroll, and text bounds.

use galfus_realm_2d_resources::ui::{
    Model2DUI, UiAlign, UiComputedLayout, UiDimension, UiDirtyFlags, UiJustify, UiLayoutDirection,
    UiNodeKind,
};

use crate::ui_text::measure_text;

/// Solves and updates layout for the entire UI tree or dirty subtrees.
pub fn solve_ui_layout(
    ui: &mut Model2DUI,
    font_db: &fontdb::Database,
    default_family: &str,
    container_width: f32,
    container_height: f32,
) {
    let Some(root_id) = ui.root_id else {
        return;
    };
    if !ui.nodes.contains_key(&root_id) {
        return;
    }

    let previous = ui.computed.clone();
    // Resolve tree recursively starting from root
    let parent_bounds = [0.0, 0.0, container_width, container_height];
    resolve_node_layout(
        ui,
        root_id,
        font_db,
        default_family,
        parent_bounds,
        [0.0, 0.0],
        None,
        1.0,
        [None, None],
        false,
    );
    // Auto-sized panels acquire their final bounds only after laying out children.
    // Recompute inherited clips from those final bounds, not provisional zero sizes.
    update_clips(ui, root_id, None);
    for (&id, layout) in &ui.computed {
        let old = previous.get(&id);
        if old.is_some_and(|old| {
            old.absolute_rect == layout.absolute_rect
                && old.clip_rect == layout.clip_rect
                && old.accumulated_opacity == layout.accumulated_opacity
        }) {
            continue;
        }
        if let Some(old) = old
            && old.absolute_rect[2] > 0.0
            && old.absolute_rect[3] > 0.0
        {
            ui.damage_regions.push(old.absolute_rect);
        }
        if layout.absolute_rect[2] > 0.0 && layout.absolute_rect[3] > 0.0 {
            ui.damage_regions.push(layout.absolute_rect);
        }
    }

    // Clear layout dirty flags
    for flags in ui.dirty_flags.values_mut() {
        flags.remove(
            UiDirtyFlags::LAYOUT
                | UiDirtyFlags::TEXT_MEASURE
                | UiDirtyFlags::HIERARCHY
                | UiDirtyFlags::CLIP_TRANSFORM,
        );
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn resolve_node_layout(
    ui: &mut Model2DUI,
    node_id: u32,
    font_db: &fontdb::Database,
    default_family: &str,
    parent_bounds: [f32; 4],
    parent_abs_pos: [f32; 2],
    parent_clip: Option<[f32; 4]>,
    parent_opacity: f32,
    forced_size: [Option<f32>; 2],
    measuring: bool,
) -> [f32; 4] {
    let node = ui.nodes.get(&node_id).cloned().unwrap();
    let style = &node.layout;

    let node_opacity = node.kind.as_panel().map_or(1.0, |p| p.opacity);
    let accumulated_opacity = (parent_opacity * node_opacity).clamp(0.0, 1.0);

    // 1. Resolve explicit dimensions
    let avail_w = parent_bounds[2];
    let avail_h = parent_bounds[3];

    let mut resolved_w = match style.width {
        UiDimension::Exact(w) => w,
        UiDimension::Percent(p) => avail_w * (p / 100.0),
        UiDimension::Auto => 0.0, // Measured below
    };

    let mut resolved_h = match style.height {
        UiDimension::Exact(h) => h,
        UiDimension::Percent(p) => avail_h * (p / 100.0),
        UiDimension::Auto => 0.0, // Measured below
    };
    if let Some(width) = forced_size[0] {
        resolved_w = width;
    }
    if let Some(height) = forced_size[1] {
        resolved_h = height;
    }

    // If text node, measure intrinsic text bounds
    if let UiNodeKind::Text(ref text_node) = node.kind {
        let max_w = if resolved_w > 0.0 {
            Some(resolved_w)
        } else if text_node.wrap == galfus_realm_2d_resources::ui::TextWrapMode::WordWrap
            && avail_w > 0.0
        {
            Some(style.max_width.map_or(avail_w, |max| max.min(avail_w)))
        } else {
            style.max_width
        };
        let measurement = measure_text(font_db, default_family, text_node, max_w);
        if matches!(style.width, UiDimension::Auto) && forced_size[0].is_none() {
            resolved_w = measurement.width;
        }
        if matches!(style.height, UiDimension::Auto) && forced_size[1].is_none() {
            resolved_h = measurement.height;
        }
    }
    if let UiNodeKind::RichText(ref text_node) = node.kind {
        let limit = if resolved_w > 0.0 {
            Some(resolved_w)
        } else if text_node.multiline
            && text_node.wrap == galfus_realm_2d_resources::ui::TextWrapMode::WordWrap
            && avail_w > 0.0
        {
            Some(style.max_width.map_or(avail_w, |max| max.min(avail_w)))
        } else {
            style.max_width
        };
        let size = crate::ui_rich_text::measure(text_node, font_db, default_family, limit);
        if matches!(style.width, UiDimension::Auto) && forced_size[0].is_none() {
            resolved_w = size[0];
        }
        if matches!(style.height, UiDimension::Auto) && forced_size[1].is_none() {
            resolved_h = size[1];
        }
    }

    // Apply constraints
    if let Some(min_w) = style.min_width {
        resolved_w = resolved_w.max(min_w);
    }
    if let Some(max_w) = style.max_width {
        resolved_w = resolved_w.min(max_w);
    }
    if let Some(min_h) = style.min_height {
        resolved_h = resolved_h.max(min_h);
    }
    if let Some(max_h) = style.max_height {
        resolved_h = resolved_h.min(max_h);
    }

    // Determine local position offset
    let (local_x, local_y) = style.position_offset.map_or((0.0, 0.0), |p| (p[0], p[1]));

    let abs_x = parent_abs_pos[0] + local_x;
    let abs_y = parent_abs_pos[1] + local_y;

    // Inner padding & scroll offset
    let pad = style.padding;
    let inner_avail_w = (resolved_w - pad[1] - pad[3]).max(0.0);
    let inner_avail_h = (resolved_h - pad[0] - pad[2]).max(0.0);

    let scroll_offset = match &node.kind {
        UiNodeKind::ScrollPanel(s) => s.scroll_offset,
        _ => [0.0, 0.0],
    };

    let should_clip = match &node.kind {
        UiNodeKind::Panel(p) => p.clip,
        UiNodeKind::SpritePanel(s) => s.panel.clip,
        UiNodeKind::ScrollPanel(_) => true,
        UiNodeKind::Text(_) | UiNodeKind::RichText(_) => false,
    };

    let provisional_abs_rect = [abs_x, abs_y, resolved_w, resolved_h];
    let child_clip = if should_clip {
        Some(match parent_clip {
            Some(p_clip) => intersect_rects(p_clip, provisional_abs_rect),
            None => provisional_abs_rect,
        })
    } else {
        parent_clip
    };

    // 2. Resolve Children Layout
    let mut content_w: f32 = 0.0;
    let mut content_h: f32 = 0.0;

    let child_ids = node.children.clone();
    if !child_ids.is_empty() {
        let is_row = style.direction == UiLayoutDirection::Row;
        let gap = if is_row { style.gap[0] } else { style.gap[1] };
        let allow_shrink = match &node.kind {
            UiNodeKind::ScrollPanel(scroll) => {
                if is_row {
                    !scroll.scroll_x_enabled
                } else {
                    !scroll.scroll_y_enabled
                }
            }
            _ => true,
        };
        let is_grid = !style.is_stack && !style.grid_columns.is_empty();
        let has_flex = !style.is_stack
            && !is_grid
            && child_ids.iter().any(|id| {
                let child = &ui.nodes[id].layout;
                let grow = child.flex_grow.is_finite() && child.flex_grow > 0.0;
                let shrink =
                    allow_shrink && child.flex_shrink.is_finite() && child.flex_shrink > 0.0;
                let cross_auto = if is_row { child.height } else { child.width };
                grow || shrink
                    || (style.align_items == UiAlign::Stretch
                        && matches!(cross_auto, UiDimension::Auto))
            });

        let child_parent_abs = [
            abs_x + pad[3] - scroll_offset[0],
            abs_y + pad[0] - scroll_offset[1],
        ];

        if is_grid {
            [content_w, content_h] = crate::ui_grid::layout_grid(
                ui,
                &child_ids,
                style,
                font_db,
                default_family,
                child_parent_abs,
                [inner_avail_w, inner_avail_h],
                child_clip,
                accumulated_opacity,
                measuring,
            );
        } else if style.is_stack {
            for &child_id in &child_ids {
                let child_rect = resolve_node_layout(
                    ui,
                    child_id,
                    font_db,
                    default_family,
                    [0.0, 0.0, inner_avail_w, inner_avail_h],
                    child_parent_abs,
                    child_clip,
                    accumulated_opacity,
                    [None, None],
                    measuring,
                );
                content_w = content_w.max(child_rect[0] + child_rect[2]);
                content_h = content_h.max(child_rect[1] + child_rect[3]);
            }
        } else {
            // Linear sequence (Row or Column)
            let mut cursor = 0.0f32;
            for (idx, &child_id) in child_ids.iter().enumerate() {
                let child_parent_pos = if is_row {
                    [child_parent_abs[0] + cursor, child_parent_abs[1]]
                } else {
                    [child_parent_abs[0], child_parent_abs[1] + cursor]
                };

                let child_rect = resolve_node_layout(
                    ui,
                    child_id,
                    font_db,
                    default_family,
                    [0.0, 0.0, inner_avail_w, inner_avail_h],
                    child_parent_pos,
                    child_clip,
                    accumulated_opacity,
                    [None, None],
                    measuring || has_flex,
                );

                if is_row {
                    cursor += child_rect[2];
                    if idx < child_ids.len() - 1 {
                        cursor += gap;
                    }
                    content_w = cursor;
                    content_h = content_h.max(child_rect[3]);
                } else {
                    cursor += child_rect[3];
                    if idx < child_ids.len() - 1 {
                        cursor += gap;
                    }
                    content_h = cursor;
                    content_w = content_w.max(child_rect[2]);
                }
            }
        }

        // Auto dimension expansion from children content
        if matches!(style.width, UiDimension::Auto) && forced_size[0].is_none() {
            resolved_w = resolved_w.max(content_w + pad[1] + pad[3]);
            if let Some(max_w) = style.max_width {
                resolved_w = resolved_w.min(max_w);
            }
        }
        if matches!(style.height, UiDimension::Auto) && forced_size[1].is_none() {
            resolved_h = resolved_h.max(content_h + pad[0] + pad[2]);
            if let Some(max_h) = style.max_height {
                resolved_h = resolved_h.min(max_h);
            }
        }
        if has_flex && !measuring {
            let inner_width = (resolved_w - pad[1] - pad[3]).max(0.0);
            let inner_height = (resolved_h - pad[0] - pad[2]).max(0.0);
            let available_main = if is_row { inner_width } else { inner_height };
            let used_main = if is_row { content_w } else { content_h };
            let sizes = crate::ui_flex::distribute(
                ui,
                &child_ids,
                is_row,
                available_main,
                used_main,
                allow_shrink,
            );
            content_w = 0.0;
            content_h = 0.0;
            let mut cursor = 0.0;
            for (index, &child_id) in child_ids.iter().enumerate() {
                let position = if is_row {
                    [child_parent_abs[0] + cursor, child_parent_abs[1]]
                } else {
                    [child_parent_abs[0], child_parent_abs[1] + cursor]
                };
                let child_style = &ui.nodes[&child_id].layout;
                let cross_auto = if is_row {
                    child_style.height
                } else {
                    child_style.width
                };
                let stretch = style.align_items == UiAlign::Stretch
                    && matches!(cross_auto, UiDimension::Auto);
                let forced = if is_row {
                    [Some(sizes[index]), stretch.then_some(inner_height)]
                } else {
                    [stretch.then_some(inner_width), Some(sizes[index])]
                };
                let rect = resolve_node_layout(
                    ui,
                    child_id,
                    font_db,
                    default_family,
                    [0.0, 0.0, inner_width, inner_height],
                    position,
                    child_clip,
                    accumulated_opacity,
                    forced,
                    false,
                );
                cursor += if is_row { rect[2] } else { rect[3] };
                if index + 1 < child_ids.len() {
                    cursor += gap;
                }
                if is_row {
                    content_w = cursor;
                    content_h = content_h.max(rect[3]);
                } else {
                    content_h = cursor;
                    content_w = content_w.max(rect[2]);
                }
            }
        }
        if !style.is_stack && !is_grid {
            let inner_width = (resolved_w - pad[1] - pad[3]).max(0.0);
            let inner_height = (resolved_h - pad[0] - pad[2]).max(0.0);
            let (available_main, available_cross, used_main) = if is_row {
                (inner_width, inner_height, content_w)
            } else {
                (inner_height, inner_width, content_h)
            };
            let free = (available_main - used_main).max(0.0);
            let count = child_ids.len() as f32;
            let (start, between) = match style.justify_content {
                UiJustify::Start => (0.0, 0.0),
                UiJustify::Center => (free * 0.5, 0.0),
                UiJustify::End => (free, 0.0),
                UiJustify::SpaceBetween if count > 1.0 => (0.0, free / (count - 1.0)),
                UiJustify::SpaceAround => (free / (2.0 * count), free / count),
                UiJustify::SpaceEvenly => (free / (count + 1.0), free / (count + 1.0)),
                UiJustify::SpaceBetween => (0.0, 0.0),
            };
            for (index, &child_id) in child_ids.iter().enumerate() {
                let rect = ui.computed[&child_id].absolute_rect;
                let cross_size = if is_row { rect[3] } else { rect[2] };
                let cross_free = (available_cross - cross_size).max(0.0);
                let cross = match style.align_items {
                    UiAlign::Center => cross_free * 0.5,
                    UiAlign::End => cross_free,
                    UiAlign::Start | UiAlign::Stretch => 0.0,
                };
                let main = start + between * index as f32;
                let delta = if is_row { [main, cross] } else { [cross, main] };
                translate_subtree(ui, child_id, delta);
            }
        }
    }

    // 3. Compute Final Clipping Scissor
    let node_abs_rect = [abs_x, abs_y, resolved_w, resolved_h];
    let clip_rect = if should_clip {
        Some(match parent_clip {
            Some(p_clip) => intersect_rects(p_clip, node_abs_rect),
            None => node_abs_rect,
        })
    } else {
        parent_clip
    };

    // 4. Update Computed Layout and Track Damage
    let new_layout = UiComputedLayout {
        local_rect: [local_x, local_y, resolved_w, resolved_h],
        absolute_rect: node_abs_rect,
        clip_rect,
        accumulated_opacity,
        content_size: [content_w, content_h],
    };

    ui.computed.insert(node_id, new_layout);

    // Update ScrollPanel content_size
    if let Some(node_mut) = ui.nodes.get_mut(&node_id)
        && let UiNodeKind::ScrollPanel(ref mut scroll) = node_mut.kind
    {
        scroll.content_size = [content_w, content_h];
    }

    [local_x, local_y, resolved_w, resolved_h]
}

fn translate_subtree(ui: &mut Model2DUI, node_id: u32, delta: [f32; 2]) {
    if delta == [0.0, 0.0] {
        return;
    }
    let mut stack = vec![node_id];
    while let Some(id) = stack.pop() {
        if let Some(layout) = ui.computed.get_mut(&id) {
            layout.absolute_rect[0] += delta[0];
            layout.absolute_rect[1] += delta[1];
        }
        if let Some(node) = ui.nodes.get(&id) {
            stack.extend(node.children.iter().copied());
        }
    }
}

fn update_clips(ui: &mut Model2DUI, node_id: u32, parent_clip: Option<[f32; 4]>) {
    let Some(node) = ui.nodes.get(&node_id) else {
        return;
    };
    let clips_children = match &node.kind {
        UiNodeKind::Panel(panel) => panel.clip,
        UiNodeKind::SpritePanel(sprite) => sprite.panel.clip,
        UiNodeKind::ScrollPanel(_) => true,
        UiNodeKind::Text(_) | UiNodeKind::RichText(_) => false,
    };
    let children = node.children.clone();
    let Some(layout) = ui.computed.get_mut(&node_id) else {
        return;
    };
    let clip = if clips_children {
        Some(parent_clip.map_or(layout.absolute_rect, |parent| {
            intersect_rects(parent, layout.absolute_rect)
        }))
    } else {
        parent_clip
    };
    layout.clip_rect = clip;
    for child_id in children {
        update_clips(ui, child_id, clip);
    }
}

/// Computes the intersection of two axis-aligned rectangles `[x, y, w, h]`.
pub fn intersect_rects(a: [f32; 4], b: [f32; 4]) -> [f32; 4] {
    let x0 = a[0].max(b[0]);
    let y0 = a[1].max(b[1]);
    let x1 = (a[0] + a[2]).min(b[0] + b[2]);
    let y1 = (a[1] + a[3]).min(b[1] + b[3]);
    let w = (x1 - x0).max(0.0);
    let h = (y1 - y0).max(0.0);
    [x0, y0, w, h]
}
