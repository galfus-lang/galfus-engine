//! Standard 2D WGSL forward shader with dynamic point lights, polar soft shadows, and surface effects.

use crate::surface_effect::{SURFACE_EFFECT_PRELUDE_2D, compose_surface_shader_2d};

/// Base WGSL template for 2D forward rendering.
pub const SHADER_2D_TEMPLATE: &str = r#"
struct Camera2DUniform {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    view_projection: mat4x4<f32>,
    position: vec4<f32>,
    params: vec4<f32>,
    viewport: vec4<f32>,
    shadow_params: vec4<f32>,
};

struct Light2DUniform {
    position: vec4<f32>,
    color: vec4<f32>,
    params: vec4<f32>,
    light_meta: vec4<u32>,
};

struct ShadowSample2D {
    blocker_distance: f32,
    blocker_left: f32,
    blocker_right: f32,
    flags: f32,
    penumbra_left: f32,
    penumbra_right: f32,
    support_left_distance: f32,
    support_right_distance: f32,
    occluder_v0: vec2<f32>,
    occluder_v1: vec2<f32>,
    occluder_v2: vec2<f32>,
    occluder_v3: vec2<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera2DUniform;
@group(0) @binding(1) var point_sampler: sampler;
@group(0) @binding(2) var linear_sampler: sampler;
@group(0) @binding(3) var<storage, read> lights: array<Light2DUniform>;
@group(0) @binding(4) var<storage, read> shadow_samples: array<ShadowSample2D>;

struct Material2DUniform {
    base_color: vec4<f32>,
    params: vec4<f32>,
    flags: vec4<u32>,
    custom_v0: vec4<f32>,
    custom_v1: vec4<f32>,
    custom_v2: vec4<f32>,
    custom_v3: vec4<f32>,
};

@group(1) @binding(0) var<uniform> material: Material2DUniform;
@group(1) @binding(1) var material_texture: texture_2d<f32>;
@group(1) @binding(2) var material_sampler: sampler;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) color: vec4<f32>,
    // Instance attributes
    @location(3) model_c0: vec4<f32>,
    @location(4) model_c1: vec4<f32>,
    @location(5) model_c2: vec4<f32>,
    @location(6) model_c3: vec4<f32>,
    @location(7) instance_tint: vec4<f32>,
    @location(8) uv_rect: vec4<f32>,
    @location(9) shadow_params: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) world_pos: vec2<f32>,
    @location(3) shadow_params: vec4<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let model = mat4x4<f32>(in.model_c0, in.model_c1, in.model_c2, in.model_c3);
    let world_pos = model * vec4<f32>(in.position, 1.0);
    out.clip_position = camera.view_projection * world_pos;
    out.world_pos = world_pos.xy;
    out.uv = mix(in.uv_rect.xy, in.uv_rect.zw, in.uv);
    out.color = in.color * in.instance_tint * material.base_color;
    out.shadow_params = in.shadow_params;
    return out;
}

{{EFFECT_PRELUDE}}

{{EFFECT_SNIPPET}}

fn unwrap_angle(angle: f32, reference: f32) -> f32 {
    var unwrapped = angle;
    let pi = 3.14159265359;
    let tau = 6.28318530718;
    loop {
        if (unwrapped - reference > pi) {
            unwrapped -= tau;
            continue;
        }
        if (unwrapped - reference < -pi) {
            unwrapped += tau;
            continue;
        }
        break;
    }
    return unwrapped;
}

fn cross2(a: vec2<f32>, b: vec2<f32>) -> f32 {
    return a.x * b.y - a.y * b.x;
}

fn ray_segment_hit(ro: vec2<f32>, rd: vec2<f32>, seg_a: vec2<f32>, seg_b: vec2<f32>) -> f32 {
    let v1 = ro - seg_a;
    let v2 = seg_b - seg_a;
    let den = cross2(rd, v2);
    if (abs(den) <= 1e-6) {
        return -1.0;
    }
    let t = cross2(v2, v1) / den;
    let q = cross2(rd, v1) / den;
    if (t >= 0.0 && q >= 0.0 && q <= 1.0) {
        return t;
    }
    return -1.0;
}

