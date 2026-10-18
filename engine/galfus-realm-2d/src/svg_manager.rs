use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use galfus_realm_2d_resources::{Material2D, SurfaceType2D, Svg2D, Transform2D};
use glam::{UVec2, Vec2, Vec4};
use resvg::tiny_skia;
use resvg::usvg::{self, Tree, fontdb};

use crate::batch::{BatchBuilder2D, PreparedItem2D};
use crate::types::{BatchKey2D, Item2DInstanceRaw};

/// Reserved logical ID base for SVG materials (within the core-reserved range 4294901761..=4294967295).
pub const SVG_MATERIAL_ID_BASE: u32 = 4294901761;

/// Maps an SVG entity ID to an internal material ID within the reserved range.
#[inline]
pub fn svg_material_id(svg_id: u32) -> u32 {
    SVG_MATERIAL_ID_BASE.saturating_add(svg_id % 65000)
}

/// Shared system font database cached for fast repeated SVG parsing.
fn get_font_database() -> Arc<fontdb::Database> {
    static FONT_DB: OnceLock<Arc<fontdb::Database>> = OnceLock::new();
    FONT_DB
        .get_or_init(|| {
            let mut db = fontdb::Database::new();
            db.load_system_fonts();

            let mut mono_family = None;
            let mut sans_family = None;
            let mut serif_family = None;

            for face in db.faces() {
                for (family, _) in &face.families {
                    if mono_family.is_none() && (family.contains("Mono") || family.contains("Code"))
                    {
                        mono_family = Some(family.clone());
                    } else if sans_family.is_none() && family.contains("Sans") {
                        sans_family = Some(family.clone());
                    } else if serif_family.is_none() && family.contains("Serif") {
                        serif_family = Some(family.clone());
                    }
                }
            }

            if let Some(ref f) = mono_family {
                db.set_monospace_family(f);
            }
            if let Some(ref f) = sans_family {
                db.set_sans_serif_family(f);
            }
            if let Some(ref f) = serif_family {
                db.set_serif_family(f);
            }

            Arc::new(db)
        })
        .clone()
}

/// Rasterizes an SVG XML string into RGBA8 bytes using resvg.
pub fn rasterize_svg(xml: &str, scale_factor: f32) -> Result<(UVec2, Vec<u8>), String> {
    let font_db = get_font_database();
    let default_family = font_db
        .faces()
        .next()
        .and_then(|face| face.families.first().map(|(f, _)| f.clone()))
        .unwrap_or_else(|| "sans-serif".to_string());

    let opt = usvg::Options {
        fontdb: font_db,
        font_family: default_family,
        ..Default::default()
    };

    let tree = Tree::from_str(xml, &opt).map_err(|e| format!("SVG parsing failed: {e}"))?;

    let base_size = tree.size();
    let scale = if scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };
    let pixmap_w = ((base_size.width() * scale).round() as u32).max(1);
    let pixmap_h = ((base_size.height() * scale).round() as u32).max(1);

    let mut pixmap = tiny_skia::Pixmap::new(pixmap_w, pixmap_h)
        .ok_or_else(|| format!("Failed to allocate {pixmap_w}x{pixmap_h} pixmap for SVG"))?;

    let sx = pixmap_w as f32 / base_size.width();
    let sy = pixmap_h as f32 / base_size.height();
    let transform = tiny_skia::Transform::from_scale(sx, sy);

    resvg::render(&tree, transform, &mut pixmap.as_mut());

    // Demultiply alpha: tiny-skia stores premultiplied color.
    // Convert to straight RGBA so standard wgpu::BlendState::ALPHA_BLENDING
    // works without double-multiplication or dark edge fringing.
    let mut data = pixmap.take();
    for chunk in data.as_chunks_mut::<4>().0 {
        let a = chunk[3];
        if a == 0 {
            chunk[0] = 0;
            chunk[1] = 0;
            chunk[2] = 0;
        } else if a < 255 {
            let alpha_f = a as f32 / 255.0;
            chunk[0] = ((chunk[0] as f32 / alpha_f).min(255.0)).round() as u8;
            chunk[1] = ((chunk[1] as f32 / alpha_f).min(255.0)).round() as u8;
            chunk[2] = ((chunk[2] as f32 / alpha_f).min(255.0)).round() as u8;
        }
    }

    Ok((UVec2::new(pixmap_w, pixmap_h), data))
}

/// Active instance of an SVG entity on the GPU.
pub struct SvgInstance2D {
    pub svg: Svg2D,
    pub transform: Transform2D,
    pub texture: Option<wgpu::Texture>,
    pub texture_view: Option<wgpu::TextureView>,
    pub bind_group: Option<wgpu::BindGroup>,
    pub texture_size: UVec2,
}

impl SvgInstance2D {
    pub fn new(svg: Svg2D, transform: Transform2D) -> Self {
        Self {
            svg,
            transform,
            texture: None,
            texture_view: None,
            bind_group: None,
            texture_size: UVec2::ZERO,
        }
    }
}

/// Manager maintaining 2D SVG entities, dynamic attribute updates, and GPU texture synchronizations.
#[derive(Default)]
pub struct SvgManager2D {
    pub instances: HashMap<u32, SvgInstance2D>,
    material_uniform_buf: Option<wgpu::Buffer>,
}

