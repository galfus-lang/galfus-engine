# galfus-gpu-manager

Shared GPU device lifecycle, resource allocation pools, and low-level rendering abstractions built on `wgpu`.

## Responsibilities

- **GPU Device & Queue Lifecycle**: Manages the central `wgpu::Device` and `wgpu::Queue`, adapter enumeration, feature discovery, and device-loss recovery.
- **Resource Pooling & Recycling**: Allocates, pools, and recycles offscreen render targets, scratch depth buffers, and staging upload buffers without frame-to-frame allocation spikes.
- **Standard Sampler & Fallback Infrastructure**: Provides immutable, engine-wide standard sampler sets and 1x1 fallback textures to guarantee safe binding across all shaders.
- **Shader Compilation & Validation**: Validates and compiles WGSL shader modules through `naga`, surfacing line-accurate compile errors and reflection metadata.

## Capabilities & Powers

- **Dynamic Texture Pool**:
  - Reuses offscreen render textures indexed by `(width, height, format, sample_count, usage)` tuples.
  - Recycles transient invocation pass textures to eliminate VRAM fragmentation and allocation overhead during window resizes and render-to-texture passes.
- **Engine-Wide Standard Sampler Bundle**:
  - Instant access to preconfigured samplers: `LinearRepeat`, `LinearClamp`, `NearestRepeat`, and `NearestClamp`.
  - Reusable across 2D sprite shaders, 3D PBR materials, SSAO kernels, and multiverse post-processing screen effects.
- **Safe Fallback Textures & Uniform Buffers**:
  - Provides pre-allocated 1x1 fallback textures (Pure White, Neutral Normal `[128, 128, 255, 255]`, Black, and Transparent) so optional texture slots always have valid GPU views.
- **Asynchronous Staging & Buffer Writing**:
  - Helpers for staging buffer uploads, mesh vertex/index buffer creation, and mapped memory reads for headless image capture.

## Invariants & Design Principles

- **Scene Agnostic**: Zero knowledge of cameras, 2D sprites, 3D meshes, lighting algorithms, or graph execution order.
- **Single Context Ownership**: A single graphics context (`Device` and `Queue`) is shared explicitly across all realms and multiverse targets, preventing duplicate driver overhead.
- **Opt-In Strategies**: Does not enforce a mandatory global texture atlas; render targets, cubemaps, and dynamic vector textures operate with native granularity.
