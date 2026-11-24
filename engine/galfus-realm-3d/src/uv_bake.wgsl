struct UvBakeUniform {
    view_proj: mat4x4<f32>,
    direction: vec4<f32>,
    color: vec4<f32>,
    uv_rect: vec4<f32>,
    flags: vec4<u32>,
};

struct ModelUniform {
    model: mat4x4<f32>,
    normal_matrix: mat4x4<f32>,
    outline_color: vec4<f32>,
    flags: vec4<u32>,
    layer_mask: vec4<u32>,
};

struct MorphVertex {
    position: vec4<f32>,
    normal: vec4<f32>,
    tangent: vec4<f32>,
};

@group(0) @binding(0) var<uniform> bake: UvBakeUniform;
@group(0) @binding(1) var<storage, read> bones: array<mat4x4<f32>>;
@group(0) @binding(2) var decal_tex: texture_2d<f32>;
@group(0) @binding(3) var decal_sampler: sampler;

@group(1) @binding(0) var<uniform> object: ModelUniform;
@group(1) @binding(2) var<storage, read> morph_weights: array<f32>;
@group(1) @binding(3) var<storage, read> morph_targets: array<MorphVertex>;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv0: vec2<f32>,
    @location(3) uv1: vec2<f32>,
    @location(4) tangent: vec4<f32>,
    @location(5) color: vec4<f32>,
    @location(6) joints0: vec4<u32>,
    @location(7) weights0: vec4<f32>,
    @location(8) joints1: vec4<u32>,
    @location(9) weights1: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_pos: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
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

fn skin_position(
    position: vec3<f32>,
    joints0: vec4<u32>,
    weights0: vec4<f32>,
    joints1: vec4<u32>,
    weights1: vec4<f32>,
    bone_offset: u32,
    bone_count: u32,
) -> vec3<f32> {
    let p = vec4<f32>(position, 1.0);
    let skinned = (bone_at(joints0.x, bone_offset, bone_count) * p) * weights0.x
                + (bone_at(joints0.y, bone_offset, bone_count) * p) * weights0.y
                + (bone_at(joints0.z, bone_offset, bone_count) * p) * weights0.z
                + (bone_at(joints0.w, bone_offset, bone_count) * p) * weights0.w
                + (bone_at(joints1.x, bone_offset, bone_count) * p) * weights1.x
                + (bone_at(joints1.y, bone_offset, bone_count) * p) * weights1.y
                + (bone_at(joints1.z, bone_offset, bone_count) * p) * weights1.z
                + (bone_at(joints1.w, bone_offset, bone_count) * p) * weights1.w;
    return skinned.xyz;
}

fn skin_direction(
    direction: vec3<f32>,
    joints0: vec4<u32>,
    weights0: vec4<f32>,
    joints1: vec4<u32>,
    weights1: vec4<f32>,
    bone_offset: u32,
    bone_count: u32,
) -> vec3<f32> {
    let d = vec4<f32>(direction, 0.0);
    let skinned = (bone_at(joints0.x, bone_offset, bone_count) * d) * weights0.x
                + (bone_at(joints0.y, bone_offset, bone_count) * d) * weights0.y
                + (bone_at(joints0.z, bone_offset, bone_count) * d) * weights0.z
                + (bone_at(joints0.w, bone_offset, bone_count) * d) * weights0.w
                + (bone_at(joints1.x, bone_offset, bone_count) * d) * weights1.x
                + (bone_at(joints1.y, bone_offset, bone_count) * d) * weights1.y
                + (bone_at(joints1.z, bone_offset, bone_count) * d) * weights1.z
                + (bone_at(joints1.w, bone_offset, bone_count) * d) * weights1.w;
    return normalize(skinned.xyz);
}

@vertex
fn vs_uv_bake(@builtin(vertex_index) vertex_index: u32, in: VertexInput) -> VertexOutput {
    var local_pos = in.position;
    var local_normal = in.normal;

    if (bake.flags.x != 0u) {
        let target_count = object.flags.w;
        if (target_count > 0u) {
            let vertex_count = arrayLength(&morph_targets) / target_count;
            for (var t = 0u; t < target_count; t++) {
                let delta = morph_targets[t * vertex_count + vertex_index];
                let w = morph_weights[t];
                local_pos += delta.position.xyz * w;
                local_normal += delta.normal.xyz * w;
            }
        }
        let bone_offset = object.flags.y;
        let bone_count = object.flags.z;
        if (bone_count > 0u) {
            local_pos = skin_position(local_pos, in.joints0, in.weights0, in.joints1, in.weights1, bone_offset, bone_count);
            local_normal = skin_direction(local_normal, in.joints0, in.weights0, in.joints1, in.weights1, bone_offset, bone_count);
        }
    }

    let world_pos = (object.model * vec4<f32>(local_pos, 1.0)).xyz;
    let world_normal = normalize((object.normal_matrix * vec4<f32>(local_normal, 0.0)).xyz);
    let uv = select(in.uv0, in.uv1, bake.flags.y != 0u);

    var out: VertexOutput;
    out.clip_position = vec4<f32>(uv.x * 2.0 - 1.0, (1.0 - uv.y) * 2.0 - 1.0, 0.0, 1.0);
    out.world_pos = world_pos;
    out.world_normal = world_normal;
    return out;
}

@fragment
fn fs_uv_bake(in: VertexOutput) -> @location(0) vec4<f32> {
    let clip = bake.view_proj * vec4<f32>(in.world_pos, 1.0);
    if (clip.w <= 1e-5) {
        discard;
    }
    let ndc = clip.xyz / clip.w;
    if (ndc.x < -1.0 || ndc.x > 1.0 || ndc.y < -1.0 || ndc.y > 1.0 || ndc.z < 0.0 || ndc.z > 1.0) {
        discard;
    }

    let facing = dot(normalize(in.world_normal), -normalize(bake.direction.xyz));
    if (facing <= 0.0) {
        discard;
    }
    let fade = bake.direction.w;
    let angle_weight = select(1.0, smoothstep(0.0, fade, facing), fade > 1e-4);

    let proj_uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    let sample_uv = mix(bake.uv_rect.xy, bake.uv_rect.zw, proj_uv);

    var tex_color = vec4<f32>(1.0, 1.0, 1.0, 1.0);
    if (bake.flags.z != 0u) {
        tex_color = textureSampleLevel(decal_tex, decal_sampler, sample_uv, 0.0);
    }

    let alpha = tex_color.a * bake.color.a * angle_weight;
    if (alpha <= 1e-4) {
        discard;
    }

    let rgb = tex_color.rgb * bake.color.rgb;
    if (bake.flags.w == 1u) {
        return vec4<f32>(mix(vec3<f32>(1.0), rgb, alpha), 1.0);
    }
    return vec4<f32>(rgb, alpha);
}
