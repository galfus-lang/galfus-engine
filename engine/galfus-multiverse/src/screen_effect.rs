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

struct ScreenInput {
    uv: vec2<f32>,
    color: vec4<f32>,
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
