//! Forward 3D WGSL Shader with Reverse-Z support and PBR-like lighting.

pub const REALM_3D_SHADER: &str = include_str!("shader.wgsl");

pub const REALM_3D_SHADER_TEMPLATE: &str = REALM_3D_SHADER;

/// Returns the default compiled WGSL shader with passthrough surface effect.
pub fn get_default_realm_3d_shader() -> String {
    REALM_3D_SHADER.replace(
        galfus_core::shader_effects::EFFECT_SNIPPET_PLACEHOLDER,
        crate::surface_effect::BUILTIN_SURFACE_PASSTHROUGH,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masked_surfaces_discard_by_alpha_cutoff() {
        assert!(
            REALM_3D_SHADER
                .contains("surface_type == 2u && s_out.albedo.a < material.pbr_params.w")
        );
        assert!(REALM_3D_SHADER.contains("discard;"));
    }
    #[test]
    fn canonical_vertex_attributes_reach_surface_shading() {
        let source = get_default_realm_3d_shader();
        assert!(source.contains("@location(4) uv1: vec2<f32>"));
        assert!(source.contains("@location(2) world_tangent: vec4<f32>"));
        assert!(source.contains("@location(5) color: vec4<f32>"));
        assert!(source.contains("@location(8) joints1: vec4<u32>"));
        assert!(source.contains("* in.vertex_color * in.instance_color"));
    }

    #[test]
    fn material_texture_slots_select_uv_sets_internally() {
        assert!(REALM_3D_SHADER.contains("(material.flags.z >> slot) & 1u"));
        assert!(REALM_3D_SHADER.contains("return uv1;"));
        assert!(REALM_3D_SHADER.contains("sample_material_texture(0u, in.uv0, in.uv1)"));
    }

    #[test]
    fn normal_maps_use_tangent_space_and_face_orientation() {
        assert!(REALM_3D_SHADER.contains("skin_direction(in.tangent.xyz"));
        assert!(REALM_3D_SHADER.contains("out.world_tangent"));
        assert!(REALM_3D_SHADER.contains("inverse_transpose_mat3(instance_mat)"));
        assert!(REALM_3D_SHADER.contains("sample_material_texture(1u, in.uv0, in.uv1)"));
        assert!(REALM_3D_SHADER.contains("cross(world_normal, tangent)"));
        assert!(REALM_3D_SHADER.contains("material.refraction_params.z"));
        assert!(REALM_3D_SHADER.contains("@builtin(front_facing) front_facing: bool"));
    }

    #[test]
    fn occlusion_strength_only_modulates_ambient_lighting() {
        assert!(REALM_3D_SHADER.contains("mix(1.0, tex_ao.r, material.refraction_params.w)"));
        assert!(REALM_3D_SHADER.contains("* occlusion * in.instance_pbr.w"));
    }
}
