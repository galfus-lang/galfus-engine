# Galfus Engine

**A host-agnostic, modular graphics foundation for native and web applications.**

> **Architecture proposal:** This document describes the intended Galfus Engine redesign. It is a design target, not a claim that every API or module is implemented in the current repository.

Galfus provides low-level graphics building blocks, resource management, platform integration, and a graph-based way to combine graphical worlds. It is not tied to a game loop, an entity-component system (ECS), or a particular host language.

An application owns its lifecycle and decides when to process events, update its state, and render. Galfus provides the capabilities needed to do that work, without dictating how the application itself is structured.

## Design principles

- **Host-owned lifecycle:** The host initializes, drives, and shuts down Galfus. No engine-owned application or game loop is imposed.
- **Host-agnostic core:** Native Rust applications, Bun, other FFI-capable runtimes, and browser applications can use appropriately packaged bindings.
- **One native library per build:** Internal Rust crates are compiled into a single shared library (`.dll`, `.so`, or `.dylib`), rather than separate runtime-loaded libraries for each module.
- **Modular internals:** Components communicate through explicit contracts and typed operations, without depending on each other's implementation details.
- **Direct operations:** The former centralized message pool and MessagePack-based command dispatch are not part of the new internal execution architecture.
- **Extensible realms:** A realm is a graphics-producing unit implementing a common contract. Built-in 2D and 3D realms are implementations, not special cases in the coordinator.
- **Host-authored shaders:** The host supplies custom shaders and their configuration. Galfus provides the raw graphics infrastructure and resource management necessary to use them.
- **Portable platform semantics:** Desktop and browser adapters expose normalized capabilities, input events, surfaces, and audio services while preserving meaningful platform differences.
- **Shared GPU resources:** A GPU manager owns device-level resources and allocation strategies without requiring knowledge of 2D or 3D scene semantics.

## High-level architecture

```text
                        APPLICATION / HOST
          Bun / Rust / other native host / Browser
         lifecycle · update logic · custom shaders
                              |
                   Direct API / host bindings
                              |
+-----------------------------------------------------------+
|                       GALFUS ENGINE                       |
|                                                           |
|                  galfus-multiverse                         |
|      realms · targets · connectors · graph execution       |
|                      /           \                         |
|             galfus-realm-2d   galfus-realm-3d              |
|                    |               |                      |
|         galfus-realm-2d-   galfus-realm-3d-                |
|             resources         resources                   |
|                                                           |
|     galfus-platform           galfus-gpu-manager          |
|     surfaces · input          wgpu · buffers · textures    |
|     events · audio            atlases · allocation        |
|                                                           |
|       galfus-realm-core       galfus-core                  |
|       realm contracts         IDs · handles · primitives  |
+-----------------------------------------------------------+
               |                           |
     desktop / browser APIs        wgpu graphics backends
```

The diagram is conceptual: it illustrates responsibilities, not a requirement that every crate depend directly on every other crate.

## Modules

| Crate                       | Responsibility                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `galfus-core`               | Common identifiers, generational handle primitives, collision/overflow checks, basic errors, and foundational contracts.                         |
| `galfus-platform`           | Normalize host/platform interaction: surfaces, windows/canvas, input, peripherals, events, audio, and capability reporting.                      |
| `galfus-gpu-manager`        | Manage shared `wgpu` contexts and resources, including buffers, textures, views, samplers, atlases, and allocation/paging strategies.            |
| `galfus-realm-core`         | Define realm contracts, inputs, outputs, execution context, and lifecycle hooks controlled by the host/coordinator.                              |
| `galfus-multiverse`         | Own the graphics graph: realm/target/connector registrations, dependency validation, scheduling, graph execution, and presentation coordination. |
| `galfus-realm-2d`           | Implement 2D graphical processing and rendering using the realm contract.                                                                        |
| `galfus-realm-3d`           | Implement 3D graphical processing and rendering using the realm contract.                                                                        |
| `galfus-realm-2d-resources` | Provide raw 2D resources such as primitives, material descriptors, and particle building blocks.                                                 |
| `galfus-realm-3d-resources` | Provide raw 3D resources such as geometry primitives, material descriptors, and particle building blocks.                                        |

`galfus-realm-*-resources` are code-level modules; they do not need to be separate dynamic libraries.

## How rendering works

The host decides when a frame occurs. During a frame:

1. The host obtains normalized platform events and updates its application state.
2. The host modifies realms, resources, targets, and connections through direct APIs.
3. The host asks the multiverse to execute the graphics graph.
4. The multiverse validates dependencies and orders the required work.
5. Realm implementations produce graphics outputs; connectors perform the required composition or transformations.
6. Targets receive the outputs and handle their destination-specific operations, including presentation where applicable.

The **multiverse coordinates and executes the graph**; it does not need to know how a 2D sprite, 3D mesh, or custom shader is implemented. **Connectors and targets perform composition and destination-specific work** under that coordination. A separate `galfus-draw` module is not planned.

## Platform support

Galfus targets a consistent _contract_, not identical platform behavior:

| Environment             | Platform integration                      | Graphics                               | Audio                  |
| ----------------------- | ----------------------------------------- | -------------------------------------- | ---------------------- |
| Windows / Linux / macOS | `winit` and native peripheral integration | `wgpu`                                 | Native audio adapter   |
| Browser                 | Canvas, DOM, and browser input APIs       | `wgpu` on WebGPU-capable browsers      | Web Audio API          |
| Headless                | No required window or canvas              | Offscreen GPU execution when supported | Optional / unavailable |

The browser target is packaged as **WebAssembly with JavaScript bindings**, not as a native DLL. Features such as unrestricted window creation, audio startup, and GPU availability depend on the environment and must be queried through capabilities.

## Packaging

The intended output is **one native shared library for each build and supported target**:

- Windows: `galfus.dll`
- Linux: `libgalfus.so`
- macOS: `libgalfus.dylib`
- Browser: `galfus.wasm` plus JavaScript bindings

Cargo features can control inclusion of optional implementations, such as `realm-2d` and `realm-3d`. A 2D-only build should not need to link the 3D implementation. The precise feature names and binary API are to be finalized.

The native shared library exposes an explicitly versioned **C-compatible ABI** for FFI hosts. Rust consumers may also use Rust-facing interfaces. Native Rust traits and Rust-owned references are not assumed to have a stable cross-language ABI.

## What Galfus does not impose

Galfus does **not** require a specific ECS, scene authoring format, scripting runtime, application loop, game framework, or default gameplay architecture. It provides raw graphic capabilities and composable execution primitives so the host can make those choices.

## Project status and documentation

This README describes the **planned refactored architecture**. Public API signatures, crate boundaries, feature flags, and compatibility guarantees remain subject to implementation and testing.

For module boundaries, handles, ownership, graph semantics, platform contracts, and integration details, see [ARCH.md](ARCH.md).
