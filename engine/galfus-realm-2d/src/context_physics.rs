use std::collections::HashMap;

use galfus_physics::PhysicsWorld2D;
use galfus_physics::types::RigidBodyDesc2D;
use galfus_realm_core::error::RealmResult;
use galfus_realm_core::hierarchy::Pose2D;

use crate::context::Realm2DContext;

impl Realm2DContext {
    /// Initializes or enables the 2D physics world.
    pub fn enable_physics_2d(&mut self, gravity: [f32; 2]) -> RealmResult<()> {
        if let Some(world) = self.physics.as_mut() {
            world.set_gravity(gravity);
        } else {
            self.physics = Some(PhysicsWorld2D::new(gravity));
        }
        Ok(())
    }

    /// Disables the 2D physics world.
    pub fn disable_physics_2d(&mut self) {
        self.physics = None;
    }

    /// Attaches or updates a rigid body component on a 2D entity.
    pub fn attach_rigid_body_2d(
        &mut self,
        entity_id: u32,
        desc: RigidBodyDesc2D,
    ) -> RealmResult<()> {
        self.validate_id(entity_id)?;

        let pose = if let (Some(pos), Some(rot)) = (desc.initial_position, desc.initial_rotation) {
            let scale = desc.initial_scale.unwrap_or([1.0, 1.0]);
            let p = Pose2D {
                position: glam::Vec2::new(pos[0], pos[1]),
                rotation: rot,
                scale: glam::Vec2::new(scale[0], scale[1]),
            };
            self.model_transforms.insert(
                entity_id,
                crate::types::Transform2D {
                    position: p.position,
                    rotation: p.rotation,
                    scale: p.scale,
                    z_layer: 0,
                    draw_order: 0,
                },
            );
            p
        } else {
            self.model_transform_for_collider(entity_id)
                .map(|tf| Pose2D {
                    position: tf.position,
                    rotation: tf.rotation,
                    scale: tf.scale,
                })
                .unwrap_or_default()
        };

        let world = self.physics.get_or_insert_with(PhysicsWorld2D::default);
        world.add_rigid_body(entity_id, &pose, &desc);

        let scale = [pose.scale.x, pose.scale.y];
        // Synchronize all attached colliders for this entity
        for collider in self.colliders.values().filter(|c| c.model_id == entity_id) {
            world.sync_collider(entity_id, collider, Some(&desc), scale);
        }

        Ok(())
    }

    /// Removes a rigid body component from a 2D entity.
    pub fn remove_rigid_body_2d(&mut self, entity_id: u32) -> RealmResult<()> {
        self.validate_id(entity_id)?;
        if let Some(world) = self.physics.as_mut() {
            world.remove_rigid_body(entity_id);
        }
        Ok(())
    }

    /// Applies an impulse vector to an entity's rigid body.
    pub fn apply_impulse_2d(&mut self, entity_id: u32, impulse: [f32; 2]) -> RealmResult<()> {
        self.validate_id(entity_id)?;
        if let Some(world) = self.physics.as_mut() {
            world.apply_impulse(entity_id, impulse);
        }
        Ok(())
    }

    /// Applies a force vector to an entity's rigid body.
    pub fn apply_force_2d(&mut self, entity_id: u32, force: [f32; 2]) -> RealmResult<()> {
        self.validate_id(entity_id)?;
        if let Some(world) = self.physics.as_mut() {
            world.apply_force(entity_id, force);
        }
        Ok(())
    }

    /// Applies torque to an entity's rigid body.
    pub fn apply_torque_2d(&mut self, entity_id: u32, torque: f32) -> RealmResult<()> {
        self.validate_id(entity_id)?;
        if let Some(world) = self.physics.as_mut() {
            world.apply_torque(entity_id, torque);
        }
        Ok(())
    }

    /// Sets the linear velocity of an entity's rigid body.
    pub fn set_linear_velocity_2d(&mut self, entity_id: u32, vel: [f32; 2]) -> RealmResult<()> {
        self.validate_id(entity_id)?;
        if let Some(world) = self.physics.as_mut() {
            world.set_linear_velocity(entity_id, vel);
        }
        Ok(())
    }

    /// Sets the angular velocity of an entity's rigid body.
    pub fn set_angular_velocity_2d(&mut self, entity_id: u32, omega: f32) -> RealmResult<()> {
        self.validate_id(entity_id)?;
        if let Some(world) = self.physics.as_mut() {
            world.set_angular_velocity(entity_id, omega);
        }
        Ok(())
    }

    /// Steps the physics world simulation by `dt` seconds and returns the step result.
    pub fn step_physics(&mut self, dt: f32) -> Option<galfus_physics::types::PhysicsStepResult2D> {
        let world = self.physics.as_mut()?;
        let result = world.step(dt);

        let mut poses = HashMap::new();
        world.write_poses_to_transforms(&mut poses);

        for (id, pose) in poses {
            if let Some(tf) = self.model_transforms.get_mut(&id) {
                tf.position = pose.position;
                tf.rotation = pose.rotation;
                let updated = *tf;
                if let Some((_, item_tf)) = self.sprites.get_mut(&id) {
                    *item_tf = updated;
                }
                if let Some((_, item_tf)) = self.shapes.get_mut(&id) {
                    *item_tf = updated;
                }
                if let Some((_, item_tf)) = self.uis.get_mut(&id) {
                    *item_tf = updated;
                }
            }
        }

        Some(result)
    }
}
