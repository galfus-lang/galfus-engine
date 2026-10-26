diagnostic(off, derivative_uniformity);
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) id: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(id << 1u) & 2) * 2.0 - 1.0;
    let y = f32(i32(id & 2u) * -2) + 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

@group(0) @binding(0) var t_input: texture_2d<f32>;
@group(0) @binding(1) var s_input: sampler;

@fragment
fn fs_sepia(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    let r = dot(color.rgb, vec3<f32>(0.393, 0.769, 0.189));
    let g = dot(color.rgb, vec3<f32>(0.349, 0.686, 0.168));
    let b = dot(color.rgb, vec3<f32>(0.272, 0.534, 0.131));
    let sepia = min(vec3<f32>(1.0), vec3<f32>(r, g, b));
    return vec4<f32>(sepia, color.a);
}

@fragment
fn fs_grayscale(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    let gray = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    return vec4<f32>(vec3<f32>(gray), color.a);
}

@fragment
fn fs_invert(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    return vec4<f32>(1.0 - color.rgb, color.a);
}

@fragment
fn fs_vignette(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    let dist = distance(in.uv, vec2<f32>(0.5, 0.5));
    let vig = clamp(smoothstep(0.75, 0.25, dist), 0.0, 1.0);
    return vec4<f32>(color.rgb * vig, color.a);
}

@fragment
fn fs_tonemap_aces(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    let mapped = clamp((color.rgb * (a * color.rgb + b)) / (color.rgb * (c * color.rgb + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
    return vec4<f32>(mapped, color.a);
}

@fragment
fn fs_chromatic_aberration(in: VertexOutput) -> @location(0) vec4<f32> {
    let offset = vec2<f32>(0.0035, 0.0);
    let r = textureSample(t_input, s_input, in.uv + offset).r;
    let g = textureSample(t_input, s_input, in.uv).g;
    let b = textureSample(t_input, s_input, in.uv - offset).b;
    let a = textureSample(t_input, s_input, in.uv).a;
    return vec4<f32>(r, g, b, a);
}

@fragment
fn fs_film_grain(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    let noise = fract(sin(dot(in.uv, vec2<f32>(12.9898, 78.233))) * 43758.5453);
    let grain = (noise - 0.5) * 0.08;
    return vec4<f32>(clamp(color.rgb + grain, vec3<f32>(0.0), vec3<f32>(1.0)), color.a);
}

@fragment
fn fs_edge_outline(in: VertexOutput) -> @location(0) vec4<f32> {
    let tex_dim = vec2<f32>(textureDimensions(t_input));
    let texel = vec2<f32>(1.0 / max(tex_dim.x, 1.0), 1.0 / max(tex_dim.y, 1.0));
    let c = textureSample(t_input, s_input, in.uv);
    let up = textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, -texel.y));
    let down = textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, texel.y));
    let left = textureSample(t_input, s_input, in.uv + vec2<f32>(-texel.x, 0.0));
    let right = textureSample(t_input, s_input, in.uv + vec2<f32>(texel.x, 0.0));
    let diff = abs(c - up) + abs(c - down) + abs(c - left) + abs(c - right);
    let edge = length(diff.rgb);
    if (edge > 0.12) {
        return vec4<f32>(0.0, 1.0, 0.85, 1.0);
    }
    return c;
}

@fragment
fn fs_posterize(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(t_input, s_input, in.uv);
    let steps = 6.0;
    let posterized = floor(color.rgb * steps) / steps;
    return vec4<f32>(posterized, color.a);
}

@fragment
fn fs_blur(in: VertexOutput) -> @location(0) vec4<f32> {
    let tex_dim = vec2<f32>(textureDimensions(t_input));
    let texel = vec2<f32>(1.5 / max(tex_dim.x, 1.0), 1.5 / max(tex_dim.y, 1.0));
    var sum = textureSample(t_input, s_input, in.uv) * 0.227027;
    sum += textureSample(t_input, s_input, in.uv + vec2<f32>(texel.x, 0.0)) * 0.1945946;
    sum += textureSample(t_input, s_input, in.uv - vec2<f32>(texel.x, 0.0)) * 0.1945946;
    sum += textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, texel.y)) * 0.1945946;
    sum += textureSample(t_input, s_input, in.uv - vec2<f32>(0.0, texel.y)) * 0.1945946;
    return sum;
}

@fragment
fn fs_sharpen(in: VertexOutput) -> @location(0) vec4<f32> {
    let tex_dim = vec2<f32>(textureDimensions(t_input));
    let texel = vec2<f32>(1.0 / max(tex_dim.x, 1.0), 1.0 / max(tex_dim.y, 1.0));
    let c = textureSample(t_input, s_input, in.uv);
    let n = textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, -texel.y));
    let s = textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, texel.y));
    let w = textureSample(t_input, s_input, in.uv + vec2<f32>(-texel.x, 0.0));
    let e = textureSample(t_input, s_input, in.uv + vec2<f32>(texel.x, 0.0));
    let edge = (n + s + w + e) * 0.25;
    let sharpened = c + (c - edge) * 0.75;
    return vec4<f32>(clamp(sharpened.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), c.a);
}

