# Galfus Engine Architecture

> **Status: proposed redesign.** This is the target architecture for the Galfus refactor, not a description of APIs already shipped. Specific Rust traits, ABI signatures, and feature names are intentionally left open until the contracts are designed and validated.

## 1. Scope and architectural goals

Galfus is a **host-agnostic graphical systems library**. It supplies platform adapters, GPU resource facilities, graphics-producing realms, and graph coordination. The host remains responsible for the application lifecycle and for defining application logic and custom shaders.

The redesigned architecture replaces centralized serialized message pools with **direct, contract-based interaction**. Modules remain separate Rust crates for development and testing, but are **linked into one native shared library** per selected build configuration. The browser distribution uses WASM and JS bindings.

### Core invariants

1. **Host ownership:** the host initiates setup, polling, frame execution, and teardown.
2. **Contract boundaries:** a module may depend on a shared contract but not another module's private implementation or internal state.
3. **Local resource ownership:** each subsystem is responsible for creating, validating, and releasing its own resources.
4. **Shared identity scheme:** common handle primitives permit cross-module references; handles do not imply unrestricted access or ownership.
5. **No central command mailbox:** synchronous operations use typed methods and return results directly. Event queues and GPU submission queues are distinct, valid mechanisms.
6. **Graphics graph orchestration:** the multiverse owns registrations, invocations, dependency ordering, and execution; realms, invocations, and targets carry out their specialized work.
7. **Platform capability awareness:** normalized APIs disclose platform-specific availability and restrictions instead of silently pretending all environments are equivalent.
8. **Single binary boundary:** one native library is produced per build; internal crate modularity does not imply individual DLLs.

## 2. Modules and boundaries

### `galfus-core`

Foundational, domain-neutral machinery: ID generation rules, generational handles, namespace/registry identity, overflow and stale-handle detection, basic error categories, and small shared primitives.

**Owns:** the _definition_ of the identity mechanism, not every resource registry in the engine.

**Must not know:** realms, windows, meshes, textures, or graph operations.

**Important distinction:** deterministic content IDs and short-lived resource handles solve different problems. Content ID hashing must detect actual collisions; resource handles should identify a registry/namespace plus slot and generation (or a comparably robust scheme). The exact bit layout is deliberately not fixed here. Wrapping generations or namespace reuse must not silently validate stale references.

### `galfus-platform`

Normalizes interaction with the execution environment through capabilities and adapters:

- Window and surface integration on desktop (`winit`).
- Canvas/DOM surfaces and input on browsers.
- Keyboard, pointer, touch, and controller input where available.
- Window/surface changes and standardized event types.
- Native audio on desktop and Web Audio in browsers.
- Optional headless/no-window execution.

**Owns:** platform resources, event normalization, and platform service contracts.

**Does not own:** application timing, scene state, render graphs, or GPU resources.

The host drives event processing. On desktop, the implementation must respect `winit` event-loop/thread-affinity constraints; its polling behavior and potential blocking must be part of the host contract. On the web, DOM/canvas setup and audio activation can require host/user interaction. A normalized event need not erase source capabilities or metadata.

### `galfus-gpu-manager`

Provides a shared `wgpu` resource context and allocation services:

- Device, queue, capabilities, and GPU failure/device-loss handling.
- Buffers, textures, texture views, samplers, and related lifetimes.
- Upload/update services and memory/resource accounting as supported.
- Optional atlas, texture-array, pooling, suballocation, and paging strategies.
- Facilities needed to create/retain host-authored shader modules and pipelines.

**Owns:** the GPU resources and their lifetimes or explicitly delegated leases.

**Does not own:** mesh semantics, sprite behavior, realm ordering, or application shaders' source code.

**Non-goal:** making all textures use an atlas. Render attachments, depth buffers, compressed/mipmapped textures, cubemaps, and storage textures have different usage constraints. “Paging” must be defined precisely before implementation (atlas pages, logical residency management, and virtual textures are not interchangeable).

A logical graphics context must be shared or passed explicitly, not silently duplicated by consumers. It is acceptable to support more than one context in the future, but handles must be scoped to the correct one.

### `galfus-realm-core`

Defines a **Realm** as a graphics-producing unit with declared capabilities, typed inputs and outputs, and operations that participate in graph execution.

Candidate contract concerns, **not final trait methods**:

- Realm metadata and declared ports.
- Resource acquisition/release under caller-controlled lifecycle.
- Preparation and execution within a supplied graphics context.
- Output descriptions (format, dimensions/extent, usage, sample count, synchronization requirements).
- Errors and readiness conditions.

`galfus-realm-core` does not depend on concrete 2D/3D implementations. Runtime-independent traits are for Rust linkage; a stable C ABI is defined separately at the binding boundary.

### `galfus-realm-2d` / `galfus-realm-3d`

Concrete implementations of the Realm contract. Each independently interprets its graphical state and renders through GPU contracts.

- `galfus-realm-2d`: 2D rendering and related execution state.
- `galfus-realm-3d`: 3D rendering and related execution state.

