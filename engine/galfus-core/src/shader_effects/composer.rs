use crate::id::ContentId;
use crate::shader_effects::error::{EffectError, EffectResult};
use crate::shader_effects::validator::validate_snippet;

/// Placeholder token replaced with the user's validated effect code.
pub const EFFECT_SNIPPET_PLACEHOLDER: &str = "{{EFFECT_SNIPPET}}";
/// Start marker for a WGSL-valid fallback effect block in `.wgsl` template files.
pub const EFFECT_SNIPPET_START: &str = "// {{EFFECT_SNIPPET_START}}";
/// End marker for a WGSL-valid fallback effect block in `.wgsl` template files.
pub const EFFECT_SNIPPET_END: &str = "// {{EFFECT_SNIPPET_END}}";

/// Replaces either a `// {{EFFECT_SNIPPET_START}} ... // {{EFFECT_SNIPPET_END}}` block
/// or the legacy `{{EFFECT_SNIPPET}}` placeholder token in a WGSL template.
pub fn replace_effect_snippet(template: &str, snippet: &str) -> Option<String> {
    let trimmed = snippet.trim();
    if let (Some(start_idx), Some(end_idx)) = (
        template.find(EFFECT_SNIPPET_START),
        template.find(EFFECT_SNIPPET_END),
    ) && start_idx < end_idx
    {
        let replace_end = end_idx + EFFECT_SNIPPET_END.len();
        let mut out = String::with_capacity(template.len() + trimmed.len());
        out.push_str(&template[..start_idx]);
        out.push_str(trimmed);
        out.push_str(&template[replace_end..]);
        return Some(out);
    }

    if template.contains(EFFECT_SNIPPET_PLACEHOLDER) {
        return Some(template.replace(EFFECT_SNIPPET_PLACEHOLDER, trimmed));
    }

    None
}

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
    /// Full template text containing `{{EFFECT_SNIPPET}}` or `// {{EFFECT_SNIPPET_START}} ... // {{EFFECT_SNIPPET_END}}`.
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

        let Some(source) = replace_effect_snippet(&self.template, user_snippet) else {
            return Err(EffectError::MissingPlaceholder(
                EFFECT_SNIPPET_PLACEHOLDER.to_string(),
            ));
        };
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
    fn test_compose_with_fallback_block_markers() {
        let template_src = r#"
// {{EFFECT_SNIPPET_START}}
fn run_effect() -> vec4<f32> {
    return vec4<f32>(0.0);
}
// {{EFFECT_SNIPPET_END}}
"#;
        let template = ShaderEffectTemplate::new(template_src, "run_effect");
        let snippet = "fn run_effect() -> vec4<f32> { return vec4<f32>(1.0); }";

        let composed = template
            .compose(snippet)
            .expect("Should replace fallback block");
        assert!(composed.source.contains("vec4<f32>(1.0)"));
        assert!(!composed.source.contains("vec4<f32>(0.0)"));
        assert!(!composed.source.contains("EFFECT_SNIPPET_START"));
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
