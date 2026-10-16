/** Surface Effect 1: Fresnel Rim Glow with pulse */
export const FRESNEL_SURFACE_SNIPPET = `
fn surface_effect(in: SurfaceInput) -> SurfaceOutput {
    var out: SurfaceOutput;
    out.albedo = in.albedo;
    out.roughness = in.roughness;
    out.metallic = in.metallic;
    out.normal = in.world_normal;

    let rim_color = in.custom.v0.rgb;
    let rim_power = in.custom.v1.x;
    let pulse_speed = in.custom.v1.y;

    let fresnel = pow(1.0 - max(dot(in.world_normal, in.view_dir), 0.0), rim_power);
    let pulse = 0.5 + 0.5 * sin(in.time * pulse_speed);
    out.emissive = in.emissive + rim_color * fresnel * pulse;
    return out;
}
`;

/** Surface Effect 2: Dynamic World-Position Wave */
export const WORLD_WAVE_SURFACE_SNIPPET = `
fn surface_effect(in: SurfaceInput) -> SurfaceOutput {
    var out: SurfaceOutput;
    out.roughness = in.roughness;
    out.metallic = in.metallic;
    out.normal = in.world_normal;

    let wave_speed = in.custom.v1.x;
    let wave_freq = in.custom.v1.y;
    let wave = 0.5 + 0.5 * sin(in.world_pos.y * wave_freq + in.time * wave_speed);

    let color_a = in.custom.v0.rgb;
    let color_b = in.custom.v2.rgb;
    out.albedo = vec4<f32>(mix(color_a, color_b, wave), in.albedo.a);
    out.emissive = mix(vec3<f32>(0.02), color_b * 0.4, wave);
    return out;
}
`;

/** Surface Effect 3: Hologram Scanlines & Alpha */
export const HOLOGRAM_SURFACE_SNIPPET = `
fn surface_effect(in: SurfaceInput) -> SurfaceOutput {
    var out: SurfaceOutput;
    out.roughness = 0.15;
    out.metallic = 0.85;
    out.normal = in.world_normal;

    let scanline_freq = in.custom.v1.x;
    let scanline_speed = in.custom.v1.y;
    let scan = 0.5 + 0.5 * sin(in.uv.y * scanline_freq + in.time * scanline_speed);

    let holo_color = in.custom.v0.rgb;
    let alpha = clamp(0.35 + 0.65 * scan, 0.2, 1.0);
    out.albedo = vec4<f32>(holo_color * 0.7, alpha);
    out.emissive = holo_color * (0.35 + 0.65 * scan);
    return out;
}
`;
