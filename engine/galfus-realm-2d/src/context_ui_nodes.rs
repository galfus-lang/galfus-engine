//! Per-node UI geometry caching and GPU synchronization.

use std::collections::HashSet;
use std::sync::Arc;

use galfus_core::Handle;
use galfus_realm_2d_resources::ui::{Model2DUI, UiComputedLayout, UiNodeKind};
use lyon_tessellation::VertexBuffers;

use super::{UiManager2D, compute_ui_dimensions};
use crate::ui_fonts::UiFontLibrary;
use crate::vector_geometry::{GpuVectorGeometry, VectorVertex};

pub(super) struct NodeGeometry {
    kind: UiNodeKind,
    layout: UiComputedLayout,
    z_layer: f32,
    dimensions: [f32; 2],
    fonts: Arc<fontdb::Database>,
    family: String,
    pub(super) back: Option<Handle<GpuVectorGeometry>>,
    pub(super) front: Option<Handle<GpuVectorGeometry>>,
}

impl UiManager2D {
    #[cfg(test)]
    pub(crate) fn node_upload_count(&self, ui_id: u32, node_id: u32) -> u64 {
        self.node_upload_counts
            .get(&(ui_id, node_id))
            .copied()
            .unwrap_or(0)
    }
    pub(super) fn clear_node_geometries(&mut self, ui_id: Option<u32>) {
        self.node_geometries.retain(|(id, _), geometry| {
            if ui_id.is_none_or(|target| target == *id) {
                for handle in [geometry.back, geometry.front].into_iter().flatten() {
                    let _ = self.geometry_pool.remove(handle);
                }
                false
            } else {
                true
            }
        });
    }

    pub(super) fn sync_tree_geometry(
        &mut self,
        ui_id: u32,
        ui: &Model2DUI,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        fonts: &UiFontLibrary,
    ) {
        let dimensions = compute_ui_dimensions(ui);
        let mut active = HashSet::new();
        let mut stack = ui.root_id.into_iter().collect::<Vec<_>>();
        while let Some(id) = stack.pop() {
            let Some(node) = ui.nodes.get(&id) else {
                continue;
            };
            if !node.visible {
                continue;
            }
            stack.extend(node.children.iter().copied());
            let Some(layout) = ui.computed.get(&id) else {
                continue;
            };
            let key = (ui_id, id);
            active.insert(key);
            let mut existing = self.node_geometries.remove(&key);
            if existing.as_ref().is_some_and(|old| {
                old.kind == node.kind
                    && old.layout == *layout
                    && old.z_layer == node.z_layer
                    && old.dimensions == [dimensions.0, dimensions.1]
                    && (!matches!(node.kind, UiNodeKind::Text(_))
                        || (Arc::ptr_eq(&old.fonts, &fonts.database)
                            && old.family == fonts.default_family))
            }) {
                self.node_geometries.insert(key, existing.unwrap());
                continue;
            }

            #[cfg(test)]
            {
                *self.node_upload_counts.entry(key).or_default() += 1;
            }

            let mut back = VertexBuffers::<VectorVertex, u32>::new();
            let mut front = VertexBuffers::<VectorVertex, u32>::new();
            let [x, y, width, height] = layout.absolute_rect;
            let left = x - dimensions.0 * 0.5;
            let bottom = dimensions.1 * 0.5 - y - height;
            let opacity = layout.accumulated_opacity;
            if width > 0.0 && height > 0.0 {
                match &node.kind {
                    UiNodeKind::Panel(panel)
                    | UiNodeKind::ScrollPanel(super::ScrollPanelNode { panel, .. }) => {
                        let mut bg = panel.background_color;
                        bg[3] *= opacity;
                        let mut colors = panel.border_colors.unwrap_or([panel.border_color; 4]);
                        for color in &mut colors {
                            color[3] *= opacity;
                        }
                        crate::ui_text::tessellate_rounded_panel_sides(
                            &mut back,
                            left,
                            bottom,
                            width,
                            height,
                            panel.border_radius,
                            bg,
                            colors,
                            panel.border_width,
                            node.z_layer,
                        );
                    }
                    UiNodeKind::SpritePanel(sprite) => {
                        let panel = &sprite.panel;
                        let mut bg = panel.background_color;
                        bg[3] *= opacity;
                        let mut colors = panel.border_colors.unwrap_or([panel.border_color; 4]);
                        for color in &mut colors {
                            color[3] *= opacity;
                        }
                        crate::ui_text::tessellate_rounded_panel_sides(
                            &mut back,
                            left,
                            bottom,
                            width,
                            height,
                            panel.border_radius,
                            bg,
                            [[0.0; 4]; 4],
                            [0.0; 4],
                            node.z_layer,
                        );
                        crate::ui_text::tessellate_rounded_panel_sides(
                            &mut front,
                            left,
                            bottom,
                            width,
                            height,
                            panel.border_radius,
                            [0.0; 4],
                            colors,
                            panel.border_width,
                            node.z_layer,
                        );
                    }
                    UiNodeKind::Text(text) => crate::ui_text::tessellate_text_run(
                        &mut back,
                        &fonts.database,
                        &fonts.default_family,
                        text,
                        x,
                        y,
                        width,
                        height,
                        dimensions.0,
                        dimensions.1,
                        node.z_layer,
                        opacity,
                        None,
                    ),
                }
            }
            crate::ui_clip::clip_new_geometry(
                &mut back,
                0,
                layout.clip_rect,
                dimensions.0,
                dimensions.1,
            );
            crate::ui_clip::clip_new_geometry(
                &mut front,
                0,
                layout.clip_rect,
                dimensions.0,
                dimensions.1,
            );
            let back_old = existing.as_mut().and_then(|old| old.back.take());
            let front_old = existing.as_mut().and_then(|old| old.front.take());
            let back_handle = upload_geometry(
                back_old,
                &back,
                dimensions,
                device,
                queue,
                &mut self.geometry_pool,
            );
            let front_handle = upload_geometry(
                front_old,
                &front,
                dimensions,
                device,
                queue,
                &mut self.geometry_pool,
            );
            if (back.indices.is_empty() || back_handle.is_some())
                && (front.indices.is_empty() || front_handle.is_some())
            {
                self.node_geometries.insert(
                    key,
                    NodeGeometry {
                        kind: node.kind.clone(),
                        layout: layout.clone(),
                        z_layer: node.z_layer,
                        dimensions: [dimensions.0, dimensions.1],
                        fonts: fonts.database.clone(),
                        family: fonts.default_family.clone(),
                        back: back_handle,
                        front: front_handle,
                    },
                );
            } else {
                for handle in [back_handle, front_handle].into_iter().flatten() {
                    let _ = self.geometry_pool.remove(handle);
                }
            }
        }
        self.node_geometries.retain(|key, geometry| {
            if key.0 == ui_id && !active.contains(key) {
                for handle in [geometry.back, geometry.front].into_iter().flatten() {
                    let _ = self.geometry_pool.remove(handle);
                }
                false
            } else {
                true
            }
        });
    }
}

