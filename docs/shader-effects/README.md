# Galfus Engine — Shader Effects Architecture

## 1. Overview

In the Galfus Engine, custom graphics logic is authored through **Shader Effects** rather than complex node trees or monolithic raw WGSL files.

Instead of requiring developers or host applications to rewrite standard vertex pipelines, bind group layouts, sampler bindings, coordinate normalization, and lighting/shadow boilerplate, the engine enforces a **Hook-based Effect Contract**:

1. **The Engine owns the pipeline architecture**:
   - Vertex generation (e.g. fullscreen procedural quads, mesh vertex layouts, camera/transform matrices).
   - Uniform buffers, texture bindings, samplers, and blend states.
   - Core illumination passes and shadow mapping.
2. **The Host injects the computational core**:
   - The user snippet provides a single standardized entrypoint function.
   - The snippet receives typed inputs and produces typed outputs.
   - Forbidden tokens (such as `@group`, `@binding`, `@vertex`, `var<uniform>`) are rejected at validation time to preserve pipeline isolation.
3. **Deterministic Composition & Caching**:
   - The engine validates the snippet and injects it into a canonical template.
   - A deterministic 64-bit `ContentId` (FNV-1a) is derived from the composed source. It is an identifier for caching and comparison, not a proof that collisions are impossible.

---

## 2. Effect Domains

Shader Effects are specialized by domain across the engine's modular crates:

| Domain                 | Crate               | Hook Function Signature                                    | Primary Use Case                                                   |
| :--------------------- | :------------------ | :--------------------------------------------------------- | :----------------------------------------------------------------- |
| **Screen Effects**     | `galfus-multiverse` | `fn screen_effect(in: ScreenInput) -> vec4<f32>`           | Post-processing, color grading, stylized filters, transitions      |
| **Surface Effects 3D** | `galfus-realm-3d`   | `fn surface_effect(in: SurfaceInput) -> SurfaceOutput`     | PBR material customization, roughness, metallic, emissive, normals |
| **Surface Effects 2D** | `galfus-realm-2d`   | `fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D` | 2D custom shaders, dissolve, glow, distortion                      |

---

## 3. Core Composition Pipeline

```text
Host Shader Snippet (WGSL)
           │
           ▼
[galfus-core::shader_effects::validate_snippet]
  - Checks for forbidden keywords (@group, @binding, @vertex, @fragment, etc.)
  - Verifies presence of required entrypoint function
           │
           ▼
[galfus-core::shader_effects::ShaderEffectTemplate]
  - Injects snippet into canonical domain prelude & entrypoint hook
  - Calculates deterministic 64-bit ContentId
           │
           ▼
[galfus-multiverse / Realm PostProcessor / Realm3D Pipeline Cache]
  - Compiles composed WGSL into wgpu::ShaderModule
  - Caches wgpu::RenderPipeline indexed by ContentId / format
```

---

## 4. Documentation Index

- [Screen Effects Guide & Tutorial](./screen-effects.md): Complete guide to authoring, registering, and activating screen post-processing filters on Realm Invocations.
- [Surface Effects Guide & Tutorial](./surface-effects.md): Complete guide to authoring custom PBR surface shaders, dynamic custom uniform vectors, and pipeline caching in 3D materials.
