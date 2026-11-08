use std::collections::HashMap;
use std::sync::Arc;

use galfus_core::{GenerationalPool, Handle};
use galfus_realm_2d_resources::{Material2D, SurfaceType2D, Svg2D, Transform2D};
use glam::{Vec2, Vec4};
use resvg::usvg::fontdb;

use crate::batch::{BatchBuilder2D, PreparedItem2D};
use crate::types::{BatchKey2D, Item2DInstanceRaw};

/// Namespace constant for SVG geometries in the generational pool.
pub const NAMESPACE_SVG_GEOMETRY: u16 = 0x20;

/// Default material ID reserved for SVG vector entities without custom shader materials.
pub const SVG_DEFAULT_MATERIAL_ID: u32 = galfus_core::id::RESERVED_RANGE_START;

/// GPU-uploaded vector geometry for an SVG sub-mesh.
pub struct SvgGeometry2D {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: wgpu::Buffer,
    pub vertex_capacity: u64,
    pub index_capacity: u64,
    pub index_count: u32,
    pub dimensions: Vec2,
}

/// Active GPU sub-mesh handle and optional `<image textureId="...">` binding.
#[derive(Debug, Clone, Copy)]
pub struct SvgSubMeshBinding {
    pub handle: Handle<SvgGeometry2D>,
    pub texture_id: Option<u32>,
    pub pixelated: bool,
}

/// Active instance of an SVG entity on the GPU.
pub struct SvgInstance2D {
    pub svg: Svg2D,
    pub transform: Transform2D,
    pub geometry_handle: Option<Handle<SvgGeometry2D>>,
    pub sub_meshes: Vec<SvgSubMeshBinding>,
    cached_tree: std::sync::Mutex<Option<(u64, resvg::usvg::Tree)>>,
}

impl SvgInstance2D {
    pub fn new(svg: Svg2D, transform: Transform2D) -> Self {
        Self {
            svg,
            transform,
            geometry_handle: None,
            sub_meshes: Vec::new(),
            cached_tree: std::sync::Mutex::new(None),
        }
    }

    fn with_parsed_tree<R>(
        &self,
        font_db: &Arc<fontdb::Database>,
        default_font_family: &str,
        f: impl FnOnce(&resvg::usvg::Tree) -> R,
    ) -> Result<R, String> {
        let seq = self.svg.mod_seq;
        let mut guard = self
            .cached_tree
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let needs_parse = guard
            .as_ref()
            .is_none_or(|(cached_seq, _)| *cached_seq != seq);
        if needs_parse {
            let xml = self.svg.current_xml();
            let tree =
                crate::svg_tessellator::parse_svg(xml, font_db.clone(), default_font_family)?;
            *guard = Some((seq, tree));
        }
        let (_, tree) = guard.as_ref().expect("cached_tree populated above");
        Ok(f(tree))
    }
}

/// Manager maintaining 2D SVG vector entities, font database, and GPU geometry uploads.
pub struct SvgManager2D {
    pub instances: HashMap<u32, SvgInstance2D>,
    pub pool: GenerationalPool<SvgGeometry2D>,
    pub font_db: Arc<fontdb::Database>,
    pub default_font_family: String,
    material_uniform_buf: Option<wgpu::Buffer>,
    textured_linear_uniform_buf: Option<wgpu::Buffer>,
    textured_nearest_uniform_buf: Option<wgpu::Buffer>,
    textured_material_ids: HashMap<(u32, bool), u32>,
    next_reserved_mat_id: u32,
}

pub const DEFAULT_FONT_BYTES: &[u8] = include_bytes!("../assets/default_font.ttf");

