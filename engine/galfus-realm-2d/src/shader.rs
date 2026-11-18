//! Standard 2D WGSL forward shader with dynamic point lights, polar soft shadows, and surface effects.

use crate::surface_effect::compose_surface_shader_2d;

/// Base WGSL template for 2D forward rendering.
pub const SHADER_2D_TEMPLATE: &str = include_str!("shader.wgsl");

/// Compiles a 2D WGSL shader source injecting custom surface effects if provided.
pub fn compile_2d_shader(user_snippet: Option<&str>) -> String {
    compose_surface_shader_2d(SHADER_2D_TEMPLATE, user_snippet)
        .map(|res| res.source)
        .unwrap_or_else(|_| SHADER_2D_TEMPLATE.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compile_default_2d_shader() {
        let source = compile_2d_shader(None);
        assert!(source.contains("fn vs_main"));
        assert!(source.contains("fn fs_main"));
        assert!(source.contains("fn surface_effect"));
    }
}
