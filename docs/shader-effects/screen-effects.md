# Screen Effects Guide & Tutorial

## 1. Introduction

**Screen Effects** are host-authored post-processing passes managed by `galfus-multiverse`. They are applied to the graphical output of a Realm before it is composited or presented onto a Target (such as an OS window or an offscreen texture).

Rather than writing full-screen vertex and fragment shaders from scratch, you provide a concise WGSL snippet implementing `fn screen_effect`. The engine takes care of quad rendering, texture sampling, pipeline caching, and scissor/viewport clipping.

---

## 2. The WGSL Contract

Every Screen Effect snippet must define the `screen_effect` entrypoint function conforming to this contract:

```wgsl
struct ScreenInput {
    uv: vec2<f32>,     // Normalized viewport UV coordinates (0.0 .. 1.0)
    color: vec4<f32>,  // Sampled input color (RGBA) from the realm output
    sampler_index: u32, // 0 = LinearRepeat, 1 = LinearClamp, 2 = NearestRepeat, 3 = NearestClamp
};

fn screen_effect(in: ScreenInput) -> vec4<f32> {
    // Return the modified color
    return in.color;
}
```

### What the Engine Provides Automatically:

- **Procedural Vertex Shader**: A fullscreen triangle is generated automatically without requiring any vertex buffers or mesh allocations.
- **Texture Sampling**: The rendered output texture of the Realm is automatically sampled at `in.uv` and passed into your function as `in.color`.
- **Viewport & Scissor Clipping**: Invocations with custom viewports (e.g. split-screen, picture-in-picture) are strictly clipped; your effect runs only over the declared viewport area.

---

## 3. Forbidden Tokens & Validation

To prevent snippets from breaking the engine's internal bind group layouts and pipeline states, the engine's validator rejects snippets containing the following reserved tokens:

```text
@group
@binding
@vertex
@fragment
@compute
@builtin
var<uniform>
var<storage>
texture_2d
texture_depth_2d
texture_2d_array
sampler
sampler_comparison
override
```

> [!NOTE]
> Helper functions and local `var` or `let` variables are fully permitted as long as they do not conflict with the engine prelude.

---

## 4. Practical Examples

### Example 1: Color Inversion

Inverts RGB channels while preserving the original alpha value:

```wgsl
fn screen_effect(in: ScreenInput) -> vec4<f32> {
    return vec4<f32>(1.0 - in.color.rgb, in.color.a);
}
```

### Example 2: Luminance Grayscale

Converts the image to perceptually accurate grayscale using standard Rec. 709 luminance weights:

```wgsl
fn screen_effect(in: ScreenInput) -> vec4<f32> {
    let gray = dot(in.color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    return vec4<f32>(vec3<f32>(gray), in.color.a);
}
```

### Example 3: Radial Vignette

Darkens the edges of the viewport relative to the screen center:

```wgsl
fn screen_effect(in: ScreenInput) -> vec4<f32> {
    let dist = distance(in.uv, vec2<f32>(0.5, 0.5));
    let vignette = smoothstep(0.7, 0.3, dist);
    return vec4<f32>(in.color.rgb * vignette, in.color.a);
}
```

### Example 4: Tint and Exposure Adjustment

Multiplies exposure and applies a warm photographic tint:

```wgsl
fn screen_effect(in: ScreenInput) -> vec4<f32> {
    let exposure = 1.25;
    let warm_tint = vec3<f32>(1.05, 0.98, 0.90);
    let graded = in.color.rgb * exposure * warm_tint;
    return vec4<f32>(clamp(graded, vec3<f32>(0.0), vec3<f32>(1.0)), in.color.a);
}
```

---

## 5. Usage Tutorial

### Step 1: Register the Shader

Assign a host logical ID (e.g. `500`) and register the snippet with the Multiverse.

#### In Rust:

```rust
let invert_snippet = r#"
    fn screen_effect(in: ScreenInput) -> vec4<f32> {
        return vec4<f32>(1.0 - in.color.rgb, in.color.a);
    }
"#;

mv.register_shader(500, invert_snippet)?;
```

#### In TypeScript / Bun FFI:

```typescript
import { GalfusBun } from 'galfus-bun';

const galfus = new GalfusBun();
galfus.multiverseRegisterShader(
  500,
  `fn screen_effect(in: ScreenInput) -> vec4<f32> {
     return vec4<f32>(1.0 - in.color.rgb, in.color.a);
   }`
);
```

### Step 2: Apply the Filter to an Invocation

Incorporate the custom shader into the `InvocationDesc` when creating it or update it dynamically:

#### In Rust:

```rust
// When creating invocation
mv.create_invocation(100, InvocationDesc {
    realm_id: 10,
    target_id: 1,
    camera_slot: None,
    viewport: ViewportRect::default(),
    filters: vec![InvocationFilter::custom(500)],
    z_index: 0,
    enabled: true,
    clear_color: None,
    anti_aliasing: None,
})?;

// Or mutate dynamically on an existing invocation:
mv.set_invocation_filters(100, vec![InvocationFilter::Custom { shader_id: 500 }])?;
```

#### In TypeScript / Bun FFI:

```typescript
galfus.multiverseSetInvocationFilters(100, [{ custom: { shaderId: 500 } }]);
```

### Step 3: Removing or Switching Filters

To switch back to unfiltered raw output, pass an empty filter list:

```typescript
// Remove all filters (Raw 1:1 blit)
galfus.multiverseSetInvocationFilters(100, []);

// Or switch to builtin Sepia
galfus.multiverseSetInvocationFilters(100, ['sepia']);
```

---

## 6. Builtin Filters

The Multiverse provides precompiled builtin filters:

- **`Sepia`, `Grayscale`, `Invert`, `Vignette`, `TonemapAces`, `ChromaticAberration`, `FilmGrain`, `EdgeOutline`, `Posterize`, `Blur`, and `Sharpen`**: Built-in post-processing filters.
- **`Fxaa`, `Smaa`, `SsaaDownsample`, and `Taa`**: Filter forms of the corresponding anti-aliasing operations. Invocation-level or global anti-aliasing can also add the appropriate pass.
- **Empty filters (`[]`)**: Direct, efficient 1:1 blit pass without color modification.

---

## 7. Performance & Caching

1. **Compilation upon Registration**: Custom shader snippets are validated and compiled into `wgpu::ShaderModule` instances at registration time, preventing frame drops during live gameplay.
2. **Pipeline Caching**: Render pipelines are lazily constructed and cached by effect name and destination texture format in the internal `PostProcessor`. Normal command encoding and resource lookups still occur every frame.
