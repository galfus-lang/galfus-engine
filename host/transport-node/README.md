# @galfus/transport-node

Native transport backend for **Node.js** and Node-API environments using the compiled native addon `galfus.node`.

---

## Overview

`@galfus/transport-node` links standard Node.js runtimes with the Galfus native core through pre-compiled Node-API (N-API) bindings. It exposes identical interfaces to `@galfus/transport-bun`, ensuring cross-runtime compatibility.

---

## Features

- **Node-API Native Addon**:
  - Loads `galfus.node` dynamically from the local distribution or compiled targets.
  - ABI-stable cross-platform execution across Node.js versions without runtime recompilation.
- **Factory API**:
  - `createNodeTransport(options?: TransportInitOptions): Promise<NodeTransport>`
  - Asynchronously verifies native platform initialization and returns a ready transport instance.
- **Precision Loop Management**:
  - Microsecond-accurate frame loop driver with unclamped delta tracking and cancellation tokens.
- **Headless Mode**:
  - Full headless support for continuous integration, visual regression pipelines, and backend simulation servers.

---

## Usage

```typescript
import { createNodeTransport } from '@galfus/transport-node';

// Create ready transport instance
const transport = await createNodeTransport({
  targetFps: 60,
  headless: true
});

console.log('Node transport initialized:', transport.isReady);
```
