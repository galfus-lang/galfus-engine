//! Full-Engine Stress & Memory Leak Benchmark
//!
//! Run with: `cargo run -p galfus-native --example leak_benchmark`

use std::collections::BTreeMap;
use std::ffi::{CStr, CString};

use galfus_animation::AnimationContext;
use galfus_animation::target::AnimationTarget;
use galfus_animation::transition::{LoopMode, TransitionConfig};
use galfus_animation::value::AnimValue;
use galfus_gpu_manager::types::{
    BufferUsageFlags, GpuTextureDesc, NormalizedTextureFormat, TextureDimension, TextureUsageFlags,
};
use galfus_multiverse::{
    AntiAliasingMode, InvocationDesc, InvocationFilter, TargetDesc, TargetKind, ViewportRect,
};
use galfus_native::ffi::{
    galfus_platform_init_headless, galfus_platform_shutdown, galfus_string_free,
};
use galfus_native::ffi_diagnostics::{
    galfus_diagnostics_configure, galfus_diagnostics_reset, galfus_diagnostics_snapshot,
};
use galfus_native::state::{with_animation_mut, with_multiverse_mut};
use galfus_physics::types::{RigidBodyDesc2D, RigidBodyDesc3D};
use galfus_realm_2d::Realm2DContext;
use galfus_realm_2d_resources::camera::Camera2D;
use galfus_realm_2d_resources::light::Light2D;
use galfus_realm_2d_resources::material::Material2D;
use galfus_realm_2d_resources::particle::ParticleEmitter2D;
use galfus_realm_2d_resources::shape::Shape2D;
use galfus_realm_2d_resources::sprite::Sprite2D;
use galfus_realm_2d_resources::transform::Transform2D;
use galfus_realm_2d_resources::ui::Model2DUI;
use galfus_realm_3d::Realm3DContext;
use galfus_realm_3d_resources::camera::Camera3D;
use galfus_realm_3d_resources::environment::EnvironmentRealm3D;
use galfus_realm_3d_resources::geometry::{Geometry3D, MorphTarget3D, MorphVertex3D};
use galfus_realm_3d_resources::light::Light3D;
use galfus_realm_3d_resources::material::{Material3D, SurfaceType3D};
use galfus_realm_3d_resources::model::{InstanceData3D, InstancedModel3D, Model3D};
use galfus_realm_3d_resources::particle::ParticleEmitter3D;
use galfus_realm_3d_resources::transform::Transform3D;
use galfus_realm_core::hierarchy::{HierarchyConstraint2D, HierarchyConstraint3D};
use galfus_realm_core::{Collider2D, Collider3D, ColliderShape2D, ColliderShape3D};
use glam::{Mat4, UVec2, Vec2, Vec3, Vec4};

const REALM_3D_ID: u32 = 10;
const REALM_2D_ID: u32 = 20;
const TARGET_MAIN_ID: u32 = 1;

fn read_process_rss_kib() -> u64 {
    #[cfg(target_os = "linux")]
    if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
        for line in status.lines() {
            if let Some(rest) = line.strip_prefix("VmRSS:")
                && let Some(val) = rest.split_whitespace().next()
            {
                return val.parse::<u64>().unwrap_or(0);
            }
        }
    }
    0
}

fn take_snapshot_via_ffi() -> (serde_json::Value, u64) {
    let ptr = galfus_diagnostics_snapshot(0);
    assert!(!ptr.is_null(), "galfus_diagnostics_snapshot returned null");
    let json_str = unsafe { CStr::from_ptr(ptr) }
        .to_str()
        .expect("valid utf8")
        .to_string();
    unsafe { galfus_string_free(ptr) };
    (
        serde_json::from_str(&json_str).expect("valid snapshot json"),
        read_process_rss_kib(),
    )
}

