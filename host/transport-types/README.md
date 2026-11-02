# @galfus/transport-types

Canonical TypeScript definitions, transport contracts, timing models, loop interfaces, and ID reservation policies for the **Galfus Engine** host ecosystem.

---

## Overview

`@galfus/transport-types` acts as the single source of truth for interfaces and policies shared across all transport backends (`@galfus/transport-bun`, `@galfus/transport-node`, `@galfus/transport-browser`) and the high-level `@galfus/engine` runtime.

---

## Key Modules & Responsibilities

- **`GalfusTransport` Contract**:
  - Defines the unified transport backend contract (`engine`, `init()`, `dispose()`, `isInitialized`, and `isDisposed`).
  - Standardizes asynchronous lifecycle initialization across native FFI, Node-API, and Browser WebAssembly.

- **Loop & Timing Infrastructure (`EngineLoopController`)**:
  - Deterministic frame timing, delta tracking, and pause/resume mechanics.
  - Token-based execution generations prevent concurrent loops across `stopLoop()` and `startLoop()` cycles.
  - Native target FPS regulation with real, unclamped `deltaMs` measurements.

- **Logical ID Reservation Policy**:
  - Enforces the core-reserved ID range (`4294901761..=4294967295` / `u32::MAX - 65535 + 1 ..= u32::MAX`).
  - Exposes `assertValidLogicalId(id)` and `isValidLogicalId(id)` to reject invalid host IDs before reaching the native ABI.

- **Canonical Engine SDK & Descriptors**:
  - Complete TypeScript interfaces for 2D/3D realms, multiverse composition, materials, lights, cameras, particles, and spatial audio.
  - Error definitions (`GalfusTransportError`, `GalfusLoopError`, `GalfusPolicyError`).

The redundant `start()` and `stop()` transport aliases have been removed. Use
`startLoop()` and `stopLoop()` on a transport, or `start()`, `pause()`, and `stop()`
on the high-level runtime.
