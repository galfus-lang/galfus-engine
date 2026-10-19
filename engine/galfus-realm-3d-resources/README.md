# galfus-realm-3d-resources

Raw 3D domain descriptors, procedural geometry generators, PBR materials, skeletal rigs, lighting models, and camera mathematics.

## Responsibilities

- **Procedural 3D Geometry**: Procedural generation algorithms for standard 3D primitives and flexible vertex layout specifications.
- **PBR Material Models**: Physically-Based Rendering descriptors (metallic-roughness, normal mapping, emissive, refraction index, and optical distortion).
- **Skeletal Skinning Data Structures**: Vertex joint indices and weights plus per-model bone matrix palettes.
- **Perspective Camera Mathematics**: Reverse-Z perspective projections, view matrix calculations, and 6-plane frustum extraction.
- **Lighting & Environment Descriptors**: Directional, point, and spot light sources, alongside IBL/cubemap environment terms.
- **Bounding Volumes (AABB)**: Axis-Aligned Bounding Box calculation, transformation, and culling tests.

## Capabilities & Powers

- **Procedural 3D Primitive Generators**:
  - Built-in generators for: `Cube`, `Sphere`, `Cylinder`, `Capsule`, `Plane`, `Pyramid`, and `Torus`.
  - Computes smooth normals, tangents, bitangents, and spherical/planar UV coordinates.
- **Physically Based Rendering (PBR) Materials (`Material3D`)**:
  - Standard metallic-roughness model adhering to the Cook-Torrance microfacet BRDF.
  - Inputs for `baseColor`, `metallic`, `roughness`, `reflectance`, `refractionIndex`, `refractionDistortion`, and `emissiveColor`.
  - Texture maps: Albedo, Normal, Metallic-Roughness, Occlusion, and Emissive.
- **Skeletal Skinning Inputs**:
  - Mesh vertices contain joint indices and weights.
  - The 3D realm receives per-model 4x4 bone matrix palettes.
- **High-Precision Reverse-Z Perspective Camera (`Camera3D`)**:
  - Generates Reverse-Z perspective projection matrices distributing floating-point depth precision towards infinity to eliminate z-fighting on distant geometry.
  - Extracts world-space viewing frustum planes for hardware-accelerated culling.
- **3D Bounding Volumes (`Aabb3D`)**:
  - Fast min/max box extraction from vertex sets and exact affine matrix transformation.

## Invariants & Design Principles

- **Data Descriptors, Not GPU Allocators**: Pure CPU data structures and mathematical definitions; buffer allocation on the GPU is handled by `galfus-realm-3d` and `galfus-gpu-manager`.
- **Strictly 3D Domain**: Focused on 3D spatial representations without mixing 2D sprite abstractions.
