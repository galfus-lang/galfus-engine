//! `Realm2DContext` CRUD, physics collider sync, batch emission, and shadow occluders for `Tilemap2D`.

use galfus_core::{CullingMode, distance_sq_in_range};
use galfus_physics::types::{RigidBodyDesc2D, RigidBodyType};
use galfus_realm_2d_resources::{
    Material2D, Occluder2D, OccluderSilhouette2D, TileCell2D, Tilemap2D, Transform2D,
};
use galfus_realm_core::error::{RealmError, RealmResult};
use galfus_realm_core::hierarchy::Pose2D;
use galfus_realm_core::{Collider2D, ColliderShape2D};
use glam::{Mat4, Vec2};

use crate::batch::{BatchBuilder2D, PreparedItem2D};
use crate::context::Realm2DContext;
use crate::culling::CameraViewportBounds2D;
use crate::tilemap::{TILEMAP_COLLIDER_ID_START, TilemapState2D};
use crate::tilemap_meshing::MergedTileRect;
use crate::types::BatchKey2D;

impl Realm2DContext {
    fn alloc_tilemap_collider_id(&mut self) -> u32 {
        let id = self.next_tilemap_collider_id;
        self.next_tilemap_collider_id = id
            .checked_add(1)
            .filter(|&v| v >= TILEMAP_COLLIDER_ID_START)
            .unwrap_or(TILEMAP_COLLIDER_ID_START);
        id
    }

    /// Creates or replaces a chunked `Tilemap2D` under a host logical ID.
    pub fn create_tilemap(
        &mut self,
        id: u32,
        desc: Tilemap2D,
        transform: Transform2D,
    ) -> RealmResult<()> {
        self.validate_id(id)?;
        if self.tilemaps.contains_key(&id) {
            self.remove_tilemap_physics(id);
        }
        let state = TilemapState2D::new(desc, transform).map_err(RealmError::Internal)?;
        self.tilemaps.insert(id, state);
        self.model_transforms.insert(id, transform);
        self.shadow_manager.is_dirty = true;
        self.dirty = true;
        Ok(())
    }

    /// Updates a single cell `(x, y)` of an existing `Tilemap2D` in O(1).
    pub fn set_tilemap_tile(
        &mut self,
        id: u32,
        x: u32,
        y: u32,
        tile_id: u16,
        flags: u8,
    ) -> RealmResult<()> {
        self.validate_id(id)?;
        let realm_id = self.id;
        let tm = self.tilemaps.get_mut(&id).ok_or_else(|| {
            RealmError::ResourceNotFound(realm_id, format!("Tilemap2D {id} not found"))
        })?;
        if tm.set_tile(x, y, TileCell2D::new(tile_id, flags)) {
            if tm.desc.cast_shadow {
                self.shadow_manager.is_dirty = true;
            }
            self.dirty = true;
        }
        Ok(())
    }

    /// Bulk-updates a rectangular region of cells in an existing `Tilemap2D`.
    pub fn set_tilemap_tiles(
        &mut self,
        id: u32,
        x: u32,
        y: u32,
        width: u32,
        height: u32,
        cells: &[TileCell2D],
    ) -> RealmResult<()> {
        self.validate_id(id)?;
        let realm_id = self.id;
        let tm = self.tilemaps.get_mut(&id).ok_or_else(|| {
            RealmError::ResourceNotFound(realm_id, format!("Tilemap2D {id} not found"))
        })?;
        if tm.set_tiles_region(x, y, width, height, cells) {
            if tm.desc.cast_shadow {
                self.shadow_manager.is_dirty = true;
            }
            self.dirty = true;
        }
        Ok(())
    }

    /// Destroys a `Tilemap2D`, releasing its chunks and any generated Rapier 2D colliders.
    pub fn destroy_tilemap(&mut self, id: u32) -> RealmResult<()> {
        self.validate_id(id)?;
        if self.tilemaps.contains_key(&id) {
            self.remove_tilemap_physics(id);
            self.tilemaps.remove(&id);
            self.model_transforms.remove(&id);
            self.shadow_manager.is_dirty = true;
            self.dirty = true;
            Ok(())
        } else {
            Err(RealmError::ResourceNotFound(
                self.id,
                format!("Tilemap2D {id} not found"),
            ))
        }
    }

