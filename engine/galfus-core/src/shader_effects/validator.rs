use crate::shader_effects::error::{EffectError, EffectResult};

/// Reserved tokens that cannot be declared inside user effect snippets.
/// These keywords and decorators belong exclusively to the engine's outer pipeline template.
pub const FORBIDDEN_SHADER_TOKENS: &[&str] = &[
    "@group",
    "@binding",
    "@vertex",
    "@fragment",
    "@compute",
    "@builtin",
    "var<uniform>",
    "var<storage>",
    "texture_2d",
    "texture_depth_2d",
    "texture_2d_array",
    "sampler",
    "sampler_comparison",
    "override ",
    "override\t",
];

/// Validates a user shader snippet against forbidden tokens and requires a specific function signature.
pub fn validate_snippet(snippet: &str, required_entrypoint: &str) -> EffectResult<()> {
    let trimmed = snippet.trim();
    if trimmed.is_empty() {
        return Err(EffectError::EmptySnippet);
    }

    for &token in FORBIDDEN_SHADER_TOKENS {
        if trimmed.contains(token) {
            return Err(EffectError::ForbiddenToken(token.to_string()));
        }
    }

    let pattern = format!("fn {required_entrypoint}(");
    let pattern_space = format!("fn {required_entrypoint} (");
    if !trimmed.contains(&pattern) && !trimmed.contains(&pattern_space) {
        return Err(EffectError::MissingEntrypoint(required_entrypoint.to_string()));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_snippet_rejected() {
        assert_eq!(validate_snippet("   \n\t", "screen_effect"), Err(EffectError::EmptySnippet));
    }

    #[test]
    fn test_forbidden_tokens_rejected() {
        let code = "@group(0) @binding(0) var t: texture_2d<f32>;\nfn screen_effect() {}";
        assert_eq!(
            validate_snippet(code, "screen_effect"),
            Err(EffectError::ForbiddenToken("@group".to_string()))
        );

        let code_vertex = "@vertex fn vs() {}\nfn screen_effect() {}";
        assert_eq!(
            validate_snippet(code_vertex, "screen_effect"),
            Err(EffectError::ForbiddenToken("@vertex".to_string()))
        );
    }

    #[test]
    fn test_missing_entrypoint_rejected() {
        let code = "fn my_custom_calc(val: f32) -> f32 { return val * 2.0; }";
        assert_eq!(
            validate_snippet(code, "screen_effect"),
            Err(EffectError::MissingEntrypoint("screen_effect".to_string()))
        );
    }

    #[test]
    fn test_valid_snippet_accepted() {
        let code = r#"
            fn screen_effect(color: vec4<f32>) -> vec4<f32> {
                return color * 0.5;
            }
        "#;
        assert!(validate_snippet(code, "screen_effect").is_ok());
    }
}
