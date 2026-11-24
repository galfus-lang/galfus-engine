//! Unit tests for Realm 3D shadow modes and shader contracts.

use super::*;

#[test]
fn surface_types_select_the_expected_shadow_mode() {
    assert_eq!(
        ShadowSurfaceMode::from_surface_type(SurfaceType3D::Opaque),
        Some(ShadowSurfaceMode::Solid)
    );
    assert_eq!(
        ShadowSurfaceMode::from_surface_type(SurfaceType3D::Mirror),
        Some(ShadowSurfaceMode::Solid)
    );
    assert_eq!(
        ShadowSurfaceMode::from_surface_type(SurfaceType3D::Masked),
        Some(ShadowSurfaceMode::AlphaMask)
    );
    assert_eq!(
        ShadowSurfaceMode::from_surface_type(SurfaceType3D::Transparent),
        Some(ShadowSurfaceMode::AlphaMask)
    );
    assert_eq!(
        ShadowSurfaceMode::from_surface_type(SurfaceType3D::Refractive),
        Some(ShadowSurfaceMode::AlphaMask)
    );
    assert_eq!(
        ShadowSurfaceMode::from_surface_type(SurfaceType3D::Additive),
        None
    );
}

#[test]
fn alpha_shadow_shader_uses_the_material_alpha_contract() {
    assert!(SHADOW_SHADER.contains("@group(1) @binding(1) var mat_tex_0"));
    assert!(SHADOW_SHADER.contains("material.flags.y & 0x3u"));
    assert!(SHADOW_SHADER.contains("material.flags.z & 1u"));
    assert!(SHADOW_SHADER.contains(
        "material.base_color.a * sample_albedo(uv).a * in.vertex_alpha * in.instance_alpha"
    ));
    assert!(SHADOW_SHADER.contains("material.pbr_params.w"));
}

#[test]
fn shadow_shader_applies_morphs_before_skinning() {
    assert!(SHADOW_SHADER.contains("@group(2) @binding(2) var<storage, read> morph_weights"));
    assert!(SHADOW_SHADER.contains("apply_morph_position(vertex_index, &local_pos)"));
    assert!(SHADOW_SHADER.contains("if (bone_count > 0u)"));
}
