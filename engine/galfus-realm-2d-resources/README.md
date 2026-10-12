# galfus-realm-2d-resources

Raw 2D domain resource primitives, material descriptors, and asset definitions.

## Responsibilities

- **2D Geometry Primitives**: Raw geometric definitions for quadrilaterals, rounded rectangles, polygons, paths, and lines.
- **2D Material Descriptors**: Shader inputs, blend mode specifications, and texture region descriptors.
- **2D Particle Building Blocks**: Emission shapes, lifecycle properties, and visual variations for 2D particle simulations.

## Invariants & Non-Goals

- **Domain Descriptors, Not GPU Allocators**: Defines raw mathematical structures and resource specifications; memory allocation is delegated to `galfus-gpu-manager`.
- **Code-Level Library**: Compiled directly into the engine, not packaged as a separate dynamic library.
