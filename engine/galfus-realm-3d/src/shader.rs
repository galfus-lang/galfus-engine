//! Forward 3D WGSL Shader with Reverse-Z support and PBR-like lighting.

pub const REALM_3D_SHADER: &str = r#"
struct CameraUniform {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    view_projection: mat4x4<f32>,
    position: vec4<f32>,
    direction: vec4<f32>,
    up: vec4<f32>,
    near_far: vec4<f32>,
};

struct EnvironmentUniform {
    ambient_color: vec4<f32>,
    fog_color: vec4<f32>,
    fog_params: vec4<f32>,
    misc_params: vec4<f32>,
};

struct LightUniform {
    position: vec4<f32>,
    direction: vec4<f32>,
    color_intensity: vec4<f32>,
    params: vec4<f32>,
    shadow_view_proj: mat4x4<f32>,
    flags: vec4<u32>,
};

struct LightsHeader {
    count: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

struct MaterialUniform {
    base_color: vec4<f32>,
    emissive_color: vec4<f32>,
    pbr_params: vec4<f32>,
    flags: vec4<u32>,
    refraction_params: vec4<f32>,
    custom_v0: vec4<f32>,
    custom_v1: vec4<f32>,
    custom_v2: vec4<f32>,
    custom_v3: vec4<f32>,
};

struct ModelUniform {
    model: mat4x4<f32>,
    normal_matrix: mat4x4<f32>,
    outline_color: vec4<f32>,
    flags: vec4<u32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(0) @binding(1) var<uniform> env: EnvironmentUniform;
@group(0) @binding(2) var<storage, read> lights: array<LightUniform>;
@group(0) @binding(3) var<uniform> lights_header: LightsHeader;
@group(0) @binding(4) var shadow_map: texture_depth_2d_array;
@group(0) @binding(5) var shadow_sampler: sampler_comparison;
@group(0) @binding(6) var<storage, read> bones: array<mat4x4<f32>>;
@group(0) @binding(7) var<storage, read> shadow_matrices: array<mat4x4<f32>>;

@group(1) @binding(0) var<uniform> material: MaterialUniform;
@group(1) @binding(1) var mat_tex_0: texture_2d<f32>;
@group(1) @binding(2) var mat_tex_1: texture_2d<f32>;
@group(1) @binding(3) var mat_tex_2: texture_2d<f32>;
@group(1) @binding(4) var mat_tex_3: texture_2d<f32>;
@group(1) @binding(5) var mat_tex_4: texture_2d<f32>;
@group(1) @binding(6) var mat_tex_5: texture_2d<f32>;
@group(1) @binding(7) var mat_tex_6: texture_2d<f32>;
@group(1) @binding(8) var mat_tex_7: texture_2d<f32>;
@group(1) @binding(9) var sampler_linear_repeat: sampler;
@group(1) @binding(10) var sampler_linear_clamp: sampler;
@group(1) @binding(11) var sampler_nearest_repeat: sampler;
@group(1) @binding(12) var sampler_nearest_clamp: sampler;

fn sample_texture_with_sampler(tex: texture_2d<f32>, uv: vec2<f32>, sampler_idx: u32) -> vec4<f32> {
    switch (sampler_idx) {
        case 1u: { return textureSample(tex, sampler_linear_clamp, uv); }
        case 2u: { return textureSample(tex, sampler_nearest_repeat, uv); }
        case 3u: { return textureSample(tex, sampler_nearest_clamp, uv); }
        default: { return textureSample(tex, sampler_linear_repeat, uv); }
    }
}

fn sample_material_texture(slot: u32, uv: vec2<f32>, sampler_idx: u32) -> vec4<f32> {
    switch (slot) {
        case 0u: { return sample_texture_with_sampler(mat_tex_0, uv, sampler_idx); }
        case 1u: { return sample_texture_with_sampler(mat_tex_1, uv, sampler_idx); }
        case 2u: { return sample_texture_with_sampler(mat_tex_2, uv, sampler_idx); }
        case 3u: { return sample_texture_with_sampler(mat_tex_3, uv, sampler_idx); }
        case 4u: { return sample_texture_with_sampler(mat_tex_4, uv, sampler_idx); }
        case 5u: { return sample_texture_with_sampler(mat_tex_5, uv, sampler_idx); }
        case 6u: { return sample_texture_with_sampler(mat_tex_6, uv, sampler_idx); }
        case 7u: { return sample_texture_with_sampler(mat_tex_7, uv, sampler_idx); }
        default: { return vec4<f32>(1.0, 1.0, 1.0, 1.0); }
    }
}
@group(2) @binding(0) var<uniform> object: ModelUniform;
@group(3) @binding(0) var opaque_screen_texture: texture_2d<f32>;
@group(3) @binding(1) var opaque_screen_sampler: sampler;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) tangent: vec4<f32>,
    @location(4) joints: vec4<u32>,
    @location(5) weights: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_pos: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) instance_color: vec4<f32>,
    @location(4) instance_emissive: vec4<f32>,
    @location(5) instance_pbr: vec4<f32>,
    @location(6) instance_custom: vec4<f32>,
};

