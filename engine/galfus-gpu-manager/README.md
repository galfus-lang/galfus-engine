# galfus-gpu-manager

Shared GPU device lifecycle, resource registries, suballocators, and low-level rendering abstractions built on `wgpu`.

## Responsibilities

- **GPU Device & Queue Lifecycle**: Creates and owns a `wgpu::Instance`, adapter, device, and queue; it can reuse an existing instance for a compatible surface.
- **Resource Registries**: Owns generational registries for buffers, textures, views, samplers, bind groups, layouts, and pipelines.
- **Standard Sampler Infrastructure**: Provides reusable standard sampler sets.
- **Suballocators**: Provides a growable buffer arena and a tile atlas for clients that choose to use them.

## Capabilities & Powers

- **Texture and buffer registries**:
  - Create, look up, write, and destroy resources by generational handle or host logical ID.
  - Texture pooling for Multiverse scratch, history, and post-process textures is owned by `galfus-multiverse`, not this crate.
- **Engine-Wide Standard Sampler Bundle**:
  - Instant access to preconfigured samplers: `LinearRepeat`, `LinearClamp`, `NearestRepeat`, and `NearestClamp`.
  - Reusable across 2D sprite shaders, 3D PBR materials, SSAO kernels, and multiverse post-processing screen effects.
- **Pipeline cache**:
  - Caches derived render pipelines by shader handle, target configuration, and entrypoint names.

## Invariants & Design Principles

- **Scene Agnostic**: Zero knowledge of cameras, 2D sprites, 3D meshes, lighting algorithms, or graph execution order.
- **Explicit Context Ownership**: A `GpuManager` shares one device and queue with the clients using that manager. It does not impose a process-global GPU context.
- **Opt-In Strategies**: Does not enforce a mandatory global texture atlas; render targets, cubemaps, and dynamic vector textures operate with native granularity.
