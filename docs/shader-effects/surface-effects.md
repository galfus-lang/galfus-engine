# Surface Effects Guide & Tutorial

## 1. Overview

**Surface Effects** in `galfus-realm-3d` allow you to customize 3D material shading without rewriting vertex pipelines, shadow mapping, lighting algorithms, or uniform bindings.

Instead of defining raw vertex and fragment shaders with arbitrary `@group` or `@binding` layouts, you provide a clean, self-contained WGSL hook function:

```wgsl
fn surface_effect(in: SurfaceInput) -> SurfaceOutput
```

The engine validates the snippet against forbidden keywords (`@group`, `@binding`, `@vertex`, and others) and composes it into the 3D shader template. The composed source receives a deterministic 64-bit FNV-1a `ContentId`; this identifier is not a collision-proof digest.

---

## 2. The Hook Interface

### 2.1. `SurfaceInput`

The engine populates and passes `SurfaceInput` to your hook:

```wgsl
struct CustomParams {
    v0: vec4<f32>,
    v1: vec4<f32>,
    v2: vec4<f32>,
    v3: vec4<f32>,
}

struct SurfaceInput {
    world_pos: vec3<f32>,
    world_normal: vec3<f32>,
    view_dir: vec3<f32>,
    uv: vec2<f32>,
    uv1: vec2<f32>,
    vertex_color: vec4<f32>,
    albedo: vec4<f32>,
    emissive: vec3<f32>,
    roughness: f32,
    metallic: f32,
    reflectance: f32,
    time: f32,
    custom: CustomParams,
    instance_color: vec4<f32>,
    instance_emissive: vec4<f32>,
    instance_pbr: vec4<f32>,
    instance_custom: vec4<f32>,
}
```

- `world_pos`: World-space position of the fragment (`vec3<f32>`).
- `world_normal`: Interpolated world-space normal (`vec3<f32>`).
- `view_dir`: Normalized vector from fragment to camera (`vec3<f32>`).
- `uv`: Primary texture coordinate, `TEXCOORD_0` (`vec2<f32>`).
- `uv1`: Secondary texture coordinate, `TEXCOORD_1` (`vec2<f32>`).
- `vertex_color`: Interpolated `COLOR_0`. It is already multiplied into `albedo`.
- `albedo`: Base material albedo (`vec4<f32>`).
- `emissive`: Base material emissive color (`vec3<f32>`).
- `roughness`, `metallic`, and `reflectance`: Base material PBR factors.
- `time`: Elapsed engine time in seconds.
- Material texture samplers are selected internally per slot; surface effects receive the
  resolved material values rather than sampler implementation details.
- `custom`: Standardized 64-byte user parameters (`custom.v0`, `custom.v1`, `custom.v2`, `custom.v3`).
- `instance_*`: Per-instance overrides supplied by instanced models.

The composed shader also provides `sample_material_texture(slot, uv)`. It applies the sampler
configured for that slot, or the default sampler when no override is supplied, so custom effects
never receive or manage sampler selectors directly.

### 2.2. `SurfaceOutput`

Your hook must return a populated `SurfaceOutput` struct:

```wgsl
struct SurfaceOutput {
    albedo: vec4<f32>,
    emissive: vec3<f32>,
    roughness: f32,
    metallic: f32,
    normal: vec3<f32>,
}
```

The returned properties are fed directly into the engine's lighting evaluation pass (directional lights, point lights, Reverse-Z shadows, and ambient environment lighting).

---

## 3. Example Snippets

### 3.1. Fresnel Rim Glow

Adds an illuminated outer rim when viewing the mesh from grazing angles:

```wgsl
fn surface_effect(in: SurfaceInput) -> SurfaceOutput {
    var out: SurfaceOutput;
    out.albedo = in.albedo;
    out.metallic = in.metallic;
    out.roughness = in.roughness;
    out.normal = in.world_normal;

    let fresnel_power = in.custom.v0.w;
    let rim = pow(1.0 - max(dot(in.world_normal, in.view_dir), 0.0), fresnel_power);
    let rim_color = in.custom.v0.rgb * rim;

    out.emissive = in.emissive + rim_color;
    return out;
}
```

### 3.2. World-Space Position Waves

Generates dynamic bands and ripples along global coordinates:

```wgsl
fn surface_effect(in: SurfaceInput) -> SurfaceOutput {
    var out: SurfaceOutput;
    let wave_freq = in.custom.v0.x;
    let wave_speed = in.custom.v0.y;
    let wave = sin(in.world_pos.y * wave_freq + in.time * wave_speed) * 0.5 + 0.5;

    let col_a = in.custom.v1.rgb;
    let col_b = in.custom.v2.rgb;
    let blend_col = mix(col_a, col_b, wave);

    out.albedo = vec4<f32>(blend_col, in.albedo.a);
    out.metallic = in.metallic;
    out.roughness = mix(0.1, 0.9, wave);
    out.emissive = blend_col * (wave * 0.3);
    out.normal = in.world_normal;
    return out;
}
```

### 3.3. Cyber Hologram (Scanlines & Alpha)

Creates a holographic scanline effect with oscillating transparency:

```wgsl
fn surface_effect(in: SurfaceInput) -> SurfaceOutput {
    var out: SurfaceOutput;
    let scanline = sin(in.world_pos.y * 30.0 + in.time * 6.0) * 0.5 + 0.5;
    let glow = in.custom.v0.rgb * (scanline * 0.8 + 0.2);

    let alpha = clamp(in.custom.v0.a * (0.4 + scanline * 0.6), 0.1, 1.0);
    out.albedo = vec4<f32>(glow, alpha);
    out.metallic = 0.0;
    out.roughness = 0.2;
    out.emissive = glow * 1.5;
    out.normal = in.world_normal;
    return out;
}
```

---

## 4. Host Usage (TypeScript / Bun FFI)

In a generated host binding, configure a material with `shaderEffect` and `customParams`, then register it in an existing 3D realm:

```typescript
galfus.realm3dCreateMaterial(10, 1, {
  baseColor: [0.1, 0.2, 0.3, 1.0],
  metallic: 0.1,
  roughness: 0.3,
  reflectance: 0.5,
  emissive: [0.0, 0.0, 0.0],
  shaderEffect: FRESNEL_SURFACE_SNIPPET,
  customParams: [
    [0.0, 0.8, 1.0, 3.0], // v0: rim color (RGB) + power (W)
    [0.0, 0.0, 0.0, 0.0], // v1
    [0.0, 0.0, 0.0, 0.0], // v2
    [0.0, 0.0, 0.0, 0.0] // v3
  ]
});
```
