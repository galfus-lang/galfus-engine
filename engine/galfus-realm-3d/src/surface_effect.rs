//! Surface effect composition and validation for 3D materials.

use galfus_core::shader_effects::{ComposedShader, EffectResult, ShaderEffectTemplate};

/// WGSL struct definitions injected as the domain prelude for surface effects.
pub const SURFACE_EFFECT_PRELUDE: &str = r#"
struct CustomParams {
    v0: vec4<f32>,
    v1: vec4<f32>,
    v2: vec4<f32>,
    v3: vec4<f32>,
};

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
};

struct SurfaceOutput {
    albedo: vec4<f32>,
    emissive: vec3<f32>,
    roughness: f32,
    metallic: f32,
    normal: vec3<f32>,
};
"#;

/// Default passthrough surface effect used when no custom effect is specified.
pub const BUILTIN_SURFACE_PASSTHROUGH: &str = r#"
fn surface_effect(in: SurfaceInput) -> SurfaceOutput {
    var out: SurfaceOutput;
    out.albedo = in.albedo;
    out.emissive = in.emissive;
    out.roughness = in.roughness;
    out.metallic = in.metallic;
    out.normal = in.world_normal;
    return out;
}
"#;

/// Composes a complete WGSL shader source by injecting a surface effect snippet.
pub fn compose_surface_shader(
    base_shader_template: &str,
    user_snippet: Option<&str>,
) -> EffectResult<ComposedShader> {
    let snippet = user_snippet.unwrap_or(BUILTIN_SURFACE_PASSTHROUGH);
    let template = ShaderEffectTemplate::new(base_shader_template, "surface_effect");
    template.compose(snippet)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builtin_surface_passthrough_composes() {
        let template = format!(
            "{}\n{{{{EFFECT_SNIPPET}}}}\nfn main() {{}}",
            SURFACE_EFFECT_PRELUDE
        );
        let composed = compose_surface_shader(&template, None).expect("Passthrough should compose");
        assert!(
            composed
                .source
                .contains("fn surface_effect(in: SurfaceInput)")
        );
    }

    #[test]
    fn test_custom_surface_effect_composes() {
        let template = format!(
            "{}\n{{{{EFFECT_SNIPPET}}}}\nfn main() {{}}",
            SURFACE_EFFECT_PRELUDE
        );
        let custom_snippet = r#"
            fn surface_effect(in: SurfaceInput) -> SurfaceOutput {
                var out: SurfaceOutput;
                out.albedo = in.albedo * in.custom.v0;
                out.emissive = in.emissive;
                out.roughness = in.roughness;
                out.metallic = in.metallic;
                out.normal = in.world_normal;
                return out;
            }
        "#;
        let composed = compose_surface_shader(&template, Some(custom_snippet))
            .expect("Custom effect should compose");
        assert!(
            composed
                .source
                .contains("out.albedo = in.albedo * in.custom.v0;")
        );
    }
}