    fn remove_tilemap_physics(&mut self, id: u32) {
        let Some(tm) = self.tilemaps.get_mut(&id) else {
            return;
        };
        if let Some(world) = self.physics.as_mut() {
            for chunk in &mut tm.chunks {
                for cid in chunk.physics_collider_ids.drain(..) {
                    world.remove_collider(cid);
                }
            }
            world.remove_rigid_body(id);
        } else {
            for chunk in &mut tm.chunks {
                chunk.physics_collider_ids.clear();
            }
        }
        tm.physics_synced = false;
    }

    /// Rebuilds dirty tilemap chunks and synchronizes greedy Rapier 2D colliders.
    pub(crate) fn prepare_tilemaps(&mut self) {
        if self.tilemaps.is_empty() {
            return;
        }
        let ids: Vec<u32> = self.tilemaps.keys().copied().collect();
        for id in ids {
            let (rebuilt_chunks, needs_full_physics, cast_shadow) = {
                let Some(tm) = self.tilemaps.get_mut(&id) else {
                    continue;
                };
                let rebuilt = tm.rebuild_dirty_chunks();
                let needs_full =
                    tm.desc.generate_colliders && !tm.physics_synced && self.physics.is_some();
                (rebuilt, needs_full, tm.desc.cast_shadow)
            };

            if !rebuilt_chunks.is_empty() && cast_shadow {
                self.shadow_manager.is_dirty = true;
            }

            if self.physics.is_none() {
                continue;
            }
            let chunks_to_sync: Vec<usize> = if needs_full_physics {
                let count = self.tilemaps.get(&id).map_or(0, |t| t.chunks.len());
                (0..count).collect()
            } else {
                rebuilt_chunks
            };
            if !chunks_to_sync.is_empty() {
                self.sync_tilemap_chunk_colliders(id, &chunks_to_sync);
            }
        }
    }

    fn sync_tilemap_chunk_colliders(&mut self, id: u32, chunk_indices: &[usize]) {
        let (generate_colliders, transform, tile_size, rects_per_chunk) = {
            let Some(tm) = self.tilemaps.get_mut(&id) else {
                return;
            };
            let list: Vec<(usize, Vec<u32>, Vec<MergedTileRect>)> = chunk_indices
                .iter()
                .filter_map(|&ci| {
                    let chunk = tm.chunks.get_mut(ci)?;
                    let old_ids = std::mem::take(&mut chunk.physics_collider_ids);
                    Some((ci, old_ids, chunk.collider_rects.clone()))
                })
                .collect();
            (
                tm.desc.generate_colliders,
                tm.transform,
                tm.desc.tile_size,
                list,
            )
        };

        if !generate_colliders {
            if let Some(world) = self.physics.as_mut() {
                for (_, old_ids, _) in rects_per_chunk {
                    for cid in old_ids {
                        world.remove_collider(cid);
                    }
                }
            }
            return;
        }

        let desc = RigidBodyDesc2D {
            body_type: RigidBodyType::Fixed,
            ..Default::default()
        };
        if let Some(world) = self.physics.as_mut()
            && !world.has_rigid_body(id)
        {
            let pose = Pose2D {
                position: transform.position,
                rotation: transform.rotation,
                scale: transform.scale,
            };
            world.add_rigid_body(id, &pose, &desc);
        }

        let mut new_ids_per_chunk: Vec<(usize, Vec<u32>)> =
            Vec::with_capacity(rects_per_chunk.len());
        for (ci, old_ids, rects) in rects_per_chunk {
            if let Some(world) = self.physics.as_mut() {
                for cid in old_ids {
                    world.remove_collider(cid);
                }
            }
            let mut new_ids = Vec::with_capacity(rects.len());
            for rect in rects {
                let cid = self.alloc_tilemap_collider_id();
                let collider = Collider2D {
                    id: cid,
                    model_id: id,
                    shape: ColliderShape2D::Rectangle {
                        half_extents: [
                            rect.w as f32 * tile_size.x * 0.5,
                            rect.h as f32 * tile_size.y * 0.5,
                        ],
                    },
                    offset: [
                        (rect.x as f32 + rect.w as f32 * 0.5) * tile_size.x,
                        (rect.y as f32 + rect.h as f32 * 0.5) * tile_size.y,
                    ],
                    local_matrix: None,
                    active: true,
                    sensor: false,
                    layer: u32::MAX,
                    mask: u32::MAX,
                };
                if let Some(world) = self.physics.as_mut() {
                    world.sync_collider(
                        id,
                        &collider,
                        Some(&desc),
                        [transform.scale.x, transform.scale.y],
                    );
                }
                new_ids.push(cid);
            }
            new_ids_per_chunk.push((ci, new_ids));
        }

        if let Some(tm) = self.tilemaps.get_mut(&id) {
            for (ci, ids) in new_ids_per_chunk {
                if let Some(chunk) = tm.chunks.get_mut(ci) {
                    chunk.physics_collider_ids = ids;
                }
            }
            tm.physics_synced = true;
        }
    }

