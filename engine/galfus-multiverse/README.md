# galfus-multiverse

Graphics execution graph orchestration, dependency validation, topological scheduling, and multi-viewport presentation coordination.

## Responsibilities

- **Multiverse Graph Topology**: Registers and orchestrates Realms, Invocations, Targets, and Target-Texture bindings.
- **Topological Scheduling & Dependency Analysis**: Analyzes inter-realm dependencies (e.g. portal mirrors, minimap RTT), detects cycles, inserts soft-cuts, and computes deterministic execution order.
- **Responsive Viewport Resolution**: Resolves responsive `ViewportRect` descriptors with anchor rules, viewport units (`vw`, `vh`), and pixel offsets.
- **Post-Processing & Screen Effect Pipeline**: Applies built-in image filters and host-registered custom WGSL screen effects per invocation.
- **Target Presentation & Dispatch**: Drives multi-pass rendering to native window surfaces and offscreen textures without runtime allocations in the hot loop.

## Capabilities & Powers

- **Versatile Target Infrastructure**:
  - `WindowTarget`: Directly targets presentation swapchains created by `galfus-platform`.
  - `TextureTarget`: Allocates offscreen GPU textures for render-to-texture (RTT), minimaps, planar reflection mirrors, and security monitors.
  - Physical size readback (`multiverseGetTargetSize`).
- **Flexible Invocations**:
  - Connects any registered Realm to a Target, binding specific camera slots, viewport rects, z-indices, clear colors, and filter chains.
  - Allows the same Realm to be invoked multiple times in a single frame with different cameras (e.g. split-screen multiplayer, side-by-side stereoscopy, or picture-in-picture minimaps).
- **Responsive `ViewportRect` Engine**:
  - Dynamic positioning with anchors (`AnchorX::Left | Center | Right`, `AnchorY::Top | Center | Bottom`).
  - Fluid sizing using viewport width/height percentages (`vw`, `vh`), fixed pixels (`px`), and helper presets (`full()`, `px()`, `pip()`).
- **Post-Processing Screen Effects**:
  - Built-in filters: `Sepia`, `Grayscale`, `Blur`, `Invert`.
  - Custom WGSL Screen Shaders: Compiles and injects custom `fn screen_effect(in: ScreenInput) -> vec4<f32>` snippets with access to up to 8 auxiliary texture slots.
- **Target-Texture Feedback & Soft-Cut Algorithm**:
  - Binds rendered targets back into Realms as material textures (`albedo`, `normal`, `custom`).
  - Detects cyclic dependencies between targets and realms, automatically inserting soft-cut edges using previous-frame historical textures to eliminate pipeline stalls.

## Invariants & Design Principles

- **Coordinator, Not Drawer**: Manages the schedule, textures, and passes; contains zero knowledge of 2D quad batches or 3D mesh vertex layouts.
- **Deterministic DAG Execution**: Guarantees strictly acyclic GPU command recording.
- **No Event Loop Ownership**: The host controls when frames are resolved (`multiverseResolve()`) and dispatched (`multiverseDispatch()`).
