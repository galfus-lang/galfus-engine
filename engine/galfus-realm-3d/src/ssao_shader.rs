//! WGSL Shaders for SSAO generation, bilateral blur, and blending.

pub const SSAO_SHADER: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

struct SsaoParams {
    proj: mat4x4<f32>,
    inv_proj: mat4x4<f32>,
    params0: vec4<f32>, // radius, bias, power, intensity
    params1: vec4<f32>, // texel.x, texel.y, 0.0, seed
};

@group(0) @binding(0) var t_depth: texture_depth_2d;
@group(0) @binding(1) var<uniform> ssao: SsaoParams;

@vertex
fn vs_main(@builtin(vertex_index) id: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(id << 1u) & 2) * 2.0 - 1.0;
    let y = f32(i32(id & 2u) * -2) + 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

fn rand(v: vec2<f32>, seed: f32) -> f32 {
    let n = dot(v, vec2<f32>(12.9898, 78.233)) + seed * 0.01;
    return fract(sin(n) * 43758.5453);
}

fn depth_at(uv: vec2<f32>) -> f32 {
    let dims = vec2<f32>(textureDimensions(t_depth));
    let coord = clamp(uv * dims, vec2<f32>(0.0), dims - vec2<f32>(1.0));
    return textureLoad(t_depth, vec2<i32>(coord), 0);
}

fn view_pos_from_depth(uv: vec2<f32>, depth: f32) -> vec3<f32> {
    let ndc = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - 2.0 * uv.y, depth, 1.0);
    let view = ssao.inv_proj * ndc;
    return view.xyz / max(abs(view.w), 1e-6);
}

// 16-sample hemisphere kernel oriented towards +Z
const KERNEL: array<vec3<f32>, 16> = array<vec3<f32>, 16>(
    vec3<f32>( 0.15,  0.10, 0.15),
    vec3<f32>(-0.20,  0.15, 0.25),
    vec3<f32>( 0.25, -0.20, 0.35),
    vec3<f32>(-0.15, -0.25, 0.40),
    vec3<f32>( 0.40,  0.15, 0.30),
    vec3<f32>(-0.35,  0.30, 0.45),
    vec3<f32>( 0.10,  0.45, 0.50),
    vec3<f32>(-0.45, -0.15, 0.55),
    vec3<f32>( 0.55, -0.25, 0.35),
    vec3<f32>(-0.25,  0.55, 0.40),
    vec3<f32>( 0.35,  0.40, 0.60),
    vec3<f32>(-0.50, -0.35, 0.65),
    vec3<f32>( 0.65,  0.20, 0.50),
    vec3<f32>(-0.30, -0.65, 0.55),
    vec3<f32>( 0.20, -0.70, 0.60),
    vec3<f32>(-0.60,  0.45, 0.65)
);

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let radius = ssao.params0.x;
    let bias = ssao.params0.y;
    let power = ssao.params0.z;
    let intensity = ssao.params0.w;
    let texel = ssao.params1.xy;
    let seed = ssao.params1.w;

    let depth = depth_at(in.uv);
    // In Reverse-Z, depth <= 1e-6 means far plane background (unoccluded skybox)
    if (depth <= 1e-6) {
        return vec4<f32>(1.0, 1.0, 1.0, 1.0);
    }

    let pos = view_pos_from_depth(in.uv, depth);

    // Reconstruct view-space normal from depth buffer without crossing depth discontinuities
    let depth_r = depth_at(in.uv + vec2<f32>(texel.x, 0.0));
    let depth_l = depth_at(in.uv - vec2<f32>(texel.x, 0.0));
    let depth_d = depth_at(in.uv + vec2<f32>(0.0, texel.y));
    let depth_u = depth_at(in.uv - vec2<f32>(0.0, texel.y));

    let dx_r = view_pos_from_depth(in.uv + vec2<f32>(texel.x, 0.0), depth_r) - pos;
    let dx_l = pos - view_pos_from_depth(in.uv - vec2<f32>(texel.x, 0.0), depth_l);
    let dx = select(dx_l, dx_r, abs(dx_r.z) < abs(dx_l.z));

    let dy_d = view_pos_from_depth(in.uv + vec2<f32>(0.0, texel.y), depth_d) - pos;
    let dy_u = pos - view_pos_from_depth(in.uv - vec2<f32>(0.0, texel.y), depth_u);
    let dy = select(dy_u, dy_d, abs(dy_d.z) < abs(dy_u.z));

    var normal = normalize(cross(dy, dx));
    if (normal.z < 0.0) {
        normal = -normal;
    }

    // Random rotation around surface normal
    let r_val = rand(in.uv * 2048.0, seed) * 2.0 - 1.0;
    let rand_vec = vec3<f32>(r_val, fract(r_val * 7.1) * 2.0 - 1.0, 0.0);
    let tangent = normalize(rand_vec - normal * dot(rand_vec, normal));
    let bitangent = cross(normal, tangent);
    let tbn = mat3x3<f32>(tangent, bitangent, normal);

    var occlusion = 0.0;
    for (var i: u32 = 0u; i < 16u; i = i + 1u) {
        let sample_dir = tbn * KERNEL[i];
        let sample_pos = pos + sample_dir * radius;
        let clip = ssao.proj * vec4<f32>(sample_pos, 1.0);
        let ndc = clip.xyz / max(abs(clip.w), 1e-6);
        let sample_uv = vec2<f32>(ndc.x * 0.5 + 0.5, (1.0 - ndc.y) * 0.5);

        if (sample_uv.x < 0.0 || sample_uv.x > 1.0 || sample_uv.y < 0.0 || sample_uv.y > 1.0) {
            continue;
        }

        let sample_depth = depth_at(sample_uv);
        if (sample_depth <= 1e-6) {
            continue;
        }

        let sample_view = view_pos_from_depth(sample_uv, sample_depth);
        let dist = abs(pos.z - sample_view.z);
        let range = smoothstep(0.0, 1.0, radius / max(0.001, dist));

        // In view space, camera is at origin looking along -Z (negative Z).
        // If sample_view.z >= sample_pos.z + bias, the geometry at sample_uv is in front of the sample point (occluded).
        let blocked = select(0.0, 1.0, sample_view.z >= sample_pos.z + bias);
        occlusion = occlusion + blocked * range;
    }

    let occ_norm = clamp(1.0 - (occlusion / 16.0) * intensity, 0.0, 1.0);
    let result = pow(occ_norm, power);
    return vec4<f32>(result, result, result, 1.0);
}
"#;

