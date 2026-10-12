# galfus-browser

WebAssembly packaging boundary and JavaScript/TypeScript bindings for the web.

## Responsibilities

- **WASM Packaging**: Compiles engine crates into a `galfus.wasm` module.
- **Browser Glue & Bindings**: Exposes typed JavaScript/TypeScript bindings via `wasm-bindgen` and web integration layers.
- **Web Platform Integration**: Bridges DOM canvas surfaces, WebGPU rendering contexts, and Web Audio subsystems.
- **Async & Gesture Lifecycle**: Respects browser lifecycle constraints, such as user-gesture activation requirements for audio.

## Invariants & Non-Goals

- **Web Specific**: Does not expose a C-compatible FFI or target native desktop dynamic linking.
- **Direct Interaction**: Exposes idiomatic JS/TS APIs invoking underlying engine contracts directly.