fn bone_at(index: u32, bone_offset: u32, bone_count: u32) -> mat4x4<f32> {
    if (index < bone_count) {
        return bones[bone_offset + index];
    }
    return mat4x4<f32>(
        vec4<f32>(1.0, 0.0, 0.0, 0.0),
        vec4<f32>(0.0, 1.0, 0.0, 0.0),
        vec4<f32>(0.0, 0.0, 1.0, 0.0),
        vec4<f32>(0.0, 0.0, 0.0, 1.0)
    );
}

fn skin_position(position: vec3<f32>, joints: vec4<u32>, weights: vec4<f32>, bone_offset: u32, bone_count: u32) -> vec3<f32> {
    let m0 = bone_at(joints.x, bone_offset, bone_count);
    let m1 = bone_at(joints.y, bone_offset, bone_count);
    let m2 = bone_at(joints.z, bone_offset, bone_count);
    let m3 = bone_at(joints.w, bone_offset, bone_count);
    let skinned = (m0 * vec4<f32>(position, 1.0)) * weights.x
                + (m1 * vec4<f32>(position, 1.0)) * weights.y
                + (m2 * vec4<f32>(position, 1.0)) * weights.z
                + (m3 * vec4<f32>(position, 1.0)) * weights.w;
    return skinned.xyz;
}

fn skin_normal(normal: vec3<f32>, joints: vec4<u32>, weights: vec4<f32>, bone_offset: u32, bone_count: u32) -> vec3<f32> {
    let m0 = bone_at(joints.x, bone_offset, bone_count);
    let m1 = bone_at(joints.y, bone_offset, bone_count);
    let m2 = bone_at(joints.z, bone_offset, bone_count);
    let m3 = bone_at(joints.w, bone_offset, bone_count);
    let skinned = (m0 * vec4<f32>(normal, 0.0)) * weights.x
                + (m1 * vec4<f32>(normal, 0.0)) * weights.y
                + (m2 * vec4<f32>(normal, 0.0)) * weights.z
                + (m3 * vec4<f32>(normal, 0.0)) * weights.w;
    return normalize(skinned.xyz);
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    var local_pos = in.position;
    var local_norm = in.normal;
    let bone_offset = object.flags.y;
    let bone_count = object.flags.z;
    if (bone_count > 0u) {
        local_pos = skin_position(in.position, in.joints, in.weights, bone_offset, bone_count);
        local_norm = skin_normal(in.normal, in.joints, in.weights, bone_offset, bone_count);
    }

    let world_pos4 = object.model * vec4<f32>(local_pos, 1.0);
    out.world_pos = world_pos4.xyz;
    out.clip_position = camera.view_projection * world_pos4;
    out.world_normal = normalize((object.normal_matrix * vec4<f32>(local_norm, 0.0)).xyz);
    out.uv = in.uv;
    out.instance_color = vec4<f32>(1.0, 1.0, 1.0, 1.0);
    out.instance_emissive = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    out.instance_pbr = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    out.instance_custom = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return out;
}