fn upload_geometry(
    old: Option<Handle<GpuVectorGeometry>>,
    buffers: &VertexBuffers<VectorVertex, u32>,
    dimensions: (f32, f32),
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pool: &mut galfus_core::GenerationalPool<GpuVectorGeometry>,
) -> Option<Handle<GpuVectorGeometry>> {
    if buffers.indices.is_empty() {
        if let Some(handle) = old {
            let _ = pool.remove(handle);
        }
        return None;
    }
    let vb_bytes = std::mem::size_of_val(buffers.vertices.as_slice()) as u64;
    let ib_bytes = std::mem::size_of_val(buffers.indices.as_slice()) as u64;
    if let Some(handle) = old {
        if let Ok(geometry) = pool.get_mut(handle)
            && geometry.vertex_capacity >= vb_bytes
            && geometry.index_capacity >= ib_bytes
        {
            queue.write_buffer(
                &geometry.vertex_buffer,
                0,
                bytemuck::cast_slice(&buffers.vertices),
            );
            queue.write_buffer(
                &geometry.index_buffer,
                0,
                bytemuck::cast_slice(&buffers.indices),
            );
            geometry.index_count = buffers.indices.len() as u32;
            geometry.dimensions = glam::Vec2::new(dimensions.0, dimensions.1);
            return Some(handle);
        }
        let _ = pool.remove(handle);
    }
    let vertex_capacity = ((vb_bytes * 3 / 2).max(1024) + 3) & !3;
    let index_capacity = ((ib_bytes * 3 / 2).max(1024) + 3) & !3;
    let vertex_buffer = crate::gpu::create_gpu_buffer(
        device,
        "galfus_ui_node_vbo",
        vertex_capacity,
        wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
    );
    let index_buffer = crate::gpu::create_gpu_buffer(
        device,
        "galfus_ui_node_ibo",
        index_capacity,
        wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
    );
    queue.write_buffer(&vertex_buffer, 0, bytemuck::cast_slice(&buffers.vertices));
    queue.write_buffer(&index_buffer, 0, bytemuck::cast_slice(&buffers.indices));
    pool.insert(GpuVectorGeometry {
        vertex_buffer,
        index_buffer,
        vertex_capacity,
        index_capacity,
        index_count: buffers.indices.len() as u32,
        dimensions: glam::Vec2::new(dimensions.0, dimensions.1),
    })
    .ok()
}
