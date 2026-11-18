# galfus-realm-2d-resources

Raw 2D domain resource descriptors, mathematical structures, materials, lighting models, particles.

## Responsibilities

- **2D Geometry & Shape Descriptors**: Data structures for quad sprites, geometric shapes (rectangles, circles, n-gon polygons), and occluder silhouettes.
- **2D Material & Shader Specifications**: Descriptors for base color tints, alpha blending classifications, 8-slot texture arrays, and custom WGSL surface effect snippets.
- **Lighting & Polar Shadow Definitions**: Descriptors for 2D point lights, ambient terms, penumbra sizes, and polar soft shadow configurations.
- **2D Particle Simulation Descriptors**: Particle emitter properties, burst counts, velocity spreads, and lifecycle properties.
- **Sprites & Geometric Vector Shapes (`Shape2D`, `Sprite2D`)**:
  - `Sprite2D`: Textured quad surfaces with sub-texture UV rectangles, height ranges, and shadow casting flags.
  - `Shape2D`: Vector primitives (rectangles, rounded circles, arbitrary polygons) with automatic occluder boundary extraction.
- **Orthographic Reverse-Z Camera (`Camera2D`)**:
  - Generates Reverse-Z orthographic view-projection matrices for maximum floating-point depth buffer precision across 2D layer stacking.
- **2D Point Lights & Soft Polar Shadows**:
  - Radiance parameters: `color`, `intensity`, `range`, `lightRadius`.
  - Polar soft shadow parameters: `angularResolution`, `ambient`, `penumbra`, `contactOffset`.
- **2D Materials (`Material2D`)**:
  - Surface classifications: `Opaque`, `Transparent` (alpha blending), `Masked` (alpha test cutoff), and `Additive` (glowing FX).
  - 8 independent texture slots and 4 standard samplers.
  - Custom surface effects: `fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D` with custom vectors `[v0..v3]`.

## Invariants & Design Principles

- **Data Descriptors, Not GPU Allocators**: Contains purely CPU-side data models and math; memory allocation on the GPU is handled by downstream renderer crates.
- **Strictly 2D Domain**: Optimized exclusively for 2D spatial coordinates and transformations.