@fragment
fn fs_blit(in: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(t_input, s_input, in.uv);
}

@fragment
fn fs_fxaa(in: VertexOutput) -> @location(0) vec4<f32> {
    let tex_dim = vec2<f32>(textureDimensions(t_input));
    let inv_dim = vec2<f32>(1.0 / max(tex_dim.x, 1.0), 1.0 / max(tex_dim.y, 1.0));

    let edge_threshold_min = 0.0833;
    let edge_threshold_max = 0.166;
    let subpix_quality = 0.75;

    let rgb_m = textureSample(t_input, s_input, in.uv).rgb;
    let alpha_m = textureSample(t_input, s_input, in.uv).a;

    let luma_m = dot(rgb_m, vec3<f32>(0.299, 0.587, 0.114));
    let luma_n = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, -inv_dim.y)).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let luma_s = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(0.0, inv_dim.y)).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let luma_w = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(-inv_dim.x, 0.0)).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let luma_e = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(inv_dim.x, 0.0)).rgb, vec3<f32>(0.299, 0.587, 0.114));

    let luma_min = min(luma_m, min(min(luma_n, luma_s), min(luma_w, luma_e)));
    let luma_max = max(luma_m, max(max(luma_n, luma_s), max(luma_w, luma_e)));
    let range = luma_max - luma_min;

    if (range < max(edge_threshold_min, luma_max * edge_threshold_max)) {
        return vec4<f32>(rgb_m, alpha_m);
    }

    let luma_nw = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(-inv_dim.x, -inv_dim.y)).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let luma_ne = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(inv_dim.x, -inv_dim.y)).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let luma_sw = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(-inv_dim.x, inv_dim.y)).rgb, vec3<f32>(0.299, 0.587, 0.114));
    let luma_se = dot(textureSample(t_input, s_input, in.uv + vec2<f32>(inv_dim.x, inv_dim.y)).rgb, vec3<f32>(0.299, 0.587, 0.114));

    let luma_down_up = luma_s + luma_n;
    let luma_left_right = luma_w + luma_e;
    let luma_left_corners = luma_sw + luma_nw;
    let luma_down_corners = luma_sw + luma_se;
    let luma_right_corners = luma_se + luma_ne;
    let luma_up_corners = luma_ne + luma_nw;

    let edge_horz = abs(-2.0 * luma_w + luma_left_corners) + abs(-2.0 * luma_m + luma_down_up) * 2.0 + abs(-2.0 * luma_e + luma_right_corners);
    let edge_vert = abs(-2.0 * luma_n + luma_up_corners) + abs(-2.0 * luma_m + luma_left_right) * 2.0 + abs(-2.0 * luma_s + luma_down_corners);
    let is_horz = edge_horz >= edge_vert;

    let luma_neg = select(luma_w, luma_n, is_horz);
    let luma_pos = select(luma_e, luma_s, is_horz);
    let grad_neg = abs(luma_neg - luma_m);
    let grad_pos = abs(luma_pos - luma_m);

    var step_len = select(inv_dim.x, inv_dim.y, is_horz);
    if (grad_neg >= grad_pos) {
        step_len = -step_len;
    }

    let luma_avg_3x3 = (luma_down_up + luma_left_right + luma_left_corners + luma_right_corners) * (1.0 / 12.0);
    let subpix_diff = clamp(abs(luma_avg_3x3 - luma_m) / max(range, 0.001), 0.0, 1.0);
    let subpix_blend = (-2.0 * subpix_diff + 3.0) * subpix_diff * subpix_diff * subpix_quality;

    var uv_offset = in.uv;
    if (is_horz) {
        uv_offset.y += step_len * (0.5 + subpix_blend * 0.5);
    } else {
        uv_offset.x += step_len * (0.5 + subpix_blend * 0.5);
    }

    let sampled_rgb = textureSample(t_input, s_input, uv_offset).rgb;
    let result_rgb = mix(rgb_m, sampled_rgb, clamp(subpix_blend * 1.25, 0.0, 1.0));
    return vec4<f32>(result_rgb, alpha_m);
}

@fragment
fn fs_ssaa_downsample(in: VertexOutput) -> @location(0) vec4<f32> {
    let dim = vec2<f32>(textureDimensions(t_input));
    let texel = vec2<f32>(0.5 / max(dim.x, 1.0), 0.5 / max(dim.y, 1.0));
    var c = textureSample(t_input, s_input, in.uv + vec2<f32>(-texel.x, -texel.y)) * 0.25;
    c += textureSample(t_input, s_input, in.uv + vec2<f32>(texel.x, -texel.y)) * 0.25;
    c += textureSample(t_input, s_input, in.uv + vec2<f32>(-texel.x, texel.y)) * 0.25;
    c += textureSample(t_input, s_input, in.uv + vec2<f32>(texel.x, texel.y)) * 0.25;
    return c;
}

