//! Uniform-cell 2D spatial hash grid accelerating viewport culling on large 2D scenes.

use std::collections::{HashMap, HashSet};

use galfus_core::CullingMode;
use glam::Vec2;

use crate::culling::{shape_world_aabb, sprite_world_aabb};
use crate::types::{Shape2D, Sprite2D, Transform2D};

/// Minimum combined sprite + shape count before using the spatial grid over linear scan.
pub(crate) const SPATIAL_GRID_THRESHOLD: usize = 128;

/// Uniform-cell spatial hash grid for 2D sprites and shapes.
#[derive(Debug, Default)]
pub(crate) struct SpatialGrid2D {
    cell_size: f32,
    sprite_cells: HashMap<(i32, i32), Vec<u32>>,
    shape_cells: HashMap<(i32, i32), Vec<u32>>,
    always_sprites: Vec<u32>,
    always_shapes: Vec<u32>,
    max_margin: f32,
    populated: bool,
}

impl SpatialGrid2D {
    pub(crate) fn new(cell_size: f32) -> Self {
        Self {
            cell_size: cell_size.max(1.0),
            ..Default::default()
        }
    }

    pub(crate) fn clear(&mut self) {
        self.sprite_cells.clear();
        self.shape_cells.clear();
        self.always_sprites.clear();
        self.always_shapes.clear();
        self.max_margin = 0.0;
        self.populated = false;
    }

    pub(crate) fn is_populated(&self) -> bool {
        self.populated
    }

    #[inline]
    fn cell_range(&self, min: Vec2, max: Vec2) -> (i32, i32, i32, i32) {
        let inv = 1.0 / self.cell_size;
        let x0 = (min.x * inv).floor() as i32;
        let y0 = (min.y * inv).floor() as i32;
        let x1 = (max.x * inv).floor() as i32;
        let y1 = (max.y * inv).floor() as i32;
        (x0, y0, x1, y1)
    }

    /// Rebuilds the spatial grid from all active sprites and shapes.
    pub(crate) fn rebuild(
        &mut self,
        sprites: &HashMap<u32, (Sprite2D, Transform2D)>,
        shapes: &HashMap<u32, (Shape2D, Transform2D)>,
    ) {
        self.clear();
        if sprites.len() + shapes.len() < SPATIAL_GRID_THRESHOLD {
            return;
        }
        if self.cell_size < 1.0 {
            self.cell_size = 16.0;
        }

        for (&id, (sprite, tf)) in sprites {
            if sprite.culling_mode == CullingMode::AlwaysRender {
                self.always_sprites.push(id);
                continue;
            }
            self.max_margin = self.max_margin.max(sprite.cull_margin.max(0.0));
            let (min, max) = sprite_world_aabb(sprite, tf);
            let (x0, y0, x1, y1) = self.cell_range(min, max);
            for cx in x0..=x1 {
                for cy in y0..=y1 {
                    self.sprite_cells.entry((cx, cy)).or_default().push(id);
                }
            }
        }

        for (&id, (shape, tf)) in shapes {
            if shape.culling_mode == CullingMode::AlwaysRender {
                self.always_shapes.push(id);
                continue;
            }
            self.max_margin = self.max_margin.max(shape.cull_margin.max(0.0));
            let Some((min, max)) = shape_world_aabb(shape, tf) else {
                continue;
            };
            let (x0, y0, x1, y1) = self.cell_range(min, max);
            for cx in x0..=x1 {
                for cy in y0..=y1 {
                    self.shape_cells.entry((cx, cy)).or_default().push(id);
                }
            }
        }
        self.populated = true;
    }

    /// Queries candidate sprite and shape IDs intersecting `[min, max]` expanded by `max_margin`.
    pub(crate) fn query(
        &self,
        min: Vec2,
        max: Vec2,
        out_sprites: &mut Vec<u32>,
        out_shapes: &mut Vec<u32>,
    ) {
        out_sprites.clear();
        out_shapes.clear();
        let pad = Vec2::splat(self.max_margin);
        let (x0, y0, x1, y1) = self.cell_range(min - pad, max + pad);

        let mut seen_sprites = HashSet::new();
        let mut seen_shapes = HashSet::new();

        for &id in &self.always_sprites {
            if seen_sprites.insert(id) {
                out_sprites.push(id);
            }
        }
        for &id in &self.always_shapes {
            if seen_shapes.insert(id) {
                out_shapes.push(id);
            }
        }

        for cx in x0..=x1 {
            for cy in y0..=y1 {
                if let Some(ids) = self.sprite_cells.get(&(cx, cy)) {
                    for &id in ids {
                        if seen_sprites.insert(id) {
                            out_sprites.push(id);
                        }
                    }
                }
                if let Some(ids) = self.shape_cells.get(&(cx, cy)) {
                    for &id in ids {
                        if seen_shapes.insert(id) {
                            out_shapes.push(id);
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spatial_grid_returns_intersecting_and_always_render_sprites() {
        let mut sprites = HashMap::new();
        for i in 1..=SPATIAL_GRID_THRESHOLD as u32 {
            let x = (i as f32) * 10.0;
            let mut s = Sprite2D::new(Vec2::new(2.0, 2.0), None);
            if i == SPATIAL_GRID_THRESHOLD as u32 {
                s.culling_mode = CullingMode::AlwaysRender;
            }
            sprites.insert(i, (s, Transform2D::from_translation(Vec2::new(x, 0.0))));
        }

        let mut grid = SpatialGrid2D::new(16.0);
        grid.rebuild(&sprites, &HashMap::new());
        assert!(grid.is_populated());

        let mut out_s = Vec::new();
        let mut out_sh = Vec::new();
        grid.query(
            Vec2::new(5.0, -5.0),
            Vec2::new(25.0, 5.0),
            &mut out_s,
            &mut out_sh,
        );
        assert!(out_s.contains(&1));
        assert!(out_s.contains(&2));
        assert!(out_s.contains(&(SPATIAL_GRID_THRESHOLD as u32))); // AlwaysRender
        assert!(!out_s.contains(&50));
    }
}
