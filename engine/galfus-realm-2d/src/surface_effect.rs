//! Surface effect composition and validation for 2D materials.

use galfus_core::shader_effects::{ComposedShader, EffectResult, ShaderEffectTemplate};

/// WGSL struct definitions injected as the domain prelude for 2D surface effects.
pub const SURFACE_EFFECT_PRELUDE_2D: &str = r#"
struct CustomParams2D {
    v0: vec4<f32>,
    v1: vec4<f32>,
    v2: vec4<f32>,
    v3: vec4<f32>,
};

struct SurfaceInput2D {
    world_pos: vec2<f32>,
    uv: vec2<f32>,
    color: vec4<f32>,
    time: f32,
    custom: CustomParams2D,
};

struct SurfaceOutput2D {
    color: vec4<f32>,
    emissive: vec4<f32>,
};
"#;

/// Default passthrough surface effect used when no custom effect is specified.
pub const BUILTIN_SURFACE_PASSTHROUGH_2D: &str = r#"
fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D {
    var out: SurfaceOutput2D;
    out.color = in.color;
    out.emissive = vec4<f32>(0.0);
    return out;
}
"#;

/// Composes a complete WGSL 2D shader source by injecting a surface effect snippet.
pub fn compose_surface_shader_2d(
    base_shader_template: &str,
    user_snippet: Option<&str>,
) -> EffectResult<ComposedShader> {
    let snippet = user_snippet.unwrap_or(BUILTIN_SURFACE_PASSTHROUGH_2D);
    let template = ShaderEffectTemplate::new(base_shader_template, "surface_effect");
    template.compose(snippet)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builtin_2d_surface_passthrough_composes() {
        let template = format!(
            "{}\n{{{{EFFECT_SNIPPET}}}}\nfn main() {{}}",
            SURFACE_EFFECT_PRELUDE_2D
        );
        let composed =
            compose_surface_shader_2d(&template, None).expect("Passthrough should compose");
        assert!(
            composed
                .source
                .contains("fn surface_effect(in: SurfaceInput2D)")
        );
    }
}