    /// Emits visible tilemap chunks into `BatchBuilder2D`, culling per-chunk AABBs when `bounds` is `Some`.
    pub(crate) fn push_tilemap_batches(
        &self,
        bounds: Option<&CameraViewportBounds2D>,
        batch_builder: &mut BatchBuilder2D,
    ) {
        for (&id, tm) in &self.tilemaps {
            if let Some(b) = bounds {
                if (tm.desc.layer_mask & b.layer_mask) == 0 {
                    continue;
                }
                if tm.desc.culling_mode != CullingMode::AlwaysRender
                    && !distance_sq_in_range(
                        b.effective_distance_sq(tm.transform.position),
                        tm.desc.distance_range,
                    )
                {
                    continue;
                }
            }
            let mat_id = tm.desc.material_id.unwrap_or(0);
            let surface_type = self
                .materials
                .get(&mat_id)
                .map_or(1, Material2D::surface_type_id);
            let key = BatchKey2D {
                z_layer: tm.desc.z_layer,
                draw_order: tm.desc.draw_order,
                surface_type,
                material_id: mat_id,
                geometry_id: 0,
                layer_mask: tm.desc.layer_mask,
            };
            let world_mat = tm.world_matrix();
            let is_identity = world_mat == Mat4::IDENTITY;

            for (ci, chunk) in tm.chunks.iter().enumerate() {
                if chunk.instances.is_empty() {
                    continue;
                }
                if let Some(b) = bounds
                    && tm.desc.culling_mode != CullingMode::AlwaysRender
                {
                    let (min, max) = tm.chunk_world_aabb(chunk);
                    if !b.intersects_aabb(min, max, tm.desc.cull_margin) {
                        continue;
                    }
                }
                for (ti, &inst) in chunk.instances.iter().enumerate() {
                    let mut final_inst = inst;
                    if !is_identity {
                        final_inst.model_matrix = world_mat * inst.model_matrix;
                    }
                    batch_builder.push(PreparedItem2D {
                        order: (id, 4, ((ci as u32) << 12) | (ti as u32)),
                        key,
                        instance: final_inst,
                        occluder_only: false,
                    });
                }
            }
        }
    }

    /// Appends greedy-merged shadow occluder quads from all shadow-casting tilemaps.
    pub(crate) fn append_tilemap_shadow_occluders(&self, occluders: &mut Vec<Occluder2D>) {
        for (&id, tm) in &self.tilemaps {
            if !tm.desc.cast_shadow {
                continue;
            }
            let ts = tm.desc.tile_size;
            for chunk in &tm.chunks {
                for rect in &chunk.shadow_rects {
                    let x0 = rect.x as f32 * ts.x;
                    let y0 = rect.y as f32 * ts.y;
                    let x1 = (rect.x + rect.w) as f32 * ts.x;
                    let y1 = (rect.y + rect.h) as f32 * ts.y;
                    let corners = [
                        tm.transform.transform_point(Vec2::new(x0, y0)),
                        tm.transform.transform_point(Vec2::new(x1, y0)),
                        tm.transform.transform_point(Vec2::new(x1, y1)),
                        tm.transform.transform_point(Vec2::new(x0, y1)),
                    ];
                    occluders.push(Occluder2D {
                        entity_id: id,
                        silhouette: OccluderSilhouette2D::from_quad(corners),
                        shadow_layer_mask: tm.desc.shadow_layer_mask,
                        shadow_height: tm.desc.shadow_height,
                        height_range: tm.desc.height_range,
                    });
                }
            }
        }
    }
}
