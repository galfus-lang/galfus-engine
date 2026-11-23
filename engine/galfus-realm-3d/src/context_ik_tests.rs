use super::*;
use galfus_realm_3d_resources::transform::Transform3D;

#[test]
fn two_bone_ik_reaches_target_and_respects_pole() {
    let mut realm = Realm3DContext::new(1);
    realm.write_entity_transform(1, Transform3D::from_position(Vec3::new(0.0, 2.0, 0.0)));
    realm.write_entity_transform(2, Transform3D::from_position(Vec3::new(0.0, 1.0, 0.0)));
    realm.write_entity_transform(3, Transform3D::from_position(Vec3::new(0.0, 0.0, 0.0)));

    let target = [0.0, 0.6, 0.0];
    realm
        .set_ik_constraint_3d(
            10,
            IkConstraint3D::TwoBone {
                root_id: 1,
                mid_id: 2,
                effector_id: 3,
                target,
                pole_target: Some([0.0, 1.0, 2.0]),
                weight: 1.0,
                active: true,
            },
        )
        .unwrap();

    realm.solve_ik();

    let eff = realm.resolve_entity_transform(3).unwrap().position;
    let mid = realm.resolve_entity_transform(2).unwrap().position;
    assert!((eff - Vec3::from_array(target)).length() < 1e-3);
    assert!(mid.z > 0.1, "knee should bend toward +Z pole: {mid:?}");
}

#[test]
fn fabrik_chain_converges_to_target_and_respects_pole() {
    let mut realm = Realm3DContext::new(1);
    for i in 0..4u32 {
        realm.write_entity_transform(
            i + 1,
            Transform3D::from_position(Vec3::new(0.0, i as f32, 0.0)),
        );
    }
    realm
        .set_ik_constraint_3d(
            20,
            IkConstraint3D::Fabrik {
                chain: vec![1, 2, 3, 4],
                target: [1.5, 1.5, 0.0],
                pole_target: Some([0.0, 10.0, 0.0]),
                iterations: 16,
                tolerance: 1e-4,
                weight: 1.0,
                active: true,
            },
        )
        .unwrap();

    realm.solve_ik();
    let p0 = realm.resolve_entity_transform(1).unwrap().position;
    let p1 = realm.resolve_entity_transform(2).unwrap().position;
    let p2 = realm.resolve_entity_transform(3).unwrap().position;
    let p3 = realm.resolve_entity_transform(4).unwrap().position;
    assert!(p1.y > 0.5 && p2.y > 0.5 && p1.z.abs() < 1e-3 && p2.z.abs() < 1e-3);
    assert!(((p1 - p0).length() - 1.0).abs() < 1e-3);
    assert!(((p2 - p1).length() - 1.0).abs() < 1e-3);
    assert!(((p3 - p2).length() - 1.0).abs() < 1e-3);
    assert!((p3 - Vec3::new(1.5, 1.5, 0.0)).length() < 1e-2);
}

#[test]
fn look_at_ik_orients_forward_axis_toward_target() {
    let mut realm = Realm3DContext::new(1);
    realm.write_entity_transform(1, Transform3D::from_position(Vec3::ZERO));
    realm
        .set_ik_constraint_3d(
            30,
            IkConstraint3D::LookAt {
                entity_id: 1,
                target: [5.0, 0.0, 0.0],
                forward_axis: [0.0, 0.0, 1.0],
                up_axis: [0.0, 1.0, 0.0],
                weight: 1.0,
                active: true,
            },
        )
        .unwrap();
    realm.solve_ik();
    let rot = realm.resolve_entity_transform(1).unwrap().rotation;
    let aimed = rot * Vec3::Z;
    assert!((aimed - Vec3::X).length() < 1e-4);
}
