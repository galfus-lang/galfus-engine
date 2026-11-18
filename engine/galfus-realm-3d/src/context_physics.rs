use std::collections::HashMap;

use galfus_physics::PhysicsWorld3D;
use galfus_physics::types::RigidBodyDesc3D;
use galfus_realm_core::error::RealmResult;
use galfus_realm_core::hierarchy::Pose3D;

use crate::context::Realm3DContext;
use crate::types::validate_id;

impl Realm3DContext {
    /// Initializes or enables the 3D physics world.
    pub fn enable_physics_3d(&mut self, gravity: [f32; 3]) -> RealmResult<()> {
        if let Some(world) = self.physics.as_mut() {
            world.set_gravity(gravity);
        } else {
            self.physics = Some(PhysicsWorld3D::new(gravity));
        }
        Ok(())
    }

    /// Disables the 3D physics world.
    pub fn disable_physics_3d(&mut self) {
        self.physics = None;
    }

    /// Attaches or updates a rigid body component on a 3D entity.
    pub fn attach_rigid_body_3d(
        &mut self,
        entity_id: u32,
        desc: RigidBodyDesc3D,
    ) -> RealmResult<()> {
        validate_id(entity_id)?;

        let pose = if let (Some(pos), Some(rot)) = (desc.initial_position, desc.initial_rotation) {
            let scale = desc.initial_scale.unwrap_or([1.0, 1.0, 1.0]);
            let p = Pose3D {
                position: glam::Vec3::new(pos[0], pos[1], pos[2]),
                rotation: glam::Quat::from_array(rot),
                scale: glam::Vec3::new(scale[0], scale[1], scale[2]),
            };
            self.model_transforms.insert(
                entity_id,
                galfus_realm_3d_resources::transform::Transform3D {
                    position: p.position,
                    rotation: p.rotation,
                    scale: p.scale,
                },
            );
            p
        } else {
            self.model_transforms
                .get(&entity_id)
                .map(|tf| Pose3D {
                    position: tf.position,
                    rotation: tf.rotation,
                    scale: tf.scale,
                })
                .or_else(|| {
                    self.models.get(&entity_id).map(|entry| Pose3D {
                        position: entry.1.position,
                        rotation: entry.1.rotation,
                        scale: entry.1.scale,
                    })
                })
                .unwrap_or_default()
        };

        let world = self.physics.get_or_insert_with(PhysicsWorld3D::default);
        world.add_rigid_body(entity_id, &pose, &desc);

        let scale = [pose.scale.x, pose.scale.y, pose.scale.z];
        // Synchronize all attached colliders for this entity
        for collider in self.colliders.values().filter(|c| c.model_id == entity_id) {
            world.sync_collider(entity_id, collider, Some(&desc), scale);
        }

        Ok(())
    }

    /// Removes a rigid body component from a 3D entity.
    pub fn remove_rigid_body_3d(&mut self, entity_id: u32) -> RealmResult<()> {
        validate_id(entity_id)?;
        if let Some(world) = self.physics.as_mut() {
            world.remove_rigid_body(entity_id);
        }
        Ok(())
    }

    /// Applies an impulse vector to an entity's rigid body.
    pub fn apply_impulse_3d(&mut self, entity_id: u32, impulse: [f32; 3]) -> RealmResult<()> {
        validate_id(entity_id)?;
        if let Some(world) = self.physics.as_mut() {
            world.apply_impulse(entity_id, impulse);
        }
        Ok(())
    }

    /// Applies a force vector to an entity's rigid body.
    pub fn apply_force_3d(&mut self, entity_id: u32, force: [f32; 3]) -> RealmResult<()> {
        validate_id(entity_id)?;
        if let Some(world) = self.physics.as_mut() {
            world.apply_force(entity_id, force);
        }
        Ok(())
    }

    /// Applies torque to an entity's rigid body.
    pub fn apply_torque_3d(&mut self, entity_id: u32, torque: [f32; 3]) -> RealmResult<()> {
        validate_id(entity_id)?;
        if let Some(world) = self.physics.as_mut() {
            world.apply_torque(entity_id, torque);
        }
        Ok(())
    }

    /// Sets the linear velocity of an entity's rigid body.
    pub fn set_linear_velocity_3d(&mut self, entity_id: u32, vel: [f32; 3]) -> RealmResult<()> {
        validate_id(entity_id)?;
        if let Some(world) = self.physics.as_mut() {
            world.set_linear_velocity(entity_id, vel);
        }
        Ok(())
    }

    /// Sets the angular velocity of an entity's rigid body.
    pub fn set_angular_velocity_3d(&mut self, entity_id: u32, vel: [f32; 3]) -> RealmResult<()> {
        validate_id(entity_id)?;
        if let Some(world) = self.physics.as_mut() {
            world.set_angular_velocity(entity_id, vel);
        }
        Ok(())
    }

    /// Steps the physics world simulation by `dt` seconds and returns the step result.
    pub fn step_physics(&mut self, dt: f32) -> Option<galfus_physics::types::PhysicsStepResult3D> {
        let world = self.physics.as_mut()?;
        let result = world.step(dt);

        let mut poses = HashMap::new();
        world.write_poses_to_transforms(&mut poses);

        for (id, pose) in poses {
            let tf = galfus_realm_3d_resources::transform::Transform3D {
                position: pose.position,
                rotation: pose.rotation,
                scale: self
                    .model_transforms
                    .get(&id)
                    .map(|tf| tf.scale)
                    .or_else(|| self.models.get(&id).map(|entry| entry.1.scale))
                    .unwrap_or(pose.scale),
            };
            self.model_transforms.insert(id, tf);
            if let Some(entry) = self.models.get_mut(&id) {
                entry.1 = tf;
            }
        }

        Some(result)
    }
}
