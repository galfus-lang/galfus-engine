//! # Galfus Animation System
//!
//! Autonomous transition and property animation crate for Galfus Engine.
//! Supports delay, smooth interruptible retargeting, 30+ easing curves,
//! physical spring simulations, and binding across 3D, 2D, SVG DOM, Multiverse,
//! and custom user channels.

pub mod applier;
pub mod context;
pub mod easing;
pub mod error;
pub mod events;
pub mod path;
pub mod path_math;
pub mod target;
pub mod transition;
pub mod value;

pub use applier::apply_target_value;
pub use context::AnimationContext;
pub use easing::Easing;
pub use error::{AnimationError, AnimationResult};
pub use events::{AnimationEvent, AnimationEventType};
pub use path::{PathCommand, PathFollowConfig, PathFollowInstance, PathFollowState, PathValueType};
pub use target::AnimationTarget;
pub use transition::{
    LoopMode, TransitionConfig, TransitionInstance, TransitionState, TransitionStatus,
};
pub use value::AnimValue;

#[cfg(test)]
mod tests {
    use super::*;
    use galfus_realm_2d::Realm2DContext;
    use galfus_realm_2d_resources::{Sprite2D, Transform2D};
    use glam::Quat;
    use std::collections::HashMap;
    use std::f32::consts::PI;