Neither implementation is hardcoded into graph validation or scheduling. Optional crate features may exclude either implementation from the packaged binary.

### `galfus-realm-2d-resources` / `galfus-realm-3d-resources`

Provide **raw, composable domain resources**, for example primitives, configurable material descriptors, and particle system building blocks. These crates define domain-specific structures and behaviors, while the GPU manager handles GPU allocation and resource lifetime. The host may author custom shaders and construct higher-level workflows from these primitives.

These crates are not automatically separate shipping artifacts.

### `galfus-multiverse`

Owns **the graph of realms, invocations, and targets** and performs:

- Registration and validation of graph entities and their handles.
- Invocation routing, viewport clipping, and presentation order (`z_index`).
- Inter-target texture bindings (`TargetTextureBinding`) for realms consuming rendered targets (e.g. portals, mirrors).
- Execution ordering and post-processing filter pass dispatch (`InvocationFilter`).
- Graph traversal, dispatch of realm rendering, and target presentation.

**Does not own:** the application loop, OS event loop, scene-specific algorithms, or raw shader compiler implementations.

There is **no `galfus-draw` crate** in this design. Multiverse coordinates graph execution, while invocations dispatch realm output to targets with optional filter chains.

## 3. Conceptual graph model

```text
Realm A: 3D world  -- Invocation (viewport, filters) ----+--> Target: window
Realm B: 2D HUD    -- Invocation (viewport, blend) ------+
Target: offscreen  -- TargetTextureBinding ------------> Realm C: portal surface
```

The entities have distinct semantics:

| Concept                    | Meaning                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Realm**                  | A stateful graphics-producing unit implementing the shared realm contract.                                                                                           |
| **Target**                 | A destination abstraction such as a window surface or offscreen texture; owns presentation and resolution.                                                          |
| **Invocation**             | The mapping that renders a Realm into a Target, specifying viewport, stacking order (`z_index`), and post-processing filters (`InvocationFilter`).                   |
| **TargetTextureBinding**   | A declaration allowing a Realm to consume a rendered Target's texture as input (e.g. mirrors, security cameras, portals).                                            |
| **Multiverse**             | The owner of graph structure, validity, scheduling, and execution order.                                                                                             |

A graph may produce multiple outputs and use intermediate textures. Output contracts should not assume every realm produces only one RGBA image. Depth, masks, multiple render attachments, and other compatible GPU outputs may be supported as contracts evolve.

Acyclic dependencies can be topologically ordered. Feedback paths, if ever supported, require explicit previous-frame/double-buffered semantics rather than accepting undefined cycles. Graph mutation should invalidate any cached execution plan.

## 4. Host-controlled lifecycle

The host owns setup, the update cadence, frame requests, and shutdown. A conceptual native-host flow:

```text
Host starts
  -> create platform capabilities/surfaces
  -> initialize shared GPU context when needed
  -> instantiate realms, targets, invocations
  -> register graph with multiverse

For each host-selected frame:
  -> poll/receive normalized platform events
  -> update application state and custom resources
  -> validate/rebuild graph plan if invalidated
  -> multiverse executes realms and invocation filters in dependency order
  -> targets resolve/present their outputs

Host shuts down
  -> release graph entities and resource leases
  -> release GPU resources and platform services
```

This is a **conceptual sequence**, not a fixed public call API. A host may use an alternative valid ordering required by its platform, and web callbacks/event delivery differ from desktop pumping.

The engine can use internal readiness work, GPU queues, or event buffering without reintroducing a mandatory central message dispatcher. Results/errors for direct operations should be returned through explicit contract mechanisms.

## 5. Cross-module contracts and ownership

Modules can communicate through explicit Rust traits/interfaces and shared types within the **single linked binary**. This differs from a plugin system where independently built DLLs must exchange Rust trait objects: **cross-DLL Rust ABI stability is not a requirement here**.

### Handle model

- `galfus-core` defines how handles are represented and validated.
- A resource's **owner module** allocates and resolves its registry entries.
- Handles may be passed to other modules or via the host as _references_.
- Consumers access functionality via an authorized owner-provided contract; a handle alone is not a pointer, lease, or ownership transfer.
- Registry identity, generation, type, and context checks must reject stale, mismatched, or forged handles as appropriate.
- The exact bit allocation and approach to collision checking are deferred until registry-scale and concurrency requirements are established.

Example: Platform owns a surface/window handle; a target can refer to it, but surface access and presentation still go through platform/GPU capabilities with platform thread-affinity rules enforced.

### Resource lifetime

Destroying a graph node is not necessarily equivalent to immediately destroying all GPU storage it references. Ownership, leases, in-flight GPU submissions, and delayed reclamation must be accounted for in the resource contracts. The proposed API should make explicit whether removal invalidates dependent graph nodes or causes validation errors.

### Threading

The host controls invocation, but not every operation can run from any thread. In particular, desktop windowing often has main-thread constraints. GPU/resource operations must follow the chosen `wgpu` and platform contracts. Host-agnostic does **not** mean thread-affinity-free.

