# galfus-realm-2d

High-performance 2D rendering realm implementing the `galfus-realm-core` contract, featuring batched sprites, dynamic polar soft shadows, particles.

## Responsibilities

- **2D Batch Rendering**: Sorts draw instances by layer, draw order, and logical resource ID before grouping adjacent compatible instances into GPU batches.
- **Dynamic 2D Lighting & Polar Soft Shadows**: Executes angular polar raymarching for 2D occluders, rendering realistic contact hardening and smooth penumbrae.
- **Custom WGSL 2D Surface Effects**: Compiles material-specific surface shaders, injecting user-authored `surface_effect` snippets.
- **2D Particle Simulation**: Simulates and renders CPU-driven 2D particle emitters with additive blending.

## Capabilities & Powers

- **High-Throughput Batch Builder (`BatchBuilder2D`)**:
  - Dynamically merges draw calls sharing pipelines and materials.
  - Stable painter-order rendering using `zLayer`, `drawOrder`, and logical resource IDs; no depth buffer is used.
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