struct InstanceInput {
    @location(6) m0: vec4<f32>,
    @location(7) m1: vec4<f32>,
    @location(8) m2: vec4<f32>,
    @location(9) m3: vec4<f32>,
    @location(10) color: vec4<f32>,
    @location(11) emissive: vec4<f32>,
    @location(12) pbr: vec4<f32>,
    @location(13) custom: vec4<f32>,
};

@vertex
fn vs_instanced_main(in: VertexInput, inst: InstanceInput) -> VertexOutput {
    var out: VertexOutput;

    let model = mat4x4<f32>(inst.m0, inst.m1, inst.m2, inst.m3);
    var world_pos4 = model * vec4<f32>(in.position, 1.0);

    // Procedural wind vertex displacement if custom.x (amplitude) > 0.0
    let wind_amp = inst.custom.x;
    if (wind_amp > 0.0) {
        let time = env.misc_params.z;
        let wind_freq = max(inst.custom.y, 0.5);
        let height_factor = pow(clamp(in.uv.y, 0.0, 1.0), 1.5);
        let wave = sin(time * wind_freq * 3.0 + world_pos4.x * 0.4 + world_pos4.z * 0.4);
        world_pos4.x = world_pos4.x + wave * wind_amp * height_factor;
        world_pos4.z = world_pos4.z + cos(time * wind_freq * 2.0 + world_pos4.x * 0.3) * wind_amp * 0.5 * height_factor;
    }

    out.world_pos = world_pos4.xyz;
    out.clip_position = camera.view_projection * world_pos4;

    // Normal transform via 3x3 rotational submatrix
    let normal_mat = mat3x3<f32>(inst.m0.xyz, inst.m1.xyz, inst.m2.xyz);
    out.world_normal = normalize(normal_mat * in.normal);

    out.uv = in.uv;
    out.instance_color = inst.color;
    out.instance_emissive = inst.emissive;
    out.instance_pbr = inst.pbr;
    out.instance_custom = inst.custom;
    return out;
}

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
    albedo: vec4<f32>,
    emissive: vec3<f32>,
    roughness: f32,
    metallic: f32,
    reflectance: f32,
    time: f32,
    sampler_index: u32,
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

// --- Surface Effect Hook Snippet ---
{{EFFECT_SNIPPET}}

fn resolve_point_face(dir: vec3<f32>) -> u32 {
    let ad = abs(dir);
    if (ad.x >= ad.y && ad.x >= ad.z) {
        return select(1u, 0u, dir.x >= 0.0);
    } else if (ad.y >= ad.x && ad.y >= ad.z) {
        return select(3u, 2u, dir.y >= 0.0);
    } else {
        return select(5u, 4u, dir.z >= 0.0);
    }
}

fn resolve_secondary_point_face(dir: vec3<f32>, primary: u32) -> u32 {
    let ad = abs(dir);
    if (primary == 0u || primary == 1u) {
        if (ad.y >= ad.z) { return select(3u, 2u, dir.y >= 0.0); }
        return select(5u, 4u, dir.z >= 0.0);
    } else if (primary == 2u || primary == 3u) {
        if (ad.x >= ad.z) { return select(1u, 0u, dir.x >= 0.0); }
        return select(5u, 4u, dir.z >= 0.0);
    } else {
        if (ad.x >= ad.y) { return select(1u, 0u, dir.x >= 0.0); }
        return select(3u, 2u, dir.y >= 0.0);
    }
}

fn resolve_tertiary_point_face(dir: vec3<f32>, primary: u32, secondary: u32) -> u32 {
    let p_axis = primary / 2u;
    let s_axis = secondary / 2u;
    let t_axis = 3u - p_axis - s_axis;
    if (t_axis == 0u) {
        return select(1u, 0u, dir.x >= 0.0);
    } else if (t_axis == 1u) {
        return select(3u, 2u, dir.y >= 0.0);
    } else {
        return select(5u, 4u, dir.z >= 0.0);
    }
}