fn ray_hits_occluder(ray_origin: vec2<f32>, ray_dir: vec2<f32>, max_dist: f32, sample: ShadowSample2D) -> bool {
    let h0 = ray_segment_hit(ray_origin, ray_dir, sample.occluder_v0, sample.occluder_v1);
    let h1 = ray_segment_hit(ray_origin, ray_dir, sample.occluder_v1, sample.occluder_v2);
    let h2 = ray_segment_hit(ray_origin, ray_dir, sample.occluder_v2, sample.occluder_v3);
    let h3 = ray_segment_hit(ray_origin, ray_dir, sample.occluder_v3, sample.occluder_v0);
    let m0 = min(select(1e20, h0, h0 >= 0.0), select(1e20, h1, h1 >= 0.0));
    let m1 = min(select(1e20, h2, h2 >= 0.0), select(1e20, h3, h3 >= 0.0));
    return min(m0, m1) < max(max_dist, 0.0);
}

fn sample_shadow_data_2d(
    layer: u32,
    shadow_res: f32,
    shadow_res_i: i32,
    angular_x: f32,
    candidate_slot: u32,
) -> ShadowSample2D {
    let wrapped = angular_x - floor(angular_x / shadow_res) * shadow_res;
    let x0 = i32(floor(wrapped)) % shadow_res_i;
    let samples_per_dir = 8u;
    let dir_idx = layer * u32(shadow_res_i) + u32(max(x0, 0));
    let idx = dir_idx * samples_per_dir + min(candidate_slot, samples_per_dir - 1u);
    return shadow_samples[idx];
}

fn occluder_covers_light_disk(sample: ShadowSample2D, world_xy: vec2<f32>, light_xy: vec2<f32>, radius: f32) -> bool {
    let to_light = light_xy - world_xy;
    let dist = length(to_light);
    if (dist <= max(radius, 0.0001)) {
        return false;
    }
    let center_dir = to_light / dist;
    let r = max(radius, 0.0);
    let half_angle = asin(clamp(r / dist, 0.0, 0.9999));
    let tangent_dist = sqrt(max(dist * dist - r * r, 0.0));
    let c = cos(half_angle);
    let s = sin(half_angle);
    let left_dir = vec2<f32>(center_dir.x * c - center_dir.y * s, center_dir.x * s + center_dir.y * c);
    let right_dir = vec2<f32>(center_dir.x * c + center_dir.y * s, -center_dir.x * s + center_dir.y * c);

    return ray_hits_occluder(world_xy, center_dir, dist, sample)
        && ray_hits_occluder(world_xy, left_dir, tangent_dist, sample)
        && ray_hits_occluder(world_xy, right_dir, tangent_dist, sample);
}

fn occluder_intersects_light_disk(sample: ShadowSample2D, world_xy: vec2<f32>, light_xy: vec2<f32>, radius: f32) -> bool {
    let to_light = light_xy - world_xy;
    let dist = length(to_light);
    if (dist <= max(radius, 0.0001)) {
        return false;
    }
    let center_dir = to_light / dist;
    let r = max(radius, 0.0);
    let half_angle = asin(clamp(r / dist, 0.0, 0.9999));
    let tangent_dist = sqrt(max(dist * dist - r * r, 0.0));
    let c = cos(half_angle);
    let s = sin(half_angle);
    let left_dir = vec2<f32>(center_dir.x * c - center_dir.y * s, center_dir.x * s + center_dir.y * c);
    let right_dir = vec2<f32>(center_dir.x * c + center_dir.y * s, -center_dir.x * s + center_dir.y * c);

    return ray_hits_occluder(world_xy, center_dir, dist, sample)
        || ray_hits_occluder(world_xy, left_dir, tangent_dist, sample)
        || ray_hits_occluder(world_xy, right_dir, tangent_dist, sample);
}

fn clipped_edge_light_overlap(
    world_xy: vec2<f32>,
    edge_a: vec2<f32>,
    edge_b: vec2<f32>,
    light_angle: f32,
    light_left: f32,
    light_right: f32,
) -> vec2<f32> {
    let raw_a = atan2((edge_a - world_xy).y, (edge_a - world_xy).x);
    let raw_b = atan2((edge_b - world_xy).y, (edge_b - world_xy).x);
    var a = unwrap_angle(raw_a, light_angle);
    var b = unwrap_angle(raw_b, a);
    if (b < a) {
        let tmp = a;
        a = b;
        b = tmp;
    }
    if (b - a > 3.14159265359) {
        let tmp = a;
        a = b;
        b = tmp + 6.28318530718;
    }
    a = unwrap_angle(a, light_angle);
    b = unwrap_angle(b, a);
    if (b < a) {
        b = b + 6.28318530718;
    }

    let overlap_left = max(light_left, a);
    let overlap_right = min(light_right, b);
    if (overlap_right <= overlap_left) {
        return vec2<f32>(0.0, 0.0);
    }
    return vec2<f32>(overlap_left, overlap_right);
}

