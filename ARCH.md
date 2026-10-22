# Galfus Engine Architecture

> **Status:** This document describes the implementation in this repository. The Rust source and tests are the authoritative definition of behavior.

---

## 1. Scope and Architectural Goals

Galfus is a **host-agnostic, modular graphics foundation** designed for native and web applications. It provides low-level graphics facilities, GPU resource management, platform integration, and a graph-based coordinator to combine graphical realms.

The engine does not impose an entity-component system (ECS), game loop, or specific framework architecture. The host application maintains complete ownership over its lifecycle, updates, and render cadence.

### Core Invariants

1. **Host-Owned Lifecycle:** The host initiates setup, event polling, graph execution, and shutdown. Supports headless execution for server/CI.
2. **Native Binary Boundary:** `galfus-native` packages the native crates as a C-compatible dynamic library (`libgalfus_native.so`, `galfus.dll`, or `libgalfus_native.dylib`). The optional `napi` feature exposes Node-API functions from the same crate.
3. **No Central Command Mailbox:** Operations use direct exported functions. Structured C-ABI payloads are JSON; hot transform paths use raw float pointers.
4. **Host-Controlled Logical IDs & Reserved Range:** The host controls logical IDs for all entities and resources. The engine core strictly reserves the top 65,535 IDs (`4294901761..=4294967295` for `u32`) for internal engine resources and rejects host commands that violate this range.
5. **Pure Quaternions:** Spatial rotations across the engine core, C-ABI, and generated SDKs use unit quaternions `[x, y, z, w]` exclusively. The engine remains lean and unopinionated; host code performs any desired Euler conversions.
6. **Zero-Allocation Fast-Path Transforms:** Hot-path spatial updates bypass JSON serialization through raw float pointer buffers (3D: 10 floats; 2D: 6 floats).
7. **Flat Platform Events:** Polled events are exposed as flat discriminated unions tagged with `{ kind: "window" | "pointer" | "keyboard" | "gamepad", type: ... }`, avoiding host language callback deadlocks.
8. **Decoupled Realm Contract:** Realms are graphics-producing units that implement a common trait (`galfus-realm-core`). Concrete 2D and 3D implementations are decoupled from the graph coordinator (`galfus-multiverse`).

---

## 2. Module Topology & Crate Boundaries

```text
                        APPLICATION / HOST
           Bun / Rust / C / Python / Lua / Browser
          lifecycle · update logic · custom shaders
                               │
                    Direct C-ABI / Host SDKs
                               │
┌───────────────────────────────────────────────────────────┐
│                       GALFUS ENGINE                       │
│                                                           │
│                  galfus-multiverse                        │
│      realms · targets · invocations · graph execution     │
│                      /           \                        │
│             galfus-realm-2d   galfus-realm-3d             │
│                    │               │                      │
│         galfus-realm-2d-   galfus-realm-3d-               │
│             resources         resources                   │
│                                                           │
│     galfus-platform           galfus-gpu-manager          │
│     surfaces · input          wgpu · buffers · textures   │
│     events · audio            allocator · pipelines       │
│                                                           │
│       galfus-realm-core       galfus-core                 │
│       realm contracts         IDs · handles · primitives  │
└───────────────────────────────────────────────────────────┘
               │                           │
     desktop / browser APIs        wgpu graphics backends
```

### Module Responsibilities

