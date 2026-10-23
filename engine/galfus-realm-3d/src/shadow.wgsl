struct ShadowUniform {
    view_proj: mat4x4<f32>,
    misc: vec4<f32>,
};

struct ModelUniform {
    model: mat4x4<f32>,
    normal_matrix: mat4x4<f32>,
    outline_color: vec4<f32>,
    flags: vec4<u32>,
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

@group(0) @binding(0) var<uniform> shadow: ShadowUniform;
@group(0) @binding(1) var<storage, read> bones: array<mat4x4<f32>>;
@group(1) @binding(0) var<uniform> material: MaterialUniform;
@group(1) @binding(1) var mat_tex_0: texture_2d<f32>;
@group(1) @binding(9) var sampler_linear_repeat: sampler;
@group(1) @binding(10) var sampler_linear_clamp: sampler;
@group(1) @binding(11) var sampler_nearest_repeat: sampler;
@group(1) @binding(12) var sampler_nearest_clamp: sampler;
@group(2) @binding(0) var<uniform> object: ModelUniform;

struct InstanceData {
    transform: mat4x4<f32>,
    color: vec4<f32>,
    emissive: vec4<f32>,
    pbr: vec4<f32>,
    custom: vec4<f32>,
};
@group(2) @binding(1) var<storage, read> instances: array<InstanceData>;

struct MorphVertex {
    position: vec4<f32>,
    normal: vec4<f32>,
    tangent: vec4<f32>,
};
@group(2) @binding(2) var<storage, read> morph_weights: array<f32>;
@group(2) @binding(3) var<storage, read> morph_targets: array<MorphVertex>;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv0: vec2<f32>,
    @location(2) uv1: vec2<f32>,
    @location(3) color: vec4<f32>,
    @location(4) joints0: vec4<u32>,
    @location(5) weights0: vec4<f32>,
    @location(6) joints1: vec4<u32>,
    @location(7) weights1: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv0: vec2<f32>,
    @location(1) uv1: vec2<f32>,
    @location(2) vertex_alpha: f32,
    @location(3) instance_alpha: f32,
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

fn skin_position(position: vec3<f32>, joints0: vec4<u32>, weights0: vec4<f32>, joints1: vec4<u32>, weights1: vec4<f32>, bone_offset: u32, bone_count: u32) -> vec3<f32> {
    let m0 = bone_at(joints0.x, bone_offset, bone_count);
    let m1 = bone_at(joints0.y, bone_offset, bone_count);
    let m2 = bone_at(joints0.z, bone_offset, bone_count);
    let m3 = bone_at(joints0.w, bone_offset, bone_count);
    let m4 = bone_at(joints1.x, bone_offset, bone_count);
    let m5 = bone_at(joints1.y, bone_offset, bone_count);
    let m6 = bone_at(joints1.z, bone_offset, bone_count);
    let m7 = bone_at(joints1.w, bone_offset, bone_count);
    let skinned = (m0 * vec4<f32>(position, 1.0)) * weights0.x
                + (m1 * vec4<f32>(position, 1.0)) * weights0.y
                + (m2 * vec4<f32>(position, 1.0)) * weights0.z
                + (m3 * vec4<f32>(position, 1.0)) * weights0.w
                + (m4 * vec4<f32>(position, 1.0)) * weights1.x
                + (m5 * vec4<f32>(position, 1.0)) * weights1.y
                + (m6 * vec4<f32>(position, 1.0)) * weights1.z
                + (m7 * vec4<f32>(position, 1.0)) * weights1.w;
    return skinned.xyz;
}

fn apply_morph_position(vertex_index: u32, position: ptr<function, vec3<f32>>) {
    let target_count = object.flags.w;
    if (target_count == 0u) {
        return;
    }
    let vertex_count = arrayLength(&morph_targets) / target_count;
    for (var target_index = 0u; target_index < target_count; target_index++) {
        *position = *position + morph_targets[target_index * vertex_count + vertex_index].position.xyz * morph_weights[target_index];
    }
}

@vertex
fn vs_main(in: VertexInput, @builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var local_pos = in.position;
    apply_morph_position(vertex_index, &local_pos);
    let bone_offset = object.flags.y;
    let bone_count = object.flags.z;
    if (bone_count > 0u) {
        local_pos = skin_position(in.position, in.joints0, in.weights0, in.joints1, in.weights1, bone_offset, bone_count);
    }
    let world_pos = object.model * vec4<f32>(local_pos, 1.0);
    var out: VertexOutput;
    out.clip_position = shadow.view_proj * world_pos;
    out.uv0 = in.uv0;
    out.uv1 = in.uv1;
    out.vertex_alpha = in.color.a;
    out.instance_alpha = 1.0;
    return out;
}

@vertex
fn vs_instanced_main(in: VertexInput, @builtin(instance_index) instance_index: u32, @builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    let inst = instances[instance_index];
    var local_pos = in.position;
    apply_morph_position(vertex_index, &local_pos);
    let bone_offset = object.flags.y;
    let bone_count = object.flags.z;
    if (bone_count > 0u) {
        local_pos = skin_position(in.position, in.joints0, in.weights0, in.joints1, in.weights1, bone_offset, bone_count);
    }
    var world_pos4 = inst.transform * vec4<f32>(local_pos, 1.0);

    // Procedural wind vertex displacement if custom.x (amplitude) > 0.0
    let wind_amp = inst.custom.x;
    if (wind_amp > 0.0) {
        let time = shadow.misc.z;
        let wind_freq = max(inst.custom.y, 0.5);
        let height_factor = pow(clamp(in.uv0.y, 0.0, 1.0), 1.5);
        let wave = sin(time * wind_freq * 3.0 + world_pos4.x * 0.4 + world_pos4.z * 0.4);
        world_pos4.x += wave * wind_amp * height_factor;
        world_pos4.z += cos(time * wind_freq * 2.5 + world_pos4.z * 0.3) * wind_amp * 0.5 * height_factor;
    }

    var out: VertexOutput;
    out.clip_position = shadow.view_proj * world_pos4;
    out.uv0 = in.uv0;
    out.uv1 = in.uv1;
    out.vertex_alpha = in.color.a;
    out.instance_alpha = inst.color.a;
    return out;
}

fn sample_albedo(uv: vec2<f32>) -> vec4<f32> {
    let sampler_idx = material.flags.y & 0x3u;
    switch (sampler_idx) {
        case 1u: { return textureSample(mat_tex_0, sampler_linear_clamp, uv); }
        case 2u: { return textureSample(mat_tex_0, sampler_nearest_repeat, uv); }
        case 3u: { return textureSample(mat_tex_0, sampler_nearest_clamp, uv); }
        default: { return textureSample(mat_tex_0, sampler_linear_repeat, uv); }
    }
}

@fragment
fn fs_alpha_mask(in: VertexOutput) {
    let uv = select(in.uv0, in.uv1, (material.flags.z & 1u) == 1u);
    let alpha = material.base_color.a * sample_albedo(uv).a * in.vertex_alpha * in.instance_alpha;
    if (alpha < material.pbr_params.w) {
        discard;
    }
}

