//! Chunked 2D Tilemap state and dirty-chunk instance/collider/shadow caching.

use galfus_realm_2d_resources::{MAX_TILEMAP_TILES, TileCell2D, Tilemap2D, Transform2D};
use glam::{Mat4, Vec2, Vec4};

use crate::tilemap_meshing::{MergedTileRect, greedy_merge_rects};
use crate::types::Item2DInstanceRaw;

/// First core-reserved u32 ID used for internal tilemap Rapier 2D colliders.
pub(crate) const TILEMAP_COLLIDER_ID_START: u32 = u32::MAX - 65535 + 1;

/// Cached per-chunk geometry, greedy collider rects, and shadow occluder rects.
#[derive(Debug, Clone)]
pub struct TileChunk2D {
    pub chunk_x: u32,
    pub chunk_y: u32,
    pub local_min: Vec2,
    pub local_max: Vec2,
    pub instances: Vec<Item2DInstanceRaw>,
    pub collider_rects: Vec<MergedTileRect>,
    pub shadow_rects: Vec<MergedTileRect>,
    pub physics_collider_ids: Vec<u32>,
    pub dirty: bool,
}

/// Runtime state of a chunked `Tilemap2D` owned by `Realm2DContext`.
#[derive(Debug, Clone)]
pub struct TilemapState2D {
    pub desc: Tilemap2D,
    pub transform: Transform2D,
    pub cells: Vec<TileCell2D>,
    pub chunks_x: u32,
    pub chunks_y: u32,
    pub chunks: Vec<TileChunk2D>,
    pub any_dirty: bool,
    pub physics_synced: bool,
}

impl TilemapState2D {
    /// Creates a new empty tilemap partitioned into `chunk_size × chunk_size` chunks.
    pub fn new(desc: Tilemap2D, transform: Transform2D) -> Result<Self, String> {
        let total = (desc.width as usize)
            .checked_mul(desc.height as usize)
            .ok_or_else(|| "Tilemap dimensions overflow".to_string())?;
        if total > MAX_TILEMAP_TILES {
            return Err(format!(
                "Tilemap cell count ({total}) exceeds maximum allowed ({MAX_TILEMAP_TILES})"
            ));
        }
        let cs = desc.effective_chunk_size();
        let chunks_x = desc.width.div_ceil(cs);
        let chunks_y = desc.height.div_ceil(cs);
        let mut chunks = Vec::with_capacity((chunks_x * chunks_y) as usize);
        for cy in 0..chunks_y {
            let y0 = cy * cs;
            let y1 = (y0 + cs).min(desc.height);
            for cx in 0..chunks_x {
                let x0 = cx * cs;
                let x1 = (x0 + cs).min(desc.width);
                chunks.push(TileChunk2D {
                    chunk_x: cx,
                    chunk_y: cy,
                    local_min: Vec2::new(
                        x0 as f32 * desc.tile_size.x,
                        y0 as f32 * desc.tile_size.y,
                    ),
                    local_max: Vec2::new(
                        x1 as f32 * desc.tile_size.x,
                        y1 as f32 * desc.tile_size.y,
                    ),
                    instances: Vec::new(),
                    collider_rects: Vec::new(),
                    shadow_rects: Vec::new(),
                    physics_collider_ids: Vec::new(),
                    dirty: true,
                });
            }
        }
        Ok(Self {
            desc,
            transform,
            cells: vec![TileCell2D::empty(); total],
            chunks_x,
            chunks_y,
            chunks,
            any_dirty: true,
            physics_synced: false,
        })
    }

    #[inline]
    fn chunk_index_for_tile(&self, tx: u32, ty: u32) -> usize {
        let cs = self.desc.effective_chunk_size();
        ((ty / cs) * self.chunks_x + (tx / cs)) as usize
    }

    /// Sets a single tile in O(1), marking only its owning chunk dirty if changed.
    pub fn set_tile(&mut self, x: u32, y: u32, cell: TileCell2D) -> bool {
        if x >= self.desc.width || y >= self.desc.height {
            return false;
        }
        let idx = (y * self.desc.width + x) as usize;
        if self.cells[idx] == cell {
            return false;
        }
        self.cells[idx] = cell;
        let ci = self.chunk_index_for_tile(x, y);
        self.chunks[ci].dirty = true;
        self.any_dirty = true;
        true
    }

