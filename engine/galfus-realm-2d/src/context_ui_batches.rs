//! Batching for native 2D UI geometry and textures.

use super::sprite_fit::fit_sprite;
use super::sprite_slices::push_nine_slice;
use super::*;
use crate::batch::{BatchBuilder2D, PreparedItem2D};
use crate::types::{BatchKey2D, Item2DInstanceRaw};
use glam::{Mat4, Quat, Vec3, Vec4};

impl UiManager2D {
    pub fn push_batches(
        &self,
        uis: &HashMap<u32, (Model2DUI, Transform2D)>,
        batch_builder: &mut BatchBuilder2D,
    ) {
        for (&ui_id, (ui, transform)) in uis {
            let (ui_width, ui_height) = compute_ui_dimensions(ui);
            let cos_r = transform.rotation.cos();
            let sin_r = transform.rotation.sin();

            let to_world = |lx: f32, ly: f32| -> (f32, f32) {
                let sx = lx * transform.scale.x;
                let sy = ly * transform.scale.y;
                let wx = transform.position.x + sx * cos_r - sy * sin_r;
                let wy = transform.position.y + sx * sin_r + sy * cos_r;
                (wx, wy)
            };

            let mut sub_order = 0u32;

            if let Some(root_id) = ui.root_id {
                let mut stack = vec![root_id];
                while let Some(node_id) = stack.pop() {
                    let Some(node) = ui.nodes.get(&node_id) else {
                        continue;
                    };
                    if !node.visible {
                        continue;
                    }
                    for child_id in node.children.iter().rev() {
                        stack.push(*child_id);
                    }
                    let Some(layout) = ui.computed.get(&node_id) else {
                        continue;
                    };
                    let is_culled = if let Some([cx, cy, cw, ch]) = layout.clip_rect {
                        let [x, y, w, h] = layout.absolute_rect;
                        if w > 0.0 && h > 0.0 {
                            x + w <= cx || x >= cx + cw || y + h <= cy || y >= cy + ch
                        } else {
                            false
                        }
                    } else {
                        false
                    };
                    if is_culled {
                        continue;
                    }

                    let opacity = layout.accumulated_opacity;
                    let geometry = self.node_geometries.get(&(ui_id, node_id));
                    if let Some(handle) = geometry.and_then(|geometry| geometry.back) {
                        sub_order = sub_order.saturating_add(1);
                        push_node_geometry(batch_builder, ui_id, sub_order, transform, handle);
                    }

                    let clipped =
                        clip_uv_rect(layout.absolute_rect, [0.0, 0.0, 1.0, 1.0], layout.clip_rect);
                    if let Some(([qx, qy, qw, qh], _)) = clipped {
                        let center_x = qx + qw * 0.5 - ui_width * 0.5;
                        let center_y = ui_height * 0.5 - (qy + qh * 0.5);
                        let (world_x, world_y) = to_world(center_x, center_y);
                        let scale_x = qw * transform.scale.x;
                        let scale_y = qh * transform.scale.y;
                        let quad_z = transform.z_layer as f32 + node.z_layer;
                        let model_matrix = Mat4::from_scale_rotation_translation(
                            Vec3::new(scale_x, scale_y, 1.0),
                            Quat::from_rotation_z(transform.rotation),
                            Vec3::new(world_x, world_y, quad_z),
                        );

                        match &node.kind {
                            UiNodeKind::Panel(panel)
                            | UiNodeKind::ScrollPanel(ScrollPanelNode { panel, .. }) => {
                                if geometry.is_none() {
                                    if panel.background_color[3] > 0.0 && opacity > 0.0 {
                                        let mut bg = panel.background_color;
                                        bg[3] *= opacity;
                                        sub_order = sub_order.saturating_add(1);
                                        push_colored_quad(
                                            batch_builder,
                                            ui_id,
                                            sub_order,
                                            transform,
                                            model_matrix,
                                            bg,
                                        );
                                    }
                                    sub_order = push_borders(
                                        batch_builder,
                                        ui_id,
                                        sub_order,
                                        transform,
                                        [qx, qy, qw, qh],
                                        panel.border_width,
                                        panel.border_color,
                                        opacity,
                                        ui_width,
                                        ui_height,
                                        &to_world,
                                        quad_z,
                                    );
                                }
                            }
                            UiNodeKind::SpritePanel(sprite) => {
                                if geometry.is_none() {
                                    if sprite.panel.background_color[3] > 0.0 && opacity > 0.0 {
                                        let mut bg = sprite.panel.background_color;
                                        bg[3] *= opacity;
                                        sub_order = sub_order.saturating_add(1);
                                        push_colored_quad(
                                            batch_builder,
                                            ui_id,
                                            sub_order,
                                            transform,
                                            model_matrix,
                                            bg,
                                        );
                                    }
                                    sub_order = push_borders(
                                        batch_builder,
                                        ui_id,
                                        sub_order,
                                        transform,
                                        [qx, qy, qw, qh],
                                        sprite.panel.border_width,
                                        sprite.panel.border_color,
                                        opacity,
                                        ui_width,
                                        ui_height,
                                        &to_world,
                                        quad_z,
                                    );
                                }
                                if let Some(tex_id) = sprite.texture_id {
                                    let sampler_idx = sprite.sampler_index.min(3);
                                    let mat_id = self
                                        .textured_materials
                                        .get(&(tex_id, sampler_idx))
                                        .map(|(id, _)| *id)
                                        .unwrap_or(0);

                                    let mut tint = sprite.tint_color;
                                    tint[3] *= opacity;
                                    let texture_size = self
                                        .texture_sizes
                                        .get(&tex_id)
                                        .copied()
                                        .unwrap_or([1.0, 1.0]);

                                    if sprite.image_mode == SpriteImageMode::NineSlice {
                                        sub_order = push_nine_slice(
                                            batch_builder,
                                            ui_id,
                                            sub_order,
                                            transform,
                                            mat_id,
                                            layout.absolute_rect,
                                            sprite.slice_border,
                                            sprite.uv_rect,
                                            texture_size,
                                            layout.clip_rect,
                                            tint,
                                            ui_width,
                                            ui_height,
                                            &to_world,
                                            quad_z,
                                        );
                                    } else {
                                        let (image_rect, image_uv) = fit_sprite(
                                            layout.absolute_rect,
                                            sprite.uv_rect,
                                            texture_size,
                                            sprite.image_mode,
                                        );
                                        if let Some(([ix, iy, iw, ih], clipped_uv)) =
                                            clip_uv_rect(image_rect, image_uv, layout.clip_rect)
                                        {
                                            let (wx, wy) = to_world(
                                                ix + iw * 0.5 - ui_width * 0.5,
                                                ui_height * 0.5 - iy - ih * 0.5,
                                            );
                                            let image_matrix =
                                                Mat4::from_scale_rotation_translation(
                                                    Vec3::new(
                                                        iw * transform.scale.x,
                                                        ih * transform.scale.y,
                                                        1.0,
                                                    ),
                                                    Quat::from_rotation_z(transform.rotation),
                                                    Vec3::new(wx, wy, quad_z),
                                                );
                                            sub_order = sub_order.saturating_add(1);
                                            batch_builder.push(PreparedItem2D {
                                                order: (ui_id, 3, sub_order),
                                                key: BatchKey2D {
                                                    z_layer: transform.z_layer,
                                                    draw_order: transform.draw_order,
                                                    surface_type: 1,
                                                    material_id: mat_id,
                                                    geometry_id: 0,
                                                },
                                                instance: Item2DInstanceRaw {
                                                    model_matrix: image_matrix,
                                                    tint: Vec4::from_array(tint),
                                                    uv_rect: Vec4::from_array(clipped_uv),
                                                    shadow_params: Vec4::new(
                                                        0.0, 0.0, -10000.0, 10000.0,
                                                    ),
                                                },
                                                occluder_only: false,
                                            });
                                        }
                                    }
                                }
                            }
                            UiNodeKind::Text(_) | UiNodeKind::RichText(_) => {}
                        }
                    }

                    if let Some(handle) = geometry.and_then(|geometry| geometry.front) {
                        sub_order = sub_order.saturating_add(1);
                        push_node_geometry(batch_builder, ui_id, sub_order, transform, handle);
                    }
                }
            } else {
                // Legacy textured and fallback quads
                for (quad_idx, quad) in ui.quads.iter().enumerate() {
                    let Some(([qx, qy, qw, qh], uv)) =
                        clip_uv_rect(quad.rect, quad.uv_rect, quad.clip_rect)
                    else {
                        continue;
                    };
                    let center_x = qx + qw * 0.5 - ui_width * 0.5;
                    let center_y = ui_height * 0.5 - (qy + qh * 0.5);
                    let (world_x, world_y) = to_world(center_x, center_y);
                    let scale_x = qw * transform.scale.x;
                    let scale_y = qh * transform.scale.y;
                    let quad_z = transform.z_layer as f32 + quad.z_layer;
                    let model_matrix = Mat4::from_scale_rotation_translation(
                        Vec3::new(scale_x, scale_y, 1.0),
                        Quat::from_rotation_z(transform.rotation),
                        Vec3::new(world_x, world_y, quad_z),
                    );

                    let sub_base = (quad_idx as u32).saturating_mul(6);
                    let has_textures = ui.quads.iter().any(|q| q.texture_id.is_some());
                    if has_textures || !self.text_geometries.contains_key(&ui_id) {
                        if quad.background_color[3] > 0.0 {
                            push_colored_quad(
                                batch_builder,
                                ui_id,
                                sub_base,
                                transform,
                                model_matrix,
                                quad.background_color,
                            );
                        }
                        let _ = push_borders(
                            batch_builder,
                            ui_id,
                            sub_base + 2,
                            transform,
                            [qx, qy, qw, qh],
                            quad.border_width,
                            quad.border_color,
                            1.0,
                            ui_width,
                            ui_height,
                            &to_world,
                            quad_z,
                        );
                    }

                    if let Some(tex_id) = quad.texture_id {
                        let sampler_idx = quad.sampler_index.min(3);
                        let mat_id = self
                            .textured_materials
                            .get(&(tex_id, sampler_idx))
                            .map(|(id, _)| *id)
                            .unwrap_or(0);

                        batch_builder.push(PreparedItem2D {
                            order: (ui_id, 3, sub_base + 1),
                            key: BatchKey2D {
                                z_layer: transform.z_layer,
                                draw_order: transform.draw_order,
                                surface_type: 1,
                                material_id: mat_id,
                                geometry_id: 0,
                            },
                            instance: Item2DInstanceRaw {
                                model_matrix,
                                tint: Vec4::from_array(quad.tint_color),
                                uv_rect: Vec4::from_array(uv),
                                shadow_params: Vec4::new(0.0, 0.0, -10000.0, 10000.0),
                            },
                            occluder_only: false,
                        });
                    }
                }
            }

            // Push vector geometry (contains all panel backgrounds, rounded/damped borders, and font glyphs)
            if let Some(&(_, handle)) = self.text_geometries.get(&ui_id) {
                let model_matrix = Mat4::from_scale_rotation_translation(
                    Vec3::new(transform.scale.x, transform.scale.y, 1.0),
                    Quat::from_rotation_z(transform.rotation),
                    Vec3::new(
                        transform.position.x,
                        transform.position.y,
                        transform.z_layer as f32,
                    ),
                );
                batch_builder.push(PreparedItem2D {
                    order: (ui_id, 3, 50000),
                    key: BatchKey2D {
                        z_layer: transform.z_layer,
                        draw_order: transform.draw_order,
                        surface_type: 1,
                        material_id: 0,
                        geometry_id: handle.to_u64(),
                    },
                    instance: Item2DInstanceRaw {
                        model_matrix,
                        tint: Vec4::ONE,
                        uv_rect: Vec4::new(0.0, 0.0, 1.0, 1.0),
                        shadow_params: Vec4::new(0.0, 0.0, -10000.0, 10000.0),
                    },
                    occluder_only: false,
                });
            }
        }
    }
}

