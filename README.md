<div align="center">
  <img src="https://raw.githubusercontent.com/galfus-multiverse/.github/main/assets/brand-full-colored.svg" alt="Galfus Engine" width="400" />
</div>

<br />

# Galfus Engine

**A host-agnostic, modular graphics foundation for native and web applications.**

> **Status:** This document describes the implementation in this repository. The Rust source and tests are the authoritative definition of behavior.

Galfus provides low-level graphics building blocks, resource management, platform integration, and a graph-based way to combine graphical worlds. It is not tied to a game loop, an entity-component system (ECS), or a particular host language.

An application owns its lifecycle and decides when to process events, update its state, and render. Galfus provides the capabilities needed to do that work, without dictating how the application itself is structured.

---

## Key Architecture & Capabilities

- **Host-Owned Lifecycle:** The host initializes, drives, and shuts down Galfus. No engine-owned application loop is imposed. Supports headless execution for server/CI.
- **Native Shared Library:** `galfus-native` packages the native crates as a C-compatible dynamic library (`libgalfus_native.so`, `galfus.dll`, or `libgalfus_native.dylib`). Node-API exports are available when it is built with the `napi` feature.
- **Host-Controlled Logical IDs:** The host controls logical IDs for all entities and resources. Galfus reserves the top 65,535 IDs (`4294901761..=4294967295` for `u32`) for internal engine resources.
- **Fast-Path Raw Struct Transforms:** Hot-path spatial updates bypass JSON serialization via direct C-ABI structs:
  - **3D**: 10 floats (`[px, py, pz, rx, ry, rz, rw, sx, sy, sz]`)
  - **2D**: 5 floats + 2 integers (`[px, py, rot, sx, sy, zLayer, drawOrder]`)
- **Pure Quaternions:** Rotations in the core and SDKs use unit quaternions `[x, y, z, w]` exclusively. The engine remains lean and unopinionated; host code performs any desired Euler conversions.
- **Multiverse Render Graph:** Coordinates execution of Realms, Invocations, and Targets with topological DAG resolution, soft-cut cycle breaking, and texture binding validation.
- **Responsive Viewport Anchors:** Invocations support CSS-like units (`vw`, `vh`, `px`) and anchored rectangles through `ViewportRect::full()` and `ViewportRect::anchored(...)`.
- **Hook-Based Shader Effects:** Custom graphics logic is authored via sandboxed WGSL hook functions injected into engine pipeline templates with deterministic 64-bit `ContentId` caching:
  - **Screen Effects**: `fn screen_effect(in: ScreenInput) -> vec4<f32>` (post-processing filters)
  - **3D Surface Effects**: `fn surface_effect(in: SurfaceInput) -> SurfaceOutput` (PBR material customization)
  - **2D Surface Effects**: `fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D` (2D sprite shaders)
- **Built-in Realms:**
  - **Realm 3D**: Forward+ PBR, Reverse-Z depth pre-pass & Early-Z, GPU Reverse-Z Hi-Z occlusion culling, declarative distance LOD, Parallax Occlusion Mapping (POM), directional/point/spot lights, shadows, SSAO, bloom, morph targets, core-owned IK & skeletal skinning, Forward PBR decals/occluded projectors, UV-space decal baking, particles, portals/mirrors, and world AABB queries.
  - **Realm 2D**: Instanced batched sprites, chunked `Tilemap2D` with greedy-merged Rapier 2D colliders & shadow occluders, Reverse-Z `Depth32Float` Early-Z, `SpatialGrid2D` viewport/LOD/occlusion culling, vector shapes, normal mapping, 2D polar soft shadows, core-backed UI, and 2D particle systems.
- **Realm Lifecycle Contract:** Full support for `realmClear(realmId)` (entity flush without unregistering) and `realmDestroy(realmId)` (full GPU resource reclamation and Multiverse unregistration).
- **Flat Platform Events:** Polled events are exposed as flat discriminated unions tagged with `{ kind: "window" | "pointer" | "keyboard" | "gamepad", type: ... }`, eliminating host callback deadlocks.

---

## High-Level Architecture

```text
                        APPLICATION / HOST
           Bun / Rust / C / Python / Lua / Browser
          lifecycle · update logic · custom shaders
                               |
                    Direct C-ABI / Host SDKs
                               |
+-----------------------------------------------------------+
|                       GALFUS ENGINE                       |
|                                                           |
|                  galfus-multiverse                         |
|      realms · targets · invocations · graph execution     |
|                      /           \                         |
|             galfus-realm-2d   galfus-realm-3d              |
|                    |               |                      |
|         galfus-realm-2d-   galfus-realm-3d-                |
|             resources         resources                   |
|                                                           |
|     galfus-platform           galfus-gpu-manager          |
|     surfaces · input          wgpu · buffers · textures    |
|     events · audio            allocator · pipelines       |
|                                                           |
|       galfus-realm-core       galfus-core                  |
|       realm contracts         IDs · handles · primitives  |
+-----------------------------------------------------------+
               |                           |
     desktop / browser APIs        wgpu graphics backends
```

