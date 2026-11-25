# galfus-realm-3d

Full-featured 3D graphics realm implementing the `galfus-realm-core` contract, featuring PBR shading, skeletal skinning, omnidirectional shadows, SSAO, optical refraction, and planar reflection mirrors.

## Responsibilities

- **3D Render Passes & Pipeline Execution**: Drives depth pre-passes, forward/clustered PBR shading passes, shadow map passes, and post-geometry screen-space passes.
- **Frustum Culling**: Tests entity AABB volumes against the active camera's 6 frustum planes, discarding offscreen geometry before GPU dispatch.
- **Dynamic Lighting & Shadow Mapping**: Manages directional shadow cascades and 6-face cubemap omnidirectional point light shadows.
- **Advanced Optical Effects**: Evaluates optical refraction (Snell's Law) and planar reflection mirrors with oblique near planes.
- **Interactive Gizmos**: Renders interactive 3D translation, rotation, and scaling manipulation gizmos.

## Capabilities & Powers

- **Physically Based Rendering (PBR) Forward+ Pipeline**:
  - Metallic-roughness forward shading with Blinn-Phong specular highlights, dielectric F0 / metallic reflectance blending, normal mapping (with automatic primitive tangents), and **Steep Parallax Occlusion Mapping (POM)** (`height_texture_id` + `parallax_scale`, uniform-safe `textureSampleGrad`, and distance fade).
  - Evaluates directional, point, and spot lights with smooth distance attenuation and shadow evaluation.
- **Culling, LOD & GPU Reverse-Z Hi-Z Occlusion**:
  - Unbiased Reverse-Z Depth Pre-Pass (`fs_opaque` discard-free), 6-plane frustum culling with `cullMargin`, half-open `distanceRange` LOD bands, GPU `R32Float` Hi-Z pyramid + compute `DrawIndexedIndirect` occlusion culling, and `cullCameraSlot` debug observer support.
- **Core-Owned IK, Morph Targets & GPU Skeletal Skinning**:
  - Evaluates morph targets and 8-joint skeletal skinning palettes in vertex shaders, paired with native `twoBone`, `fabrik`, and `lookAt` IK solvers.
- **Forward PBR Decals, Occluded Projectors & UV-Space Baking**:
  - Evaluates orthographic decals and perspective depth-occluded texture projectors before lighting, plus one-shot GPU UV-space decal baking (`bakeUvDecal`) for tattoos and permanent surface stamps.
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
  - Injects user-defined procedural fragment modifications (`fn surface_effect(in: SurfaceInput) -> SurfaceOutput`).
- **Decoupled Spatial Nodes (`Model3D`) & Renderables (`Mesh3D`)**:
  - Spatial nodes maintain world transforms independently of visual meshes, enabling pure anchor nodes and bone hierarchies without dummy geometry.
  - Assets (geometries and materials) are retained independently, surviving mesh or model destruction.

## Invariants & Design Principles

- **Independent of 2D**: Zero dependencies on 2D sprite shaders, vector shapes, or `galfus-realm-2d`.
- **Multiverse Cooperative**: Renders into the invocation target view supplied by `galfus-multiverse`.
