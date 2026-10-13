use serde::{Deserialize, Serialize};

/// Strongly typed handle to an allocated region within a 2D Texture Array Atlas.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtlasTileHandle {
    pub index: u32,
    pub generation: u32,
}

/// Description for configuring a `TileAtlas2DArray`.
#[derive(Debug, Clone)]
pub struct TileAtlasDesc {
    pub label: Option<&'static str>,
    pub format: wgpu::TextureFormat,
    pub usage: wgpu::TextureUsages,
    pub tile_px: u32,
    pub guard_px: u32,
    pub tiles_w: u32,
    pub tiles_h: u32,
    pub layers: u32,
}

/// Notification emitted when repacking moves an allocated tile region.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtlasRelocation {
    pub handle: AtlasTileHandle,
}

#[derive(Debug, Clone)]
struct AtlasSlot {
    generation: u32,
    alive: bool,
    layer: u32,
    rect_tiles: (u32, u32, u32, u32), // (x, y, w, h) in tiles
}

/// A spatial sub-allocator over a 2D Texture Array divided into tiles with guard paddings.
pub struct TileAtlas2DArray {
    _texture: wgpu::Texture,
    view: wgpu::TextureView,
    layer_views: Vec<wgpu::TextureView>,
    format: wgpu::TextureFormat,

    pitch_px: u32,
    guard_px: u32,
    tiles_w: u32,
    tiles_h: u32,
    layers: u32,

    slots: Vec<AtlasSlot>,
    free_slots: Vec<u32>,
    layers_occupied: Vec<Vec<bool>>,
    free_tiles_total: u32,
}

impl TileAtlas2DArray {
    /// Initializes a new tile-based texture array atlas.
    pub fn new(device: &wgpu::Device, desc: TileAtlasDesc) -> Self {
        let guard_px = desc.guard_px;
        let pitch_px = desc.tile_px + (guard_px * 2);

        let max_dim = device.limits().max_texture_dimension_2d;
        let max_layers = device.limits().max_texture_array_layers;

        let actual_tiles_w = desc.tiles_w.min(max_dim / pitch_px.max(1)).max(1);
        let actual_tiles_h = desc.tiles_h.min(max_dim / pitch_px.max(1)).max(1);
        let actual_layers = desc.layers.min(max_layers).max(1);

        let atlas_w_px = actual_tiles_w * pitch_px;
        let atlas_h_px = actual_tiles_h * pitch_px;

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: desc.label,
            size: wgpu::Extent3d {
                width: atlas_w_px,
                height: atlas_h_px,
                depth_or_array_layers: actual_layers,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: desc.format,
            usage: desc.usage,
            view_formats: &[],
        });

        let view = texture.create_view(&wgpu::TextureViewDescriptor {
            label: desc.label.map(|l| format!("{l} Array View")).as_deref(),
            dimension: Some(wgpu::TextureViewDimension::D2Array),
            ..Default::default()
        });

        let layer_size = (actual_tiles_w * actual_tiles_h) as usize;
        let layers_occupied = vec![vec![false; layer_size]; actual_layers as usize];

        let mut layer_views = Vec::with_capacity(actual_layers as usize);
        for i in 0..actual_layers {
            layer_views.push(texture.create_view(&wgpu::TextureViewDescriptor {
                label: desc.label.map(|l| format!("{l} Layer View {i}")).as_deref(),
                dimension: Some(wgpu::TextureViewDimension::D2),
                base_array_layer: i,
                array_layer_count: Some(1),
                ..Default::default()
            }));
        }

