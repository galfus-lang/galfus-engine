# Realm3D shader patterns

This document defines the stable material-uniform conventions shared by Realm3D,
custom surface effects, and external scene serializers. Changes to this layout
must update the Rust uniform, the default WGSL template, and this document together.

## Material flags

`MaterialUniform.flags` is a `vec4<u32>` with the following contract:

| Component | Bits                        | Meaning                                                                                                                                 |
| --------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `x`       | `0..=2`                     | Surface type: opaque `0`, transparent `1`, masked `2`, additive `3`, refractive `4`, mirror `5`, portal `6`.                            |
| `x`       | `4..=8`                     | Texture presence for slots `0..=4`.                                                                                                     |
| `x`       | `9`                         | A custom surface effect is present.                                                                                                     |
| `y`       | `2 * slot ..= 2 * slot + 1` | Two-bit sampler preset for each of the eight texture slots: linear-repeat `0`, linear-clamp `1`, nearest-repeat `2`, nearest-clamp `3`. |
| `z`       | `slot`                      | Texture-coordinate selector for each of the eight texture slots: UV0 `0`, UV1 `1`.                                                      |
| `w`       | all                         | Reserved; write zero.                                                                                                                   |

All unlisted bits are reserved and must be zero. `pbr_params.w` contains the
masked-surface alpha cutoff, clamped to the inclusive `0.0..=1.0` range.
`refraction_params` stores `[index_of_refraction, distortion_strength,
normal_scale, 0]`.

## Texture sampling

The default shader owns the mapping from slot to texture binding, sampler
preset, and UV set. Material descriptors expose this as `textureSlots`,
`textureSamplers`, and `textureUvSets`; serializers should emit those semantic
properties, never prepack GPU flags.

Custom `surface_effect` functions receive `SurfaceInput.uv` (UV0) and
`SurfaceInput.uv1` (UV1). They should use these explicit values for any custom
sampling. Built-in PBR texture slots already apply their configured sampler and
UV set internally. Slot 1 is a linear tangent-space normal map. Its RGB value
is decoded to `[-1, 1]`, its XY strength uses `normalScale`, and it is converted
to world space through the canonical vertex tangent basis before a surface
effect receives `world_normal`. Geometry using slot 1 must provide glTF/MikkTSpace
`tangent` values; Realm3D consumes the canonical tangent attribute and does not
derive tangents at render time.

## Rasterization

`side` is a pipeline property, not a material-uniform bit. `front` culls back
faces, `back` culls front faces, and `double` disables culling. It applies to
regular, instanced, and shadow draws. glTF `doubleSided: true` maps to `side:
"double"`; a missing or false value maps to `side: "front"` in an external
serializer.