pub const SSAO_BLUR_SHADER: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

struct BlurParams {
    params: vec4<f32>, // texel.x, texel.y, depth_threshold, radius
};

@group(0) @binding(0) var t_ssao: texture_2d<f32>;
@group(0) @binding(1) var t_depth: texture_depth_2d;
@group(0) @binding(2) var<uniform> blur: BlurParams;

@vertex
fn vs_main(@builtin(vertex_index) id: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(id << 1u) & 2) * 2.0 - 1.0;
    let y = f32(i32(id & 2u) * -2) + 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

fn depth_at(uv: vec2<f32>) -> f32 {
    let dims = vec2<f32>(textureDimensions(t_depth));
    let coord = clamp(uv * dims, vec2<f32>(0.0), dims - vec2<f32>(1.0));
    return textureLoad(t_depth, vec2<i32>(coord), 0);
}

fn ssao_at(uv: vec2<f32>) -> f32 {
    let dims = vec2<f32>(textureDimensions(t_ssao));
    let coord = clamp(uv * dims, vec2<f32>(0.0), dims - vec2<f32>(1.0));
    return textureLoad(t_ssao, vec2<i32>(coord), 0).r;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let center_depth = depth_at(in.uv);
    if (center_depth <= 1e-6) {
        return vec4<f32>(1.0, 1.0, 1.0, 1.0);
    }

    let texel = blur.params.xy;
    let radius = i32(blur.params.w + 0.5);

    var sum = 0.0;
    var weight_sum = 0.0;

    for (var y: i32 = -radius; y <= radius; y = y + 1) {
        for (var x: i32 = -radius; x <= radius; x = x + 1) {
            let offset = vec2<f32>(f32(x), f32(y)) * texel;
            let sample_uv = in.uv + offset;
            let s_depth = depth_at(sample_uv);
            if (s_depth <= 1e-6) {
                continue;
            }

            let val = ssao_at(sample_uv);
            // Relative depth threshold preserves geometric edges cleanly
            let depth_rel = abs(s_depth - center_depth) / center_depth;
            let depth_weight = 1.0 - clamp(depth_rel / 0.08, 0.0, 1.0);
            let dist = length(vec2<f32>(f32(x), f32(y)));
            let blur_weight = exp(-dist * dist * 0.5);
            let weight = depth_weight * blur_weight;

            sum = sum + val * weight;
            weight_sum = weight_sum + weight;
        }
    }

    let result = sum / max(weight_sum, 0.0001);
    return vec4<f32>(result, result, result, 1.0);
}
"#;

pub const SSAO_APPLY_SHADER: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var t_blur: texture_2d<f32>;
@group(0) @binding(1) var s_blur: sampler;

@vertex
fn vs_main(@builtin(vertex_index) id: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(id << 1u) & 2) * 2.0 - 1.0;
    let y = f32(i32(id & 2u) * -2) + 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let occ = textureSample(t_blur, s_blur, in.uv).r;
    return vec4<f32>(occ, occ, occ, 1.0);
}
"#;
