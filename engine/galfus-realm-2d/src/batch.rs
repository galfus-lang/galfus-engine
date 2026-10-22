use crate::types::{BatchKey2D, BatchRange2D, Item2DInstanceRaw};

/// Prepared item ready for batch sorting.
#[derive(Debug, Clone)]
pub struct PreparedItem2D {
    pub key: BatchKey2D,
    pub instance: Item2DInstanceRaw,
    pub occluder_only: bool,
}

/// Dynamic batch builder for 2D sprites and vector shapes.
#[derive(Debug, Default)]
pub struct BatchBuilder2D {
    items: Vec<PreparedItem2D>,
    sorted_instances: Vec<Item2DInstanceRaw>,
    ranges: Vec<BatchRange2D>,
}

impl BatchBuilder2D {
    /// Creates a new empty batch builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Clears internal buffers for the next frame.
    pub fn clear(&mut self) {
        self.items.clear();
        self.sorted_instances.clear();
        self.ranges.clear();
    }

    /// Adds a prepared 2D item for batching.
    pub fn push(&mut self, item: PreparedItem2D) {
        if !item.occluder_only {
            self.items.push(item);
        }
    }

    /// Sorts all added items deterministically and generates contiguous draw ranges.
    pub fn build(&mut self) {
        self.sorted_instances.clear();
        self.ranges.clear();

        if self.items.is_empty() {
            return;
        }

        // Deterministic sorting: Z-layer -> draw order -> surface type -> material -> geometry
        self.items.sort_by_key(|a| a.key);

        self.sorted_instances.reserve(self.items.len());

        let mut current_key = self.items[0].key;
        let mut range_start = 0u32;
        let mut range_count = 0u32;

        for item in &self.items {
            if item.key != current_key {
                self.ranges.push(BatchRange2D {
                    key: current_key,
                    start: range_start,
                    count: range_count,
                });
                current_key = item.key;
                range_start = self.sorted_instances.len() as u32;
                range_count = 0;
            }

            self.sorted_instances.push(item.instance);
            range_count += 1;
        }

        if range_count > 0 {
            self.ranges.push(BatchRange2D {
                key: current_key,
                start: range_start,
                count: range_count,
            });
        }
    }

    /// Returns the sorted instances to be uploaded to the GPU.
    pub fn instances(&self) -> &[Item2DInstanceRaw] {
        &self.sorted_instances
    }

    /// Returns the resolved draw batch ranges.
    pub fn ranges(&self) -> &[BatchRange2D] {
        &self.ranges
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use glam::{Mat4, Vec4};

    fn make_item(z_layer: i32, material_id: u32, geometry_id: u64) -> PreparedItem2D {
        make_item_with_order(z_layer, 0, material_id, geometry_id)
    }

    fn make_item_with_order(
        z_layer: i32,
        draw_order: i32,
        material_id: u32,
        geometry_id: u64,
    ) -> PreparedItem2D {
        PreparedItem2D {
            key: BatchKey2D {
                z_layer,
                draw_order,
                surface_type: 1,
                material_id,
                geometry_id,
            },
            instance: Item2DInstanceRaw {
                model_matrix: Mat4::IDENTITY,
                tint: Vec4::ONE,
                uv_rect: Vec4::new(0.0, 0.0, 1.0, 1.0),
                shadow_params: Vec4::ZERO,
            },
            occluder_only: false,
        }
    }

    #[test]
    fn test_batch_grouping_and_sorting() {
        let mut builder = BatchBuilder2D::new();

        builder.push(make_item(2, 10, 1));
        builder.push(make_item(0, 10, 1));
        builder.push(make_item(0, 10, 1));
        builder.push(make_item(0, 20, 1));

        builder.build();

        let ranges = builder.ranges();
        assert_eq!(ranges.len(), 3);
        assert_eq!(ranges[0].key.z_layer, 0);
        assert_eq!(ranges[0].key.material_id, 10);
        assert_eq!(ranges[0].count, 2);

        assert_eq!(ranges[1].key.z_layer, 0);
        assert_eq!(ranges[1].key.material_id, 20);
        assert_eq!(ranges[1].count, 1);

        assert_eq!(ranges[2].key.z_layer, 2);
        assert_eq!(ranges[2].count, 1);
    }

    #[test]
    fn test_draw_order_overrides_material_sort() {
        let mut builder = BatchBuilder2D::new();

        // Even though material 20 > material 5, draw_order 0 is drawn before draw_order 1
        builder.push(make_item_with_order(0, 1, 5, 1));
        builder.push(make_item_with_order(0, 0, 20, 1));

        builder.build();

        let ranges = builder.ranges();
        assert_eq!(ranges.len(), 2);
        assert_eq!(ranges[0].key.draw_order, 0);
        assert_eq!(ranges[0].key.material_id, 20);
        assert_eq!(ranges[1].key.draw_order, 1);
        assert_eq!(ranges[1].key.material_id, 5);
    }
}
