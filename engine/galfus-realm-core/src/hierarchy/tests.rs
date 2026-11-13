use std::collections::HashMap;

use glam::{Quat, Vec2, Vec3};

use super::solver_2d::HierarchyGraph2D;
use super::solver_3d::HierarchyGraph3D;
use super::types::{HierarchyConstraint2D, HierarchyConstraint3D, Pose2D, Pose3D};

#[test]
fn test_2d_fixed_hierarchy() {
    let mut graph = HierarchyGraph2D::new();
    let mut locals = HashMap::new();
    let mut worlds = HashMap::new();

    // Parent at (10, 20), rotation 0, scale (1, 1)
    locals.insert(1, Pose2D::new(Vec2::new(10.0, 20.0), 0.0, Vec2::ONE));
    // Child at (5, 0) relative to parent
    locals.insert(2, Pose2D::new(Vec2::new(5.0, 0.0), 0.0, Vec2::ONE));

    graph
        .attach(
            2,
            1,
            HierarchyConstraint2D::Fixed {
                offset: [0.0, 0.0],
                rotation_offset: 0.0,
                local_anchor_origin: None,
                local_anchor_target: None,
            },
        )
        .unwrap();

    graph.solve(&locals, &mut worlds, 0.016, 0.0);

    let child_world = worlds.get(&2).unwrap();
    assert!((child_world.position.x - 15.0).abs() < 1e-4);
    assert!((child_world.position.y - 20.0).abs() < 1e-4);
}

#[test]
fn test_2d_cycle_detection() {
    let mut graph = HierarchyGraph2D::new();
    let mut locals = HashMap::new();
    let mut worlds = HashMap::new();

    locals.insert(1, Pose2D::new(Vec2::new(10.0, 0.0), 0.0, Vec2::ONE));
    locals.insert(2, Pose2D::new(Vec2::new(20.0, 0.0), 0.0, Vec2::ONE));

    // 1 -> 2 and 2 -> 1 (cycle)
    graph
        .attach(1, 2, HierarchyConstraint2D::default())
        .unwrap();
    graph
        .attach(2, 1, HierarchyConstraint2D::default())
        .unwrap();

    // Should not stack overflow
    graph.solve(&locals, &mut worlds, 0.016, 0.0);
    assert!(worlds.contains_key(&1));
    assert!(worlds.contains_key(&2));
}

#[test]
fn test_2d_rhai_script_constraint() {
    let mut graph = HierarchyGraph2D::new();
    let mut locals = HashMap::new();
    let mut worlds = HashMap::new();

    locals.insert(1, Pose2D::new(Vec2::new(10.0, 10.0), 0.0, Vec2::ONE));
    locals.insert(2, Pose2D::default());

    let script = r#"
        out.copy_position(target);
        out.x += 5.0;
        out.y += sin(time * 3.0) * 2.0;
    "#;

    let res = graph.attach(
        2,
        1,
        HierarchyConstraint2D::Script {
            source: script.to_string(),
        },
    );
    assert!(res.is_ok(), "Attach failed: {:?}", res);

    graph.solve(&locals, &mut worlds, 0.016, 0.0);

    let child = worlds.get(&2).unwrap();
    eprintln!("Child position: {:?}", child.position);
    assert!((child.position.x - 15.0).abs() < 1e-4);
    assert!((child.position.y - 10.0).abs() < 1e-4);
}

#[test]
fn test_3d_rope_slack_and_clamp() {
    let mut graph = HierarchyGraph3D::new();
    let mut locals = HashMap::new();
    let mut worlds = HashMap::new();

    locals.insert(
        1,
        Pose3D::new(Vec3::new(0.0, 0.0, 0.0), Quat::IDENTITY, Vec3::ONE),
    );
    locals.insert(
        2,
        Pose3D::new(Vec3::new(2.0, 0.0, 0.0), Quat::IDENTITY, Vec3::ONE),
    );

    graph
        .attach(
            2,
            1,
            HierarchyConstraint3D::Rope {
                max_length: 5.0,
                damping: 0.0,
                offset: [0.0, 0.0, 0.0],
                local_anchor_origin: None,
                local_anchor_target: None,
            },
        )
        .unwrap();

    // Within max_length (dist = 2 < 5), stays at 2.0
    graph.solve(&locals, &mut worlds, 0.016, 0.016);
    let child = worlds.get(&2).unwrap();
    assert!((child.position.x - 2.0).abs() < 1e-4);

    // Move parent to x = 10.0, distance = 8.0 > max_length 5.0 -> clamped to 5.0 away
    locals.insert(
        1,
        Pose3D::new(Vec3::new(10.0, 0.0, 0.0), Quat::IDENTITY, Vec3::ONE),
    );
    graph.solve(&locals, &mut worlds, 0.016, 0.032);
    let child = worlds.get(&2).unwrap();
    // Clamped position should be parent (10) - 5 = 5.0
    assert!((child.position.x - 5.0).abs() < 1e-4);
}

#[test]
fn test_3d_chain_exact_distance() {
    let mut graph = HierarchyGraph3D::new();
    let mut locals = HashMap::new();
    let mut worlds = HashMap::new();

    locals.insert(1, Pose3D::new(Vec3::ZERO, Quat::IDENTITY, Vec3::ONE));
    locals.insert(
        2,
        Pose3D::new(Vec3::new(0.0, -1.0, 0.0), Quat::IDENTITY, Vec3::ONE),
    );

    graph
        .attach(
            2,
            1,
            HierarchyConstraint3D::Chain {
                length: 3.0,
                align_rotation: true,
                offset: [0.0, 0.0, 0.0],
                local_anchor_origin: None,
                local_anchor_target: None,
            },
        )
        .unwrap();

    graph.solve(&locals, &mut worlds, 0.016, 0.016);
    let child = worlds.get(&2).unwrap();
    assert!((child.position.y - (-3.0)).abs() < 1e-4);
}

#[test]
fn test_3d_spring_oscillation() {
    let mut graph = HierarchyGraph3D::new();
    let mut locals = HashMap::new();
    let mut worlds = HashMap::new();

    locals.insert(
        1,
        Pose3D::new(Vec3::new(0.0, 10.0, 0.0), Quat::IDENTITY, Vec3::ONE),
    );
    locals.insert(2, Pose3D::new(Vec3::ZERO, Quat::IDENTITY, Vec3::ONE));

    graph
        .attach(
            2,
            1,
            HierarchyConstraint3D::Spring {
                stiffness: 80.0,
                damping: 12.0,
                rest_length: 4.0,
                offset: [0.0, 0.0, 0.0],
                local_anchor_origin: None,
                local_anchor_target: None,
            },
        )
        .unwrap();

    for i in 1..=60 {
        graph.solve(&locals, &mut worlds, 0.016, i as f32 * 0.016);
    }

    let bob = worlds.get(&2).unwrap();
    // Rest position is 4 below 10 => y ≈ 6.0
    assert!(bob.position.y > 5.0 && bob.position.y < 7.0);
}
