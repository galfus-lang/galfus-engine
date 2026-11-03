# @galfus/transport-bun

High-performance native transport backend for **Bun** using direct FFI bindings (`bun:ffi`) to link against `libgalfus_native.so`, `galfus.dll`, or `libgalfus_native.dylib`.

---

## Overview

`@galfus/transport-bun` provides zero-overhead interoperability between Bun and the Galfus native core. Hot-path spatial operations (transforms, matrices, look-at queries) use direct memory pointer buffers, bypassing JSON marshalling completely.

---

## Features

- **Direct Bun FFI Integration**:
  - Dynamically loads the pre-compiled `galfus-native` shared library.
  - Zero-copy C struct and pointer marshalling for high-frequency transforms.
- **Factory API**:
  - `createBunTransport(options?: TransportInitOptions): Promise<BunTransport>`
  - Asynchronously initializes the native platform and display capabilities, returning a transport that is immediately `ready`.
- **Target FPS & Loop Timing**:
  - Precision sleep-based microsecond loop timer supporting target frame rates (e.g. 60, 120 FPS).
  - Unclamped real `deltaMs` metrics.
- **Headless & Server Support**:
  - Supports headless execution for server-side rendering, CI test suites, and offscreen compute passes.

---

## Usage

```typescript
import { createBunTransport } from '@galfus/transport-bun';

// Create and initialize the transport backend
const transport = await createBunTransport({
  targetFps: 120,
  headless: false
});

// Access capabilities and engine bindings
console.log('Capabilities:', transport.capabilities);
transport.engine.multiverseCreateTarget(1, { kind: { type: 'window', windowId: 1 } });
```
