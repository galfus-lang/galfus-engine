//! SVG draw batch generation.

use super::*;
use galfus_realm_2d::batch::{BatchBuilder2D, PreparedItem2D};
use galfus_realm_2d::types::{BatchKey2D, Item2DInstanceRaw};
use galfus_realm_2d_resources::Material2D;
use glam::Vec4;

impl SvgManager2D {
    /// Pushes active SVG geometry into the 2D batch builder.
    pub fn push_batches(
        &self,
        batch_builder: &mut BatchBuilder2D,
        materials: &HashMap<u32, Material2D>,
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

            let default_mat_id = instance.svg.material_id.unwrap_or(SVG_DEFAULT_MATERIAL_ID);
            let draw_order = instance
                .svg
                .draw_order
                .unwrap_or(instance.transform.draw_order);

            let [min_z, max_z] = instance.svg.height_range.unwrap_or([-10000.0, 10000.0]);
            let rx_sh = if instance.svg.receive_shadow {
                1.0
            } else {
                0.0
            };
            let cast_sh = if instance.svg.cast_shadow { 1.0 } else { 0.0 };
            let shadow_params = Vec4::new(rx_sh, cast_sh, min_z, max_z);
            let item = Item2DInstanceRaw {
                model_matrix,
                tint: Vec4::ONE,
                uv_rect: Vec4::new(0.0, 0.0, 1.0, 1.0),
                shadow_params,
            };

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
                            .map_or(1, Material2D::surface_type_id),
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