impl Default for SvgManager2D {
    fn default() -> Self {
        let mut db = fontdb::Database::new();
        db.load_font_data(DEFAULT_FONT_BYTES.to_vec());
        let default_font_family = db
            .faces()
            .last()
            .and_then(|f| f.families.first().map(|(fam, _)| fam.clone()))
            .unwrap_or_else(|| "Liberation Sans".to_string());

        db.set_sans_serif_family(&default_font_family);
        db.set_serif_family(&default_font_family);
        db.set_monospace_family(&default_font_family);
        db.set_cursive_family(&default_font_family);
        db.set_fantasy_family(&default_font_family);

        Self {
            instances: HashMap::new(),
            pool: GenerationalPool::new(NAMESPACE_SVG_GEOMETRY),
            font_db: Arc::new(db),
            default_font_family,
            material_uniform_buf: None,
            textured_linear_uniform_buf: None,
            textured_nearest_uniform_buf: None,
            textured_material_ids: HashMap::new(),
            next_reserved_mat_id: SVG_DEFAULT_MATERIAL_ID + 1,
        }
    }
}

impl SvgManager2D {
    pub fn new() -> Self {
        Self::default()
    }

    fn release_instance_geometries(
        pool: &mut GenerationalPool<SvgGeometry2D>,
        inst: &SvgInstance2D,
    ) {
        for sub in &inst.sub_meshes {
            let _ = pool.remove(sub.handle);
        }
        if let Some(h) = inst.geometry_handle {
            let _ = pool.remove(h);
        }
    }

    /// Registers a custom TTF/OTF font directly from an in-memory byte buffer (zero filesystem access).
    ///
    /// Returns the detected font family name on success.
    pub fn load_font_data(&mut self, data: &[u8]) -> Result<String, String> {
        let db = Arc::make_mut(&mut self.font_db);
        let prev_count = db.faces().count();
        db.load_font_data(data.to_vec());
        let new_count = db.faces().count();
        if new_count <= prev_count {
            return Err("No valid font faces found in binary data".to_string());
        }
        let last_face = db
            .faces()
            .last()
            .ok_or_else(|| "Failed to inspect loaded font face".to_string())?;
        let family_name = last_face
            .families
            .first()
            .map(|(f, _)| f.clone())
            .unwrap_or_else(|| "custom".to_string());

        for inst in self.instances.values_mut() {
            inst.svg.dirty = true;
            if let Ok(mut guard) = inst.cached_tree.lock() {
                *guard = None;
            }
        }

        Ok(family_name)
    }

    pub fn insert(&mut self, id: u32, svg: Svg2D, transform: Transform2D) {
        if let Some(previous) = self.instances.remove(&id) {
            Self::release_instance_geometries(&mut self.pool, &previous);
        }
        self.instances
            .insert(id, SvgInstance2D::new(svg, transform));
    }

    pub fn remove(&mut self, id: u32) -> Option<SvgInstance2D> {
        if let Some(inst) = self.instances.remove(&id) {
            Self::release_instance_geometries(&mut self.pool, &inst);
            Some(inst)
        } else {
            None
        }
    }

    pub fn clear(&mut self) {
        for inst in self.instances.values() {
            Self::release_instance_geometries(&mut self.pool, inst);
        }
        self.instances.clear();
        self.textured_material_ids.clear();
        self.next_reserved_mat_id = SVG_DEFAULT_MATERIAL_ID + 1;
    }

    pub fn get(&self, id: u32) -> Option<&SvgInstance2D> {
        self.instances.get(&id)
    }

    pub fn get_mut(&mut self, id: u32) -> Option<&mut SvgInstance2D> {
        self.instances.get_mut(&id)
    }

    /// Resolves an element's geometric bounds in SVG viewport coordinates.
    pub fn element_rect(
        &self,
        svg_id: u32,
        element_id: &str,
    ) -> Result<Option<crate::svg_tessellator::SvgElementRect>, String> {
        let Some(instance) = self.instances.get(&svg_id) else {
            return Ok(None);
        };
        instance.with_parsed_tree(&self.font_db, &self.default_font_family, |tree| {
            crate::svg_tessellator::svg_element_rect_from_tree(tree, element_id)
        })
    }

