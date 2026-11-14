//! 2D User Interface management, layout synchronization, material caching, and batch submission.

#[path = "context_ui_batches.rs"]
mod batches;
#[path = "context_ui_nodes.rs"]
mod nodes;
#[path = "context_ui_sprite_fit.rs"]
mod sprite_fit;
#[path = "context_ui_sprite_slices.rs"]
mod sprite_slices;

use crate::ui_fonts::UiFontLibrary;
use crate::vector_geometry::{GpuVectorGeometry, VectorVertex};
use galfus_core::id::RESERVED_RANGE_START;
use galfus_core::{GenerationalPool, Handle};
use galfus_realm_2d_resources::Transform2D;
use galfus_realm_2d_resources::ui::{Model2DUI, ScrollPanelNode, SpriteImageMode, UiNodeKind};
use std::collections::HashMap;
use std::sync::Arc;

/// Base reserved material ID for UI textured samplers.
pub const UI_RESERVED_MATERIAL_BASE: u32 = RESERVED_RANGE_START + 1000;

pub fn compute_ui_dimensions(ui: &Model2DUI) -> (f32, f32) {
    if let Some(root_id) = ui.root_id
        && let Some(layout) = ui.computed.get(&root_id)
    {
        return (
            layout.absolute_rect[2].max(1.0),
            layout.absolute_rect[3].max(1.0),
        );
    }
    // If legacy flat quads are used and the first quad is the root canvas panel [0, 0, w, h]
    if let Some(first) = ui.quads.first()
        && first.rect[0] == 0.0
        && first.rect[1] == 0.0
        && first.rect[2] > 0.0
        && first.rect[3] > 0.0
    {
        return (first.rect[2].max(1.0), first.rect[3].max(1.0));
    }
    let mut max_w: f32 = 0.0;
    let mut max_h: f32 = 0.0;
    for q in &ui.quads {
        max_w = max_w.max(q.rect[0] + q.rect[2]);
        max_h = max_h.max(q.rect[1] + q.rect[3]);
    }
    for t in &ui.texts {
        max_w = max_w.max(t.position[0]);
        max_h = max_h.max(t.position[1] + t.font_size);
    }
    (max_w.max(1.0), max_h.max(1.0))
}

pub struct UiManager2D {
    material_uniform_bufs: [Option<wgpu::Buffer>; 4],
    textured_materials: HashMap<(u32, u32), (u32, wgpu::BindGroup)>,
    texture_sizes: HashMap<u32, [f32; 2]>,
    next_mat_id: u32,
    text_geometries: HashMap<u32, (u64, Handle<GpuVectorGeometry>)>,
    geometry_inputs: HashMap<u32, (Model2DUI, Arc<fontdb::Database>, String)>,
    node_geometries: HashMap<(u32, u32), nodes::NodeGeometry>,
    geometry_pool: GenerationalPool<GpuVectorGeometry>,
    #[cfg(test)]
    node_upload_counts: HashMap<(u32, u32), u64>,
}

impl Default for UiManager2D {
    fn default() -> Self {
        Self {
            material_uniform_bufs: [None, None, None, None],
            textured_materials: HashMap::new(),
            texture_sizes: HashMap::new(),
            next_mat_id: UI_RESERVED_MATERIAL_BASE,
            text_geometries: HashMap::new(),
            geometry_inputs: HashMap::new(),
            node_geometries: HashMap::new(),
            geometry_pool: GenerationalPool::new(0x21),
            #[cfg(test)]
            node_upload_counts: HashMap::new(),
        }
    }
}

impl UiManager2D {
    pub fn new() -> Self {
        Self::default()
    }

    #[cfg(test)]
    pub(crate) fn set_test_texture_size(&mut self, id: u32, size: [f32; 2]) {
        self.texture_sizes.insert(id, size);
    }

    pub fn clear(&mut self) {
        for (_, (_, handle)) in self.text_geometries.drain() {
            let _ = self.geometry_pool.remove(handle);
        }
        self.textured_materials.clear();
        self.texture_sizes.clear();
        self.geometry_inputs.clear();
        self.clear_node_geometries(None);
        self.next_mat_id = UI_RESERVED_MATERIAL_BASE;
    }

