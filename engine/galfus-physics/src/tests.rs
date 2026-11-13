use galfus_realm_core::collision::{Collider2D, Collider3D, ColliderShape2D, ColliderShape3D};
use galfus_realm_core::hierarchy::{Pose2D, Pose3D};
use glam::{Quat, Vec2, Vec3};

use crate::types::{RigidBodyDesc2D, RigidBodyDesc3D, RigidBodyType};
use crate::world_2d::PhysicsWorld2D;
use crate::world_3d::PhysicsWorld3D;

#[test]
fn test_physics_world_2d_gravity_fall() {
    let mut world = PhysicsWorld2D::new([0.0, -9.81]);

    // Dynamic ball at (0, 10)
    let ball_id = 1;
    let ball_pose = Pose2D::new(Vec2::new(0.0, 10.0), 0.0, Vec2::ONE);
    let ball_desc = RigidBodyDesc2D {
        body_type: RigidBodyType::Dynamic,
        mass: Some(1.0),
        ..Default::default()
    };
    world.add_rigid_body(ball_id, &ball_pose, &ball_desc);

    let collider = Collider2D {
        id: 100,
        model_id: ball_id,
        shape: ColliderShape2D::Circle { radius: 0.5 },
        offset: [0.0, 0.0],
        local_matrix: None,
        active: true,
        sensor: false,
        layer: 1,
        mask: 1,
    };
    world.sync_collider(ball_id, &collider, Some(&ball_desc), [1.0, 1.0]);

    // Step physics for 1 second (60 steps)
    for _ in 0..60 {
        world.step(1.0 / 60.0);
    }

    let end_pose = world.get_body_pose(ball_id).unwrap();
    // After 1s under -9.81 m/s², y should drop significantly from 10.0 (around y ≈ 10 - 0.5 * 9.81 ≈ 5.1)
    assert!(
        end_pose.position.y < 9.0,
        "Ball should have fallen under gravity, y = {}",
        end_pose.position.y
    );
}

#[test]
fn test_physics_world_2d_impulse() {
    let mut world = PhysicsWorld2D::new([0.0, 0.0]); // zero gravity

    let entity_id = 1;
    let pose = Pose2D::new(Vec2::ZERO, 0.0, Vec2::ONE);
    let desc = RigidBodyDesc2D {
        body_type: RigidBodyType::Dynamic,
        mass: Some(1.0),
        ..Default::default()
    };
    world.add_rigid_body(entity_id, &pose, &desc);

    let collider = Collider2D {
        id: 102,
        model_id: entity_id,
        shape: ColliderShape2D::Circle { radius: 0.5 },
        offset: [0.0, 0.0],
        local_matrix: None,
        active: true,
        sensor: false,
        layer: 1,
        mask: 1,
    };
    world.sync_collider(entity_id, &collider, Some(&desc), [1.0, 1.0]);

    world.apply_impulse(entity_id, [10.0, 0.0]);

    for _ in 0..60 {
        world.step(1.0 / 60.0);
    }

    let end_pose = world.get_body_pose(entity_id).unwrap();
    assert!(
        end_pose.position.x > 0.5,
        "Body should have moved along X, x = {}",
        end_pose.position.x
    );
}

#[test]
fn test_physics_world_3d_gravity_fall() {
    let mut world = PhysicsWorld3D::new([0.0, -9.81, 0.0]);

    let entity_id = 1;
    let pose = Pose3D::new(Vec3::new(0.0, 10.0, 0.0), Quat::IDENTITY, Vec3::ONE);
    let desc = RigidBodyDesc3D {
        body_type: RigidBodyType::Dynamic,
        mass: Some(2.0),
        ..Default::default()
    };
    world.add_rigid_body(entity_id, &pose, &desc);

    let collider = Collider3D {
        id: 101,
        model_id: entity_id,
        shape: ColliderShape3D::Sphere { radius: 0.5 },
        offset: [0.0, 0.0, 0.0],
        local_matrix: None,
        active: true,
        sensor: false,
        layer: 1,
        mask: 1,
    };
    world.sync_collider(entity_id, &collider, Some(&desc), [1.0, 1.0, 1.0]);

    for _ in 0..60 {
        world.step(1.0 / 60.0);
    }

    let end_pose = world.get_body_pose(entity_id).unwrap();
    assert!(
        end_pose.position.y < 9.0,
        "3D Body should have fallen under gravity, y = {}",
        end_pose.position.y
    );
}

#[test]
fn step_result_preserves_large_logical_ids() {
    let mut world = PhysicsWorld2D::default();
    let id = 16_777_217;
    world.add_rigid_body(id, &Pose2D::default(), &RigidBodyDesc2D::default());
    let result = serde_json::to_value(world.step(1.0 / 60.0)).unwrap();
    assert_eq!(result["poses"][0][0].as_u64(), Some(id.into()));
}
