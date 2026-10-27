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

    let stripped = strip_comments(trimmed);

    for &token in FORBIDDEN_SHADER_TOKENS {
        if contains_forbidden_token(&stripped, token) {
            return Err(EffectError::ForbiddenToken(token.trim().to_string()));
        }
    }

    if !has_entrypoint(&stripped, required_entrypoint) {
        return Err(EffectError::MissingEntrypoint(
            required_entrypoint.to_string(),
        ));
    }

    Ok(())
}

fn is_ident_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn strip_comments(source: &str) -> String {
    let mut output = String::with_capacity(source.len());
    let mut chars = source.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '/' {
            match chars.peek().copied() {
                Some('/') => {
                    chars.next();
                    for n in chars.by_ref() {
                        if n == '\n' {
                            output.push('\n');
                            break;
                        }
                    }
                    continue;
                }
                Some('*') => {
                    chars.next();
                    let mut prev = ' ';
                    for n in chars.by_ref() {
                        if prev == '*' && n == '/' {
                            break;
                        }
                        if n == '\n' {
                            output.push('\n');
                        }
                        prev = n;
                    }
                    continue;
                }
                _ => {}
            }
        }
        output.push(c);
    }
    output
}

fn contains_forbidden_token(code: &str, token: &str) -> bool {
    let token_clean = token.trim();
    if token_clean.is_empty() {
        return false;
    }

    let mut start_idx = 0;
    while let Some(pos) = code[start_idx..].find(token_clean) {
        let abs_pos = start_idx + pos;
        let end_pos = abs_pos + token_clean.len();

        let is_boundary_start = if abs_pos == 0 {
            true
        } else {
            let prev_char = code[..abs_pos].chars().next_back().unwrap();
            if token_clean.starts_with('@') {
                !is_ident_char(prev_char) && prev_char != '@'
            } else {
                !is_ident_char(prev_char)
            }
        };

        let is_boundary_end = if end_pos == code.len() {
            true
        } else {
            let next_char = code[end_pos..].chars().next().unwrap();
            if token_clean.chars().next_back().is_some_and(is_ident_char) {
                !is_ident_char(next_char)
            } else {
                true
            }
        };

        if is_boundary_start && is_boundary_end {
            return true;
        }

        start_idx = abs_pos + 1;
    }
    false
}

fn has_entrypoint(code: &str, entrypoint: &str) -> bool {
    let mut start_idx = 0;
    while let Some(pos) = code[start_idx..].find(entrypoint) {
        let abs_pos = start_idx + pos;
        let end_pos = abs_pos + entrypoint.len();

        let prev_valid = if abs_pos == 0 {
            false
        } else {
            !is_ident_char(code[..abs_pos].chars().next_back().unwrap())
        };

        let next_valid = if end_pos == code.len() {
            false
        } else {
            !is_ident_char(code[end_pos..].chars().next().unwrap())
        };

        if prev_valid && next_valid {
            let prefix = code[..abs_pos].trim_end();
            if prefix.ends_with("fn") {
                let fn_start = prefix.len() - 2;
                let fn_boundary = if fn_start == 0 {
                    true
                } else {
                    !is_ident_char(prefix[..fn_start].chars().next_back().unwrap())
                };

                if fn_boundary {
                    let suffix = code[end_pos..].trim_start();
                    if suffix.starts_with('(') {
                        return true;
                    }
                }
            }
        }
        start_idx = abs_pos + 1;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_snippet_rejected() {
        assert_eq!(
            validate_snippet("   \n\t", "screen_effect"),
            Err(EffectError::EmptySnippet)
        );
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

    #[test]
    fn test_comments_with_forbidden_tokens_ignored() {
        let code = r#"
            // @group(0) @binding(0) comment should be ignored
            /* multiline
               sampler
               @vertex
            */
            fn screen_effect(color: vec4<f32>) -> vec4<f32> {
                return color;
            }
        "#;
        assert!(validate_snippet(code, "screen_effect").is_ok());
    }

    #[test]
    fn test_identifier_with_substring_of_forbidden_token_accepted() {
        let code = r#"
            fn screen_effect(color: vec4<f32>) -> vec4<f32> {
                let resampler = 1.0;
                let my_override = 2.0;
                return color * resampler * my_override;
            }
        "#;
        assert!(validate_snippet(code, "screen_effect").is_ok());
    }
}
