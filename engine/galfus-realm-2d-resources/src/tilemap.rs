use bytemuck::{Pod, Zeroable};
use galfus_core::CullingMode;
use glam::{Mat4, Vec2, Vec3, Vec4};
use serde::{Deserialize, Serialize};

/// Hard safety cap on total cells in a single `Tilemap2D` (~16 MB at 4 bytes/cell).
pub const MAX_TILEMAP_TILES: usize = 4_000_000;

/// Bit 0: Flip tile horizontally around its center.
pub const TILE_FLAG_FLIP_X: u8 = 1 << 0;
/// Bit 1: Flip tile vertically around its center.
pub const TILE_FLAG_FLIP_Y: u8 = 1 << 1;
/// Bit 2: Rotate tile 90 degrees counter-clockwise around its center.
pub const TILE_FLAG_ROT_90: u8 = 1 << 2;
/// Bit 3: Tile participates in greedy-merged solid Rapier 2D colliders.
pub const TILE_FLAG_SOLID: u8 = 1 << 3;
/// Bit 4: Tile participates in greedy-merged 2D polar shadow occluders.
pub const TILE_FLAG_BLOCKS_LIGHT: u8 = 1 << 4;

/// Compact 4-byte cell stored in a `Tilemap2D` grid.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Pod, Zeroable, Serialize, Deserialize)]
#[repr(C)]
pub struct TileCell2D {
    /// 1-based atlas tile index (`0` = empty cell).
    pub tile_id: u16,
    /// Bitflags (`FLIP_X`, `FLIP_Y`, `ROT_90`, `SOLID`, `BLOCKS_LIGHT`).
    pub flags: u8,
    /// Reserved variant / palette index.
    pub variant: u8,
}

impl TileCell2D {
    /// Creates an empty tile cell.
    #[inline]
    pub const fn empty() -> Self {
        Self {
            tile_id: 0,
            flags: 0,
            variant: 0,
        }
    }

    /// Creates a tile cell with 1-based atlas ID and flags.
    #[inline]
    pub const fn new(tile_id: u16, flags: u8) -> Self {
        Self {
            tile_id,
            flags,
            variant: 0,
        }
    }

    #[inline]
    pub const fn is_empty(self) -> bool {
        self.tile_id == 0
    }

    #[inline]
    pub const fn is_solid(self) -> bool {
        self.tile_id != 0 && (self.flags & TILE_FLAG_SOLID) != 0
    }

    #[inline]
    pub const fn blocks_light(self) -> bool {
        self.tile_id != 0 && (self.flags & TILE_FLAG_BLOCKS_LIGHT) != 0
    }
}

/// Configuration descriptor for a chunked 2D tilemap layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tilemap2D {
    /// Grid width in tiles.
    pub width: u32,
    /// Grid height in tiles.
    pub height: u32,
    /// World-space dimensions of a single tile `[width, height]`.
    pub tile_size: Vec2,
    /// Chunk edge size in tiles (clamped to `8..=64`, default `32`).
    #[serde(default = "default_chunk_size")]
    pub chunk_size: u32,
    /// Number of tile columns in the atlas texture.
    pub atlas_columns: u32,
    /// Number of tile rows in the atlas texture.
    pub atlas_rows: u32,
    /// Optional atlas pixel dimensions `[width, height]` used for half-texel UV inset.
    #[serde(default)]
    pub atlas_size_px: Option<[u32; 2]>,
    /// Optional inter-tile padding in pixels (requires `atlas_size_px`).
    #[serde(default)]
    pub tile_padding_px: f32,
    /// Material ID referencing the tileset `Material2D`.
    pub material_id: Option<u32>,
    /// Painter Z-layer for sorting.
    #[serde(default)]
    pub z_layer: i32,
    /// Tie-breaking draw order within `z_layer`.
    #[serde(default)]
    pub draw_order: i32,
    /// 32-bit visibility / lighting layer mask.
    #[serde(default = "default_layer_mask")]
    pub layer_mask: u32,
    /// Whether `TILE_FLAG_BLOCKS_LIGHT` tiles emit greedy-merged 2D shadow occluders.
    #[serde(default)]
    pub cast_shadow: bool,
    /// Whether tile quads receive dynamic 2D lighting/shadows.
    #[serde(default = "default_true")]
    pub receive_shadow: bool,
    /// Shadow layer bitmask for emitted occluders.
    #[serde(default = "default_layer_mask")]
    pub shadow_layer_mask: u32,
    /// Shadow caster height for 2.5D shadow evaluation.
    #[serde(default = "default_shadow_height")]
    pub shadow_height: f32,
    /// Optional 2.5D height band `[min_z, max_z]`.
    #[serde(default)]
    pub height_range: Option<[f32; 2]>,
    /// Viewport culling behavior (`Auto`, `FrustumOnly`, `AlwaysRender`).
    #[serde(default)]
    pub culling_mode: CullingMode,
    /// Extra world-space margin added to chunk AABBs during viewport culling.
    #[serde(default)]
    pub cull_margin: f32,
    /// Optional half-open effective distance range `[start, end)` for zoom-aware LOD.
    #[serde(default)]
    pub distance_range: Option<[f32; 2]>,
    /// Whether `TILE_FLAG_SOLID` tiles generate greedy-merged fixed Rapier 2D box colliders.
    #[serde(default)]
    pub generate_colliders: bool,
}