    /// Reads the raw text shaping layout for the current SVG document.
    pub fn text_layout(
        &self,
        svg_id: u32,
        element_id: &str,
    ) -> Result<Option<crate::svg_text_layout::SvgTextLayout>, String> {
        let Some(instance) = self.instances.get(&svg_id) else {
            return Ok(None);
        };
        crate::svg_text_layout::svg_text_layout(
            instance.svg.current_xml(),
            element_id,
            self.font_db.clone(),
            &self.default_font_family,
        )
    }

    /// Resolves an active GPU geometry buffer by 64-bit packed generational handle.
    pub fn get_geometry_by_u64(&self, raw: u64) -> Option<&SvgGeometry2D> {
        let handle: Handle<SvgGeometry2D> = Handle::from_u64(raw)?;
        self.pool.get(handle).ok()
    }

    /// Returns all host logical texture IDs referenced by active SVG instances.
    pub fn referenced_texture_ids(&self) -> Vec<u32> {
        let mut ids = Vec::new();
        for inst in self.instances.values() {
            for tex_id in inst.svg.referenced_texture_ids() {
                if !ids.contains(&tex_id) {
                    ids.push(tex_id);
                }
            }
        }
        ids
    }

    /// Tessellates dirty SVG entities directly on GPU geometry buffers.
    #[allow(clippy::too_many_arguments)]
    pub fn sync_gpu<'a>(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        material_bgl: &wgpu::BindGroupLayout,
        samplers: &galfus_gpu_manager::StandardSamplers,
        fallback_white: &wgpu::TextureView,
        fallback_normal: &wgpu::TextureView,
        fallback_black: &wgpu::TextureView,
        _fallback_uniform_buf: &wgpu::Buffer,
        textures: &'a (dyn Fn(u32) -> Option<&'a wgpu::TextureView> + 'a),
        material_bind_groups: &mut HashMap<u32, wgpu::BindGroup>,
    ) {
        let uniform_buf = self.material_uniform_buf.get_or_insert_with(|| {
            let buf = crate::gpu::create_gpu_buffer(
                device,
                "galfus_2d_svg_material_buf",
                std::mem::size_of::<galfus_realm_2d_resources::Material2DUniform>() as u64,
                wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            );
            let svg_mat = Material2D {
                surface_type: SurfaceType2D::Transparent,
                base_color: Vec4::ONE,
                texture_id: None,
                sampler_index: 1,
                ..Default::default()
            };
            queue.write_buffer(&buf, 0, bytemuck::bytes_of(&svg_mat.build_uniform()));
            buf
        });

        let tex_linear_buf = self.textured_linear_uniform_buf.get_or_insert_with(|| {
            let buf = crate::gpu::create_gpu_buffer(
                device,
                "galfus_2d_svg_tex_linear_mat_buf",
                std::mem::size_of::<galfus_realm_2d_resources::Material2DUniform>() as u64,
                wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            );
            let mat = Material2D {
                surface_type: SurfaceType2D::Transparent,
                base_color: Vec4::ONE,
                texture_id: Some(1),
                sampler_index: 1,
                ..Default::default()
            };
            queue.write_buffer(&buf, 0, bytemuck::bytes_of(&mat.build_uniform()));
            buf
        });

        let tex_nearest_buf = self.textured_nearest_uniform_buf.get_or_insert_with(|| {
            let buf = crate::gpu::create_gpu_buffer(
                device,
                "galfus_2d_svg_tex_nearest_mat_buf",
                std::mem::size_of::<galfus_realm_2d_resources::Material2DUniform>() as u64,
                wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            );
            let mat = Material2D {
                surface_type: SurfaceType2D::Transparent,
                base_color: Vec4::ONE,
                texture_id: Some(1),
                sampler_index: 0,
                ..Default::default()
            };
            queue.write_buffer(&buf, 0, bytemuck::bytes_of(&mat.build_uniform()));
            buf
        });

        for (&id, instance) in &mut self.instances {
            if instance.svg.dirty || instance.geometry_handle.is_none() {
                let tess_res = instance
                    .with_parsed_tree(&self.font_db, &self.default_font_family, |tree| {
                        crate::svg_tessellator::tessellate_svg_tree(tree)
                    })
                    .and_then(|r| r);
                match tess_res {
                    Ok(mesh) => {
                        let sub_list: Vec<crate::svg_tessellator::SvgSubMesh> =
                            if !mesh.sub_meshes.is_empty() {
                                mesh.sub_meshes
                                    .into_iter()
                                    .filter(|s| !s.indices.is_empty() && !s.vertices.is_empty())
                                    .collect()
                            } else if !mesh.indices.is_empty() && !mesh.vertices.is_empty() {
                                vec![crate::svg_tessellator::SvgSubMesh {
                                    vertices: mesh.vertices,
                                    indices: mesh.indices,
                                    texture_id: None,
                                    pixelated: false,
                                }]
                            } else {
                                Vec::new()
                            };

                        let can_reuse = instance.sub_meshes.len() == sub_list.len()
                            && !sub_list.is_empty()
                            && instance.sub_meshes.iter().zip(sub_list.iter()).all(
                                |(binding, sub)| {
                                    let vb_bytes = std::mem::size_of_val(&sub.vertices[..]) as u64;
                                    let ib_bytes = std::mem::size_of_val(&sub.indices[..]) as u64;
                                    self.pool.get(binding.handle).is_ok_and(|g| {
                                        g.vertex_capacity >= vb_bytes
                                            && g.index_capacity >= ib_bytes
                                    })
                                },
                            );

                        if can_reuse {
                            for (binding, sub) in instance.sub_meshes.iter_mut().zip(sub_list) {
                                if let Ok(geom) = self.pool.get_mut(binding.handle) {
                                    queue.write_buffer(
                                        &geom.vertex_buffer,
                                        0,
                                        bytemuck::cast_slice(&sub.vertices),
                                    );
                                    queue.write_buffer(
                                        &geom.index_buffer,
                                        0,
                                        bytemuck::cast_slice(&sub.indices),
                                    );
                                    geom.index_count = sub.indices.len() as u32;
                                    geom.dimensions = mesh.dimensions;
                                }
                                binding.texture_id = sub.texture_id;
                                binding.pixelated = sub.pixelated;
                            }
                        } else {
                            Self::release_instance_geometries(&mut self.pool, instance);
                            instance.geometry_handle = None;
                            instance.sub_meshes.clear();

                            for (sub_idx, sub) in sub_list.into_iter().enumerate() {
                                let vb_bytes = std::mem::size_of_val(&sub.vertices[..]) as u64;
                                let ib_bytes = std::mem::size_of_val(&sub.indices[..]) as u64;
                                let vb_cap = ((vb_bytes * 3 / 2).max(16384) + 3) & !3;
                                let ib_cap = ((ib_bytes * 3 / 2).max(16384) + 3) & !3;
                                let vbo = crate::gpu::create_gpu_buffer(
                                    device,
                                    &format!("galfus_svg_{id}_{sub_idx}_vbo"),
                                    vb_cap,
                                    wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                                );
                                queue.write_buffer(&vbo, 0, bytemuck::cast_slice(&sub.vertices));

                                let ibo = crate::gpu::create_gpu_buffer(
                                    device,
                                    &format!("galfus_svg_{id}_{sub_idx}_ibo"),
                                    ib_cap,
                                    wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
                                );
                                queue.write_buffer(&ibo, 0, bytemuck::cast_slice(&sub.indices));

                                if let Ok(handle) = self.pool.insert(SvgGeometry2D {
                                    vertex_buffer: vbo,
                                    index_buffer: ibo,
                                    vertex_capacity: vb_cap,
                                    index_capacity: ib_cap,
                                    index_count: sub.indices.len() as u32,
                                    dimensions: mesh.dimensions,
                                }) {
                                    if instance.geometry_handle.is_none() {
                                        instance.geometry_handle = Some(handle);
                                    }
                                    instance.sub_meshes.push(SvgSubMeshBinding {
                                        handle,
                                        texture_id: sub.texture_id,
                                        pixelated: sub.pixelated,
                                    });
                                }
                            }
                        }
                        instance.svg.dirty = false;
                    }
                    Err(err) => {
                        eprintln!("[SvgManager2D] Failed to tessellate SVG #{id}: {err}");
                        instance.svg.dirty = false;
                    }
                }
            }

            let mat_id = instance.svg.material_id.unwrap_or(SVG_DEFAULT_MATERIAL_ID);
            material_bind_groups.entry(mat_id).or_insert_with(|| {
                crate::gpu::create_material_bind_group_2d(
                    device,
                    material_bgl,
                    samplers,
                    fallback_white,
                    fallback_normal,
                    fallback_black,
                    uniform_buf,
                    &[None; 8],
                    &|_| None,
                )
            });

            for sub in &instance.sub_meshes {
                if let Some(tex_id) = sub.texture_id {
                    let key = (tex_id, sub.pixelated);
                    let tex_mat_id = *self.textured_material_ids.entry(key).or_insert_with(|| {
                        let allocated = self.next_reserved_mat_id;
                        self.next_reserved_mat_id = self.next_reserved_mat_id.saturating_add(1);
                        allocated
                    });
                    let mut slots = [None; 8];
                    slots[0] = Some(tex_id);
                    let u_buf = if sub.pixelated {
                        &*tex_nearest_buf
                    } else {
                        &*tex_linear_buf
                    };
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
                    material_bind_groups.insert(tex_mat_id, bg);
                }
            }
        }
    }

    /// Pushes active SVG geometry into the 2D batch builder.
    pub fn push_batches(
        &self,
        batch_builder: &mut BatchBuilder2D,
        materials: &HashMap<u32, crate::types::Material2D>,
    ) {
        for (&id, instance) in &self.instances {
            let sub_bindings: Vec<SvgSubMeshBinding> = if !instance.sub_meshes.is_empty() {
                instance.sub_meshes.clone()
            } else if let Some(handle) = instance.geometry_handle {
                vec![SvgSubMeshBinding {
                    handle,
                    texture_id: None,
                    pixelated: false,
                }]
            } else {
                continue;
            };

            let Some(first_geom) = self.pool.get(sub_bindings[0].handle).ok() else {
                continue;
            };

            let model_matrix = instance
                .svg
                .compute_model_matrix(&instance.transform, first_geom.dimensions);

            let [min_z, max_z] = instance.svg.height_range.unwrap_or([-10000.0, 10000.0]);
            let item = Item2DInstanceRaw {
                model_matrix,
                tint: Vec4::ONE,
                uv_rect: Vec4::new(0.0, 0.0, 1.0, 1.0),
                shadow_params: Vec4::new(
                    if instance.svg.receive_shadow {
                        1.0
                    } else {
                        0.0
                    },
                    if instance.svg.cast_shadow { 1.0 } else { 0.0 },
                    min_z,
                    max_z,
                ),
            };

            let default_mat_id = instance.svg.material_id.unwrap_or(SVG_DEFAULT_MATERIAL_ID);
            let draw_order = instance
                .svg
                .draw_order
                .unwrap_or(instance.transform.draw_order);

            for (sub_idx, sub) in sub_bindings.iter().enumerate() {
                if self.pool.get(sub.handle).is_err() {
                    continue;
                }
                let mat_id = if let Some(tex_id) = sub.texture_id {
                    self.textured_material_ids
                        .get(&(tex_id, sub.pixelated))
                        .copied()
                        .unwrap_or(default_mat_id)
                } else {
                    default_mat_id
                };

                batch_builder.push(PreparedItem2D {
                    order: (id, 3, sub_idx as u32),
                    key: BatchKey2D {
                        z_layer: instance.transform.z_layer,
                        draw_order,
                        surface_type: materials
                            .get(&mat_id)
                            .map_or(1, crate::types::Material2D::surface_type_id),
                        material_id: mat_id,
                        geometry_id: sub.handle.to_u64(),
                    },
                    instance: item,
                    occluder_only: instance.svg.occluder_only,
                });
            }
        }
    }
}