---

## Workspace Layout

| Path                               | Description                                                                                                      |
| :--------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| `engine/galfus-core`               | Core types, ContentId, ShaderEffectTemplate, collision shapes, reserved ID policies.                             |
| `engine/galfus-platform`           | Cross-platform windowing (`winit`), headless mode, flat event queues.                                            |
| `engine/galfus-gpu-manager`        | Shared `wgpu` instance, device, queue, and texture/buffer management.                                            |
| `engine/galfus-realm-core`         | Realm lifecycle trait (`id`, `kind`, `prepare`, `render`, `clear`, `destroy`, `referenced_texture_ids`).         |
| `engine/galfus-multiverse`         | Graph coordinator, target blocks, DAG topological ordering, screen effects.                                      |
| `engine/galfus-realm-2d`           | 2D renderer, sprite batching, 2D shadows, 2D surface effects.                                                    |
| `engine/galfus-realm-2d-resources` | 2D domain models: sprites, shapes, 2D cameras, materials, particles.                                             |
| `engine/galfus-realm-3d`           | 3D forward+ renderer, reverse-Z, shadow maps, SSAO, gizmos, portals.                                             |
| `engine/galfus-realm-3d-resources` | 3D domain models: meshes, PBR materials, lights, cameras, particles, AABB.                                       |
| `engine/galfus-animation`          | Property transitions, easing curves, SLERP, path evaluation.                                                     |
| `engine/galfus-physics`            | 2D and 3D rigid bodies, colliders, raycasting, and contact events via Rapier.                                    |
| `bindings/galfus-native`           | Unified C-ABI dynamic library (`libgalfus_native.so`) and Node-API exports.                                      |
| `bindings/galfus-browser`          | WebAssembly packaging and WebGPU surface binding for browsers.                                                   |
| `host/`                            | High-level TypeScript ecosystem (`@galfus/engine`, `@galfus/ui`, `@galfus/demos`, `@galfus/gltf-loader`, etc.).  |
| `scripts/codegen`                  | Multi-language code generator using the Strategy pattern.                                                        |
| `sdk/`                             | Generated client SDKs (`sdk/c`, `sdk/csharp`, `sdk/python`, `sdk/lua`, `sdk/typescript`, `sdk/bun`, `sdk/node`). |
| `host/demos`                       | Interactive realtime demonstration suite (3D PBR, SSAO, portals, 2D shadows, multiverse).                        |

---

## Multi-Language SDK Generation

Galfus uses a centralized, specification-driven code generator (`scripts/codegen.ts`) implementing the Strategy pattern to generate idiomatic bindings for multiple programming languages and Browser/WASM:

- **C / C++**: `sdk/c/galfus.h`
- **C# / MonoDevelop**: `sdk/csharp/Galfus.cs`
- **Python**: `sdk/python/galfus.py`
- **LuaJIT**: `sdk/lua/galfus.lua`
- **TypeScript**: `sdk/typescript/galfus.ts`
- **Browser/WASM**: `sdk/browser/galfus.ts`
- **Bun FFI**: `sdk/bun/galfus.ts`
- **Node.js (Node-API)**: `sdk/node/galfus.ts`

To regenerate all SDKs after specification changes:

```bash
bun run codegen
```

---

## Building and Verification

### Prerequisites

- **Rust**: Stable toolchain (edition 2024)
- **Bun**: Fast JavaScript runtime and package manager
- **Vulkan / Metal / DX12** compatible GPU driver

### Build Commands

```bash
# Compile the native dynamic library
cargo build -p galfus-native

# Run the complete workspace test suite
cargo test --workspace

# Full workspace validation (formatting, file-length policy, TypeScript, Cargo check, native & WASM Clippy)
bun run validate

# Comprehensive C-ABI / Bun FFI test suite
bun run test:ffi
```

### Running Realtime Demos

```bash
# Launch interactive demo launcher
bun demo

# Run a specific demo by ID (e.g. 3d15 POM or 2d4 Tilemap2D)
bun demo 3d15
bun demo 2d4
```

---

## Documentation

- [docs/host-tutorial.md](docs/host-tutorial.md) — High-level TypeScript host architecture & tutorial (`@galfus/engine`).
- [host/engine/README.md](host/engine/README.md) — `@galfus/engine` quick starts and API guide.
- [ARCH.md](ARCH.md) — Comprehensive architectural specification and proof of implementation.
- [docs/shader-effects/README.md](docs/shader-effects/README.md) — Shader Effects architecture and contracts.
- [docs/shader-effects/screen-effects.md](docs/shader-effects/screen-effects.md) — Screen post-processing tutorial.
- [docs/shader-effects/surface-effects.md](docs/shader-effects/surface-effects.md) — 3D PBR Surface Effects tutorial.

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, coding guidelines, and the Pull Request workflow.

## License

Galfus Engine is licensed under the [Apache License 2.0](LICENSE).
