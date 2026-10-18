# galfus-realm-3d

Full-featured 3D graphics realm implementing the `galfus-realm-core` contract, featuring PBR shading, skeletal skinning, omnidirectional shadows, SSAO, optical refraction, and planar reflection mirrors.

## Responsibilities

- **3D Render Passes & Pipeline Execution**: Drives depth pre-passes, forward/clustered PBR shading passes, shadow map passes, and post-geometry screen-space passes.
- **Frustum Culling**: Tests entity AABB volumes against the active camera's 6 frustum planes, discarding offscreen geometry before GPU dispatch.
- **Dynamic Lighting & Shadow Mapping**: Manages directional shadow cascades and 6-face cubemap omnidirectional point light shadows.
- **Advanced Optical Effects**: Evaluates optical refraction (Snell's Law) and planar reflection mirrors with oblique near planes.
- **Interactive Gizmos**: Renders interactive 3D translation, rotation, and scaling manipulation gizmos.

## Capabilities & Powers

- **Physically Based Rendering (PBR) Engine**:
  - Full implementation of the Cook-Torrance specular microfacet model (GGX distribution, Smith geometry shadowing, and Schlick Fresnel).
  - Evaluates directional, point, and spot lights with smooth distance attenuation and shadow evaluation.
- **GPU Skeletal Mesh Skinning**:
  - Evaluates bone matrix palettes in vertex shaders, animating skinned characters with up to 128 joints.
- **Omnidirectional Point Light Shadows**:
  - Generates 6-face cube shadow depth maps with hardware depth testing and Percentage-Closer Filtering (PCF).
- **Screen-Space Ambient Occlusion (SSAO)**:
  - Hemisphere sample kernel pass evaluating depth buffer discontinuities to generate realistic ambient contact shadows in crevices.
- **Screen-Space Optical Refraction**:
  - Simulates Snell's Law index of refraction (IOR) for glass, water, crystals, and gems, sampling background scenes with normal deviation and chromatic aberration.
- **Planar Reflection Mirrors & Portals**:
  - Renders virtual reflection cameras with mirrored view matrices and oblique near-plane clipping directly to offscreen RTT targets.
- **Interactive Transform Gizmos**:
  - Axis-colored translation arrows, rotation rings, and scale handles rendered with custom depth bias for host manipulation.
- **Custom WGSL 3D Surface Effects**:
  - Injects user-defined procedural vertex and fragment modifications (`fn surface_effect(in: SurfaceInput3D) -> SurfaceOutput3D`).

## Invariants & Design Principles

- **Independent of 2D**: Zero dependencies on 2D sprite shaders, vector shapes, or `galfus-realm-2d`.
- **Feature-Gated**: Can be excluded at compile time for 2D-only or lightweight embedded builds.
- **Multiverse Cooperative**: Dispatches render passes cleanly into the command encoder provided by `galfus-multiverse`.