fn default_chunk_size() -> u32 {
    32
}

fn default_layer_mask() -> u32 {
    u32::MAX
}

fn default_true() -> bool {
    true
}

fn default_shadow_height() -> f32 {
    1.0
}

impl Default for Tilemap2D {
    fn default() -> Self {
        Self {
            width: 0,
            height: 0,
            tile_size: Vec2::ONE,
            chunk_size: default_chunk_size(),
            atlas_columns: 1,
            atlas_rows: 1,
            atlas_size_px: None,
            tile_padding_px: 0.0,
            material_id: None,
            z_layer: 0,
            draw_order: 0,
            layer_mask: u32::MAX,
            cast_shadow: false,
            receive_shadow: true,
            shadow_layer_mask: u32::MAX,
            shadow_height: 1.0,
            height_range: None,
            culling_mode: CullingMode::Auto,
            cull_margin: 0.0,
            distance_range: None,
            generate_colliders: false,
        }
    }
}

impl Tilemap2D {
    /// Returns the validated chunk size clamped to `8..=64`.
    #[inline]
    pub fn effective_chunk_size(&self) -> u32 {
        self.chunk_size.clamp(8, 64)
    }

    /// Computes `[u_offset, v_offset, u_scale, v_scale]` for a 1-based `tile_id`,
    /// applying optional half-texel UV inset and padding to eliminate atlas bleeding.
    pub fn tile_uv_rect(&self, tile_id: u16) -> Vec4 {
        let cols = self.atlas_columns.max(1);
        let rows = self.atlas_rows.max(1);
        let idx = (tile_id.saturating_sub(1) as u32) % (cols * rows);
        let col = idx % cols;
        let row = idx / cols;

        let cell_u = 1.0 / cols as f32;
        let cell_v = 1.0 / rows as f32;
        let mut u0 = col as f32 * cell_u;
        let mut v0 = row as f32 * cell_v;
        let mut u_span = cell_u;
        let mut v_span = cell_v;

        if let Some([aw, ah]) = self.atlas_size_px
            && aw > 0
            && ah > 0
        {
            let inset_u = (0.5 + self.tile_padding_px.max(0.0)) / aw as f32;
            let inset_v = (0.5 + self.tile_padding_px.max(0.0)) / ah as f32;
            u0 += inset_u;
            v0 += inset_v;
            u_span = (u_span - inset_u * 2.0).max(1e-5);
            v_span = (v_span - inset_v * 2.0).max(1e-5);
        }

        Vec4::new(u0, v0, u_span, v_span)
    }

    /// Computes the tilemap-local model matrix for cell `(tx, ty)` with flip/rotation flags.
    ///
    /// Cell `(0, 0)` occupies `[0..tile_size.x, 0..tile_size.y]` in tilemap-local space.
    pub fn tile_local_matrix(&self, tx: u32, ty: u32, flags: u8) -> Mat4 {
        let cx = (tx as f32 + 0.5) * self.tile_size.x;
        let cy = (ty as f32 + 0.5) * self.tile_size.y;
        let sx = if (flags & TILE_FLAG_FLIP_X) != 0 {
            -self.tile_size.x
        } else {
            self.tile_size.x
        };
        let sy = if (flags & TILE_FLAG_FLIP_Y) != 0 {
            -self.tile_size.y
        } else {
            self.tile_size.y
        };
        let mut mat = Mat4::from_translation(Vec3::new(cx, cy, 0.0));
        if (flags & TILE_FLAG_ROT_90) != 0 {
            mat *= Mat4::from_rotation_z(std::f32::consts::FRAC_PI_2);
        }
        mat * Mat4::from_scale(Vec3::new(sx, sy, 1.0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tile_cell_is_four_bytes_and_decodes_flags() {
        assert_eq!(std::mem::size_of::<TileCell2D>(), 4);
        let empty = TileCell2D::empty();
        assert!(empty.is_empty());
        assert!(!empty.is_solid());
        assert!(!empty.blocks_light());

        let wall = TileCell2D::new(3, TILE_FLAG_SOLID | TILE_FLAG_BLOCKS_LIGHT);
        assert!(!wall.is_empty());
        assert!(wall.is_solid());
        assert!(wall.blocks_light());
    }

    #[test]
    fn tile_uv_rect_computes_atlas_cell_and_half_texel_inset() {
        let tm = Tilemap2D {
            atlas_columns: 4,
            atlas_rows: 2,
            atlas_size_px: Some([256, 128]),
            tile_padding_px: 0.0,
            ..Default::default()
        };
        // tile_id 6 -> idx 5 -> col 1, row 1
        let uv = tm.tile_uv_rect(6);
        let inset_u = 0.5 / 256.0;
        let inset_v = 0.5 / 128.0;
        assert!((uv.x - (0.25 + inset_u)).abs() < 1e-6);
        assert!((uv.y - (0.5 + inset_v)).abs() < 1e-6);
        assert!((uv.z - (0.25 - 2.0 * inset_u)).abs() < 1e-6);
        assert!((uv.w - (0.5 - 2.0 * inset_v)).abs() < 1e-6);
    }
}
