# galfus-realm-3d-resources

Raw 3D domain resource primitives, material descriptors, and geometry definitions.

## Responsibilities

- **3D Geometry Primitives**: Raw geometry descriptors (cubes, spheres, capsules, planes, cylinders, and vertex attribute layouts).
- **3D Material Descriptors**: PBR material definitions (albedo, roughness, metallic, normal maps, occlusion, emissive).
- **Light & Environment Building Blocks**: Light source descriptors (directional, point, spot) and environment map definitions.
- **3D Particle Building Blocks**: Emission volumes, 3D trajectory parameters, and particle system configurations.

## Invariants & Non-Goals

- **Domain Descriptors, Not GPU Allocators**: Defines raw data structures and specifications; memory allocation is delegated to `galfus-gpu-manager`.
- **Code-Level Library**: Compiled directly into the engine, not packaged as a separate dynamic library.
