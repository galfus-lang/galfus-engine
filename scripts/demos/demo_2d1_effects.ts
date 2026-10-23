/** Custom 2D surface effects used by the soft-shadow demonstration. */
export const CRYSTAL_SURFACE_SNIPPET = `
fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D {
    var out: SurfaceOutput2D;
    let wave = 0.5 + 0.5 * sin(in.time * in.custom.v0.x);
    out.color = vec4<f32>(mix(in.color.rgb, in.custom.v1.rgb, wave * 0.7), in.color.a);
    out.emissive = vec4<f32>(in.custom.v1.rgb * wave * in.custom.v0.y, 1.0);
    return out;
}
`;

export const POLY_SURFACE_SNIPPET = `
fn sd_poly(p: vec2<f32>, r: f32, n: f32) -> f32 {
    if (n < 3.0) { return length(p) - r; }
    let an = 3.14159265 / n;
    let a = atan2(p.y, p.x);
    let bn = ((a % (2.0 * an)) + 2.0 * an) % (2.0 * an) - an;
    return length(p) * cos(bn) - r;
}
fn surface_effect(in: SurfaceInput2D) -> SurfaceOutput2D {
    var out: SurfaceOutput2D;
    let d = sd_poly((in.uv - vec2<f32>(0.5)) * 2.0, 0.82, in.custom.v0.x);
    if (d > 0.0) { discard; }
    let edge = smoothstep(-0.06, 0.0, d);
    let ring = smoothstep(-0.40, -0.38, d) * (1.0 - smoothstep(-0.32, -0.30, d));
    var col = mix(in.color.rgb, in.color.rgb * 0.45, edge);
    col = mix(col, vec3<f32>(1.0, 0.95, 0.8), ring * 0.65);
    out.color = vec4<f32>(col, in.color.a);
    out.emissive = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return out;
}
`;
