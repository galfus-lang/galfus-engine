diagnostic(off, derivative_uniformity);
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) offset0: vec4<f32>,
    @location(2) offset1: vec4<f32>,
    @location(3) offset2: vec4<f32>,
};

@vertex
fn vs_edge(@builtin(vertex_index) id: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(id << 1u) & 2) * 2.0 - 1.0;
    let y = f32(i32(id & 2u) * -2) + 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

@group(0) @binding(0) var t_color: texture_2d<f32>;
@group(0) @binding(1) var s_linear: sampler;
@group(0) @binding(2) var t_edges: texture_2d<f32>;
@group(0) @binding(3) var t_area: texture_2d<f32>;
@group(0) @binding(4) var t_search: texture_2d<f32>;
@group(0) @binding(5) var t_weights: texture_2d<f32>;

// --- Pass 1: Edge Detection ---
@fragment
fn fs_edge(in: VertexOutput) -> @location(0) vec2<f32> {
    let dim = vec2<f32>(textureDimensions(t_color));
    let texel = vec2<f32>(1.0 / max(dim.x, 1.0), 1.0 / max(dim.y, 1.0));
    let threshold = 0.08;

    let c = textureSample(t_color, s_linear, in.uv).rgb;
    let c_left = textureSample(t_color, s_linear, in.uv - vec2<f32>(texel.x, 0.0)).rgb;
    let c_top = textureSample(t_color, s_linear, in.uv - vec2<f32>(0.0, texel.y)).rgb;

    let luma_c = dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
    let luma_left = dot(c_left, vec3<f32>(0.2126, 0.7152, 0.0722));
    let luma_top = dot(c_top, vec3<f32>(0.2126, 0.7152, 0.0722));

    let delta = abs(vec2<f32>(luma_c) - vec2<f32>(luma_left, luma_top));
    var edges = step(vec2<f32>(threshold), delta);

    if (edges.x == 0.0 && edges.y == 0.0) {
        return vec2<f32>(0.0, 0.0);
    }

    return edges;
}

// --- Pass 2: Blending Weight Calculation ---
@fragment
fn fs_weights(in: VertexOutput) -> @location(0) vec4<f32> {
    let dim = vec2<f32>(textureDimensions(t_edges));
    let texel = vec2<f32>(1.0 / max(dim.x, 1.0), 1.0 / max(dim.y, 1.0));

    let e = textureSample(t_edges, s_linear, in.uv).rg;
    var weights = vec4<f32>(0.0);

    if (e.g > 0.0) { // Edge on the North
        // Search distance left & right
        var d_left = 0.0;
        for (var i: i32 = 1; i <= 8; i = i + 1) {
            let sample_uv = in.uv - vec2<f32>(f32(i) * texel.x, 0.0);
            let edge = textureSample(t_edges, s_linear, sample_uv).g;
            if (edge < 0.5) {
                d_left = f32(i);
                break;
            }
            d_left = f32(i);
        }

        var d_right = 0.0;
        for (var i: i32 = 1; i <= 8; i = i + 1) {
            let sample_uv = in.uv + vec2<f32>(f32(i) * texel.x, 0.0);
            let edge = textureSample(t_edges, s_linear, sample_uv).g;
            if (edge < 0.5) {
                d_right = f32(i);
                break;
            }
            d_right = f32(i);
        }

        let total_dist = d_left + d_right;
        let weight_val = clamp(1.0 - (d_left / max(total_dist, 1.0)), 0.0, 1.0);
        weights.r = weight_val * 0.5;
    }

    if (e.r > 0.0) { // Edge on the West
        // Search distance top & bottom
        var d_top = 0.0;
        for (var i: i32 = 1; i <= 8; i = i + 1) {
            let sample_uv = in.uv - vec2<f32>(0.0, f32(i) * texel.y);
            let edge = textureSample(t_edges, s_linear, sample_uv).r;
            if (edge < 0.5) {
                d_top = f32(i);
                break;
            }
            d_top = f32(i);
        }

        var d_bottom = 0.0;
        for (var i: i32 = 1; i <= 8; i = i + 1) {
            let sample_uv = in.uv + vec2<f32>(0.0, f32(i) * texel.y);
            let edge = textureSample(t_edges, s_linear, sample_uv).r;
            if (edge < 0.5) {
                d_bottom = f32(i);
                break;
            }
            d_bottom = f32(i);
        }

        let total_dist = d_top + d_bottom;
        let weight_val = clamp(1.0 - (d_top / max(total_dist, 1.0)), 0.0, 1.0);
        weights.b = weight_val * 0.5;
    }

    return weights;
}

// --- Pass 3: Neighborhood Blending ---
@fragment
fn fs_blend(in: VertexOutput) -> @location(0) vec4<f32> {
    let dim = vec2<f32>(textureDimensions(t_color));
    let texel = vec2<f32>(1.0 / max(dim.x, 1.0), 1.0 / max(dim.y, 1.0));

    let a = textureSample(t_weights, s_linear, in.uv);
    let w_top = a.r;
    let w_left = a.b;

    if (w_top == 0.0 && w_left == 0.0) {
        return textureSample(t_color, s_linear, in.uv);
    }

    var color = textureSample(t_color, s_linear, in.uv);
    if (w_top > 0.0) {
        let neighbor = textureSample(t_color, s_linear, in.uv - vec2<f32>(0.0, texel.y));
        color = mix(color, neighbor, w_top);
    }
    if (w_left > 0.0) {
        let neighbor = textureSample(t_color, s_linear, in.uv - vec2<f32>(texel.x, 0.0));
        color = mix(color, neighbor, w_left);
    }

    return color;
}