    pub fn on_ui_removed(&mut self, ui_id: u32) {
        self.clear_node_geometries(Some(ui_id));
        self.geometry_inputs.remove(&ui_id);
        if let Some((_, handle)) = self.text_geometries.remove(&ui_id) {
            let _ = self.geometry_pool.remove(handle);
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn sync_gpu<'tex>(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        material_bgl: &wgpu::BindGroupLayout,
        samplers: &galfus_gpu_manager::StandardSamplers,
        fallback_white: &wgpu::TextureView,
        fallback_normal: &wgpu::TextureView,
        fallback_black: &wgpu::TextureView,
        textures: &dyn Fn(u32) -> Option<&'tex wgpu::TextureView>,
        uis: &HashMap<u32, (Model2DUI, Transform2D)>,
        material_bind_groups: &mut HashMap<u32, wgpu::BindGroup>,
        fonts: &UiFontLibrary,
    ) {
        // Ensure textured materials for quads and sprite panels
        self.texture_sizes.clear();
        for (ui, _) in uis.values() {
            for quad in &ui.quads {
                if let Some(tex_id) = quad.texture_id {
                    self.ensure_textured_material(
                        device,
                        queue,
                        material_bgl,
                        samplers,
                        fallback_white,
                        fallback_normal,
                        fallback_black,
                        textures,
                        tex_id,
                        quad.sampler_index,
                    );
                }
            }
            for node in ui.nodes.values() {
                if let UiNodeKind::SpritePanel(ref s) = node.kind
                    && let Some(tex_id) = s.texture_id
                {
                    if let Some(texture) = textures(tex_id) {
                        let size = texture.texture().size();
                        self.texture_sizes
                            .insert(tex_id, [size.width as f32, size.height as f32]);
                    }
                    self.ensure_textured_material(
                        device,
                        queue,
                        material_bgl,
                        samplers,
                        fallback_white,
                        fallback_normal,
                        fallback_black,
                        textures,
                        tex_id,
                        s.sampler_index,
                    );
                }
            }
        }

        // Build and upload vector geometry (rounded panels, borders, text glyphs)
        for (&ui_id, (ui, _transform)) in uis {
            if ui.root_id.is_some() {
                if let Some((_, handle)) = self.text_geometries.remove(&ui_id) {
                    let _ = self.geometry_pool.remove(handle);
                }
                self.geometry_inputs.remove(&ui_id);
                self.sync_tree_geometry(ui_id, ui, device, queue, fonts);
                continue;
            }
            self.clear_node_geometries(Some(ui_id));
            if self
                .geometry_inputs
                .get(&ui_id)
                .is_some_and(|(previous, cached_fonts, family)| {
                    previous.root_id == ui.root_id
                        && previous.nodes == ui.nodes
                        && previous.computed == ui.computed
                        && previous.quads == ui.quads
                        && previous.texts == ui.texts
                        && Arc::ptr_eq(cached_fonts, &fonts.database)
                        && family == &fonts.default_family
                })
            {
                continue;
            }
            let (ui_width, ui_height) = compute_ui_dimensions(ui);
            let mut buffers: lyon_tessellation::VertexBuffers<VectorVertex, u32> =
                lyon_tessellation::VertexBuffers::new();

            let has_textures = ui.quads.iter().any(|q| q.texture_id.is_some());

            // Legacy flat quads and texts
            if !has_textures {
                for quad in &ui.quads {
                    let [qx, qy, qw, qh] = quad.rect;
                    let geometry_start = buffers.indices.len();
                    let top = ui_height * 0.5 - qy;
                    let bottom = top - qh;
                    let left = qx - ui_width * 0.5;
                    let quad_z = quad.z_layer;

                    let bg = if quad.texture_id.is_none() {
                        quad.background_color
                    } else {
                        [0.0; 4]
                    };

                    crate::ui_text::tessellate_rounded_panel(
                        &mut buffers,
                        left,
                        bottom,
                        qw,
                        qh,
                        quad.border_radius,
                        bg,
                        quad.border_color,
                        quad.border_width,
                        quad_z,
                    );
                    crate::ui_clip::clip_new_geometry(
                        &mut buffers,
                        geometry_start,
                        quad.clip_rect,
                        ui_width,
                        ui_height,
                    );
                }
            }

            for text in &ui.texts {
                if text.text.is_empty() || text.font_size <= 0.0 || text.color[3] <= 0.0 {
                    continue;
                }
                let [tx, ty] = text.position;
                let text_node = galfus_realm_2d_resources::ui::TextNode {
                    text: text.text.clone(),
                    font_size: text.font_size,
                    color: text.color,
                    multiline: text.text.as_utf16().contains(&(b'\n' as u16)),
                    ..Default::default()
                };
                crate::ui_text::tessellate_text_run(
                    &mut buffers,
                    &fonts.database,
                    &fonts.default_family,
                    &text_node,
                    tx,
                    ty,
                    10000.0,
                    text.font_size,
                    ui_width,
                    ui_height,
                    0.001,
                    1.0,
                    text.clip_rect,
                );
            }

            if buffers.indices.is_empty() {
                if let Some((_, handle)) = self.text_geometries.remove(&ui_id) {
                    let _ = self.geometry_pool.remove(handle);
                }
            } else {
                let vb_bytes =
                    (buffers.vertices.len() * std::mem::size_of::<VectorVertex>()) as u64;
                let ib_bytes = (buffers.indices.len() * std::mem::size_of::<u32>()) as u64;

                let mut reused = false;
                if let Some(&(_, handle)) = self.text_geometries.get(&ui_id)
                    && let Ok(geom) = self.geometry_pool.get_mut(handle)
                    && geom.vertex_capacity >= vb_bytes
                    && geom.index_capacity >= ib_bytes
                {
                    queue.write_buffer(
                        &geom.vertex_buffer,
                        0,
                        bytemuck::cast_slice(&buffers.vertices),
                    );
                    queue.write_buffer(
                        &geom.index_buffer,
                        0,
                        bytemuck::cast_slice(&buffers.indices),
                    );
                    geom.index_count = buffers.indices.len() as u32;
                    geom.dimensions = glam::Vec2::new(ui_width, ui_height);
                    reused = true;
                }

                if !reused {
                    if let Some((_, old_handle)) = self.text_geometries.remove(&ui_id) {
                        let _ = self.geometry_pool.remove(old_handle);
                    }
                    let vb_cap = ((vb_bytes * 3 / 2).max(16384) + 3) & !3;
                    let ib_cap = ((ib_bytes * 3 / 2).max(16384) + 3) & !3;
                    let vbo = crate::gpu::create_gpu_buffer(
                        device,
                        &format!("galfus_ui_{ui_id}_vbo"),
                        vb_cap,
                        wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                    );
                    queue.write_buffer(&vbo, 0, bytemuck::cast_slice(&buffers.vertices));

                    let ibo = crate::gpu::create_gpu_buffer(
                        device,
                        &format!("galfus_ui_{ui_id}_ibo"),
                        ib_cap,
                        wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
                    );
                    queue.write_buffer(&ibo, 0, bytemuck::cast_slice(&buffers.indices));

                    if let Ok(handle) = self.geometry_pool.insert(GpuVectorGeometry {
                        vertex_buffer: vbo,
                        index_buffer: ibo,
                        vertex_capacity: vb_cap,
                        index_capacity: ib_cap,
                        index_count: buffers.indices.len() as u32,
                        dimensions: glam::Vec2::new(ui_width, ui_height),
                    }) {
                        self.text_geometries.insert(ui_id, (0, handle));
                    }
                }
            }
            if buffers.indices.is_empty() || self.text_geometries.contains_key(&ui_id) {
                self.geometry_inputs.insert(
                    ui_id,
                    (
                        ui.clone(),
                        fonts.database.clone(),
                        fonts.default_family.clone(),
                    ),
                );
            } else {
                self.geometry_inputs.remove(&ui_id);
            }
        }

        // Export textured material bind groups to render map
        for &(mat_id, ref bg) in self.textured_materials.values() {
            material_bind_groups
                .entry(mat_id)
                .or_insert_with(|| bg.clone());
        }
    }

    pub(crate) fn get_geometry_by_u64(&self, raw: u64) -> Option<&GpuVectorGeometry> {
        let handle = Handle::from_u64(raw)?;
        self.geometry_pool.get(handle).ok()
    }

    #[allow(clippy::too_many_arguments)]
    fn ensure_textured_material<'tex>(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        material_bgl: &wgpu::BindGroupLayout,
        samplers: &galfus_gpu_manager::StandardSamplers,
        fallback_white: &wgpu::TextureView,
        fallback_normal: &wgpu::TextureView,
        fallback_black: &wgpu::TextureView,
        textures: &dyn Fn(u32) -> Option<&'tex wgpu::TextureView>,
        tex_id: u32,
        sampler_index: u32,
    ) {
        let sampler_idx = sampler_index.min(3);
        let key = (tex_id, sampler_idx);
        if !self.textured_materials.contains_key(&key) {
            let u_buf = self.material_uniform_bufs[sampler_idx as usize].get_or_insert_with(|| {
                let mat = galfus_realm_2d_resources::Material2D {
                    texture_id: Some(0),
                    sampler_index: sampler_idx,
                    ..Default::default()
                };
                let buf = crate::gpu::create_gpu_buffer(
                    device,
                    &format!("galfus_ui_sampler_{sampler_idx}_mat_buf"),
                    std::mem::size_of::<galfus_realm_2d_resources::Material2DUniform>() as u64,
                    wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                );
                queue.write_buffer(&buf, 0, bytemuck::bytes_of(&mat.build_uniform()));
                buf
            });

            let mat_id = self.next_mat_id;
            self.next_mat_id = self.next_mat_id.saturating_add(1);
            let mut slots = [None; 8];
            slots[0] = Some(tex_id);
            let bg = crate::gpu::create_material_bind_group_2d(
                device,
                material_bgl,
                samplers,
                fallback_white,
                fallback_normal,
                fallback_black,
                u_buf,
                &slots,
                textures,
            );
            self.textured_materials.insert(key, (mat_id, bg));
        }
    }
}