    /// Bulk-updates a rectangular region of tiles, marking only touched chunks dirty.
    pub fn set_tiles_region(
        &mut self,
        x: u32,
        y: u32,
        width: u32,
        height: u32,
        cells: &[TileCell2D],
    ) -> bool {
        if width == 0 || height == 0 || cells.is_empty() {
            return false;
        }
        let mut changed = false;
        for dy in 0..height {
            let ty = y.saturating_add(dy);
            if ty >= self.desc.height {
                break;
            }
            for dx in 0..width {
                let tx = x.saturating_add(dx);
                if tx >= self.desc.width {
                    break;
                }
                let src_idx = (dy * width + dx) as usize;
                let Some(&cell) = cells.get(src_idx) else {
                    break;
                };
                if self.set_tile(tx, ty, cell) {
                    changed = true;
                }
            }
        }
        changed
    }

    /// Rebuilds cached instances, greedy collider rects, and greedy shadow rects for dirty chunks.
    /// Returns the indices of chunks that were rebuilt.
    pub fn rebuild_dirty_chunks(&mut self) -> Vec<usize> {
        if !self.any_dirty {
            return Vec::new();
        }
        let cs = self.desc.effective_chunk_size();
        let [min_z, max_z] = self.desc.height_range.unwrap_or([-10000.0, 10000.0]);
        let shadow_flags = Vec4::new(
            if self.desc.receive_shadow { 1.0 } else { 0.0 },
            if self.desc.cast_shadow { 1.0 } else { 0.0 },
            min_z,
            max_z,
        );
        let mut rebuilt = Vec::new();

        for (ci, chunk) in self.chunks.iter_mut().enumerate() {
            if !chunk.dirty {
                continue;
            }
            chunk.dirty = false;
            chunk.instances.clear();
            let x0 = chunk.chunk_x * cs;
            let y0 = chunk.chunk_y * cs;
            let cw = cs.min(self.desc.width.saturating_sub(x0));
            let ch = cs.min(self.desc.height.saturating_sub(y0));

            for ly in 0..ch {
                let ty = y0 + ly;
                let row_base = (ty * self.desc.width) as usize;
                for lx in 0..cw {
                    let tx = x0 + lx;
                    let cell = self.cells[row_base + tx as usize];
                    if cell.is_empty() {
                        continue;
                    }
                    let local_mat = self.desc.tile_local_matrix(tx, ty, cell.flags);
                    let uv_rect = self.desc.tile_uv_rect(cell.tile_id);
                    chunk.instances.push(Item2DInstanceRaw::new(
                        local_mat,
                        Vec4::ONE,
                        uv_rect,
                        shadow_flags,
                        self.desc.layer_mask,
                    ));
                }
            }

            if self.desc.generate_colliders {
                chunk.collider_rects = greedy_merge_rects(cw, ch, |lx, ly| {
                    let idx = ((y0 + ly) * self.desc.width + (x0 + lx)) as usize;
                    self.cells[idx].is_solid()
                })
                .into_iter()
                .map(|r| MergedTileRect {
                    x: x0 + r.x,
                    y: y0 + r.y,
                    w: r.w,
                    h: r.h,
                })
                .collect();
            } else {
                chunk.collider_rects.clear();
            }

            if self.desc.cast_shadow {
                chunk.shadow_rects = greedy_merge_rects(cw, ch, |lx, ly| {
                    let idx = ((y0 + ly) * self.desc.width + (x0 + lx)) as usize;
                    self.cells[idx].blocks_light()
                })
                .into_iter()
                .map(|r| MergedTileRect {
                    x: x0 + r.x,
                    y: y0 + r.y,
                    w: r.w,
                    h: r.h,
                })
                .collect();
            } else {
                chunk.shadow_rects.clear();
            }

            rebuilt.push(ci);
        }

        self.any_dirty = false;
        rebuilt
    }

    /// Computes the world-space AABB of a single chunk.
    pub fn chunk_world_aabb(&self, chunk: &TileChunk2D) -> (Vec2, Vec2) {
        let corners = [
            self.transform.transform_point(chunk.local_min),
            self.transform
                .transform_point(Vec2::new(chunk.local_max.x, chunk.local_min.y)),
            self.transform.transform_point(chunk.local_max),
            self.transform
                .transform_point(Vec2::new(chunk.local_min.x, chunk.local_max.y)),
        ];
        let mut min = Vec2::splat(f32::INFINITY);
        let mut max = Vec2::splat(f32::NEG_INFINITY);
        for c in corners {
            min = min.min(c);
            max = max.max(c);
        }
        (min, max)
    }

    pub(crate) fn world_matrix(&self) -> Mat4 {
        let t = Mat4::from_translation(self.transform.position.extend(0.0));
        let r = Mat4::from_rotation_z(self.transform.rotation);
        let s = Mat4::from_scale(self.transform.scale.extend(1.0));
        t * r * s
    }
}
