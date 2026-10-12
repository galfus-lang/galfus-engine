# galfus-core

Foundational, domain-neutral primitives and identity machinery for the Galfus Engine.

## Responsibilities

- **Generational Handles**: Primitives for handle representations (slot, generation, namespace/registry identifiers) and stale-handle detection.
- **Identity & ID Validation**: Deterministic content ID hashing, collision detection, and host logical ID range validation (enforcing reservation policies).
- **Core Error Primitives**: Domain-agnostic error categories and result definitions.
- **Fundamental Primitives**: Shared mathematical/utility building blocks devoid of domain assumptions.

## Invariants & Non-Goals

- **Domain Agnostic**: Must not know about graphics, GPU concepts (`wgpu`), windows, surfaces, meshes, textures, or render graphs.
- **Not a Central Registry**: Defines the _primitives_ for handles and registries, but does not maintain central global storage for engine resources. Each subsystem manages its own registries.
- **Zero Heavy Dependencies**: Kept minimal, fast to compile, and foundational across the entire engine.
