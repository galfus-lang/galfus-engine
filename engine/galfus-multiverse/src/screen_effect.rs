use galfus_core::shader_effects::{ComposedShader, EffectResult, ShaderEffectTemplate};

/// Canonical WGSL template for multiverse screen/post-processing shaders.
/// Generates a procedural fullscreen triangle and invokes the user's `screen_effect` function.
pub const SCREEN_EFFECT_TEMPLATE: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) id: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(id << 1u) & 2) * 2.0 - 1.0;
    let y = f32(i32(id & 2u) * -2) + 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

@group(0) @binding(0) var t_input: texture_2d<f32>;
@group(0) @binding(1) var s_input: sampler;
@group(0) @binding(2) var screen_tex_0: texture_2d<f32>;
@group(0) @binding(3) var screen_tex_1: texture_2d<f32>;
@group(0) @binding(4) var screen_tex_2: texture_2d<f32>;
@group(0) @binding(5) var screen_tex_3: texture_2d<f32>;
@group(0) @binding(6) var screen_tex_4: texture_2d<f32>;
@group(0) @binding(7) var screen_tex_5: texture_2d<f32>;
@group(0) @binding(8) var screen_tex_6: texture_2d<f32>;
@group(0) @binding(9) var screen_tex_7: texture_2d<f32>;
@group(0) @binding(10) var sampler_linear_repeat: sampler;
@group(0) @binding(11) var sampler_linear_clamp: sampler;
@group(0) @binding(12) var sampler_nearest_repeat: sampler;
@group(0) @binding(13) var sampler_nearest_clamp: sampler;

fn sample_screen_texture_with_sampler(tex: texture_2d<f32>, uv: vec2<f32>, sampler_idx: u32) -> vec4<f32> {
    switch (sampler_idx) {
        case 1u: { return textureSample(tex, sampler_linear_clamp, uv); }
        case 2u: { return textureSample(tex, sampler_nearest_repeat, uv); }
        case 3u: { return textureSample(tex, sampler_nearest_clamp, uv); }
        default: { return textureSample(tex, sampler_linear_repeat, uv); }
    }
}

fn sample_screen_texture(slot: u32, uv: vec2<f32>, sampler_idx: u32) -> vec4<f32> {
    switch (slot) {
        case 0u: { return sample_screen_texture_with_sampler(screen_tex_0, uv, sampler_idx); }
        case 1u: { return sample_screen_texture_with_sampler(screen_tex_1, uv, sampler_idx); }
        case 2u: { return sample_screen_texture_with_sampler(screen_tex_2, uv, sampler_idx); }
        case 3u: { return sample_screen_texture_with_sampler(screen_tex_3, uv, sampler_idx); }
        case 4u: { return sample_screen_texture_with_sampler(screen_tex_4, uv, sampler_idx); }
        case 5u: { return sample_screen_texture_with_sampler(screen_tex_5, uv, sampler_idx); }
        case 6u: { return sample_screen_texture_with_sampler(screen_tex_6, uv, sampler_idx); }
        case 7u: { return sample_screen_texture_with_sampler(screen_tex_7, uv, sampler_idx); }
        default: { return vec4<f32>(1.0, 1.0, 1.0, 1.0); }
    }
}

struct ScreenInput {
    uv: vec2<f32>,
    color: vec4<f32>,
    sampler_index: u32,
};

// --- User Screen Effect Snippet ---
{{EFFECT_SNIPPET}}

// --- Multiverse Fragment Hook ---
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let sampled = textureSample(t_input, s_input, in.uv);
    var screen_in: ScreenInput;
    screen_in.uv = in.uv;
    screen_in.color = sampled;
    screen_in.sampler_index = 0u;
    return screen_effect(screen_in);
}
"#;

/// Standard 1:1 blit screen effect snippet.
pub const BUILTIN_BLIT_SNIPPET: &str = r#"
fn screen_effect(in: ScreenInput) -> vec4<f32> {
    return in.color;
}
"#;

/// Standard sepia tone color grading screen effect snippet.
pub const BUILTIN_SEPIA_SNIPPET: &str = r#"
fn screen_effect(in: ScreenInput) -> vec4<f32> {
    let r = dot(in.color.rgb, vec3<f32>(0.393, 0.769, 0.189));
    let g = dot(in.color.rgb, vec3<f32>(0.349, 0.686, 0.168));
    let b = dot(in.color.rgb, vec3<f32>(0.272, 0.534, 0.131));
    let sepia = min(vec3<f32>(1.0), vec3<f32>(r, g, b));
    return vec4<f32>(sepia, in.color.a);
}
"#;

/// Composes a user screen effect snippet into a full, self-contained WGSL shader.
pub fn compose_screen_effect(user_snippet: &str) -> EffectResult<ComposedShader> {
    let template = ShaderEffectTemplate::new(SCREEN_EFFECT_TEMPLATE, "screen_effect");
    template.compose(user_snippet)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compose_builtin_blit() {
        let composed = compose_screen_effect(BUILTIN_BLIT_SNIPPET).expect("Blit should compose");
        assert!(composed.source.contains("fn vs_main("));
        assert!(composed.source.contains("fn fs_main("));
        assert!(composed.source.contains("return in.color;"));
    }

    #[test]
    fn test_compose_custom_effect() {
        let snippet = r#"
            fn screen_effect(in: ScreenInput) -> vec4<f32> {
                return vec4<f32>(1.0 - in.color.rgb, in.color.a);
            }
        "#;
        let composed = compose_screen_effect(snippet).expect("Invert should compose");
        assert!(composed.source.contains("1.0 - in.color.rgb"));
    }
}
