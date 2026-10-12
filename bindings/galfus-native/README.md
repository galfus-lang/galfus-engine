# galfus-native

Single native shared library packaging boundary and C-compatible ABI for FFI runtimes.

## Responsibilities

- **Single Binary Packaging**: Compiles internal engine crates into a single shared artifact (`galfus.dll`, `libgalfus.so`, or `libgalfus.dylib`).
- **C-Compatible ABI**: Exposes a versioned, stable C FFI surface for host runtimes (Bun, Node, Python, C++, Rust).
- **Boundary Marshalling**: Manages memory ownership across the FFI boundary, string/buffer conventions, and structured error reporting.
- **Feature Selection**: Enables build-time configuration of engine capabilities (e.g. compiling 2D-only vs 3D-inclusive builds).

## Invariants & Non-Goals

- **No Message Mailbox**: Interacts with engine crates via direct typed calls; does not reintroduce centralized serialized command queues.
- **Opaque Pointers & Handles**: Exposes robust handle primitives rather than raw internal Rust references to the host.
