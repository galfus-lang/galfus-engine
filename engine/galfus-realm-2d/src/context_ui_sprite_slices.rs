//! Nine-slice sprite batching.

use super::batches::clip_uv_rect;
use crate::batch::{BatchBuilder2D, PreparedItem2D};
use crate::types::{BatchKey2D, Item2DInstanceRaw};
use galfus_realm_2d_resources::Transform2D;
use glam::{Mat4, Quat, Vec3, Vec4};

#[allow(clippy::too_many_arguments)]
pub(super) fn push_nine_slice(
    batch_builder: &mut BatchBuilder2D,
    ui_id: u32,
    mut sub_order: u32,
    transform: &Transform2D,
    mat_id: u32,
    rect: [f32; 4],
    border: [f32; 4],
    uv: [f32; 4],
    texture_size: [f32; 2],
    clip: Option<[f32; 4]>,
    tint: [f32; 4],
    ui_width: f32,
    ui_height: f32,
    to_world: &dyn Fn(f32, f32) -> (f32, f32),
    quad_z: f32,
) -> u32 {
    let [x, y, w, h] = rect;
    let [bt, br, bb, bl] = border.map(|value| value.max(0.0));
    let fit_pair = |a: f32, b: f32, available: f32| {
        let scale = if a + b > available && a + b > 0.0 {
            available.max(0.0) / (a + b)
        } else {
            1.0
        };
        (a * scale, b * scale)
    };
    let (left, right) = fit_pair(bl, br, w);
    let (top, bottom) = fit_pair(bt, bb, h);
    let cw = (w - left - right).max(0.0);
    let ch = (h - top - bottom).max(0.0);

    let xs = [x, x + left, x + left + cw, x + w];
    let ys = [y, y + top, y + top + ch, y + h];

    let u_span = uv[2] - uv[0];
    let v_span = uv[3] - uv[1];
    let source_w = texture_size[0] * u_span.abs();
    let source_h = texture_size[1] * v_span.abs();
    let (src_left, src_right) = fit_pair(bl, br, source_w);
    let (src_top, src_bottom) = fit_pair(bt, bb, source_h);
    let u_left = if source_w > 0.0 {
        uv[0] + (src_left / source_w) * u_span
    } else {
        uv[0]
    };
    let u_right = if source_w > 0.0 {
        uv[2] - (src_right / source_w) * u_span
    } else {
        uv[2]
    };
    let v_top = if source_h > 0.0 {
        uv[1] + (src_top / source_h) * v_span
    } else {
        uv[1]
    };
    let v_bot = if source_h > 0.0 {
        uv[3] - (src_bottom / source_h) * v_span
    } else {
        uv[3]
    };

    let u_coords = [uv[0], u_left, u_right, uv[2]];
    let v_coords = [uv[1], v_top, v_bot, uv[3]];

    for row in 0..3 {
        let cell_y = ys[row];
        let cell_h = ys[row + 1] - cell_y;
        if cell_h <= 0.0 {
            continue;
        }
        for col in 0..3 {
            let cell_x = xs[col];
            let cell_w = xs[col + 1] - cell_x;
            if cell_w <= 0.0 {
                continue;
            }

            let Some(([cell_x, cell_y, cell_w, cell_h], cell_uv)) = clip_uv_rect(
                [cell_x, cell_y, cell_w, cell_h],
                [
                    u_coords[col],
                    v_coords[row],
                    u_coords[col + 1],
                    v_coords[row + 1],
                ],
                clip,
            ) else {
                continue;
            };
            let cell_cx = cell_x + cell_w * 0.5 - ui_width * 0.5;
            let cell_cy = ui_height * 0.5 - (cell_y + cell_h * 0.5);
            let (cwx, cwy) = to_world(cell_cx, cell_cy);
            let cmat = Mat4::from_scale_rotation_translation(
                Vec3::new(cell_w * transform.scale.x, cell_h * transform.scale.y, 1.0),
                Quat::from_rotation_z(transform.rotation),
                Vec3::new(cwx, cwy, quad_z),
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
                    model_matrix: cmat,
                    tint: Vec4::from_array(tint),
                    uv_rect: Vec4::from_array(cell_uv),
                    shadow_params: Vec4::new(0.0, 0.0, -10000.0, 10000.0),
                },
                occluder_only: false,
            });
        }
    }

    sub_order
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_borders_use_texture_size_even_when_destination_changes() {
        let mut builder = BatchBuilder2D::new();
        push_nine_slice(
            &mut builder,
            1,
            0,
            &Transform2D::default(),
            0,
            [0.0, 0.0, 200.0, 100.0],
            [10.0; 4],
            [0.0, 0.0, 1.0, 1.0],
            [100.0, 50.0],
            None,
            [1.0; 4],
            200.0,
            100.0,
            &|x, y| (x, y),
            0.0,
        );
        builder.build();
        assert_eq!(builder.instances().len(), 9);
        assert_eq!(
            builder.instances()[0].uv_rect.to_array(),
            [0.0, 0.0, 0.1, 0.2]
        );
    }
}
