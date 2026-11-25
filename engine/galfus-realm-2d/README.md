# galfus-realm-2d

High-performance 2D rendering realm implementing the `galfus-realm-core` contract, featuring batched sprites, dynamic polar soft shadows, particles.

## Responsibilities

- **2D Batch Rendering**: Sorts draw instances by layer, draw order, and logical resource ID before grouping adjacent compatible instances into GPU batches.
- **Dynamic 2D Lighting & Polar Soft Shadows**: Executes angular polar raymarching for 2D occluders, rendering realistic contact hardening and smooth penumbrae.
- **Custom WGSL 2D Surface Effects**: Compiles material-specific surface shaders, injecting user-authored `surface_effect` snippets.
- **2D Particle Simulation**: Simulates and renders CPU-driven 2D particle emitters with additive blending.

## Capabilities & Powers

- **High-Throughput Batch Builder (`BatchBuilder2D`) & Reverse-Z Early-Z**:
  - Dynamically merges draw calls sharing pipelines and materials.
  - Uses Reverse-Z `Depth32Float` with monotonic painter-order depth ranks, submitting opaque items front-to-back for Hardware Early-Z rejection followed by transparent/masked/additive items back-to-front.
- **Chunked `Tilemap2D` & Greedy Meshing**:
  - Partitions large tile grids into `32×32` (configurable `8..=64`) dirty-cached chunks with per-chunk viewport/LOD culling.
  - Greedily merges contiguous solid and light-blocking tiles into minimal fixed Rapier 2D box colliders and 2D shadow occluder quads.
- **Spatial Grid, Viewport/LOD Culling & 2D Occlusion**:
  - Uniform-cell `SpatialGrid2D` broad-phase, zoom-aware effective distance LOD (`hypot(dx, dy, orthoScale)`), CPU opaque-panel occlusion culling, and `cullCameraSlot` debug observer support.
- **Dynamic 2D Polar Soft Shadows**:
  - Real-time shadow mask generation from geometric shapes and sprites.
  - Evaluates occluder silhouette edges in polar coordinates to render physically-inspired soft shadows and penumbrae.
- **Custom WGSL 2D Surface Effects**:
  - Enables materials to run custom procedural shaders (e.g. plasma swirls, scanline holograms, caustics, and animated dissolve patterns) receiving lighting and time parameters.
- **Decoupled Spatial Nodes (`Model2D`) & Visual Attachments**:
  - Spatial entities maintain affine 2D transforms and draw order independently of visual components (sprites and shapes).
  - Pure 2D spatial nodes can serve as anchor targets and locator points without attaching visual assets.

## Invariants & Design Principles

- **Independent of 3D**: Completely isolated from 3D PBR meshes, skeletal rigs, and `galfus-realm-3d`.
- **Multiverse Cooperative**: Renders into the invocation target view supplied by `galfus-multiverse`.