fn rgba_checker(w: u32, h: u32, seed: u8) -> Vec<u8> {
    let mut data = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let idx = ((y * w + x) * 4) as usize;
            let on = ((x / 8) + (y / 8)) % 2 == 0;
            data[idx] = if on { seed } else { 40 };
            data[idx + 1] = ((x * 3) as u8).wrapping_add(seed);
            data[idx + 2] = ((y * 5) as u8).wrapping_add(seed);
            data[idx + 3] = 255;
        }
    }
    data
}

fn tex_desc(label: String, width: u32, height: u32) -> GpuTextureDesc {
    GpuTextureDesc {
        label: Some(label),
        width,
        height,
        depth_or_layers: 1,
        mip_levels: 1,
        sample_count: 1,
        dimension: TextureDimension::D2,
        format: NormalizedTextureFormat::Rgba8Unorm,
        usages: TextureUsageFlags {
            texture_binding: true,
            copy_dst: true,
            ..Default::default()
        },
    }
}

fn build_realm_3d() -> Result<Realm3DContext, String> {
    let mut r3d = Realm3DContext::new(REALM_3D_ID);
    r3d.enable_physics_3d([0.0, -9.81, 0.0])
        .map_err(|e| e.to_string())?;
    r3d.create_camera(
        1,
        Camera3D::perspective(60.0, 0.1, 500.0, 0),
        Transform3D::from_position(Vec3::new(0.0, 4.0, -12.0)),
    )
    .map_err(|e| e.to_string())?;

    let mut env = EnvironmentRealm3D::default();
    env.bloom.enabled = true;
    env.ssao.enabled = true;
    env.outline.enabled = true;
    r3d.set_environment(env);

    let mut cube = Geometry3D::cube(1.0);
    cube.set_morph_targets(vec![MorphTarget3D::new(vec![
        MorphVertex3D::new(
            [0.0, 0.2, 0.0],
            [0.0; 3],
            [0.0; 3]
        );
        cube.vertices.len()
    ])])
    .map_err(|e| e.to_string())?;
    r3d.create_geometry(1, cube).map_err(|e| e.to_string())?;
    r3d.create_material(1, Material3D::solid_color(Vec4::new(0.3, 0.7, 1.0, 1.0)))
        .map_err(|e| e.to_string())?;
    let mut refractive = Material3D::solid_color(Vec4::new(0.8, 0.95, 1.0, 0.4));
    refractive.surface_type = SurfaceType3D::Refractive;
    r3d.create_material(2, refractive)
        .map_err(|e| e.to_string())?;

    for i in 0..24u32 {
        let mut m = Model3D::new(1, if i % 6 == 0 { 2 } else { 1 });
        m.cast_outline = i % 4 == 0;
        let pos = Vec3::new((i % 6) as f32 * 2.2 - 5.5, 0.0, (i / 6) as f32 * 2.2);
        r3d.create_model(100 + i, m, Transform3D::from_position(pos))
            .map_err(|e| e.to_string())?;
    }

    r3d.create_instanced_model(500, InstancedModel3D::new(1, 1, 200))
        .map_err(|e| e.to_string())?;
    let instances: Vec<InstanceData3D> = (0..200)
        .map(|i| InstanceData3D {
            transform: Mat4::from_translation(Vec3::new(
                (i % 20) as f32 * 1.5 - 15.0,
                -2.0,
                (i / 20) as f32 * 1.5,
            )),
            color: Vec4::new(0.6, 0.8, 0.4, 1.0),
            emissive: Vec4::ZERO,
            pbr: Vec4::new(0.1, 0.6, 0.5, 0.0),
            custom: Vec4::ZERO,
        })
        .collect();
    r3d.set_instanced_model_data(500, instances)
        .map_err(|e| e.to_string())?;
    r3d.create_light(
        1,
        Light3D::directional(Vec3::new(-0.5, -1.0, 0.4), 1.5, true),
        Transform3D::default(),
    )
    .map_err(|e| e.to_string())?;
    for i in 0..4u32 {
        r3d.create_light(
            10 + i,
            Light3D::point(Vec3::new(1.0, 0.8, 0.5), 2.0, 18.0, i == 0),
            Transform3D::from_position(Vec3::new(i as f32 * 3.0 - 4.5, 3.0, 0.0)),
        )
        .map_err(|e| e.to_string())?;
    }
    r3d.create_particle_emitter(
        1,
        ParticleEmitter3D::default(),
        Transform3D::from_position(Vec3::new(0.0, 1.0, 0.0)),
    )
    .map_err(|e| e.to_string())?;
    Ok(r3d)
}