    #[test]
    fn test_scalar_linear_transition() {
        let mut ctx = AnimationContext::new();
        let config = TransitionConfig {
            duration: 1.0,
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::Once,
        };
        ctx.create_transition(1, AnimValue::Scalar(0.0), config)
            .unwrap();
        ctx.transition_to(1, AnimValue::Scalar(100.0), None)
            .unwrap();

        assert_eq!(ctx.get_state(1).unwrap().status, TransitionStatus::Running);

        // Advance 0.5s -> 50.0
        ctx.step(0.5);
        let val = ctx.get_value(1).unwrap().as_scalar().unwrap();
        assert!((val - 50.0).abs() < 1e-4);

        // Advance 0.5s -> 100.0 (Completed)
        ctx.step(0.5);
        let state = ctx.get_state(1).unwrap();
        assert_eq!(state.status, TransitionStatus::Completed);
        assert!((state.current_value.as_scalar().unwrap() - 100.0).abs() < 1e-4);

        let events = ctx.pump_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, AnimationEventType::Completed);
    }

    #[test]
    fn test_delay_countdown() {
        let mut ctx = AnimationContext::new();
        let config = TransitionConfig {
            duration: 1.0,
            delay: 0.5,
            easing: Easing::Linear,
            loop_mode: LoopMode::Once,
        };
        ctx.create_transition(10, AnimValue::Scalar(10.0), config)
            .unwrap();
        ctx.transition_to(10, AnimValue::Scalar(20.0), None)
            .unwrap();

        assert_eq!(ctx.get_state(10).unwrap().status, TransitionStatus::Delay);

        // Advance 0.25s -> Still in delay
        ctx.step(0.25);
        assert_eq!(ctx.get_state(10).unwrap().status, TransitionStatus::Delay);
        assert_eq!(ctx.get_value(10).unwrap().as_scalar().unwrap(), 10.0);
        assert!(ctx.pump_events().is_empty());

        // Advance 0.25s -> Delay finishes, transition starts
        ctx.step(0.25);
        assert_eq!(ctx.get_state(10).unwrap().status, TransitionStatus::Running);
        let events = ctx.pump_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, AnimationEventType::Started);

        // Advance remaining 1.0s -> Completed
        ctx.step(1.0);
        assert_eq!(
            ctx.get_state(10).unwrap().status,
            TransitionStatus::Completed
        );
        assert_eq!(ctx.get_value(10).unwrap().as_scalar().unwrap(), 20.0);
    }

    #[test]
    fn test_interruptible_smooth_retargeting() {
        let mut ctx = AnimationContext::new();
        let config = TransitionConfig {
            duration: 1.0,
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::Once,
        };
        ctx.create_transition(20, AnimValue::Scalar(0.0), config)
            .unwrap();
        ctx.transition_to(20, AnimValue::Scalar(100.0), None)
            .unwrap();

        // Advance half-way to 50.0
        ctx.step(0.5);
        let current = ctx.get_value(20).unwrap().as_scalar().unwrap();
        assert!((current - 50.0).abs() < 1e-4);

        // Interrupt! Redirect towards 250.0 in 2.0s
        let new_config = TransitionConfig {
            duration: 2.0,
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::Once,
        };
        ctx.transition_to(20, AnimValue::Scalar(250.0), Some(new_config))
            .unwrap();

        let state = ctx.get_state(20).unwrap();
        // Start value must seamlessly be 50.0 (no jump back to 0.0)
        assert!((state.start_value.as_scalar().unwrap() - 50.0).abs() < 1e-4);
        assert!((state.target_value.as_scalar().unwrap() - 250.0).abs() < 1e-4);

        // Step 1.0s (half of 2.0s from 50 to 250) -> should be 150.0
        ctx.step(1.0);
        let current2 = ctx.get_value(20).unwrap().as_scalar().unwrap();
        assert!((current2 - 150.0).abs() < 1e-4);
    }

    #[test]
    fn test_transform3d_shortest_slerp() {
        let mut ctx = AnimationContext::new();
        let config = TransitionConfig {
            duration: 1.0,
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::Once,
        };

        let start_rot = Quat::IDENTITY;
        // 90 degrees around Y axis
        let end_rot = Quat::from_rotation_y(PI * 0.5);

        let start_val = AnimValue::Transform3D([
            0.0,
            0.0,
            0.0,
            start_rot.x,
            start_rot.y,
            start_rot.z,
            start_rot.w,
            1.0,
            1.0,
            1.0,
        ]);
        let end_val = AnimValue::Transform3D([
            10.0, 20.0, 30.0, end_rot.x, end_rot.y, end_rot.z, end_rot.w, 2.0, 2.0, 2.0,
        ]);

        ctx.create_transition(30, start_val, config).unwrap();
        ctx.transition_to(30, end_val, None).unwrap();

        // Step half-way (0.5s)
        ctx.step(0.5);
        let mid = ctx.get_value(30).unwrap();
        let mid_t = mid.to_transform3d().unwrap();

        assert!((mid_t.position.x - 5.0).abs() < 1e-4);
        assert!((mid_t.position.y - 10.0).abs() < 1e-4);
        assert!((mid_t.position.z - 15.0).abs() < 1e-4);
        assert!((mid_t.scale.x - 1.5).abs() < 1e-4);

        // Expected mid rotation is 45 degrees around Y
        let expected_rot = Quat::from_rotation_y(PI * 0.25);
        assert!((mid_t.rotation.dot(expected_rot).abs() - 1.0).abs() < 1e-3);
    }

    #[test]
    fn test_transform2d_angular_wrapping() {
        let mut ctx = AnimationContext::new();
        let config = TransitionConfig {
            duration: 1.0,
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::Once,
        };

        // From 350 degrees (5.934 rad) to 10 degrees (0.174 rad)
        let deg_to_rad = PI / 180.0;
        let start_rot = 350.0 * deg_to_rad;
        let end_rot = 10.0 * deg_to_rad;

        let start_val = AnimValue::Transform2D([0.0, 0.0, start_rot, 1.0, 1.0, 0.0]);
        let end_val = AnimValue::Transform2D([10.0, 10.0, end_rot, 1.0, 1.0, 1.0]);

        ctx.create_transition(40, start_val, config).unwrap();
        ctx.transition_to(40, end_val, None).unwrap();

        // Step 0.5s -> should take the shortest 20-degree path forward (passing 360/0 deg = 0 rad)
        ctx.step(0.5);
        let mid_val = ctx.get_value(40).unwrap();
        let mid_t = mid_val.to_transform2d().unwrap();

        // Shortest mid rotation between 350 deg and 10 deg is 0/360 deg
        let rot_sin = mid_t.rotation.sin();
        let rot_cos = mid_t.rotation.cos();
        assert!(rot_sin.abs() < 0.05);
        assert!((rot_cos - 1.0).abs() < 0.05);
    }

    #[test]
    fn test_ping_pong_loop_mode() {
        let mut ctx = AnimationContext::new();
        let config = TransitionConfig {
            duration: 1.0,
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::PingPong,
        };
        ctx.create_transition(50, AnimValue::Scalar(0.0), config)
            .unwrap();
        ctx.transition_to(50, AnimValue::Scalar(10.0), None)
            .unwrap();

        // Advance 1.0s -> reaches 10.0 and ping-pongs
        ctx.step(1.0);
        let events = ctx.pump_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, AnimationEventType::Looped);

        // Advance 0.5s into bounce -> should be 5.0 (moving back towards 0.0)
        ctx.step(0.5);
        let val = ctx.get_value(50).unwrap().as_scalar().unwrap();
        assert!((val - 5.0).abs() < 1e-4);
    }

    #[test]
    fn test_apply_to_multiverse_error_propagation() {
        let mut ctx = AnimationContext::new();
        let config = TransitionConfig {
            duration: 1.0,
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::Once,
        };
        ctx.create_transition(60, AnimValue::Vec4(glam::Vec4::ZERO), config)
            .unwrap();
        // Bind to non-existent realm
        ctx.bind_target(
            60,
            AnimationTarget::Material2DColor {
                realm_id: 999,
                material_id: 1,
            },
        )
        .unwrap();

        let mut mv = galfus_multiverse::MultiverseContext::new();
        let res = ctx.apply_to_multiverse(&mut mv);
        assert!(
            res.is_err(),
            "Targeting non-existent realm must return an error"
        );
    }

    #[test]
    fn sprite_animation_invalidates_the_realm_shadow_cache() {
        let mut realm = Realm2DContext::new(1);
        realm
            .set_sprite(1, Sprite2D::default(), Transform2D::default())
            .unwrap();
        realm.shadow_manager.is_dirty = false;

        let mut multiverse = galfus_multiverse::MultiverseContext::new();
        multiverse.register_realm(Box::new(realm)).unwrap();
        let mut custom_channels = HashMap::new();
        apply_target_value(
            &AnimationTarget::SpriteTransform2D {
                realm_id: 1,
                sprite_id: 1,
            },
            &AnimValue::Vec2(glam::Vec2::X),
            &mut multiverse,
            &mut custom_channels,
        )
        .unwrap();

        let realm = multiverse.get_realm::<Realm2DContext>(1).unwrap();
        assert!(realm.shadow_manager.is_dirty);
        assert_eq!(realm.sprites[&1].1.position, glam::Vec2::X);
    }

    #[test]
    fn test_target_conflict_locking_and_release() {
        let mut ctx = AnimationContext::new();
        let config = TransitionConfig {
            duration: 1.0,
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::Once,
        };
        ctx.create_transition(71, AnimValue::Scalar(0.0), config.clone())
            .unwrap();
        ctx.create_transition(72, AnimValue::Scalar(0.0), config)
            .unwrap();

        let target = AnimationTarget::CustomChannel { channel_id: 42 };

        // Transition 71 acquires target lock
        assert!(ctx.bind_target(71, target.clone()).is_ok());

        // Transition 72 tries to acquire the same target -> TargetConflict error!
        let err = ctx.bind_target(72, target.clone());
        assert!(err.is_err());
        match err.unwrap_err() {
            AnimationError::TargetConflict { owner_id, .. } => assert_eq!(owner_id, 71),
            other => panic!("Expected TargetConflict, got {other:?}"),
        }

        // Transition 71 releases target
        assert!(ctx.unbind_target(71).is_ok());

        // Now transition 72 can successfully acquire the target lock!
        assert!(ctx.bind_target(72, target.clone()).is_ok());

        // Destroying transition 72 also releases the lock
        assert!(ctx.destroy_transition(72).is_ok());
        assert!(ctx.bind_target(71, target).is_ok());
    }

    #[test]
    fn test_anim_value_interpolation_and_type_mismatch() {
        // 1. Vec4 (Color) interpolation
        let c1 = AnimValue::Vec4(glam::Vec4::new(0.0, 0.0, 0.0, 1.0));
        let c2 = AnimValue::Vec4(glam::Vec4::new(1.0, 1.0, 1.0, 1.0));
        let mid_c = c1.interpolate(&c2, 0.5).unwrap();
        match mid_c {
            AnimValue::Vec4(c) => {
                assert!((c.x - 0.5).abs() < 1e-4);
                assert!((c.y - 0.5).abs() < 1e-4);
                assert!((c.z - 0.5).abs() < 1e-4);
                assert!((c.w - 1.0).abs() < 1e-4);
            }
            _ => panic!("Expected AnimValue::Vec4"),
        }

        // 2. Vec3 interpolation
        let v1 = AnimValue::Vec3(glam::Vec3::new(0.0, 0.0, 0.0));
        let v2 = AnimValue::Vec3(glam::Vec3::new(10.0, 20.0, 30.0));
        let mid_v = v1.interpolate(&v2, 0.5).unwrap();
        match mid_v {
            AnimValue::Vec3(v) => {
                assert!((v.x - 5.0).abs() < 1e-4);
                assert!((v.y - 10.0).abs() < 1e-4);
                assert!((v.z - 15.0).abs() < 1e-4);
            }
            _ => panic!("Expected AnimValue::Vec3"),
        }

        // 3. Type mismatch: Scalar cannot interpolate into Vec4
        let s = AnimValue::Scalar(42.0);
        let mismatch_err = s.interpolate(&c1, 0.5);
        assert!(mismatch_err.is_err());
        match mismatch_err.unwrap_err() {
            AnimationError::TypeMismatch { from, to } => {
                assert!(from.contains("Scalar"));
                assert!(to.contains("Vec4"));
            }
            other => panic!("Expected TypeMismatch, got {other:?}"),
        }
    }

    #[test]
    fn test_transition_not_found_and_rebind_lock_transfer() {
        let mut ctx = AnimationContext::new();

        // 1. Operations on non-existent transition return TransitionNotFound
        assert!(
            ctx.transition_to(999, AnimValue::Scalar(1.0), None)
                .is_err()
        );
        assert!(
            ctx.bind_target(999, AnimationTarget::CustomChannel { channel_id: 1 })
                .is_err()
        );
        assert!(ctx.unbind_target(999).is_err());
        assert!(ctx.destroy_transition(999).is_err());

        // 2. Re-binding target transfers property lock seamlessly
        let config = TransitionConfig {
            duration: 1.0,
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::Once,
        };
        ctx.create_transition(80, AnimValue::Scalar(0.0), config.clone())
            .unwrap();
        ctx.create_transition(81, AnimValue::Scalar(0.0), config)
            .unwrap();

        let target_a = AnimationTarget::CustomChannel { channel_id: 100 };
        let target_b = AnimationTarget::CustomChannel { channel_id: 200 };

        ctx.bind_target(80, target_a.clone()).unwrap();
        // Transition 81 cannot bind to target_a
        assert!(ctx.bind_target(81, target_a.clone()).is_err());

        // Transition 80 switches target to target_b
        ctx.bind_target(80, target_b).unwrap();

        // Now target_a is freed and transition 81 can acquire it!
        assert!(ctx.bind_target(81, target_a).is_ok());
    }

    #[test]
    fn test_path_follow_2d_and_3d_evaluation() {
        let mut ctx = AnimationContext::new();

        // 1. 2D Path Follow
        let config_2d = PathFollowConfig {
            duration: Some(2.0),
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::Once,
            orient_to_path: true,
            value_type: None,
        };
        let cmds_2d = vec![
            PathCommand::MoveTo { to: vec![0.0, 0.0] },
            PathCommand::LineTo {
                to: vec![10.0, 0.0],
                duration: None,
                easing: None,
            },
        ];
        ctx.create_path_follow(1, cmds_2d, config_2d).unwrap();

        // Initial state at t = 0
        let v0 = ctx.get_path_follow_value(1).unwrap();
        match v0 {
            AnimValue::Transform2D([x, y, rot, _, _, _]) => {
                assert_eq!(x, 0.0);
                assert_eq!(y, 0.0);
                assert!((rot - 0.0).abs() < 1e-4);
            }
            _ => panic!("Expected Transform2D"),
        }

        // Halfway at t = 1.0s (50%)
        ctx.step(1.0);
        let v1 = ctx.get_path_follow_value(1).unwrap();
        match v1 {
            AnimValue::Transform2D([x, y, rot, _, _, _]) => {
                assert!((x - 5.0).abs() < 1e-4);
                assert_eq!(y, 0.0);
                assert!((rot - 0.0).abs() < 1e-4);
            }
            _ => panic!("Expected Transform2D"),
        }

        // 2. 3D Smooth Path Follow with OrientToPath
        let config_3d = PathFollowConfig {
            duration: Some(4.0),
            delay: 0.0,
            easing: Easing::Linear,
            loop_mode: LoopMode::Loop,
            orient_to_path: true,
            value_type: None,
        };
        let cmds_3d = vec![
            PathCommand::MoveTo {
                to: vec![0.0, 0.0, 0.0],
            },
            PathCommand::SmoothTo {
                to: vec![5.0, 2.0, 0.0],
                duration: None,
                easing: None,
            },
            PathCommand::SmoothTo {
                to: vec![10.0, 0.0, 0.0],
                duration: None,
                easing: None,
            },
        ];
        ctx.create_path_follow(2, cmds_3d, config_3d).unwrap();

        let target_3d = AnimationTarget::ModelTransform3D {
            realm_id: 10,
            model_id: 1,
        };
        ctx.bind_path_follow_target(2, target_3d.clone()).unwrap();

        // Ensure transition cannot bind to the same target locked by path follow!
        let trans_config = TransitionConfig {
            duration: 1.0,
            ..Default::default()
        };
        ctx.create_transition(3, AnimValue::Scalar(0.0), trans_config)
            .unwrap();
        let conflict = ctx.bind_target(3, target_3d.clone());
        assert!(conflict.is_err());
        match conflict.unwrap_err() {
            AnimationError::TargetConflict { owner_id, .. } => {
                assert_eq!(owner_id, 2);
            }
            other => panic!("Expected TargetConflict, got {other:?}"),
        }

        // Advance 3D path
        ctx.step(2.0); // 50%
        let v_mid = ctx.get_path_follow_value(2).unwrap();
        match v_mid {
            AnimValue::Transform3D([x, y, _, qx, qy, qz, qw, ..]) => {
                assert!((x - 5.0).abs() < 0.5);
                assert!((y - 2.0).abs() < 0.5);
                let q_len = (qx * qx + qy * qy + qz * qz + qw * qw).sqrt();
                assert!((q_len - 1.0).abs() < 1e-3);
            }
            _ => panic!("Expected Transform3D"),
        }

        // Destroy path follow releases lock
        ctx.destroy_path_follow(2).unwrap();
        // Now transition 3 can bind successfully
        assert!(ctx.bind_target(3, target_3d).is_ok());
    }
}
