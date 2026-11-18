pub mod composer;
pub mod error;
pub mod validator;

pub use composer::{
    ComposedShader, EFFECT_SNIPPET_END, EFFECT_SNIPPET_PLACEHOLDER, EFFECT_SNIPPET_START,
    ShaderEffectTemplate, replace_effect_snippet,
};
pub use error::{EffectError, EffectResult};
pub use validator::{FORBIDDEN_SHADER_TOKENS, validate_snippet};
