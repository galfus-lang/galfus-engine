//! Clips UI triangles without changing the shape or position of their source geometry.

use lyon_tessellation::VertexBuffers;

use crate::vector_geometry::VectorVertex;

/// Clips geometry appended after `start` against a rectangle in UI coordinates.
pub(crate) fn clip_new_geometry(
    buffers: &mut VertexBuffers<VectorVertex, u32>,
    start: usize,
    clip: Option<[f32; 4]>,
    ui_width: f32,
    ui_height: f32,
) {
    let Some([x, y, width, height]) = clip else {
        return;
    };
    let indices = buffers.indices.split_off(start);
    if width <= 0.0 || height <= 0.0 {
        return;
    }
    let bounds = [
        x - ui_width * 0.5,
        x + width - ui_width * 0.5,
        ui_height * 0.5 - y - height,
        ui_height * 0.5 - y,
    ];
    for triangle in indices.as_chunks::<3>().0 {
        let mut polygon = triangle
            .iter()
            .map(|&i| buffers.vertices[i as usize])
            .collect::<Vec<_>>();
        for (axis, boundary, keep_greater) in [
            (0, bounds[0], true),
            (0, bounds[1], false),
            (1, bounds[2], true),
            (1, bounds[3], false),
        ] {
            if polygon.is_empty() {
                break;
            }
            let input = std::mem::take(&mut polygon);
            let mut previous = *input.last().unwrap();
            let inside = |v: &VectorVertex| {
                if keep_greater {
                    v[axis] >= boundary
                } else {
                    v[axis] <= boundary
                }
            };
            for current in input {
                let prev_inside = inside(&previous);
                let curr_inside = inside(&current);
                if prev_inside != curr_inside {
                    let denom = current[axis] - previous[axis];
                    if denom.abs() > 1e-6 {
                        let t = ((boundary - previous[axis]) / denom).clamp(0.0, 1.0);
                        let mut intersection = previous;
                        for i in 0..intersection.len() {
                            intersection[i] = previous[i] + t * (current[i] - previous[i]);
                        }
                        polygon.push(intersection);
                    }
                }
                if curr_inside {
                    polygon.push(current);
                }
                previous = current;
            }
        }
        if polygon.len() >= 3 {
            let base = buffers.vertices.len() as u32;
            buffers.vertices.extend_from_slice(&polygon);
            for i in 1..polygon.len() - 1 {
                buffers
                    .indices
                    .extend_from_slice(&[base, base + i as u32, base + i as u32 + 1]);
            }
        }
    }
}