## 6. GPU and host-authored shaders

The host creates application-specific visual logic and custom WGSL/shader definitions; Galfus provides raw resource and execution mechanisms. Built-in realms may still need small internal shaders and standard pipelines to implement their promised primitives or composition.

Shader/pipeline creation, caching, validation, and GPU error reporting must use the GPU manager's contracts. A realm may request pipelines and buffers without owning a second, hidden `wgpu::Device`.

Atlas and paging policies should be opt-in or selected by resource requirements, not imposed on all textures.

## 7. Platform and browser adapter model

`galfus-platform` exposes a normalized contract and capability discovery:

| Capability       | Desktop                                    | Browser                               |
| ---------------- | ------------------------------------------ | ------------------------------------- |
| Surface          | `winit` windows                            | Canvas/DOM                            |
| Input/events     | Native platform sources                    | Browser event APIs                    |
| Peripherals      | OS-dependent devices                       | Browser-permitted APIs                |
| Graphics         | `wgpu` native backends                     | `wgpu` WebGPU backend where available |
| Audio            | Existing native audio integration/adapters | Web Audio API                         |
| Lifecycle driver | Host event/update loop                     | Host/browser callbacks                |

On browser targets, WebAssembly and JavaScript glue are required for some browser APIs. User-gesture restrictions (notably audio), permission rules, feature availability, and surface ownership are surfaced rather than hidden. The platform module should gracefully report unsupported capabilities.

Headless operation should remain possible without manufacturing a fake window, provided the requested GPU workload is supported.

## 8. Build and distribution model

### Internal code modularity

Nine principal crates:

```text
crates/
  galfus-core/
  galfus-platform/
  galfus-gpu-manager/
  galfus-realm-core/
  galfus-multiverse/
  galfus-realm-2d/
  galfus-realm-3d/
  galfus-realm-2d-resources/
  galfus-realm-3d-resources/
```

### External packaging boundary

```text
bindings/
  galfus-native/  -> one shared library with a C-compatible FFI surface
  galfus-web/     -> WASM + JavaScript bindings
```

Exact workspace paths are provisional.

Native artifacts per selected target:

- Windows: `galfus.dll`
- Linux: `libgalfus.so`
- macOS: `libgalfus.dylib`

The browser build yields `galfus.wasm` plus JavaScript bindings. It does not use the native shared-library ABI directly.

Optional Cargo features can select realm implementations. Feature choice occurs **at build time**, not by loading a second realm DLL at runtime. A small 2D-only build excludes 3D implementations and their exclusive dependencies, subject to link-time verification.

The public native API should expose a versioned C ABI suitable for Bun FFI and other foreign-language callers, with explicit memory ownership, struct layout/versioning, string/buffer conventions, error reporting, and handle lifetime rules. Designing that ABI is a separate next step; this document does not freeze specific symbols.

## 9. Dependency direction

The desired dependency policy is **acyclic and contract-oriented**:

- `galfus-core` is minimal and knows no graphics or platform domain.
- `galfus-realm-core` describes the realm contract without knowing concrete realms.
- `galfus-multiverse` depends on contracts, not on hard-coded `galfus-realm-2d` / `galfus-realm-3d` implementations.
- Concrete realms implement contracts and use GPU services through their public interfaces.
- Resource crates supply domain primitives without becoming global GPU allocators.
- `galfus-platform` does not depend on the multiverse, game state, or render graphs.
- The native/web packaging layer composes the selected modules and exposes the host-facing API.

Some contracts may need shared GPU surface/format types. Place these at the lowest appropriate shared boundary rather than introducing circular crate dependencies. Not every conceptual module must map to exactly one trait.

## 10. Migration from the existing architecture

This is a redesign plan, not an in-place refactor already completed.

1. **Inventory ownership and dependencies** in the current runtime and binding code.
2. **Define shared identity and contracts** for platform, GPU, realms, invocations, and targets.
3. **Extract platform and GPU services** while maintaining existing `winit` and `wgpu` behavior.
4. **Move graph coordination into multiverse** and preserve current realm/target/invocation capabilities where compatible with the new contracts.
5. **Replace message-pool entry points** with direct typed native operations; develop the C ABI for FFI hosts separately.
6. **Build one native artifact** with optional 2D/3D compilation features, and a separate WASM/browser packaging path.
7. **Validate integration** across Windows, macOS, Linux (including window-system differences), browser, and headless modes where supported.

### Decisions intentionally not finalized

- Public Rust trait signatures and exported C symbols.
- Exact handle width/layout, namespace assignment, and registry concurrency model.
- Specific audio backend crate for each native target.
- Target presentation interfaces and synchronization reporting requirements.
- Final feature names and repository paths.
- Fine-grained GPU atlas/paging implementation and resource residency policies.
- The precise split between direct host API calls and optional batched GPU uploads.

These should be resolved after validating module responsibilities and cross-platform constraints, without reintroducing a centralized command/message architecture.