fn push_node_geometry(
    batch_builder: &mut BatchBuilder2D,
    ui_id: u32,
    sub_order: u32,
    transform: &Transform2D,
    handle: Handle<GpuVectorGeometry>,
) {
    let model_matrix = Mat4::from_scale_rotation_translation(
        Vec3::new(transform.scale.x, transform.scale.y, 1.0),
        Quat::from_rotation_z(transform.rotation),
        Vec3::new(
            transform.position.x,
            transform.position.y,
            transform.z_layer as f32,
        ),
    );
    batch_builder.push(PreparedItem2D {
        order: (ui_id, 3, sub_order),
        key: BatchKey2D {
            z_layer: transform.z_layer,
            draw_order: transform.draw_order,
            surface_type: 1,
            material_id: 0,
            geometry_id: handle.to_u64(),
        },
        instance: Item2DInstanceRaw {
            model_matrix,
            tint: Vec4::ONE,
            uv_rect: Vec4::new(0.0, 0.0, 1.0, 1.0),
            shadow_params: Vec4::new(0.0, 0.0, -10000.0, 10000.0),
        },
        occluder_only: false,
    });
}

/// Clips a textured rectangle while preserving its original texture mapping.
pub(super) fn clip_uv_rect(
    rect: [f32; 4],
    uv: [f32; 4],
    clip: Option<[f32; 4]>,
) -> Option<([f32; 4], [f32; 4])> {
    let [x, y, w, h] = rect;
    if w <= 0.0 || h <= 0.0 {
        return None;
    }
    let Some([cx, cy, cw, ch]) = clip else {
        return Some((rect, uv));
    };
    let x0 = x.max(cx);
    let y0 = y.max(cy);
    let x1 = (x + w).min(cx + cw);
    let y1 = (y + h).min(cy + ch);
    if x1 <= x0 || y1 <= y0 {
        return None;
    }
    let du = uv[2] - uv[0];
    let dv = uv[3] - uv[1];
    Some((
        [x0, y0, x1 - x0, y1 - y0],
        [
            uv[0] + (x0 - x) / w * du,
            uv[1] + (y0 - y) / h * dv,
            uv[0] + (x1 - x) / w * du,
            uv[1] + (y1 - y) / h * dv,
        ],
    ))
}

