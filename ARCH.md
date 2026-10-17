# Galfus Engine Architecture

> **Status: Implemented and Verified Architecture.** This document specifies the active architecture, runtime invariants, cross-module contracts, execution model, and verified implementation proof of the Galfus Engine ecosystem.

---

## 1. Scope and Architectural Goals

Galfus is a **host-agnostic, modular graphics foundation** designed for native and web applications. It provides low-level graphics facilities, GPU resource management, platform integration, and a graph-based coordinator to combine graphical realms.

The engine does not impose an entity-component system (ECS), game loop, or specific framework architecture. The host application maintains complete ownership over its lifecycle, updates, and render cadence.

### Core Invariants

1. **Host-Owned Lifecycle:** The host initiates setup, event polling, graph execution, and shutdown. Supports headless execution for server/CI.
2. **Single Binary Boundary:** Internal engine crates compile into a single shared dynamic library (`libgalfus_native.so`, `galfus.dll`, or `libgalfus_native.dylib`) exposing an explicitly versioned, C-compatible ABI.
3. **No Central Command Mailbox:** Serialized message pools and command mailboxes are eliminated. Operations use direct typed C-ABI functions and memory buffers.
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
| `engine/galfus-core`               | Identifiers, deterministic 64-bit `ContentId` hashing (SipHash-2-4), shader snippet validation, `ShaderEffectTemplate`, and reserved ID validation.            |
| `engine/galfus-platform`           | Cross-platform windowing (`winit`), headless mode, display capabilities, flat event queues, and peripheral normalization.                                      |
| `engine/galfus-gpu-manager`        | Shared `wgpu::Instance`, `wgpu::Adapter`, `wgpu::Device`, and `wgpu::Queue` management, shared texture/buffer allocation, and uniform layouts.                 |
| `engine/galfus-realm-core`         | The `Realm` trait defining the lifecycle contract (`prepare`, `execute`, `clear`, `destroy`, `referenced_texture_ids`).                                        |
| `engine/galfus-multiverse`         | Render graph coordination, target blocks, topological DAG scheduling, soft-cut cycle breaking, post-processing screen effects, and texture binding validation. |
| `engine/galfus-realm-2d`           | Concrete 2D realm: instanced sprite batching, vector shapes, 2D dynamic lights, occluder penumbra shadows, and 2D surface effects.                             |
| `engine/galfus-realm-2d-resources` | Raw 2D domain models: sprites, shapes, 2D cameras, materials, and 2D particle systems.                                                                         |
| `engine/galfus-realm-3d`           | Concrete 3D realm: Forward+ PBR, Reverse-Z depth, directional/point/spot lights, shadow maps, SSAO, gizmos, portals, and world AABB queries.                   |
| `engine/galfus-realm-3d-resources` | Raw 3D domain models: geometry meshes, PBR materials, lights, 3D cameras, particles, and skeleton animation.                                                   |
| `bindings/galfus-native`           | Unified C-ABI dynamic library (`libgalfus_native.so`) providing exported C functions, memory ownership, and direct pointer fast paths.                         |
| `scripts/codegen`                  | Multi-language code generation engine implementing the Strategy pattern to generate SDKs for C, Python, LuaJIT, TypeScript, and Bun FFI.                       |

---

## 3. Realm Lifecycle Contract

All graphical realms implement the standard `Realm` trait defined in `galfus-realm-core`:

```rust
pub trait Realm: Send + Sync {
    fn realm_id(&self) -> u32;
    fn prepare(&mut self, ctx: &mut RealmPrepareContext) -> Result<(), RealmError>;
    fn execute(&mut self, ctx: &mut RealmExecutionContext) -> Result<(), RealmError>;
    fn clear(&mut self);
    fn destroy(&mut self);
    fn referenced_texture_ids(&self) -> Vec<u32>;
    fn as_any(&self) -> &dyn Any;
    fn as_any_mut(&mut self) -> &mut dyn Any;
}
```

### Lifecycle Semantics:

- **`clear(&mut self)`**: Clears internal entities (models, sprites, lights, cameras, emitters) and scene state while keeping GPU pipeline caches and the realm registration active in Multiverse.
- **`destroy(&mut self)`**: Releases all internal GPU buffers, bind groups, pipelines, and entities. Multiverse automatically unregisters invocations, scratch textures, and bindings associated with the realm.
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
  - `clearColor`: Optional target clear color before invocation execution.
- **TargetTextureBinding**: Declares that a Realm consumes a rendered Target's texture as input (e.g. portals, mirrors, security cameras).

### 4.2. Topological Scheduling & Cycle Breaking

1. **DAG Analysis**: Multiverse performs topological sorting of targets based on `TargetTextureBinding` dependencies.
2. **Cycle Detection & Soft-Cut**: When cyclical dependencies occur (e.g. Portal A renders Target B, which renders Target A), Multiverse detects the cycle and applies a **soft-cut fallback**: the edge is broken, falling back to the previous frame's double-buffered texture without panicking or deadlocking.
3. **Texture Binding Validation**: In `resolve()`, Multiverse validates all `referenced_texture_ids()` from active realms against declared target IDs. If a material references an offscreen target without an explicit `TargetTextureBinding`, a clear warning log is emitted.

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
  - Computes deterministic 64-bit ContentId (SipHash-2-4)
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

Generated SDK wrappers (TypeScript/Bun) automatically detect the argument type: passing `Float32Array` or `number[]` routes directly to the raw fast path, while descriptor objects route through structured JSON.

---

## 7. Multi-Language SDK Code Generation

Galfus uses a specification-driven codegen architecture located in `scripts/codegen/`. Using the **Strategy Pattern**, a single declarative specification generates client bindings for multiple runtimes:

```text
scripts/codegen/specs/
  ├── types.ts            (Type system, primitive & pointer mappings)
  ├── platform.ts         (Windowing, capabilities, flat event specs)
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
  └── bun_ffi.ts          ──► sdk/bun/galfus.ts
```

---

## 8. Verification and Quality Gates

The Galfus Engine maintains strict automated quality standards:

1. **Workspace Compilation & Zero Warnings**:
   - `cargo check`: 0 errors across all workspace crates.
   - `cargo clippy`: 0 warnings with strict linter rules.
   - `bun run check`: 0 TypeScript errors across all generated SDKs and test scripts.
2. **Comprehensive Unit Testing**:
   - `cargo test --workspace`: 74 unit tests covering handle safety, reserved ID enforcement, Reverse-Z depth, PBR alignment, 2D shadow penumbras, DAG resolution, and soft-cut cycle breaking.
3. **End-to-End C-ABI & FFI Validation**:
   - `bun run test:ffi`: Validates headless platform initialization, multiverse targets, raw fast-path transforms, AABB queries, target texture warning logs, `realmClear`, and `realmDestroy`.
4. **Realtime Interactive Demonstration Suite**:
   - `scripts/demos/main.ts`: Realtime interactive validation of Forward+ PBR, SSAO, skeleton animation, 3D portals/mirrors, 2D dynamic shadows, and Multiverse split-screen post-processing.
