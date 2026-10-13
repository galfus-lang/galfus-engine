use crate::id::ContentId;
use crate::shader_effects::error::{EffectError, EffectResult};
use crate::shader_effects::validator::validate_snippet;

/// Placeholder token replaced with the user's validated effect code.
pub const EFFECT_SNIPPET_PLACEHOLDER: &str = "{{EFFECT_SNIPPET}}";

/// Result of a successfully validated and composed shader effect.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ComposedShader {
    /// Complete, self-contained WGSL source code ready for compilation.
    pub source: String,
    /// Deterministic 64-bit content identifier for pipeline and shader caching.
    pub content_id: ContentId,
}

/// Generic, domain-agnostic template for shader effects.
/// Combines engine boilerplate (preludes, pipeline structs, and entrypoint hooks)
/// with a validated user effect snippet.
#[derive(Debug, Clone)]
pub struct ShaderEffectTemplate {
    /// Full template text containing `{{EFFECT_SNIPPET}}`.
    pub template: String,
    /// The name of the function required inside the user snippet.
    pub required_entrypoint: String,
}

impl ShaderEffectTemplate {
    /// Constructs a new template with the given source and required entrypoint function name.
    pub fn new(template: impl Into<String>, required_entrypoint: impl Into<String>) -> Self {
        Self {
            template: template.into(),
            required_entrypoint: required_entrypoint.into(),
        }
    }

    /// Validates the user snippet and composes the final WGSL source code.
    pub fn compose(&self, user_snippet: &str) -> EffectResult<ComposedShader> {
        validate_snippet(user_snippet, &self.required_entrypoint)?;

        if !self.template.contains(EFFECT_SNIPPET_PLACEHOLDER) {
            return Err(EffectError::MissingPlaceholder(
                EFFECT_SNIPPET_PLACEHOLDER.to_string(),
            ));
        }

        let source = self
            .template
            .replace(EFFECT_SNIPPET_PLACEHOLDER, user_snippet.trim());
        let content_id = ContentId::from_bytes(source.as_bytes());

        Ok(ComposedShader { source, content_id })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compose_success() {
        let template_src = r#"
// Domain prelude
struct Input { uv: vec2<f32> };

// User code
{{EFFECT_SNIPPET}}

// Entrypoint hook
@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return run_effect();
}
"#;
        let template = ShaderEffectTemplate::new(template_src, "run_effect");
        let snippet = "fn run_effect() -> vec4<f32> { return vec4<f32>(1.0); }";

        let composed = template.compose(snippet).expect("Should compose cleanly");
        assert!(composed.source.contains("fn run_effect()"));
        assert!(composed.source.contains("// Domain prelude"));
        assert_ne!(composed.content_id.as_u64(), 0);
    }

    #[test]
    fn test_compose_missing_placeholder() {
        let template_src = "// No placeholder here\nfn dummy() {}";
        let template = ShaderEffectTemplate::new(template_src, "run_effect");
        let snippet = "fn run_effect() {}";

        assert_eq!(
            template.compose(snippet),
            Err(EffectError::MissingPlaceholder(
                EFFECT_SNIPPET_PLACEHOLDER.to_string()
            ))
        );
    }
}
