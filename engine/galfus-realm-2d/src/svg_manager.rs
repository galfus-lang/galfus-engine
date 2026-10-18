use std::collections::HashMap;
use std::sync::Arc;

use galfus_realm_2d_resources::{Material2D, SurfaceType2D, Svg2D, Transform2D};
use glam::{Vec2, Vec4};
use resvg::usvg::fontdb;

use crate::batch::{BatchBuilder2D, PreparedItem2D};
use crate::types::{BatchKey2D, Item2DInstanceRaw};

/// Base ID for geometry assigned to SVG meshes in the 2D batch builder.
pub const SVG_GEOMETRY_ID_BASE: u32 = 1_000_000;

/// Reserved logical ID base for SVG materials (within core-reserved range 4294901761..=4294967295).
pub const SVG_MATERIAL_ID_BASE: u32 = 4294901761;

/// Maps an SVG entity ID to an internal material ID within the reserved range.
#[inline]
pub fn svg_material_id(svg_id: u32) -> u32 {
    SVG_MATERIAL_ID_BASE.saturating_add(svg_id % 65000)
}

/// GPU-uploaded vector geometry for an SVG instance.
pub struct SvgGeometry2D {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: wgpu::Buffer,
    pub index_count: u32,
    pub dimensions: Vec2,
}

/// Active instance of an SVG entity on the GPU.
pub struct SvgInstance2D {
    pub svg: Svg2D,
    pub transform: Transform2D,
    pub geometry: Option<SvgGeometry2D>,
}

impl SvgInstance2D {
    pub fn new(svg: Svg2D, transform: Transform2D) -> Self {
        Self {
            svg,
            transform,
            geometry: None,
        }
    }
}

/// Manager maintaining 2D SVG vector entities, font database, and GPU geometry uploads.
pub struct SvgManager2D {
    pub instances: HashMap<u32, SvgInstance2D>,
    pub font_db: Arc<fontdb::Database>,
    pub default_font_family: String,
    material_uniform_buf: Option<wgpu::Buffer>,
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
            font_db: Arc::new(db),
            default_font_family,
            material_uniform_buf: None,
        }
    }
}

impl SvgManager2D {
    pub fn new() -> Self {
        Self::default()
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

        // Mark all active SVGs dirty so they re-tessellate if they use this font
        for inst in self.instances.values_mut() {
            inst.svg.dirty = true;
        }

        Ok(family_name)
    }

    pub fn insert(&mut self, id: u32, svg: Svg2D, transform: Transform2D) {
        self.instances
            .insert(id, SvgInstance2D::new(svg, transform));
    }

    pub fn remove(&mut self, id: u32) -> Option<SvgInstance2D> {
        self.instances.remove(&id)
    }

    pub fn clear(&mut self) {
        self.instances.clear();
    }

    pub fn get(&self, id: u32) -> Option<&SvgInstance2D> {
        self.instances.get(&id)
    }

    pub fn get_mut(&mut self, id: u32) -> Option<&mut SvgInstance2D> {
        self.instances.get_mut(&id)
    }

    /// Resolves an active GPU geometry buffer by geometry ID.
    pub fn get_geometry(&self, geometry_id: u32) -> Option<&SvgGeometry2D> {
        if geometry_id >= SVG_GEOMETRY_ID_BASE {
            let svg_id = geometry_id - SVG_GEOMETRY_ID_BASE;
            self.instances
                .get(&svg_id)
                .and_then(|inst| inst.geometry.as_ref())
        } else {
            None
        }
    }

    /// Tessellates dirty SVG entities directly on GPU geometry buffers.
    #[allow(clippy::too_many_arguments)]
    pub fn sync_gpu(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        material_bgl: &wgpu::BindGroupLayout,
        samplers: &galfus_gpu_manager::StandardSamplers,
        fallback_white: &wgpu::TextureView,
        fallback_normal: &wgpu::TextureView,
        fallback_black: &wgpu::TextureView,
        _fallback_uniform_buf: &wgpu::Buffer,
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

        for (&id, instance) in &mut self.instances {
            if instance.svg.dirty || instance.geometry.is_none() {
                let xml = instance.svg.current_xml();
                match crate::svg_tessellator::tessellate_svg(
                    xml,
                    self.font_db.clone(),
                    &self.default_font_family,
                ) {
                    Ok(mesh) => {
                        if !mesh.indices.is_empty() && !mesh.vertices.is_empty() {
                            let vbo = crate::gpu::create_gpu_buffer(
                                device,
                                &format!("galfus_svg_{id}_vbo"),
                                std::mem::size_of_val(&mesh.vertices[..]) as u64,
                                wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                            );
                            queue.write_buffer(&vbo, 0, bytemuck::cast_slice(&mesh.vertices));

                            let ibo = crate::gpu::create_gpu_buffer(
                                device,
                                &format!("galfus_svg_{id}_ibo"),
                                std::mem::size_of_val(&mesh.indices[..]) as u64,
                                wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
                            );
                            queue.write_buffer(&ibo, 0, bytemuck::cast_slice(&mesh.indices));

                            instance.geometry = Some(SvgGeometry2D {
                                vertex_buffer: vbo,
                                index_buffer: ibo,
                                index_count: mesh.indices.len() as u32,
                                dimensions: mesh.dimensions,
                            });
                        }
                        instance.svg.dirty = false;
                    }
                    Err(err) => {
                        eprintln!("[SvgManager2D] Failed to tessellate SVG #{id}: {err}");
                        instance.svg.dirty = false;
                    }
                }
            }

            let mat_id = instance
                .svg
                .material_id
                .unwrap_or_else(|| svg_material_id(id));

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
        }
    }

    /// Pushes active SVG geometry into the 2D batch builder.
    pub fn push_batches(&self, batch_builder: &mut BatchBuilder2D) {
        for (&id, instance) in &self.instances {
            if instance.geometry.is_none() {
                continue;
            }

            let fallback_size = instance
                .geometry
                .as_ref()
                .map(|g| g.dimensions)
                .unwrap_or(Vec2::ONE);
            let model_matrix = instance
                .svg
                .compute_model_matrix(&instance.transform, fallback_size);

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
                    -10000.0,
                    10000.0,
                ),
            };

            let mat_id = instance
                .svg
                .material_id
                .unwrap_or_else(|| svg_material_id(id));

            batch_builder.push(PreparedItem2D {
                key: BatchKey2D {
                    z_layer: instance.transform.z_layer,
                    material_id: mat_id,
                    geometry_id: SVG_GEOMETRY_ID_BASE.saturating_add(id),
                    surface_type: 1, // Transparent
                },
                instance: item,
                occluder_only: false,
            });
        }
    }
}
