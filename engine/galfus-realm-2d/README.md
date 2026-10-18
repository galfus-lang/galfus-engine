# galfus-realm-2d

High-performance 2D rendering realm implementing the `galfus-realm-core` contract, featuring batched sprites, dynamic polar soft shadows, particles, and GPU reactive SVG vector rendering.

## Responsibilities

- **2D Batch Rendering**: Collects, groups, and sorts draw instances by `(zLayer, materialId, geometryId, surfaceType)` into optimal GPU batches.
- **Dynamic 2D Lighting & Polar Soft Shadows**: Executes angular polar raymarching for 2D occluders, rendering realistic contact hardening and smooth penumbrae.
- **Reactive SVG Vector Graphics (`SvgManager2D`)**: Rasterizes vector SVGs to GPU textures, synchronizes dirty DOM states, and emits draw items into the batch builder.
- **Custom WGSL 2D Surface Effects**: Compiles material-specific surface shaders, injecting user-authored `surface_effect` snippets.
- **2D Particle Simulation**: Simulates and renders CPU-driven 2D particle emitters with additive blending.

## Capabilities & Powers

- **High-Throughput Batch Builder (`BatchBuilder2D`)**:
  - Dynamically merges draw calls sharing pipelines and materials.
  - Stable sorting by `zLayer` utilizing Reverse-Z depth buffers to prevent layer flickering and z-fighting.
- **Reactive SVG GPU Manager (`SvgManager2D`)**:
  - Precision vector rasterization via `resvg`, `usvg`, and `tiny-skia`.
  - Cached system font database (`fontdb`) with automatic discovery of monospace, sans-serif, and serif font families.
  - Straight RGBA alpha conversion: Demultiplies tiny-skia's premultiplied color buffer to guarantee clean, fringe-free alpha blending with `wgpu::BlendState::ALPHA_BLENDING`.
  - Dedicated SVG material uniform buffers enabling texture slot 0 sampling with `LinearClamp` edge filtering.
  - Dirty-flag caching: Only re-rasterizes when XML source, attributes, or text content mutate.
  - Uses core-reserved material IDs (`4294901761 + (svg_id % 65000)`), avoiding host ID collision.
- **Dynamic 2D Polar Soft Shadows**:
  - Real-time shadow mask generation from geometric shapes and sprites.
  - Evaluates occluder silhouette edges in polar coordinates to render physically-inspired soft shadows and penumbrae.
- **Custom WGSL 2D Surface Effects**:
  - Enables materials to run custom procedural shaders (e.g. plasma swirls, scanline holograms, caustics, and animated dissolve patterns) receiving lighting and time parameters.

## Invariants & Design Principles

- **Independent of 3D**: Completely isolated from 3D PBR meshes, skeletal rigs, and `galfus-realm-3d`.
- **Feature-Gated**: Can be excluded at compile time for dedicated 3D headless or minimal builds.
- **Multiverse Cooperative**: Dispatches render passes cleanly into the command encoder provided by `galfus-multiverse`.