fn merge_interval_length_4(
    i0: vec2<f32>,
    i1: vec2<f32>,
    i2: vec2<f32>,
    i3: vec2<f32>,
) -> f32 {
    var starts = array<f32, 4>(i0.x, i1.x, i2.x, i3.x);
    var ends = array<f32, 4>(i0.y, i1.y, i2.y, i3.y);
    for (var i = 0u; i < 4u; i = i + 1u) {
        for (var j = i + 1u; j < 4u; j = j + 1u) {
            if (starts[j] < starts[i]) {
                let st = starts[i];
                let et = ends[i];
                starts[i] = starts[j];
                ends[i] = ends[j];
                starts[j] = st;
                ends[j] = et;
            }
        }
    }

    var total = 0.0;
    var current_start = 0.0;
    var current_end = 0.0;
    var has_interval = false;
    for (var i = 0u; i < 4u; i = i + 1u) {
        if (ends[i] <= starts[i]) {
            continue;
        }
        if (!has_interval) {
            current_start = starts[i];
            current_end = ends[i];
            has_interval = true;
            continue;
        }
        if (starts[i] <= current_end) {
            current_end = max(current_end, ends[i]);
        } else {
            total += max(current_end - current_start, 0.0);
            current_start = starts[i];
            current_end = ends[i];
        }
    }
    if (has_interval) {
        total += max(current_end - current_start, 0.0);
    }
    return total;
}

fn occluder_light_disk_visibility(
    sample: ShadowSample2D,
    world_xy: vec2<f32>,
    light_xy: vec2<f32>,
    light_radius: f32,
) -> f32 {
    let to_light = light_xy - world_xy;
    let dist = length(to_light);
    let r = max(light_radius, 0.0);
    if (dist <= max(r, 0.0001)) {
        return 1.0;
    }

    let light_angle = atan2(to_light.y, to_light.x);
    let half_angle = asin(clamp(r / dist, 0.0, 0.9999));
    let light_left = light_angle - half_angle;
    let light_right = light_angle + half_angle;

    let edge0 = clipped_edge_light_overlap(world_xy, sample.occluder_v0, sample.occluder_v1, light_angle, light_left, light_right);
    let edge1 = clipped_edge_light_overlap(world_xy, sample.occluder_v1, sample.occluder_v2, light_angle, light_left, light_right);
    let edge2 = clipped_edge_light_overlap(world_xy, sample.occluder_v2, sample.occluder_v3, light_angle, light_left, light_right);
    let edge3 = clipped_edge_light_overlap(world_xy, sample.occluder_v3, sample.occluder_v0, light_angle, light_left, light_right);
    let blocked_angle = merge_interval_length_4(edge0, edge1, edge2, edge3);
    let coverage = clamp(blocked_angle / max(light_right - light_left, 1e-5), 0.0, 1.0);
    return 1.0 - coverage;
}

fn shadow_visibility_from_sample(
    sample: ShadowSample2D,
    angle: f32,
    dist_ratio: f32,
    contact_offset: f32,
    world_xy: vec2<f32>,
    light_xy: vec2<f32>,
    light_radius: f32,
) -> f32 {
    if (sample.flags < 0.5) {
        return 1.0;
    }

    if (occluder_covers_light_disk(sample, world_xy, light_xy, light_radius)) {
        return 0.0;
    }
    if (!occluder_intersects_light_disk(sample, world_xy, light_xy, light_radius)) {
        return 1.0;
    }

    return occluder_light_disk_visibility(sample, world_xy, light_xy, light_radius);
}