fn build_realm_2d() -> Result<Realm2DContext, String> {
    let mut r2d = Realm2DContext::new(REALM_2D_ID);
    r2d.enable_physics_2d([0.0, -9.81])
        .map_err(|e| e.to_string())?;
    r2d.set_camera(1, Camera2D::default(), Transform2D::default())
        .map_err(|e| e.to_string())?;
    r2d.set_material(1, Material2D::default())
        .map_err(|e| e.to_string())?;
    for i in 0..30u32 {
        r2d.set_sprite(
            100 + i,
            Sprite2D::default(),
            Transform2D::from_translation(Vec2::new(
                (i % 10) as f32 * 40.0,
                (i / 10) as f32 * 40.0,
            )),
        )
        .map_err(|e| e.to_string())?;
    }
    for i in 0..3u32 {
        let light = Light2D {
            cast_shadow: true,
            position: Vec2::new(i as f32 * 100.0, 50.0),
            ..Default::default()
        };
        r2d.set_light(10 + i, light).map_err(|e| e.to_string())?;
    }
    r2d.set_particle_emitter(1, ParticleEmitter2D::default(), Transform2D::default())
        .map_err(|e| e.to_string())?;
    Ok(r2d)
}

fn setup_base_scene() {
    with_multiverse_mut(|mv| {
        mv.set_anti_aliasing(AntiAliasingMode::Smaa);
        mv.create_target(
            TARGET_MAIN_ID,
            TargetDesc {
                kind: TargetKind::Texture {
                    width: 1280,
                    height: 720,
                    format: "rgba8unorm".into(),
                },
                size: Some(UVec2::new(1280, 720)),
            },
        )
        .map_err(|e| e.to_string())?;
        mv.create_texture(
            1,
            &tex_desc("base_checker".into(), 64, 64),
            &rgba_checker(64, 64, 180),
        )
        .map_err(|e| e.to_string())?;
        mv.register_realm(Box::new(build_realm_3d()?))
            .map_err(|e| e.to_string())?;
        mv.register_realm(Box::new(build_realm_2d()?))
            .map_err(|e| e.to_string())?;
        mv.create_invocation(
            1,
            InvocationDesc {
                realm_id: REALM_3D_ID,
                target_id: TARGET_MAIN_ID,
                camera_slot: Some(0),
                viewport: ViewportRect::full(),
                filters: vec![InvocationFilter::Sepia],
                z_index: 0,
                anti_aliasing: None,
                enabled: true,
                clear_color: Some([0.05, 0.06, 0.09, 1.0]),
            },
        )
        .map_err(|e| e.to_string())?;
        mv.create_invocation(
            2,
            InvocationDesc {
                realm_id: REALM_2D_ID,
                target_id: TARGET_MAIN_ID,
                camera_slot: Some(0),
                viewport: ViewportRect::full(),
                filters: vec![],
                z_index: 1,
                anti_aliasing: Some(AntiAliasingMode::None),
                enabled: true,
                clear_color: None,
            },
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .expect("setup_base_scene failed");
}

fn step_frame(frame_id: u64, dt: f32) {
    with_animation_mut(|anim: &mut AnimationContext| {
        anim.step(dt);
        with_multiverse_mut(|mv| {
            let _ = anim.apply_to_multiverse(mv);
            if let Some(r3d) = mv.get_realm_mut::<Realm3DContext>(REALM_3D_ID) {
                r3d.step_physics(dt);
                r3d.draw_line(Vec3::ZERO, Vec3::Y * 3.0, Vec4::ONE);
            }
            if let Some(r2d) = mv.get_realm_mut::<Realm2DContext>(REALM_2D_ID) {
                r2d.step_physics(dt);
            }
            mv.dispatch(frame_id, dt).map_err(|e| e.to_string())
        })
    })
    .expect("step_frame failed");
}

fn run_churn_cycle(cycle: u32, frame_counter: &mut u64) {
    let base_id = 10_000 + cycle * 1_000;
    let tex_bytes = rgba_checker(128, 128, (cycle * 37) as u8);
    let buf_bytes = vec![0xABu8; 4096];
    let buf_usage = BufferUsageFlags {
        vertex: false,
        index: false,
        uniform: false,
        storage: true,
        copy_src: false,
        copy_dst: true,
    };

    with_multiverse_mut(|mv| {
        mv.set_anti_aliasing(if cycle.is_multiple_of(2) {
            AntiAliasingMode::Smaa
        } else {
            AntiAliasingMode::Taa
        });
        for i in 0..10u32 {
            let tid = base_id + i;
            mv.create_texture(tid, &tex_desc(format!("churn_tex_{tid}"), 128, 128), &tex_bytes)
                .map_err(|e| e.to_string())?;
            mv.create_buffer(tid, Some(&format!("churn_buf_{tid}")), &buf_bytes, buf_usage)
                .map_err(|e| e.to_string())?;
        }
        if let Some(r2d) = mv.get_realm_mut::<Realm2DContext>(REALM_2D_ID) {
            for i in 0..25u32 {
                let id = base_id + 100 + i;
                r2d.set_sprite(id, Sprite2D::default(), Transform2D::from_translation(Vec2::new(i as f32 * 5.0, 10.0)))
                    .map_err(|e| e.to_string())?;
                r2d.create_collider_2d(Collider2D {
                    id,
                    model_id: id,
                    shape: ColliderShape2D::Rectangle { half_extents: [8.0, 8.0] },
                    offset: [0.0, 0.0],
                    local_matrix: None,
                    sensor: false,
                    layer: 1,
                    mask: u32::MAX,
                    active: true,
                })
                .map_err(|e| e.to_string())?;
                r2d.attach_rigid_body_2d(id, RigidBodyDesc2D::default()).map_err(|e| e.to_string())?;
                r2d.attach_2d(
                    id,
                    100,
                    HierarchyConstraint2D::Script {
                        source: "let x = target_x + 1.0; #{ x: x, y: target_y, rotation: 0.0, scale_x: 1.0, scale_y: 1.0 }".into(),
                    },
                )
                .map_err(|e| e.to_string())?;
            }
            for i in 0..10u32 {
                r2d.set_shape(base_id + 200 + i, Shape2D::default(), Transform2D::default())
                    .map_err(|e| e.to_string())?;
            }
            for i in 0..5u32 {
                r2d.create_ui(base_id + 300 + i, Model2DUI::default(), Transform2D::default())
                    .map_err(|e| e.to_string())?;
            }
        }
        if let Some(r3d) = mv.get_realm_mut::<Realm3DContext>(REALM_3D_ID) {
            for i in 0..15u32 {
                let id = base_id + 400 + i;
                r3d.create_geometry(id, Geometry3D::sphere(0.6, 16, 12)).map_err(|e| e.to_string())?;
                r3d.create_material(id, Material3D::solid_color(Vec4::new(0.8, 0.3, 0.2, 1.0)))
                    .map_err(|e| e.to_string())?;
                r3d.create_model(id, Model3D::new(id, id), Transform3D::from_position(Vec3::new(i as f32, 2.0, 0.0)))
                    .map_err(|e| e.to_string())?;
                r3d.create_collider_3d(Collider3D {
                    id,
                    model_id: id,
                    shape: ColliderShape3D::Sphere { radius: 0.6 },
                    offset: [0.0, 0.0, 0.0],
                    local_matrix: None,
                    sensor: false,
                    layer: 1,
                    mask: u32::MAX,
                    active: true,
                })
                .map_err(|e| e.to_string())?;
                r3d.attach_rigid_body_3d(id, RigidBodyDesc3D::default()).map_err(|e| e.to_string())?;
                r3d.attach_3d(
                    id,
                    100,
                    HierarchyConstraint3D::Script {
                        source: "#{ x: target_x, y: target_y + 1.0, z: target_z }".into(),
                    },
                )
                .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })
    .expect("churn spawn failed");

    with_animation_mut(|anim| {
        for i in 0..20u32 {
            let tid = base_id + 600 + i;
            let cfg = TransitionConfig {
                duration: 0.03,
                loop_mode: LoopMode::Once,
                ..Default::default()
            };
            anim.create_transition(tid, AnimValue::Scalar(0.0), cfg)
                .map_err(|e| e.to_string())?;
            anim.bind_target(tid, AnimationTarget::CustomChannel { channel_id: tid })
                .map_err(|e| e.to_string())?;
            anim.transition_to(tid, AnimValue::Scalar(1.0), None)
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .expect("churn anim spawn failed");

    for _ in 0..4 {
        *frame_counter += 1;
        step_frame(*frame_counter, 0.016);
    }

    with_animation_mut(|anim| {
        anim.prune_completed();
        let _ = anim.pump_events();
        Ok(())
    })
    .expect("churn anim prune failed");

    with_multiverse_mut(|mv| {
        if let Some(r2d) = mv.get_realm_mut::<Realm2DContext>(REALM_2D_ID) {
            for i in 0..25u32 {
                let id = base_id + 100 + i;
                let _ = r2d.remove_rigid_body_2d(id);
                let _ = r2d.destroy_sprite(id);
            }
            for i in 0..10u32 {
                let _ = r2d.destroy_shape(base_id + 200 + i);
            }
            for i in 0..5u32 {
                let _ = r2d.destroy_ui(base_id + 300 + i);
            }
        }
        if let Some(r3d) = mv.get_realm_mut::<Realm3DContext>(REALM_3D_ID) {
            for i in 0..15u32 {
                let id = base_id + 400 + i;
                let _ = r3d.remove_rigid_body_3d(id);
                let _ = r3d.destroy_model(id);
                let _ = r3d.destroy_geometry(id);
                let _ = r3d.destroy_material(id);
            }
        }
        for i in 0..10u32 {
            let tid = base_id + i;
            let _ = mv.dispose_texture(tid);
            let _ = mv.dispose_buffer(tid);
        }
        Ok(())
    })
    .expect("churn destroy failed");

    for _ in 0..2 {
        *frame_counter += 1;
        step_frame(*frame_counter, 0.016);
    }
}

fn extract_category_map(snap: &serde_json::Value) -> BTreeMap<String, (u64, u64, u64)> {
    let mut map = BTreeMap::new();
    if let Some(arr) = snap["memory"]["categories"].as_array() {
        for item in arr {
            map.insert(
                item["category"].as_str().unwrap_or("unknown").to_string(),
                (
                    item["cpuBytes"].as_u64().unwrap_or(0),
                    item["gpuBytes"].as_u64().unwrap_or(0),
                    item["itemCount"].as_u64().unwrap_or(0),
                ),
            );
        }
    }
    map
}

fn print_summary(
    first_cats: &BTreeMap<String, (u64, u64, u64)>,
    last_snap: &serde_json::Value,
    rss_delta_mib: f64,
) {
    println!("\n=== Memory Growth (Cycle 1 -> 8 | VmRSS delta: {rss_delta_mib:+.2} MiB) ===");
    let last_cats = extract_category_map(last_snap);
    let mut rows: Vec<_> = last_cats
        .iter()
        .map(|(cat, &(ce, ge, ie))| {
            let (cs, gs, is) = first_cats.get(cat).copied().unwrap_or((0, 0, 0));
            (
                cat.as_str(),
                ce as i64 - cs as i64,
                ge as i64 - gs as i64,
                ie as i64 - is as i64,
            )
        })
        .collect();
    rows.sort_by_key(|a| std::cmp::Reverse(a.1 + a.2));
    for (cat, dc, dg, di) in rows {
        println!("  {cat:<34} cpu={dc:>+10}B gpu={dg:>+10}B items={di:>+6}");
    }
    if let Some(arr) = last_snap["driftWarnings"].as_array()
        && !arr.is_empty()
    {
        println!("\n=== Drift Warnings ({}) ===", arr.len());
        for w in arr {
            println!("  [{}] {}", w["category"], w["message"]);
        }
    }
}

fn main() {
    assert_eq!(galfus_platform_init_headless(), 0, "headless init failed");
    let cfg = CString::new(r#"{"enabledTags":["*"],"consoleOutput":false}"#).unwrap();
    assert_eq!(unsafe { galfus_diagnostics_configure(cfg.as_ptr()) }, 0);
    galfus_diagnostics_reset();

    println!("=== Galfus Full-Engine Stress & Leak Benchmark ===\n");
    setup_base_scene();

    let mut frame_counter = 0u64;
    for _ in 0..5 {
        frame_counter += 1;
        step_frame(frame_counter, 0.016);
    }
    let (steady_start, rss_steady_start) = take_snapshot_via_ffi();
    for _ in 0..40 {
        frame_counter += 1;
        step_frame(frame_counter, 0.016);
    }
    let (steady_end, rss_steady_end) = take_snapshot_via_ffi();
    println!(
        "[Phase A: Steady-State 40 frames] VmRSS: {:.2} -> {:.2} MiB ({:+.2} MiB) | CPU: {:.1} -> {:.1} KiB | GPU: {:.2} MiB",
        rss_steady_start as f64 / 1024.0,
        rss_steady_end as f64 / 1024.0,
        (rss_steady_end as i64 - rss_steady_start as i64) as f64 / 1024.0,
        steady_start["memory"]["totalCpuBytes"]
            .as_u64()
            .unwrap_or(0) as f64
            / 1024.0,
        steady_end["memory"]["totalCpuBytes"].as_u64().unwrap_or(0) as f64 / 1024.0,
        steady_end["memory"]["totalGpuBytes"].as_u64().unwrap_or(0) as f64 / (1024.0 * 1024.0),
    );

    println!("\n[Phase B: Lifecycle Churn (8 cycles)]");
    let mut first_cats = BTreeMap::new();
    let mut last_snap = steady_end;
    let (mut rss_1, mut rss_last) = (0u64, 0u64);
    for cycle in 1..=8u32 {
        run_churn_cycle(cycle, &mut frame_counter);
        let (snap, rss) = take_snapshot_via_ffi();
        println!(
            "Cycle {cycle}: VmRSS={:.2} MiB | CPU={:.1} KiB | GPU={:.2} MiB | Drifts={}",
            rss as f64 / 1024.0,
            snap["memory"]["totalCpuBytes"].as_u64().unwrap_or(0) as f64 / 1024.0,
            snap["memory"]["totalGpuBytes"].as_u64().unwrap_or(0) as f64 / (1024.0 * 1024.0),
            snap["driftWarnings"].as_array().map_or(0, Vec::len),
        );
        if cycle == 1 {
            first_cats = extract_category_map(&snap);
            rss_1 = rss;
        }
        rss_last = rss;
        last_snap = snap;
    }

    print_summary(
        &first_cats,
        &last_snap,
        (rss_last as i64 - rss_1 as i64) as f64 / 1024.0,
    );
    let _ = galfus_platform_shutdown();
}