impl SvgManager2D {
    pub fn new() -> Self {
        Self::default()
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

    /// Synchronizes all dirty SVG entities to GPU textures and populates material bind groups.
    #[allow(clippy::too_many_arguments)]
    pub fn sync_gpu(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        material_bgl: &wgpu::BindGroupLayout,
        samplers: &galfus_gpu_manager::StandardSamplers,
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
                texture_id: Some(0), // Sets bit 4 (has_diffuse_texture) in build_uniform()!
                sampler_index: 1,    // LinearClamp
                ..Default::default()
            };
            queue.write_buffer(&buf, 0, bytemuck::bytes_of(&svg_mat.build_uniform()));
            buf
        });

        for (&id, instance) in &mut self.instances {
            if instance.svg.dirty || instance.texture.is_none() {
                let xml = instance.svg.current_xml();
                if let Ok((size, rgba)) = rasterize_svg(xml, instance.svg.scale_factor) {
                    let recreate = instance.texture.is_none() || instance.texture_size != size;
                    if recreate {
                        let texture = device.create_texture(&wgpu::TextureDescriptor {
                            label: Some(&format!("galfus_svg_{id}_tex")),
                            size: wgpu::Extent3d {
                                width: size.x,
                                height: size.y,
                                depth_or_array_layers: 1,
                            },
                            mip_level_count: 1,
                            sample_count: 1,
                            dimension: wgpu::TextureDimension::D2,
                            format: wgpu::TextureFormat::Rgba8Unorm,
                            usage: wgpu::TextureUsages::TEXTURE_BINDING
                                | wgpu::TextureUsages::COPY_DST,
                            view_formats: &[],
                        });
                        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());

                        let bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
                            label: Some(&format!("galfus_svg_{id}_mat_bg")),
                            layout: material_bgl,
                            entries: &[
                                wgpu::BindGroupEntry {
                                    binding: 0,
                                    resource: uniform_buf.as_entire_binding(),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 1,
                                    resource: wgpu::BindingResource::TextureView(&view),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 2,
                                    resource: wgpu::BindingResource::TextureView(fallback_normal),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 3,
                                    resource: wgpu::BindingResource::TextureView(fallback_black),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 4,
                                    resource: wgpu::BindingResource::TextureView(fallback_black),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 5,
                                    resource: wgpu::BindingResource::TextureView(fallback_black),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 6,
                                    resource: wgpu::BindingResource::TextureView(fallback_black),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 7,
                                    resource: wgpu::BindingResource::TextureView(fallback_black),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 8,
                                    resource: wgpu::BindingResource::TextureView(fallback_black),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 9,
                                    resource: wgpu::BindingResource::Sampler(
                                        &samplers.linear_repeat,
                                    ),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 10,
                                    resource: wgpu::BindingResource::Sampler(
                                        &samplers.linear_clamp,
                                    ),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 11,
                                    resource: wgpu::BindingResource::Sampler(
                                        &samplers.nearest_repeat,
                                    ),
                                },
                                wgpu::BindGroupEntry {
                                    binding: 12,
                                    resource: wgpu::BindingResource::Sampler(
                                        &samplers.nearest_clamp,
                                    ),
                                },
                            ],
                        });

                        instance.texture = Some(texture);
                        instance.texture_view = Some(view);
                        instance.bind_group = Some(bg);
                        instance.texture_size = size;
                    }
                    if let Some(ref texture) = instance.texture {
                        queue.write_texture(
                            wgpu::TexelCopyTextureInfo {
                                texture,
                                mip_level: 0,
                                origin: wgpu::Origin3d::ZERO,
                                aspect: wgpu::TextureAspect::All,
                            },
                            &rgba,
                            wgpu::TexelCopyBufferLayout {
                                offset: 0,
                                bytes_per_row: Some(4 * size.x),
                                rows_per_image: Some(size.y),
                            },
                            wgpu::Extent3d {
                                width: size.x,
                                height: size.y,
                                depth_or_array_layers: 1,
                            },
                        );
                    }
                    instance.svg.dirty = false;
                }
            }

            if let Some(ref bg) = instance.bind_group {
                let mat_id = svg_material_id(id);
                // We clone or copy bind group reference into material_bind_groups
                material_bind_groups.insert(mat_id, bg.clone());
            }
        }
    }

    /// Pushes active SVG quads into the 2D batch builder.
    pub fn push_batches(&self, batch_builder: &mut BatchBuilder2D) {
        for (&id, instance) in &self.instances {
            if instance.bind_group.is_none() {
                continue;
            }
            let fallback_size = Vec2::new(
                instance.texture_size.x as f32,
                instance.texture_size.y as f32,
            ) / instance.svg.scale_factor;
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

            batch_builder.push(PreparedItem2D {
                key: BatchKey2D {
                    z_layer: instance.transform.z_layer,
                    material_id: svg_material_id(id),
                    geometry_id: 0,
                    surface_type: 1,
                },
                instance: item,
                occluder_only: false,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rasterize_svg_with_text() {
        let xml = r#"<svg width="200" height="100" xmlns="http://www.w3.org/2000/svg">
            <text x="10" y="30" font-size="16" fill="white">
                <tspan x="10" dy="0">Line One</tspan>
                <tspan x="10" dy="20">Line Two</tspan>
            </text>
        </svg>"#;
        let res = rasterize_svg(xml, 1.0);
        assert!(res.is_ok(), "Failed to rasterize SVG text: {:?}", res.err());
        let (size, data) = res.unwrap();
        assert_eq!(size, UVec2::new(200, 100));
        let non_zero_pixels = data.as_chunks::<4>().0.iter().filter(|p| p[3] > 0).count();
        assert!(
            non_zero_pixels > 50,
            "Rendered text should have drawn non-zero glyph pixels (found: {non_zero_pixels})"
        );
    }
}
