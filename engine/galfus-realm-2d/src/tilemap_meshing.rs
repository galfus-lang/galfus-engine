//! Greedy 2D rectangle merging for chunked tilemap colliders and shadow occluders.

/// An axis-aligned rectangle in tile-grid coordinates (local to a chunk or full map).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MergedTileRect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// Greedily merges contiguous set cells in a `width × height` boolean grid into
/// a minimal set of non-overlapping axis-aligned rectangles (`O(width * height)`).
pub fn greedy_merge_rects<F>(width: u32, height: u32, is_set: F) -> Vec<MergedTileRect>
where
    F: Fn(u32, u32) -> bool,
{
    let w_usize = width as usize;
    let h_usize = height as usize;
    if w_usize == 0 || h_usize == 0 {
        return Vec::new();
    }

    let mut visited = vec![false; w_usize * h_usize];
    let mut rects = Vec::new();

    for y in 0..height {
        for x in 0..width {
            let idx = (y as usize) * w_usize + (x as usize);
            if visited[idx] || !is_set(x, y) {
                continue;
            }

            // Expand rightward as far as possible along row `y`.
            let mut rw = 1u32;
            while x + rw < width {
                let next_idx = (y as usize) * w_usize + ((x + rw) as usize);
                if visited[next_idx] || !is_set(x + rw, y) {
                    break;
                }
                rw += 1;
            }

            // Expand downward while every cell across `[x .. x + rw)` is set and unvisited.
            let mut rh = 1u32;
            'rows: while y + rh < height {
                let row_base = ((y + rh) as usize) * w_usize;
                for dx in 0..rw {
                    let cell_idx = row_base + ((x + dx) as usize);
                    if visited[cell_idx] || !is_set(x + dx, y + rh) {
                        break 'rows;
                    }
                }
                rh += 1;
            }

            // Mark merged rectangle as visited.
            for dy in 0..rh {
                let row_base = ((y + dy) as usize) * w_usize;
                for dx in 0..rw {
                    visited[row_base + ((x + dx) as usize)] = true;
                }
            }

            rects.push(MergedTileRect { x, y, w: rw, h: rh });
        }
    }

    rects
}

#[cfg(test)]
mod tests {
    use super::*;

    fn verify_exact_coverage(width: u32, height: u32, grid: &[bool], rects: &[MergedTileRect]) {
        let mut counts = vec![0u32; (width * height) as usize];
        for r in rects {
            for dy in 0..r.h {
                for dx in 0..r.w {
                    let idx = ((r.y + dy) * width + (r.x + dx)) as usize;
                    counts[idx] += 1;
                }
            }
        }
        for (i, &expected) in grid.iter().enumerate() {
            assert_eq!(
                counts[i],
                u32::from(expected),
                "coverage mismatch at cell {i}"
            );
        }
    }

    #[test]
    fn merges_solid_block_into_single_rect() {
        let grid = vec![true; 16 * 16];
        let rects = greedy_merge_rects(16, 16, |x, y| grid[(y * 16 + x) as usize]);
        assert_eq!(
            rects,
            vec![MergedTileRect {
                x: 0,
                y: 0,
                w: 16,
                h: 16
            }]
        );
        verify_exact_coverage(16, 16, &grid, &rects);
    }

    #[test]
    fn merges_l_shape_into_two_rects() {
        // 4x4 L-shape: bottom row (y=0) full + left column (x=0) full
        let mut grid = vec![false; 16];
        grid[..4].fill(true);
        for y in 0..4 {
            grid[y * 4] = true;
        }
        let rects = greedy_merge_rects(4, 4, |x, y| grid[(y * 4 + x) as usize]);
        assert_eq!(rects.len(), 2);
        verify_exact_coverage(4, 4, &grid, &rects);
    }

    #[test]
    fn handles_empty_and_checkerboard() {
        let empty = greedy_merge_rects(8, 8, |_, _| false);
        assert!(empty.is_empty());

        let grid: Vec<bool> = (0..16)
            .map(|i| {
                let x = i % 4;
                let y = i / 4;
                (x + y) % 2 == 0
            })
            .collect();
        let rects = greedy_merge_rects(4, 4, |x, y| grid[(y * 4 + x) as usize]);
        assert_eq!(rects.len(), 8);
        verify_exact_coverage(4, 4, &grid, &rects);
    }
}
