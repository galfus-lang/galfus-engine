# galfus-browser

WebAssembly packaging boundary and JavaScript/TypeScript integration layer for modern web browsers.

## Responsibilities

- **WebAssembly Packaging**: Compiles internal engine components into a high-performance WebAssembly (`.wasm`) module via `wasm-bindgen` (`cdylib`).
- **Zero-Copy Object Marshalling**: Marshals engine configurations, platform capabilities, and flat event queues directly to/from native JavaScript objects using `serde-wasm-bindgen` without intermediary JSON string formatting.
- **Web Platform & Canvas Surface Integration**: Bridges browser DOM `<canvas>` elements to WebGPU rendering surfaces, handling viewport resizing, high-DPI scaling, and canvas destruction.
- **Browser Event Normalization**: Drains and normalizes browser pointer, keyboard, and window events into Galfus platform event arrays on the JavaScript main thread.
- **Web Audio & Autoplay Lifecycle**: Coordinates audio playback, voice management, real-time volume/panning modulation, and gracefully handles browser user-gesture activation constraints.
- **Gamepad & Haptics Bridge**: Interfaces with the HTML5 Gamepad API, exposing connected gamepads and driving dual-motor rumble haptics.

## Capabilities & Powers

- **GalfusBrowser Controller**:
  - `new()`: Initializes the platform context within the browser window.
  - `newHeadless()`: Initializes a headless context suitable for Web Workers, background compute, or automated testing environments.
  - `getCapabilities()`: Returns detailed host runtime capabilities (GPU backend, compute shader support, audio channels, gamepad availability) as a typed JavaScript object.
- **Canvas & Surface Management**:
  - `createWindow(config)`: Binds to a DOM canvas element and registers a logical window surface ID.
  - `closeWindow(windowId)`: Unbinds the canvas and releases associated GPU surface swapchains.
  - `setWindowTitle(windowId, title)`: Updates the document or canvas accessibility title.
- **Normalized Event Polling**:
  - `pumpEvents()`: Drains all pending platform events into an idiomatic JavaScript array of discriminated objects:
    ```typescript
    type PlatformEvent =
      | { kind: 'window'; type: 'resized'; width: number; height: number }
      | { kind: 'pointer'; type: 'move' | 'down' | 'up'; x: number; y: number }
      | { kind: 'keyboard'; type: 'keyDown' | 'keyUp'; key: string }
      | { kind: 'gamepad'; type: 'connected' | 'disconnected'; id: number };
    ```
- **Web Audio Engine**:
  - `audioPlaySound(soundId, volume, panning, speed, looping)`: Spawns an active playback voice and returns its logical `voiceId`.
  - `audioPauseSound(voiceId)` & `audioResumeSound(voiceId)`: Pauses and resumes voice playback without losing playback position.
  - `audioStopSound(voiceId)`: Immediately terminates voice playback.
  - `audioSetVolume(voiceId, volume)` & `audioSetPanning(voiceId, panning)`: Dynamic real-time spatialization adjustments.
  - `audioUnloadSound(soundId)`: Reclaims decoded audio buffer memory.
- **Gamepad & Rumble**:
  - `gamepadGetConnected()`: Discovers all connected W3C standard gamepads.
  - `gamepadSetRumble(gamepadId, strong, weak, durationMs)`: Triggers dual-rumble vibration effects on supporting gamepads.

## Example Usage

```typescript
import init, { GalfusBrowser } from './pkg/galfus_browser.js';

async function main() {
  // Initialize WebAssembly runtime
  await init();

  // Create Galfus browser coordinator
  const galfus = new GalfusBrowser();
  const caps = galfus.getCapabilities();
  console.log('Galfus runtime capabilities:', caps);

  // Bind to a canvas element
  const windowId = galfus.createWindow({
    title: 'Galfus WebGPU Demo',
    width: 1280,
    height: 720,
    resizable: true
  });

  // Game loop driven by requestAnimationFrame
  function frame() {
    const events = galfus.pumpEvents();
    for (const event of events) {
      if (event.kind === 'keyboard' && event.type === 'keyDown') {
        console.log('Key pressed:', event.key);
      }
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
```

## Invariants & Design Principles

- **Host-Driven Animation Loop**: Does not hijack the browser event loop or force a persistent tick. The host application drives rendering via standard `requestAnimationFrame`.
- **Target Separation**: Dedicated strictly to WebAssembly and browser environments; desktop C-FFI linking is handled exclusively by `galfus-native`.
- **Direct JS Object Interop**: Avoids JSON string serializing/deserializing overhead in hot paths by utilizing `serde-wasm-bindgen` direct V8 value mapping.
