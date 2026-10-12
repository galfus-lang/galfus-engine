# galfus-gpu-manager

Shared GPU context lifecycle, resource allocation, and device abstraction built on `wgpu`.

## Responsibilities

- **GPU Device & Queue Management**: Manages shared `wgpu::Device`, `wgpu::Queue`, adapter selection, and device-loss recovery.
- **Resource Allocations**: Creates, caches, and recycles GPU buffers, textures, texture views, and samplers.
- **Pipeline & Shader Facilities**: Compiles, validates, and caches compute/render pipelines and host-authored shader modules.
- **Memory & Allocation Strategies**: Provides suballocation, buffer pooling, and opt-in texture atlas/array management.
- **Resource Accounting**: Tracks GPU memory usage and handles asynchronous resource uploads and staging.

## Invariants & Non-Goals

- **Scene Agnostic**: Does not know about 2D sprites, 3D meshes, camera transforms, or realm execution order.
- **Opt-In Strategies**: Does not force all textures into an atlas (render targets, depth buffers, and cubemaps have distinct usage patterns).
- **Single Context Ownership**: A graphics context is shared explicitly, preventing hidden device duplications across subsystems.
