# galfus-realm-core

Abstract Realm execution contracts and graphics execution contexts.

## Responsibilities

- **The `Realm` Contract**: Defines the fundamental trait implemented by a graphics-producing unit participating in the Multiverse graph.
- **Two-Phase Execution Protocol**: Enforces a strict separation between resource preparation (`prepare`) and command recording (`render`).
- **Reference Realm Implementation**: Provides `ColorRealm`, a minimal realm useful for graph and invocation tests.

## Capabilities & Powers

- **Universal Polymorphic Realm Trait**:
  - `id()` and `kind()`: Identify the realm and its category.
  - `prepare(&mut self, &RealmPrepareContext)`: Runs once per dispatched frame with the device, queue, timing data, and a shared-texture resolver.
  - `render(&mut self, &RealmInvocationContext)`: Runs for each invocation with its target texture view, viewport, camera slot, and optional TAA jitter.
  - `clear(&mut self)`: Optional hook for clearing realm-owned scene state while retaining its registration.
  - `destroy(&mut self)`: Optional hook for releasing realm-owned resources before unregistration.
- **Structured execution contexts**:
  - `RealmPrepareContext` supplies the device, queue, frame ID, delta time, and texture resolver.
  - `RealmInvocationContext` supplies the device, queue, output texture view and format, pixel viewport, target/invocation IDs, camera slot, and optional TAA jitter.
- **Built-in `ColorRealm`**:
  - A minimal test realm that records render count and last viewport. It does not issue a color draw pass.

## Invariants & Design Principles

- **Implementation Agnostic**: Contains no concrete 2D sprite rendering or 3D PBR shader logic.
- **No Graph Scheduling**: Defines the contracts that nodes fulfill, but does not own dependency analysis, cycle detection, or scheduling (owned exclusively by `galfus-multiverse`).
