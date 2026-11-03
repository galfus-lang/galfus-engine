# @galfus/transport-browser

Browser and WebAssembly (WASM) transport backend for **Galfus Engine** running on modern WebGPU-enabled browsers.

---

## Overview

`@galfus/transport-browser` loads the compiled `galfus_browser.wasm` module and binds WebGPU canvas surfaces directly to the Galfus multiverse render graph.

---

## Features

- **WebAssembly & WebGPU**:
  - Compiles the full Galfus graphics core into WASM via `wasm-bindgen`.
  - Interfaces directly with `navigator.gpu` and HTML5 canvas contexts.
- **Strict `requestAnimationFrame` Cadence**:
  - Exclusively driven by the browser's native `requestAnimationFrame` loop.
  - Zero timer-based (`setTimeout`) fallbacks, ensuring tear-free presentation synchronized to display refresh rates.
- **Browser Audio Context**:
  - Bridges the host audio manager with the Web Audio API for spatial audio playback and positional attenuation.
- **Factory API**:
  - `createBrowserTransport(options?: BrowserTransportInitOptions): Promise<BrowserTransport>`
  - Asynchronously compiles the WASM binary and returns an initialized transport ready for runtime consumption.

---

## Usage

```typescript
import { createBrowserTransport } from '@galfus/transport-browser';

// Initialize the browser WASM transport
const transport = await createBrowserTransport({
  canvas: document.getElementById('render-canvas') as HTMLCanvasElement
});

console.log('Browser transport ready:', transport.isReady);
```
