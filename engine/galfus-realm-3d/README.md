# galfus-realm-3d

Concrete 3D graphics realm implementing the `galfus-realm-core` contract.

## Responsibilities

- **3D Rendering Engine**: Implements 3D mesh rasterization, material evaluation, lighting, and shadow generation.
- **3D Camera & View Frustums**: Manages perspective projections, camera matrices, frustum culling, and view transformations.
- **Multi-Attachment Outputs**: Generates declared outputs including HDR color, depth, normals, and material data for downstream graph nodes.
- **Pass Execution**: Drives depth pre-passes, forward/clustered passes, and shadow map generation.

## Invariants & Non-Goals

- **Independent of 2D**: Zero dependency on 2D sprite rendering or `galfus-realm-2d`.
- **Feature-Gated**: Can be excluded at compile time via Cargo features for 2D-only builds.
- **No Direct Graph Scheduling**: Fulfills its realm execution contract when dispatched by `galfus-multiverse`.
