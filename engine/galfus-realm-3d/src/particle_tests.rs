use super::*;
use galfus_realm_3d_resources::material::SurfaceType3D;
use galfus_realm_3d_resources::particle::{ParticleEmitter3D, ParticleEmitterState3D};
use galfus_realm_3d_resources::transform::Transform3D;
use glam::{Quat, Vec3, Vec4};
use std::collections::BTreeMap;

#[test]
fn collect_emitter_instances_propagates_uv_rect_and_material_batches() {
    let mut emitters = BTreeMap::new();
    let emitter = ParticleEmitter3D {
        material_id: Some(7),
        uv_rect: Vec4::new(0.25, 0.5, 0.75, 1.0),
        ..Default::default()
    };
    let mut state = ParticleEmitterState3D::new();
    state.burst(&emitter, 4, Vec3::ZERO, Quat::IDENTITY);
    emitters.insert(1, (emitter, Transform3D::default(), state));

    let mut materials = BTreeMap::new();
    let mat = Material3D {
        surface_type: SurfaceType3D::Transparent,
        albedo_texture_id: Some(42),
        ..Default::default()
    };
    materials.insert(7, (mat, None, None));

    let mut alpha = Vec::new();
    let mut additive = Vec::new();
    let mut alpha_batches = Vec::new();
    let mut additive_batches = Vec::new();

    collect_emitter_instances(
        &emitters,
        &materials,
        None,
        u32::MAX,
        &mut alpha,
        &mut additive,
        &mut alpha_batches,
        &mut additive_batches,
    );

    assert_eq!(alpha.len(), 4);
    assert!(additive.is_empty());
    assert_eq!(alpha_batches.len(), 1);
    assert_eq!(alpha_batches[0].material_id, Some(7));
    assert_eq!(alpha_batches[0].front_range, 0..4);
    assert_eq!(alpha[0].uv_rect, [0.25, 0.5, 0.75, 1.0]);
}

#[test]
fn collect_emitter_instances_filters_by_camera_layer_mask() {
    let mut emitters = BTreeMap::new();
    let emitter = ParticleEmitter3D {
        layer_mask: 0b0100,
        ..Default::default()
    };
    let mut state = ParticleEmitterState3D::new();
    state.burst(&emitter, 3, Vec3::ZERO, Quat::IDENTITY);
    emitters.insert(1, (emitter, Transform3D::default(), state));

    let materials = BTreeMap::new();
    let mut alpha = Vec::new();
    let mut additive = Vec::new();
    let mut alpha_batches = Vec::new();
    let mut additive_batches = Vec::new();

    collect_emitter_instances(
        &emitters,
        &materials,
        None,
        0b0001,
        &mut alpha,
        &mut additive,
        &mut alpha_batches,
        &mut additive_batches,
    );
    assert!(additive.is_empty());

    collect_emitter_instances(
        &emitters,
        &materials,
        None,
        0b0100,
        &mut alpha,
        &mut additive,
        &mut alpha_batches,
        &mut additive_batches,
    );
    assert_eq!(additive.len(), 3);
}
