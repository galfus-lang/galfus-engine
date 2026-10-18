# galfus-native

Single native shared library packaging boundary and C-compatible ABI for host FFI runtimes.

## Responsibilities

- **Single Binary Artifact Packaging**: Links all internal engine crates (`galfus-core`, `galfus-gpu-manager`, `galfus-platform`, `galfus-multiverse`, `galfus-realm-2d`, `galfus-realm-3d`) into a single native dynamic library (`libgalfus_native.so`, `galfus.dll`, or `libgalfus.dylib`).
- **Stable C-Compatible ABI**: Exposes a clean, versioned C function surface (`extern "C"`) compatible with Bun, Node-API, Python, LuaJIT, and C/C++.
- **Fast-Path Raw Buffer Marshalling**: Direct memory pointer exchanges for high-frequency spatial transforms and physical size queries.
- **JSON Serialization Boundary**: Marshals complex scene descriptors and configurations using serde (converting internal Rust `snake_case` to host `camelCase`).
- **Thread-Safe Error Reporting**: Stores descriptive error strings in thread-local storage accessible via `galfus_get_last_error()`.

## Capabilities & Powers

- **Zero-Copy Raw Array Fast-Paths**:
  - Direct 6-float and 10-float array writes for transforms (`Float32Array`):
    - `galfus_realm_3d_set_model_transform_raw` & `galfus_realm_3d_get_model_transform_raw`
    - `galfus_realm_3d_set_camera_transform_raw` & `galfus_realm_3d_get_camera_transform_raw`
    - `galfus_realm_2d_set_sprite_transform_raw` & `galfus_realm_2d_get_sprite_transform_raw`
    - `galfus_realm_2d_set_svg_transform_raw` & `galfus_realm_2d_get_svg_transform_raw`
  - Direct output pointer writes for dimensions:
    - `galfus_multiverse_get_target_size_raw`
    - `galfus_platform_get_window_size_raw`
- **Comprehensive API Coverage**:
  - Platform & Windowing: `galfus_platform_init`, `galfus_window_create`, `galfus_platform_pump_events`.
  - Multiverse Orchestration: `galfus_multiverse_create_target`, `galfus_multiverse_create_invocation`, `galfus_multiverse_resolve`, `galfus_multiverse_dispatch`.
  - 2D Realm, Shapes, Particles & Reactive SVG: `galfus_realm_2d_create_svg`, `galfus_realm_2d_set_svg_attribute`, `galfus_realm_2d_set_svg_text`, `galfus_realm_2d_remove_svg_attribute`.
  - 3D Realm, Meshes, PBR, Shadows & SSAO: `galfus_realm_3d_create_model`, `galfus_realm_3d_create_light`, `galfus_realm_3d_set_environment`.
- **Automated Multi-Language SDK Generation**:
  - Feeds the strategy-pattern codegen engine to automatically output:
    - `sdk/c/galfus.h` (C/C++ Header)
    - `sdk/python/galfus.py` (Python ctypes wrapper)
    - `sdk/lua/galfus.lua` (LuaJIT FFI wrapper)
    - `sdk/typescript/galfus.ts` (Canonical TypeScript definitions)
    - `sdk/bun/galfus.ts` (High-performance Bun FFI client with fast-path buffer overloads)

## Invariants & Design Principles

- **Direct Typed Calls**: Interacts with engine crates via synchronous typed functions; does not reintroduce centralized command mailboxes.
- **Opaque Handles & Safe Boundaries**: All C functions catch Rust panics at the boundary (`catch_unwind`) and return integer error codes (`0` for success, `-1` on error).
