# galfus-realm-2d

Concrete 2D graphics realm implementing the `galfus-realm-core` contract.

## Responsibilities

- **2D Rendering Engine**: Implements sprite batching, 2D vector shapes, text rendering, and layer compositing.
- **2D Camera & Transform Hierarchy**: Manages 2D views, orthographic projections, and viewport transformations.
- **Realm Contract Implementation**: Implements declared 2D output ports (color, alpha, masks) for consumption by the multiverse graph.
- **Pipeline & Material Binding**: Associates 2D draw commands with GPU pipelines provided via `galfus-gpu-manager`.

## Invariants & Non-Goals

- **Independent of 3D**: Zero dependency on 3D mesh rendering, lighting models, or `galfus-realm-3d`.
- **Feature-Gated**: Can be excluded at compile time via Cargo features for 3D-only or minimal builds.
- **No Direct Graph Scheduling**: Fulfills its realm execution contract when dispatched by `galfus-multiverse`.
