/**
 * Spatial dirty flags bitmask for 2D and 3D spatial models.
 * Controls the two-stage lifecycle: local change -> anchor solve -> world change -> core sync.
 */
export const enum SpatialDirtyFlags {
  /** Clean state: no updates needed in solver or core */
  Clean = 0,
  /** Local transform changed: Anchor solver needs to update worldMatrix */
  LocalDirty = 1 << 0,
  /** World matrix changed: Realm sync needs to upload worldMatrix to core */
  WorldDirty = 1 << 1,
  /** Descriptor changed: Realm sync needs to upload descriptor/material/flags to core */
  DescDirty = 1 << 2
}