fn sample_shadow_visibility(
    light_idx: u32,
    world_pos: vec2<f32>,
    light_pos: vec2<f32>,
    light_radius: f32,
    light_range: f32,
) -> f32 {
    let from_light = world_pos - light_pos;
    let dist = length(from_light);
    let dist_ratio = clamp(dist / light_range, 0.0, 1.0);
    let angle = atan2(from_light.y, from_light.x);
    let tau = 6.28318530718;
    let angular_u = fract((angle / tau) + 1.0);
    let shadow_res = max(camera.shadow_params.w, 1.0);
    let shadow_res_i = i32(shadow_res);
    let angular_x = angular_u * shadow_res;
    let contact_offset = max(camera.shadow_params.z, 0.0);
    var shadow_visibility = 1.0;
    var full_umbra = false;

    for (var direction_offset = -1i; direction_offset <= 1i; direction_offset = direction_offset + 1i) {
        let sample_x = angular_x + f32(direction_offset);
        for (var candidate_slot = 0u; candidate_slot < 8u; candidate_slot = candidate_slot + 1u) {
            let shadow_sample = sample_shadow_data_2d(
                light_idx,
                shadow_res,
                shadow_res_i,
                sample_x,
                candidate_slot
            );
            if (shadow_sample.flags >= 0.5 && occluder_covers_light_disk(
                shadow_sample,
                world_pos,
                light_pos,
                light_radius
            )) {
                full_umbra = true;
            }
        }
    }

    if (full_umbra) {
        return 0.0;
    }

    for (var candidate_slot = 0u; candidate_slot < 8u; candidate_slot = candidate_slot + 1u) {
        let shadow_sample = sample_shadow_data_2d(
            light_idx,
            shadow_res,
            shadow_res_i,
            angular_x,
            candidate_slot
        );
        shadow_visibility *= shadow_visibility_from_sample(
            shadow_sample,
            angle,
            dist_ratio,
            contact_offset,
            world_pos,
            light_pos,
            light_radius
        );
    }

    return shadow_visibility;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var tex_color = in.color;
    if ((material.flags.x & (1u << 4u)) != 0u) {
        tex_color *= textureSample(material_texture, material_sampler, in.uv);
    }

    // Alpha test for Masked surface type
    if ((material.flags.x & 2u) != 0u && tex_color.a < material.params.x) {
        discard;
    }

    // Surface effect injection
    let custom = CustomParams2D(
        material.custom_v0,
        material.custom_v1,
        material.custom_v2,
        material.custom_v3,
    );
    let surface_in = SurfaceInput2D(in.world_pos, in.uv, tex_color, camera.params.x, custom);
    let surface_out = surface_effect(surface_in);

    // Dynamic 2D Lighting
    let ambient = camera.shadow_params.x;
    var lit = surface_out.color.rgb * ambient;
    let receives_shadow = in.shadow_params.x > 0.5;
    let light_count = min(u32(camera.shadow_params.y), arrayLength(&lights));

    for (var i = 0u; i < light_count; i = i + 1u) {
        let l = lights[i];
        if (l.light_meta.z == 0u) {
            continue;
        }
        if (l.position.z < in.shadow_params.z) {
            continue;
        }
        let delta = l.position.xy - in.world_pos;
        let dist = length(delta);
        let range = max(l.params.y, 0.0001);
        if (dist >= range) {
            continue;
        }

        var visibility = 1.0;
        if (receives_shadow && l.params.w > 0.5) {
            visibility = sample_shadow_visibility(l.light_meta.y, in.world_pos, l.position.xy, l.params.z, range);
        }

        let atten = clamp(1.0 - (dist / range), 0.0, 1.0);
        let smooth_atten = atten * atten * (3.0 - 2.0 * atten);
        lit += surface_out.color.rgb * l.color.rgb * l.params.x * smooth_atten * visibility;
    }

    lit += surface_out.emissive.rgb;
    return vec4<f32>(lit, surface_out.color.a);
}
"#;

/// Compiles a 2D WGSL shader source injecting custom surface effects if provided.
pub fn compile_2d_shader(user_snippet: Option<&str>) -> String {
    let with_prelude = SHADER_2D_TEMPLATE.replace("{{EFFECT_PRELUDE}}", SURFACE_EFFECT_PRELUDE_2D);
    compose_surface_shader_2d(&with_prelude, user_snippet)
        .map(|res| res.source)
        .unwrap_or_else(|_| with_prelude.replace("{{EFFECT_SNIPPET}}", ""))
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
