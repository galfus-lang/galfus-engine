# galfus-core

Foundational, domain-neutral primitives, generational handles, and identity validation machinery for the Galfus Engine.

## Responsibilities

- **Generational Handle Machinery**: Provides lightweight `Handle<T>` primitives combining slot indices with generation counters to ensure stale-handle detection and memory safety without garbage collection overhead.
- **Identity & Logical ID Policy**: Enforces the engine-wide ID reservation policy, verifying that host-allocated logical IDs never collide with core-reserved ranges.
- **Deterministic Content Hashing**: Supplies fast, collision-resistant hashing primitives for pipeline state objects, shader snippet deduplication, and asset caching.
- **Foundational Error Models**: Defines core error traits, categories, and result types shared across all engine crates.

## Capabilities & Powers

- **Type-Safe Generational Handles**: Generates and validates handles with generational stamping, preventing use-after-free bugs when resources are recycled.
- **Logical ID Range Enforcer**:
  - Strictly reserves the highest 65,535 IDs (`4294901761..=4294967295` for `u32`) for internal engine infrastructure (such as dynamic SVG materials, synthetic gizmos, and fallback textures).
  - Validates all host-supplied IDs at crate boundaries, rejecting reserved range violations before commands reach the renderer.
- **Fast Content Fingerprinting**: Computes 64-bit deterministic hash fingerprints for dynamic WGSL shader snippets and composite pipeline states.
- **Zero Heavy Dependencies**: Completely decoupled from graphics APIs, windowing libraries, and file I/O, compiling in milliseconds and forming the base of the entire dependency graph.

## Invariants & Design Principles

- **Strictly Domain-Agnostic**: Contains zero knowledge of GPU abstractions (`wgpu`), 2D/3D geometry, window surfaces, or multiverse render graphs.
- **Decentralized Storage**: Defines the identity and handle primitives, but does not maintain a central global registry. Each downstream crate maintains its own localized, cache-friendly storage.
