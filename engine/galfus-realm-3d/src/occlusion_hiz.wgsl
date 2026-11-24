// Reverse-Z Hierarchical-Z (Hi-Z) pyramid generation & GPU indirect occlusion culling.

@group(0) @binding(0) var depth_src: texture_depth_2d;
@group(0) @binding(1) var hiz_dst_0: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8)
fn cs_copy_depth(@builtin(global_invocation_id) gid: vec3<u32>) {
    let dims = textureDimensions(hiz_dst_0);
    if (gid.x >= dims.x || gid.y >= dims.y) {
        return;
    }
    let d = textureLoad(depth_src, vec2<i32>(gid.xy), 0);
    textureStore(hiz_dst_0, vec2<i32>(gid.xy), vec4<f32>(d, 0.0, 0.0, 0.0));
}

@group(0) @binding(0) var hiz_src: texture_2d<f32>;
@group(0) @binding(1) var hiz_dst: texture_storage_2d<r32float, write>;

fn load_hiz(coord: vec2<i32>, max_coord: vec2<i32>) -> f32 {
    let c = clamp(coord, vec2<i32>(0, 0), max_coord);
    return textureLoad(hiz_src, c, 0).r;
}

// Conservative Reverse-Z min-depth reduction (handles both even and odd source dimensions).
@compute @workgroup_size(8, 8)
fn cs_downsample(@builtin(global_invocation_id) gid: vec3<u32>) {
    let dst_dims = textureDimensions(hiz_dst);
    if (gid.x >= dst_dims.x || gid.y >= dst_dims.y) {
        return;
    }
    let src_dims = vec2<i32>(textureDimensions(hiz_src, 0));
    let max_coord = src_dims - vec2<i32>(1, 1);
    let base = vec2<i32>(gid.xy) * 2;

    var d = min(
        min(load_hiz(base, max_coord), load_hiz(base + vec2<i32>(1, 0), max_coord)),
        min(load_hiz(base + vec2<i32>(0, 1), max_coord), load_hiz(base + vec2<i32>(1, 1), max_coord))
    );

    let extra_x = ((src_dims.x & 1) == 1) && (i32(gid.x) == i32(dst_dims.x) - 1);
    let extra_y = ((src_dims.y & 1) == 1) && (i32(gid.y) == i32(dst_dims.y) - 1);
    if (extra_x) {
        d = min(d, min(load_hiz(base + vec2<i32>(2, 0), max_coord), load_hiz(base + vec2<i32>(2, 1), max_coord)));
    }
    if (extra_y) {
        d = min(d, min(load_hiz(base + vec2<i32>(0, 2), max_coord), load_hiz(base + vec2<i32>(1, 2), max_coord)));
    }
    if (extra_x && extra_y) {
        d = min(d, load_hiz(base + vec2<i32>(2, 2), max_coord));
    }

    textureStore(hiz_dst, vec2<i32>(gid.xy), vec4<f32>(d, 0.0, 0.0, 0.0));
}

struct CullItem {
    aabb_min: vec4<f32>,   // xyz = world min (padded), w = 1.0 if always visible
    aabb_max: vec4<f32>,   // xyz = world max (padded), w = unused
    draw_params: vec4<u32>, // x = index_count, y = instance_count
};

struct CullParams {
    view_proj: mat4x4<f32>,
    hiz_size: vec2<f32>,
    mip_count: u32,
    item_count: u32,
};

struct DrawIndexedIndirect {
    index_count: u32,
    instance_count: u32,
    first_index: u32,
    base_vertex: i32,
    first_instance: u32,
};

@group(0) @binding(0) var<uniform> params: CullParams;
@group(0) @binding(1) var<storage, read> items: array<CullItem>;
@group(0) @binding(2) var hiz_pyramid: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> indirect_args: array<DrawIndexedIndirect>;

@compute @workgroup_size(64)
fn cs_cull_indirect(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.item_count) {
        return;
    }

    let item = items[idx];
    var out_args: DrawIndexedIndirect;
    out_args.index_count = item.draw_params.x;
    out_args.instance_count = item.draw_params.y;
    out_args.first_index = 0u;
    out_args.base_vertex = 0;
    out_args.first_instance = 0u;

    // Always-visible items (AlwaysRender, FrustumOnly, or occluders themselves) bypass Hi-Z test.
    if (item.aabb_min.w > 0.5 || item.draw_params.y == 0u) {
        indirect_args[idx] = out_args;
        return;
    }

    let bmin = item.aabb_min.xyz;
    let bmax = item.aabb_max.xyz;

    var min_uv = vec2<f32>(1.0, 1.0);
    var max_uv = vec2<f32>(0.0, 0.0);
    var max_z = 0.0; // Reverse-Z: nearest depth is largest value in [0, 1].

    for (var i = 0u; i < 8u; i = i + 1u) {
        let corner = vec3<f32>(
            select(bmin.x, bmax.x, (i & 1u) != 0u),
            select(bmin.y, bmax.y, (i & 2u) != 0u),
            select(bmin.z, bmax.z, (i & 4u) != 0u)
        );
        let clip = params.view_proj * vec4<f32>(corner, 1.0);
        // Conservative: if any corner is behind/on the near plane, keep visible.
        if (clip.w <= 0.0001) {
            indirect_args[idx] = out_args;
            return;
        }
        let ndc = clip.xyz / clip.w;
        let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
        min_uv = min(min_uv, uv);
        max_uv = max(max_uv, uv);
        max_z = max(max_z, ndc.z);
    }

    // If AABB touches or is closer than near plane, keep visible.
    if (max_z >= 1.0) {
        indirect_args[idx] = out_args;
        return;
    }

    min_uv = clamp(min_uv, vec2<f32>(0.0), vec2<f32>(1.0));
    max_uv = clamp(max_uv, vec2<f32>(0.0), vec2<f32>(1.0));
    if (min_uv.x >= max_uv.x || min_uv.y >= max_uv.y) {
        indirect_args[idx] = out_args;
        return;
    }

    let rect_px = (max_uv - min_uv) * params.hiz_size;
    let max_dim = max(rect_px.x, rect_px.y);
    let mip = clamp(i32(ceil(log2(max(max_dim, 1.0)))), 0, i32(params.mip_count) - 1);

    let mip_dims = vec2<i32>(textureDimensions(hiz_pyramid, mip));
    let max_c = max(mip_dims - vec2<i32>(1, 1), vec2<i32>(0, 0));
    let c0 = clamp(vec2<i32>(floor(min_uv * vec2<f32>(mip_dims))), vec2<i32>(0, 0), max_c);
    let c1 = clamp(vec2<i32>(floor(max_uv * vec2<f32>(mip_dims))), vec2<i32>(0, 0), max_c);

    let d00 = textureLoad(hiz_pyramid, vec2<i32>(c0.x, c0.y), mip).r;
    let d10 = textureLoad(hiz_pyramid, vec2<i32>(c1.x, c0.y), mip).r;
    let d01 = textureLoad(hiz_pyramid, vec2<i32>(c0.x, c1.y), mip).r;
    let d11 = textureLoad(hiz_pyramid, vec2<i32>(c1.x, c1.y), mip).r;
    let hiz_min = min(min(d00, d10), min(d01, d11));

    // Reverse-Z occlusion: if candidate's nearest depth is strictly behind occluder's farthest depth.
    if (max_z + 0.0002 < hiz_min) {
        out_args.instance_count = 0u;
    }

    indirect_args[idx] = out_args;
}