| Crate                              | Responsibility                                                                                                                                                 |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/galfus-core`               | Identifiers, deterministic 64-bit `ContentId` hashing (FNV-1a), shader snippet validation, `ShaderEffectTemplate`, and reserved ID validation.                 |
| `engine/galfus-platform`           | Cross-platform windowing (`winit`), headless mode, display capabilities, flat event queues, and peripheral normalization.                                      |
| `engine/galfus-gpu-manager`        | Shared `wgpu::Instance`, `wgpu::Adapter`, `wgpu::Device`, and `wgpu::Queue` management, shared texture/buffer allocation, and uniform layouts.                 |
| `engine/galfus-realm-core`         | The `Realm` trait defining the lifecycle contract (`id`, `kind`, `prepare`, `render`, `clear`, `destroy`, `referenced_texture_ids`).                           |
| `engine/galfus-multiverse`         | Render graph coordination, target blocks, topological DAG scheduling, soft-cut cycle breaking, post-processing screen effects, and texture binding validation. |
| `engine/galfus-realm-2d`           | Concrete 2D realm: instanced sprite batching, vector shapes, 2D dynamic lights, occluder penumbra shadows, and 2D surface effects.                             |
| `engine/galfus-realm-2d-resources` | Raw 2D domain models: sprites, shapes, 2D cameras, materials, and 2D particle systems.                                                                         |
| `engine/galfus-realm-3d`           | Concrete 3D realm: Forward+ PBR, Reverse-Z depth, directional/point/spot lights, shadow maps, SSAO, gizmos, portals, and world AABB queries.                   |
| `engine/galfus-realm-3d-resources` | Raw 3D domain models: geometry meshes, PBR materials, lights, 3D cameras, particles, and skeleton animation.                                                   |
| `bindings/galfus-native`           | Unified C-ABI dynamic library (`libgalfus_native.so`) providing exported C functions, memory ownership, and direct pointer fast paths.                         |
| `scripts/codegen`                  | Multi-language code generation engine implementing the Strategy pattern to generate SDKs for C, Python, LuaJIT, TypeScript, Bun FFI, and Browser/WASM.         |

---

## 3. Realm Lifecycle Contract

All graphical realms implement the standard `Realm` trait defined in `galfus-realm-core`:

```rust
pub trait Realm: Send + Sync + 'static {
    fn id(&self) -> u32;
    fn kind(&self) -> RealmKind;
    fn prepare(&mut self, context: &RealmPrepareContext<'_>) -> RealmResult<()>;
    fn render(&mut self, context: &RealmInvocationContext<'_>) -> RealmResult<()>;
    fn clear(&mut self) -> RealmResult<()>;
    fn destroy(&mut self) -> RealmResult<()>;
    fn referenced_texture_ids(&self) -> Vec<u32>;
    fn as_any(&self) -> &dyn Any;
    fn as_any_mut(&mut self) -> &mut dyn Any;
}
```

### Lifecycle Semantics:

- **`prepare`**: Is called once per dispatched frame for every registered realm. It receives the GPU device, queue, frame timing, and a logical-texture resolver.
- **`render`**: Is called once per scheduled invocation. It receives an invocation-local output texture, resolved viewport, camera slot, and optional TAA jitter.
- **`clear`**: Clears a realm's scene data while keeping its registration active. Concrete realms preserve or rebuild their GPU caches according to their own implementation.
- **`destroy`**: Lets a realm release its own state. `MultiverseContext::unregister_realm` also removes that realm's invocations and target bindings.
- **`referenced_texture_ids(&self)`**: Returns all logical texture IDs referenced across the realm's active materials. Used by Multiverse during graph resolution to validate declared bindings.

---

## 4. Multiverse Render Graph Architecture

The Multiverse manages the execution graph linking **Realms**, **Invocations**, and **Targets**:

```text
Realm A (3D World)  ── Invocation 100 (Viewport full, sepia)  ──► Target 1 (Window)
Realm B (2D HUD)    ── Invocation 101 (Viewport full, z=1)     ──► Target 1 (Window)
Target 2 (Offscreen) ── TargetTextureBinding (slot: "albedo")   ──► Realm A (Portal Surface)
```

### 4.1. Core Graph Entities

- **Target**: A render destination (Window Surface swapchain or Offscreen GPU Texture).
- **Invocation**: Links a Realm to a Target, defining:
  - `cameraSlot`: Active camera index within the Realm.
  - `viewport`: Responsive anchor rectangle (`ViewportRect`) supporting `vw`, `vh`, and `px` units.
  - `zIndex`: Sorting order for compositing multiple invocations within the same target block.
  - `filters`: Ordered post-processing screen effect passes (`InvocationFilter`).
  - `clearColor`: Optional clear color for the invocation scratch texture before the realm renders.
- **TargetTextureBinding**: Declares that a Realm consumes a rendered Target's texture as input (e.g. portals, mirrors, security cameras).

### 4.2. Topological Scheduling & Cycle Breaking

1. **DAG Analysis**: Multiverse performs topological sorting of targets based on `TargetTextureBinding` dependencies.
2. **Cycle Detection & Soft-Cut**: When a cycle occurs, all edges remaining in that cycle are cut from the schedule. Texture targets used as cut sources receive a history texture; consumers use its previous-frame contents until the source has rendered again.
3. **Texture Binding Validation**: During `resolve()`, if a realm references an existing target ID without a matching binding, Multiverse emits a warning. This is diagnostic validation, not an error and not automatic slot wiring.

### 4.3. Frame execution

`dispatch(frame_id, delta_time)` resolves the graph if it is dirty, prepares every registered realm once, then executes target blocks in schedule order. Every invocation renders into an RGBA8 scratch texture. Multiverse applies its filter/anti-aliasing chain and composites that result into the window surface or offscreen target. Window targets without an attached `GpuSurface` are scheduled but have no presentation view to receive the composite.

---

## 5. Shader Effects Architecture

Custom graphics logic is authored via sandboxed WGSL hook functions injected into engine pipeline templates:

```text
Host Shader Snippet (WGSL)
           │
           ▼
[galfus-core::validate_snippet]
  - Rejects forbidden keywords (@group, @binding, @vertex, @fragment, var<uniform>)
  - Verifies presence of domain entrypoint function
           │
           ▼
[galfus-core::ShaderEffectTemplate]
  - Injects snippet into domain prelude & entrypoint hook
  - Computes deterministic 64-bit ContentId (FNV-1a)
           │
           ▼
[Pipeline Cache (Multiverse / Realm 3D / Realm 2D)]
  - Compiles composed WGSL into wgpu::ShaderModule
  - Caches wgpu::RenderPipeline indexed by ContentId & surface format
```

### Effect Domains:

1. **Screen Effects (`galfus-multiverse`)**:
   - Signature: `fn screen_effect(in: ScreenInput) -> vec4<f32>`
   - Applied to Invocation viewports via procedural fullscreen quad.
2. **Surface Effects 3D (`galfus-realm-3d`)**:
   - Signature: `fn surface_effect(in: SurfaceInput) -> SurfaceOutput`
   - Injected into forward+ PBR multi-light and shadow pipeline.
3. **Surface Effects 2D (`galfus-realm-2d`)**:
   - Signature: `fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D`
   - Injected into 2D sprite and vector shape rendering pipeline.

---

## 6. Fast-Path Transforms and Direct C-ABI

To guarantee high throughput for simulations, physics engines, and game logic, Galfus provides dual-mode APIs:

### 6.1. Fast-Path Raw Float Buffers

Bypasses JSON serialization entirely by reading raw memory buffers passed directly across FFI:

- **3D Entities (Models, Cameras)**: 10 consecutive `f32` values:
  `[pos_x, pos_y, pos_z, rot_x, rot_y, rot_z, rot_w, scale_x, scale_y, scale_z]`
- **2D Entities (Sprites, Cameras)**: 6 consecutive `f32` values:
  `[pos_x, pos_y, rotation_rad, scale_x, scale_y, z_layer]`

### 6.2. Query Getters

- `galfus_multiverse_get_target_size(target_id, out_w, out_h)`
- `galfus_platform_get_window_size(window_id, out_w, out_h)`
- `galfus_realm_3d_get_model_transform(realm_id, model_id, out_ptr)`
- `galfus_realm_3d_get_camera_transform(realm_id, camera_id, out_ptr)`
- `galfus_realm_3d_get_model_aabb(realm_id, model_id, out_min, out_max)`: Computes the model's world-space oriented AABB by transforming local geometry bounds through the model matrix.
- `galfus_realm_2d_get_sprite_transform(realm_id, sprite_id, out_ptr)`
- `galfus_realm_2d_get_camera_transform(realm_id, camera_id, out_ptr)`

### 6.3. Ergonomic SDK Bindings

The exported raw functions accept pointers to these layouts. Generated host wrappers may offer ergonomic overloads, but their behavior is defined by the generated code for that binding.

---

## 7. Multi-Language SDK Code Generation

Galfus uses a specification-driven codegen architecture located in `scripts/codegen/`. Shared native ABI specifications and a Browser/WASM contract generate client bindings for multiple runtimes:

```text
scripts/codegen/specs/
  ├── types.ts            (Type system, primitive & pointer mappings)
  ├── platform.ts         (Windowing, capabilities, flat event specs)
  ├── browser.ts          (Browser/WASM JavaScript API contract)
  ├── multiverse.ts       (Targets, invocations, bindings, dispatch)
  ├── realm_2d.ts         (2D sprites, shapes, lights, cameras)
  ├── realm_3d.ts         (3D models, geometry, materials, cameras)
  └── realm_3d_desc.ts    (3D descriptor specifications)
           │
           ▼
scripts/codegen/strategies/
  ├── c_header.ts         ──► sdk/c/galfus.h
  ├── python.ts           ──► sdk/python/galfus.py
  ├── lua.ts              ──► sdk/lua/galfus.lua
  ├── typescript.ts       ──► sdk/typescript/galfus.ts
  ├── bun_ffi.ts          ──► sdk/bun/galfus.ts
  ├── node_api.ts         ──► sdk/node/galfus.ts
  ├── csharp.ts           ──► sdk/csharp/Galfus.cs
  └── browser_wasm.ts     ──► sdk/browser/galfus.ts
```

---

## 8. Verification and Quality Gates

The Galfus Engine maintains strict automated quality standards:

1. **Workspace checks**: `bun run check` runs Bun syntax checks, `cargo check --workspace --all-targets`, and `cargo clippy --workspace --all-targets`.
2. **Rust tests**: `cargo test --workspace` covers core behavior and GPU-dependent cases when an adapter is available.
3. **Binding checks**: `bun run test:ffi`, `bun run test:binds`, and `bun run test:napi` exercise their respective exported surfaces.
4. **Realtime demos**:
   - `scripts/demos/main.ts`: Realtime interactive validation of Forward+ PBR, SSAO, skeleton animation, 3D portals/mirrors, 2D dynamic shadows, and Multiverse split-screen post-processing.