fn push_colored_quad(
    batch_builder: &mut BatchBuilder2D,
    ui_id: u32,
    sub_order: u32,
    transform: &Transform2D,
    model_matrix: Mat4,
    color: [f32; 4],
) {
    batch_builder.push(PreparedItem2D {
        order: (ui_id, 3, sub_order),
        key: BatchKey2D {
            z_layer: transform.z_layer,
            draw_order: transform.draw_order,
            surface_type: 1,
            material_id: 0,
            geometry_id: 0,
        },
        instance: Item2DInstanceRaw {
            model_matrix,
            tint: Vec4::from_array(color),
            uv_rect: Vec4::new(0.0, 0.0, 1.0, 1.0),
            shadow_params: Vec4::new(0.0, 0.0, -10000.0, 10000.0),
        },
        occluder_only: false,
    });
}

#[allow(clippy::too_many_arguments)]
fn push_borders(
    batch_builder: &mut BatchBuilder2D,
    ui_id: u32,
    mut sub_order: u32,
    transform: &Transform2D,
    rect: [f32; 4],
    border_width: [f32; 4],
    border_color: [f32; 4],
    opacity: f32,
    ui_width: f32,
    ui_height: f32,
    to_world: &dyn Fn(f32, f32) -> (f32, f32),
    quad_z: f32,
) -> u32 {
    let [bt, br, bb, bl] = border_width;
    if (bt > 0.0 || br > 0.0 || bb > 0.0 || bl > 0.0) && border_color[3] > 0.0 && opacity > 0.0 {
        let [qx, qy, qw, qh] = rect;
        let mut tint = border_color;
        tint[3] *= opacity;
        let border_edges = [
            (qx, qy, qw, bt),                                     // top
            (qx, qy + qh - bb, qw, bb),                           // bottom
            (qx, qy + bt, bl, (qh - bt - bb).max(0.0)),           // left
            (qx + qw - br, qy + bt, br, (qh - bt - bb).max(0.0)), // right
        ];
        for &(ex, ey, ew, eh) in &border_edges {
            if ew <= 0.0 || eh <= 0.0 {
                continue;
            }
            let ecx = ex + ew * 0.5 - ui_width * 0.5;
            let ecy = ui_height * 0.5 - (ey + eh * 0.5);
            let (ewx, ewy) = to_world(ecx, ecy);
            let emat = Mat4::from_scale_rotation_translation(
                Vec3::new(ew * transform.scale.x, eh * transform.scale.y, 1.0),
                Quat::from_rotation_z(transform.rotation),
                Vec3::new(ewx, ewy, quad_z + 0.0001),
            );
            sub_order = sub_order.saturating_add(1);
            push_colored_quad(batch_builder, ui_id, sub_order, transform, emat, tint);
        }
    }
    sub_order
}