        Self {
            _texture: texture,
            view,
            layer_views,
            format: desc.format,
            pitch_px,
            guard_px,
            tiles_w: actual_tiles_w,
            tiles_h: actual_tiles_h,
            layers: actual_layers,
            slots: Vec::new(),
            free_slots: Vec::new(),
            layers_occupied,
            free_tiles_total: actual_tiles_w * actual_tiles_h * actual_layers,
        }
    }

    /// Allocates a contiguous region of `w` by `h` tiles. Returns relocation list if repack was needed.
    pub fn alloc(&mut self, w: u32, h: u32) -> Option<(AtlasTileHandle, Vec<AtlasRelocation>)> {
        if w == 0 || h == 0 || w > self.tiles_w || h > self.tiles_h {
            return None;
        }

        let required = w * h;
        if self.free_tiles_total < required {
            return None;
        }

        if let Some((layer, x, y)) = self.find_free_region(w, h) {
            return Some((self.create_slot(layer, x, y, w, h), Vec::new()));
        }

        // Space fragmented; repack existing allocations
        let relocations = self.repack();

        if let Some((layer, x, y)) = self.find_free_region(w, h) {
            Some((self.create_slot(layer, x, y, w, h), relocations))
        } else {
            None
        }
    }

    /// Releases an allocated tile region back to the free pool.
    pub fn free(&mut self, handle: AtlasTileHandle) -> bool {
        let (alive, layer, rect_tiles) = if let Some(slot) = self.slots.get(handle.index as usize) {
            if slot.generation == handle.generation {
                (slot.alive, slot.layer, slot.rect_tiles)
            } else {
                return false;
            }
        } else {
            return false;
        };

        if alive {
            self.mark_region(
                layer,
                rect_tiles.0,
                rect_tiles.1,
                rect_tiles.2,
                rect_tiles.3,
                false,
            );
            self.free_tiles_total += rect_tiles.2 * rect_tiles.3;
            self.free_slots.push(handle.index);

            let slot = &mut self.slots[handle.index as usize];
            slot.alive = false;
            return true;
        }

        false
    }

    /// Repacks all alive regions to resolve fragmentation, emitting relocation events.
    pub fn repack(&mut self) -> Vec<AtlasRelocation> {
        struct RepackItem {
            index: u32,
            old_layer: u32,
            w: u32,
            h: u32,
            old_rect: (u32, u32, u32, u32),
        }

        let mut items: Vec<RepackItem> = self
            .slots
            .iter()
            .enumerate()
            .filter(|(_, s)| s.alive)
            .map(|(i, s)| RepackItem {
                index: i as u32,
                old_layer: s.layer,
                w: s.rect_tiles.2,
                h: s.rect_tiles.3,
                old_rect: s.rect_tiles,
            })
            .collect();

        // Sort by area descending (largest regions packed first)
        items.sort_by_key(|item| std::cmp::Reverse(item.w * item.h));

        for grid in &mut self.layers_occupied {
            grid.fill(false);
        }

        let mut relocations = Vec::new();

        for item in items {
            if let Some((new_layer, new_x, new_y)) = self.find_free_region(item.w, item.h) {
                self.mark_region(new_layer, new_x, new_y, item.w, item.h, true);

                let slot = &mut self.slots[item.index as usize];
                let moved =
                    new_layer != item.old_layer || (new_x, new_y, item.w, item.h) != item.old_rect;

                if moved {
                    relocations.push(AtlasRelocation {
                        handle: AtlasTileHandle {
                            index: item.index,
                            generation: slot.generation,
                        },
                    });

                    slot.layer = new_layer;
                    slot.rect_tiles = (new_x, new_y, item.w, item.h);
                }
            } else {
                self.slots[item.index as usize].alive = false;
            }
        }

        relocations
    }

    /// Computes the UV transform `(scale_x, scale_y, bias_x, bias_y, layer)` for an allocated slot.
    pub fn get_uv_transform(&self, handle: AtlasTileHandle) -> Option<(f32, f32, f32, f32, u32)> {
        let slot = self.slots.get(handle.index as usize)?;
        if !slot.alive || slot.generation != handle.generation {
            return None;
        }

        let (tx, ty, tw, th) = slot.rect_tiles;
        let atlas_w = (self.tiles_w * self.pitch_px) as f32;
        let atlas_h = (self.tiles_h * self.pitch_px) as f32;

        let inner_x = (tx * self.pitch_px + self.guard_px) as f32;
        let inner_y = (ty * self.pitch_px + self.guard_px) as f32;
        let inner_w = (tw * self.pitch_px - 2 * self.guard_px) as f32;
        let inner_h = (th * self.pitch_px - 2 * self.guard_px) as f32;

        let scale_x = inner_w / atlas_w;
        let scale_y = inner_h / atlas_h;
        let bias_x = inner_x / atlas_w;
        let bias_y = inner_y / atlas_h;

        Some((scale_x, scale_y, bias_x, bias_y, slot.layer))
    }

    /// Returns the array view of the entire texture array.
    pub fn view(&self) -> &wgpu::TextureView {
        &self.view
    }

    /// Returns a single layer texture view.
    pub fn layer_view(&self, layer: u32) -> Option<&wgpu::TextureView> {
        self.layer_views.get(layer as usize)
    }

    /// Returns format of the atlas texture.
    pub fn format(&self) -> wgpu::TextureFormat {
        self.format
    }

    /// Returns basic structural information about the atlas layout.
    pub fn info(&self) -> TileAtlasInfo {
        TileAtlasInfo {
            tiles_w: self.tiles_w,
            tiles_h: self.tiles_h,
            layers: self.layers,
            pitch_px: self.pitch_px,
            guard_px: self.guard_px,
        }
    }

    fn find_free_region(&self, w: u32, h: u32) -> Option<(u32, u32, u32)> {
        for layer in 0..self.layers {
            let grid = &self.layers_occupied[layer as usize];

            for y in 0..=(self.tiles_h - h) {
                for x in 0..=(self.tiles_w - w) {
                    if self.is_region_free(grid, x, y, w, h) {
                        return Some((layer, x, y));
                    }
                }
            }
        }
        None
    }

    fn is_region_free(&self, grid: &[bool], x: u32, y: u32, w: u32, h: u32) -> bool {
        for dy in 0..h {
            let offset = ((y + dy) * self.tiles_w + x) as usize;
            for dx in 0..w {
                if grid[offset + dx as usize] {
                    return false;
                }
            }
        }
        true
    }

    fn mark_region(&mut self, layer: u32, x: u32, y: u32, w: u32, h: u32, occupied: bool) {
        let grid = &mut self.layers_occupied[layer as usize];
        for dy in 0..h {
            let offset = ((y + dy) * self.tiles_w + x) as usize;
            for dx in 0..w {
                grid[offset + dx as usize] = occupied;
            }
        }
    }

    fn create_slot(&mut self, layer: u32, x: u32, y: u32, w: u32, h: u32) -> AtlasTileHandle {
        self.mark_region(layer, x, y, w, h, true);
        self.free_tiles_total -= w * h;

        if let Some(index) = self.free_slots.pop() {
            let slot = &mut self.slots[index as usize];
            slot.generation += 1;
            slot.alive = true;
            slot.layer = layer;
            slot.rect_tiles = (x, y, w, h);
            AtlasTileHandle {
                index,
                generation: slot.generation,
            }
        } else {
            let index = self.slots.len() as u32;
            self.slots.push(AtlasSlot {
                generation: 0,
                alive: true,
                layer,
                rect_tiles: (x, y, w, h),
            });
            AtlasTileHandle {
                index,
                generation: 0,
            }
        }
    }
}

/// Structural info describing a TileAtlas.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TileAtlasInfo {
    pub tiles_w: u32,
    pub tiles_h: u32,
    pub layers: u32,
    pub pitch_px: u32,
    pub guard_px: u32,
}
