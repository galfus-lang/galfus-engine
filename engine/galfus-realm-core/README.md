# galfus-realm-core

Abstract Realm execution contracts, port specifications, and graphics execution contexts.

## Responsibilities

- **The `Realm` Contract**: Defines the fundamental trait implemented by any graphics-producing unit (2D, 3D, compute, or synthetic) participating in the multiverse graph.
- **Two-Phase Execution Protocol**: Enforces a strict separation between resource preparation (`prepare`) and command recording (`render`).
- **Port & Attachment Descriptors**: Declares input/output port formats, color spaces, depth attachments, and multi-sampling requirements.
- **Reference Realm Implementations**: Provides foundational reference realms (such as `ColorRealm`) for solid fills, clear coats, and validation.

## Capabilities & Powers

- **Universal Polymorphic Realm Trait**:
  - `prepare(&mut self, device, queue, ...)`: Uploads buffers, compiles dirty materials, and synchronizes textures before render passes begin.
  - `render(&self, ctx: &mut RealmContext)`: Records draw commands into the provided `wgpu::CommandEncoder` targeting the resolved viewport and output texture view.
  - `clear(&mut self)`: Clears entity and scene state without destroying long-lived GPU pipeline caches.
  - `destroy(&mut self)`: Releases all GPU buffers, bind groups, and pipelines associated with the realm.
- **Structured Execution Context (`RealmContext`)**:
  - Supplies the active `wgpu::CommandEncoder`, resolved target `wgpu::TextureView`, optional depth view, pixel viewport rect, frame index, and elapsed delta time.
- **Built-in `ColorRealm`**:
  - Extremely fast, zero-overhead realm for background fills, solid color clearing, and multiverse DAG dependency testing.

## Invariants & Design Principles

- **Implementation Agnostic**: Contains no concrete 2D sprite rendering or 3D PBR shader logic.
- **No Graph Scheduling**: Defines the contracts that nodes fulfill, but does not own dependency analysis, cycle detection, or scheduling (owned exclusively by `galfus-multiverse`).