fn sample_shadow_layer(
    layer: u32,
    world_pos: vec3<f32>,
    normal: vec3<f32>,
    light_dir: vec3<f32>
) -> f32 {
    let slope = 1.0 - max(dot(normal, light_dir), 0.0);
    // Normal offset bias moves test point slightly along surface normal,
    // anchoring shadows cleanly to model contact bases without Peter Panning.
    let biased_pos = world_pos + normal * (0.008 + 0.012 * slope);
    let shadow_mat = shadow_matrices[layer];
    let shadow_clip = shadow_mat * vec4<f32>(biased_pos, 1.0);
    if (shadow_clip.w <= 1e-5) {
        return 1.0;
    }
    let shadow_ndc = shadow_clip.xyz / shadow_clip.w;
    if (shadow_ndc.x < -1.0 || shadow_ndc.x > 1.0 || shadow_ndc.y < -1.0 || shadow_ndc.y > 1.0 || shadow_ndc.z < 0.0 || shadow_ndc.z > 1.0) {
        return 1.0;
    }
    let shadow_uv = clamp(vec2<f32>(shadow_ndc.x * 0.5 + 0.5, -shadow_ndc.y * 0.5 + 0.5), vec2<f32>(0.0), vec2<f32>(1.0));
    let bias = 0.00002 + 0.00004 * slope;
    let ref_depth = clamp(shadow_ndc.z + bias, 0.0, 1.0);
    let texel = 1.0 / 2048.0;
    let s0 = textureSampleCompare(shadow_map, shadow_sampler, shadow_uv + vec2<f32>(-texel, -texel), i32(layer), ref_depth);
    let s1 = textureSampleCompare(shadow_map, shadow_sampler, shadow_uv + vec2<f32>(texel, -texel), i32(layer), ref_depth);
    let s2 = textureSampleCompare(shadow_map, shadow_sampler, shadow_uv + vec2<f32>(-texel, texel), i32(layer), ref_depth);
    let s3 = textureSampleCompare(shadow_map, shadow_sampler, shadow_uv + vec2<f32>(texel, texel), i32(layer), ref_depth);
    return (s0 + s1 + s2 + s3) * 0.25;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let mat_sampler_idx = material.flags.y;
    let tex_albedo = sample_texture_with_sampler(mat_tex_0, in.uv, mat_sampler_idx);
    let tex_mr = sample_texture_with_sampler(mat_tex_2, in.uv, mat_sampler_idx);
    let tex_ao = sample_texture_with_sampler(mat_tex_3, in.uv, mat_sampler_idx);
    let tex_emissive = sample_texture_with_sampler(mat_tex_4, in.uv, mat_sampler_idx);

    var s_in: SurfaceInput;
    s_in.world_pos = in.world_pos;
    s_in.world_normal = normalize(in.world_normal);
    s_in.view_dir = normalize(camera.position.xyz - in.world_pos);
    s_in.uv = in.uv;
    s_in.albedo = material.base_color * tex_albedo * in.instance_color;
    s_in.emissive = material.emissive_color.rgb + tex_emissive.rgb + in.instance_emissive.rgb * in.instance_emissive.w;
    s_in.roughness = clamp((material.pbr_params.x + in.instance_pbr.y) * tex_mr.g, 0.04, 1.0);
    s_in.metallic = clamp(material.pbr_params.y * tex_mr.b + in.instance_pbr.x, 0.0, 1.0);
    s_in.reflectance = material.pbr_params.z;
    s_in.time = env.misc_params.z;
    s_in.sampler_index = mat_sampler_idx;
    s_in.custom.v0 = material.custom_v0;
    s_in.custom.v1 = material.custom_v1;
    s_in.custom.v2 = material.custom_v2;
    s_in.custom.v3 = material.custom_v3;
    s_in.instance_color = in.instance_color;
    s_in.instance_emissive = in.instance_emissive;
    s_in.instance_pbr = in.instance_pbr;
    s_in.instance_custom = in.instance_custom;

    let s_out = surface_effect(s_in);

    let N = normalize(s_out.normal);
    let V = s_in.view_dir;

    let albedo = s_out.albedo;
    var direct_light = vec3<f32>(0.0);

    let roughness = clamp(s_out.roughness, 0.04, 1.0);
    let metallic = clamp(s_out.metallic, 0.0, 1.0);
    let shininess = (2.0 / (roughness * roughness)) - 2.0;

    let light_count = lights_header.count;
    for (var i = 0u; i < light_count; i = i + 1u) {
        let light = lights[i];
        let kind_code = u32(round(light.params.w));

        var L: vec3<f32>;
        var attenuation: f32 = 1.0;

        if (kind_code == 0u) {
            // Directional Light
            L = normalize(-light.direction.xyz);
        } else {
            // Point or Spot Light
            let to_light = light.position.xyz - in.world_pos;
            let dist = length(to_light);
            let range = light.params.x;
            if (range > 0.0 && dist > range) {
                continue;
            }
            L = normalize(to_light);
            attenuation = 1.0 / max(1.0 + (dist / max(range, 0.1)) * (dist / max(range, 0.1)), 0.001);

            if (kind_code == 2u) {
                // Spot Light cone attenuation
                let spot_cos = dot(-L, normalize(light.direction.xyz));
                let inner_cos = light.params.y;
                let outer_cos = light.params.z;
                let spot_factor = clamp((spot_cos - outer_cos) / max(inner_cos - outer_cos, 0.001), 0.0, 1.0);
                attenuation = attenuation * spot_factor;
            }
        }

        var shadow_factor: f32 = 1.0;
        let cast_shadow = (light.flags.x & 1u) != 0u;
        let receive_shadow = (object.flags.x & 1u) != 0u;
        let base_layer = light.flags.y;
        if (cast_shadow && receive_shadow && base_layer < 16u && kind_code <= 2u) {
            if (kind_code == 1u) {
                let to_frag = in.world_pos - light.position.xyz;
                let primary_face = resolve_point_face(to_frag);
                let primary_layer = base_layer + primary_face;
                var vis = 1.0;
                if (primary_layer < 16u) {
                    vis = sample_shadow_layer(primary_layer, in.world_pos, N, L);
                }

                let ad = abs(to_frag);
                let major = max(ad.x, max(ad.y, ad.z));
                let minor = ad.x + ad.y + ad.z - major - min(ad.x, min(ad.y, ad.z));
                let min_c = min(ad.x, min(ad.y, ad.z));

                if (major > 0.0 && (major - minor) / major < 0.08) {
                    let secondary_face = resolve_secondary_point_face(to_frag, primary_face);
                    let secondary_layer = base_layer + secondary_face;
                    if (secondary_layer < 16u) {
                        let sec_vis = sample_shadow_layer(secondary_layer, in.world_pos, N, L);
                        vis = min(vis, sec_vis);
                    }

                    if ((major - min_c) / major < 0.08) {
                        let tertiary_face = resolve_tertiary_point_face(to_frag, primary_face, secondary_face);
                        let tertiary_layer = base_layer + tertiary_face;
                        if (tertiary_layer < 16u) {
                            let tert_vis = sample_shadow_layer(tertiary_layer, in.world_pos, N, L);
                            vis = min(vis, tert_vis);
                        }
                    }
                }
                shadow_factor = vis;
            } else {
                let shadow_layer = base_layer;
                if (shadow_layer < 16u) {
                    shadow_factor = sample_shadow_layer(shadow_layer, in.world_pos, N, L);
                }
            }
        }

        let NdotL = max(dot(N, L), 0.0);
        if (NdotL > 0.0) {
            let H = normalize(L + V);
            let NdotH = max(dot(N, H), 0.0);
            let spec = pow(NdotH, max(shininess, 1.0));

            let diffuse = albedo.rgb * light.color_intensity.rgb * NdotL * (1.0 - metallic);
            let specular = light.color_intensity.rgb * spec * mix(vec3<f32>(0.04), albedo.rgb, metallic);

            direct_light = direct_light + (diffuse + specular) * attenuation * shadow_factor * light.color_intensity.a;
        }
    }

    let ambient = albedo.rgb * env.ambient_color.rgb * env.ambient_color.a * tex_ao.r * in.instance_pbr.w;
    var final_color = ambient + direct_light + s_out.emissive;

    // Refraction transmission for glass, water, crystals
    let is_refractive = (material.flags.x & 7u) == 4u;
    if (is_refractive) {
        let screen_dims = vec2<f32>(textureDimensions(opaque_screen_texture));
        let screen_uv = in.clip_position.xy / max(screen_dims, vec2<f32>(1.0));
        let view_normal = (camera.view * vec4<f32>(N, 0.0)).xy;
        let distortion = material.refraction_params.y;
        let refr_uv = clamp(screen_uv - view_normal * distortion, vec2<f32>(0.001), vec2<f32>(0.999));
        let bg_color = textureSample(opaque_screen_texture, opaque_screen_sampler, refr_uv).rgb;

        let fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        let transmitted = mix(bg_color, bg_color * albedo.rgb, albedo.a);
        let spec_reflection = direct_light + vec3<f32>(fresnel * material.pbr_params.z);
        final_color = transmitted + spec_reflection + s_out.emissive;
    }

    // Planar reflection for mirrors (5u) and optical portals (6u)
    let is_mirror_or_portal = (material.flags.x & 7u) == 5u || (material.flags.x & 7u) == 6u;
    if (is_mirror_or_portal) {
        let screen_dims = vec2<f32>(textureDimensions(opaque_screen_texture));
        var screen_uv = in.clip_position.xy / max(screen_dims, vec2<f32>(1.0));
        if ((material.flags.x & 7u) == 5u) {
            screen_uv.x = 1.0 - screen_uv.x;
        }
        let refl_color = textureSample(opaque_screen_texture, opaque_screen_sampler, screen_uv).rgb;
        if ((material.flags.x & 7u) == 5u) {
            let fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.0);
            let tint = mix(albedo.rgb, vec3<f32>(1.0), fresnel * 0.4);
            let refl_strength = material.pbr_params.z;
            final_color = refl_color * tint * refl_strength + direct_light + s_out.emissive;
        } else {
            final_color = refl_color + s_out.emissive;
        }
    }

    // Fog blending
    let fog_mode = u32(round(env.fog_params.w));
    if (fog_mode > 0u) {
        let dist = distance(camera.position.xyz, in.world_pos);
        var fog_factor: f32 = 0.0;
        if (fog_mode == 1u) {
            // Linear fog
            let start = env.fog_params.x;
            let end = env.fog_params.y;
            fog_factor = clamp((dist - start) / max(end - start, 0.001), 0.0, 1.0);
        } else if (fog_mode == 2u) {
            // Exponential fog
            let density = env.fog_params.z;
            fog_factor = 1.0 - clamp(exp(-dist * density), 0.0, 1.0);
        }
        final_color = mix(final_color, env.fog_color.rgb, fog_factor);
    }

    var out_alpha = albedo.a;
    if (is_refractive || is_mirror_or_portal) {
        out_alpha = 1.0;
    }
    return vec4<f32>(final_color, out_alpha);
}
"#;

pub const REALM_3D_SHADER_TEMPLATE: &str = REALM_3D_SHADER;

/// Returns the default compiled WGSL shader with passthrough surface effect.
pub fn get_default_realm_3d_shader() -> String {
    REALM_3D_SHADER.replace(
        galfus_core::shader_effects::EFFECT_SNIPPET_PLACEHOLDER,
        crate::surface_effect::BUILTIN_SURFACE_PASSTHROUGH,
    )
}
