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

@group(1) @binding(0) var<uniform> material: MaterialUniform;
@group(2) @binding(0) var<uniform> object: ModelUniform;

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
    custom: CustomParams,
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

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var s_in: SurfaceInput;
    s_in.world_pos = in.world_pos;
    s_in.world_normal = normalize(in.world_normal);
    s_in.view_dir = normalize(camera.position.xyz - in.world_pos);
    s_in.uv = in.uv;
    s_in.albedo = material.base_color;
    s_in.emissive = material.emissive_color.rgb;
    s_in.roughness = clamp(material.pbr_params.x, 0.04, 1.0);
    s_in.metallic = clamp(material.pbr_params.y, 0.0, 1.0);
    s_in.reflectance = material.pbr_params.z;
    s_in.time = env.misc_params.z;
    s_in.custom.v0 = material.custom_v0;
    s_in.custom.v1 = material.custom_v1;
    s_in.custom.v2 = material.custom_v2;
    s_in.custom.v3 = material.custom_v3;

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
        let shadow_layer = light.flags.y;
        if (cast_shadow && receive_shadow && shadow_layer < 4u && kind_code <= 2u) {
            let shadow_clip = light.shadow_view_proj * vec4<f32>(in.world_pos, 1.0);
            if (shadow_clip.w > 1e-5) {
                let shadow_ndc = shadow_clip.xyz / shadow_clip.w;
                let shadow_uv = vec2<f32>(shadow_ndc.x * 0.5 + 0.5, -shadow_ndc.y * 0.5 + 0.5);
                if (shadow_uv.x >= 0.001 && shadow_uv.x <= 0.999 && shadow_uv.y >= 0.001 && shadow_uv.y <= 0.999 && shadow_ndc.z >= 0.0 && shadow_ndc.z <= 1.0) {
                    let slope = 1.0 - max(dot(N, L), 0.0);
                    let bias = 0.0001 + 0.0004 * slope;
                    let ref_depth = clamp(shadow_ndc.z + bias, 0.0, 1.0);
                    let texel = 1.0 / 2048.0;
                    let s0 = textureSampleCompare(shadow_map, shadow_sampler, shadow_uv + vec2<f32>(-texel, -texel), i32(shadow_layer), ref_depth);
                    let s1 = textureSampleCompare(shadow_map, shadow_sampler, shadow_uv + vec2<f32>(texel, -texel), i32(shadow_layer), ref_depth);
                    let s2 = textureSampleCompare(shadow_map, shadow_sampler, shadow_uv + vec2<f32>(-texel, texel), i32(shadow_layer), ref_depth);
                    let s3 = textureSampleCompare(shadow_map, shadow_sampler, shadow_uv + vec2<f32>(texel, texel), i32(shadow_layer), ref_depth);
                    shadow_factor = (s0 + s1 + s2 + s3) * 0.25;
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

    let ambient = albedo.rgb * env.ambient_color.rgb * env.ambient_color.a;
    var final_color = ambient + direct_light + s_out.emissive;

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

    return vec4<f32>(final_color, albedo.a);
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
