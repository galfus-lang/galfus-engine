use std::collections::HashMap;

use galfus_realm_core::collision::{Collider3D, ColliderShape3D};
use galfus_realm_core::hierarchy::Pose3D;
use glam::{Quat, Vec3};
use rapier3d::prelude::*;

use crate::events::EventCollector3D;
use crate::types::BodyCommand3D;
use crate::types::{
    JointDesc3D, PhysicsContactEvent, PhysicsStepResult3D, RigidBodyDesc3D, RigidBodyType,
};

/// Autonomous 3D physics simulation world powered by native Rapier3D.
pub struct PhysicsWorld3D {
    pub gravity: Vec3,
    pub rigid_body_set: RigidBodySet,
    pub collider_set: ColliderSet,
    pub soft_body_set: SoftBodySet,
    pub integration_parameters: IntegrationParameters,
    pub physics_pipeline: PhysicsPipeline,
    pub island_manager: IslandManager,
    pub broad_phase: DefaultBroadPhase,
    pub narrow_phase: NarrowPhase,
    pub impulse_joint_set: ImpulseJointSet,
    pub multibody_joint_set: MultibodyJointSet,
    pub ccd_solver: CCDSolver,

    // Entity mapping
    entity_to_body: HashMap<u32, RigidBodyHandle>,
    body_to_entity: HashMap<RigidBodyHandle, u32>,
    body_descs: HashMap<u32, RigidBodyDesc3D>,
    entity_joints: HashMap<u32, ImpulseJointHandle>,
    entity_to_colliders: HashMap<u32, Vec<ColliderHandle>>,
    collider_to_entity: HashMap<ColliderHandle, (u32, u32)>, // (entity_id, collider_id)

    // Events
    contact_events: Vec<PhysicsContactEvent>,
}

impl Default for PhysicsWorld3D {
    fn default() -> Self {
        Self::new([0.0, -9.81, 0.0])
    }
}

impl PhysicsWorld3D {
    /// Creates a new 3D physics world with the given gravity vector.
    pub fn new(gravity: [f32; 3]) -> Self {
        Self {
            gravity: Vec3::new(gravity[0], gravity[1], gravity[2]),
            rigid_body_set: RigidBodySet::new(),
            collider_set: ColliderSet::new(),
            soft_body_set: SoftBodySet::new(),
            integration_parameters: IntegrationParameters::default(),
            physics_pipeline: PhysicsPipeline::new(),
            island_manager: IslandManager::new(),
            broad_phase: DefaultBroadPhase::new(),
            narrow_phase: NarrowPhase::new(),
            impulse_joint_set: ImpulseJointSet::new(),
            multibody_joint_set: MultibodyJointSet::new(),
            ccd_solver: CCDSolver::new(),
            entity_to_body: HashMap::new(),
            body_to_entity: HashMap::new(),
            body_descs: HashMap::new(),
            entity_joints: HashMap::new(),
            entity_to_colliders: HashMap::new(),
            collider_to_entity: HashMap::new(),
            contact_events: Vec::new(),
        }
    }

    /// Advances the physics simulation by `dt` seconds and returns the step result.
    pub fn step(&mut self, dt: f32) -> PhysicsStepResult3D {
        self.integration_parameters.dt = dt.clamp(1e-4, 0.1);

        let physics_hooks = ();
        let collector = EventCollector3D {
            events: std::sync::Mutex::new(Vec::new()),
        };

        self.physics_pipeline.step(
            self.gravity,
            &self.integration_parameters,
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.rigid_body_set,
            &mut self.collider_set,
            &mut self.impulse_joint_set,
            &mut self.multibody_joint_set,
            &mut self.soft_body_set,
            &mut self.ccd_solver,
            &physics_hooks,
            &collector,
        );

        for (_, body) in self.rigid_body_set.iter_mut() {
            body.reset_forces(false);
            body.reset_torques(false);
        }

        if let Ok(events) = collector.events.into_inner() {
            for event in events {
                match event {
                    CollisionEvent::Started(h1, h2, flags) => {
                        if let (Some(&(e1, _)), Some(&(e2, _))) = (
                            self.collider_to_entity.get(&h1),
                            self.collider_to_entity.get(&h2),
                        ) {
                            let is_sensor = flags.contains(CollisionEventFlags::SENSOR);
                            self.contact_events.push(PhysicsContactEvent {
                                event_type: if is_sensor {
                                    "sensorEnter".to_string()
                                } else {
                                    "collisionStart".to_string()
                                },
                                entity_a: e1,
                                entity_b: e2,
                                sensor: is_sensor,
                            });
                        }
                    }
                    CollisionEvent::Stopped(h1, h2, flags) => {
                        if let (Some(&(e1, _)), Some(&(e2, _))) = (
                            self.collider_to_entity.get(&h1),
                            self.collider_to_entity.get(&h2),
                        ) {
                            let is_sensor = flags.contains(CollisionEventFlags::SENSOR);
                            self.contact_events.push(PhysicsContactEvent {
                                event_type: if is_sensor {
                                    "sensorExit".to_string()
                                } else {
                                    "collisionEnd".to_string()
                                },
                                entity_a: e1,
                                entity_b: e2,
                                sensor: is_sensor,
                            });
                        }
                    }
                }
            }
        }

        let mut poses = Vec::with_capacity(self.entity_to_body.len());
        for (&entity_id, &handle) in &self.entity_to_body {
            if let Some(body) = self.rigid_body_set.get(handle)
                && !body.is_fixed()
            {
                let p = body.translation();
                let r = body.rotation();
                poses.push((entity_id, p.x, p.y, p.z, r.x, r.y, r.z, r.w));
            }
        }

        PhysicsStepResult3D {
            poses,
            events: self.drain_contact_events(),
        }
    }

    /// Applies a body command or returns its current velocities.
    pub fn command(&mut self, entity_id: u32, command: BodyCommand3D) -> Option<serde_json::Value> {
        let handle = *self.entity_to_body.get(&entity_id)?;
        let body = self.rigid_body_set.get_mut(handle)?;
        match command {
            BodyCommand3D::SetPose { position, rotation } => {
                body.set_translation(Vec3::from_array(position), true);
                body.set_rotation(Quat::from_array(rotation), true);
            }
            BodyCommand3D::ImpulseAtPoint { impulse, point } => body.apply_impulse_at_point(
                Vec3::from_array(impulse),
                Vec3::from_array(point),
                true,
            ),
            BodyCommand3D::ForceAtPoint { force, point } => {
                body.add_force_at_point(Vec3::from_array(force), Vec3::from_array(point), true)
            }
            BodyCommand3D::Torque { torque } => body.add_torque(Vec3::from_array(torque), true),
            BodyCommand3D::Velocity => {
                return Some(
                    serde_json::json!({"linear": body.linvel().to_array(), "angular": body.angvel().to_array()}),
                );
            }
        }
        Some(serde_json::Value::Null)
    }

    /// Sets the world gravity vector.
    pub fn set_gravity(&mut self, gravity: [f32; 3]) {
        self.gravity = Vec3::new(gravity[0], gravity[1], gravity[2]);
    }

    /// Gets the current gravity vector.
    pub fn get_gravity(&self) -> [f32; 3] {
        [self.gravity.x, self.gravity.y, self.gravity.z]
    }

    /// Adds or replaces a rigid body for the given entity.
    pub fn add_rigid_body(&mut self, entity_id: u32, pose: &Pose3D, desc: &RigidBodyDesc3D) {
        if self.entity_to_body.contains_key(&entity_id) {
            self.remove_rigid_body(entity_id);
        }

        let rb_type = match desc.body_type {
            RigidBodyType::Dynamic => rapier3d::prelude::RigidBodyType::Dynamic,
            RigidBodyType::Fixed => rapier3d::prelude::RigidBodyType::Fixed,
            RigidBodyType::KinematicPosition => {
                rapier3d::prelude::RigidBodyType::KinematicPositionBased
            }
            RigidBodyType::KinematicVelocity => {
                rapier3d::prelude::RigidBodyType::KinematicVelocityBased
            }
        };

        let (axis, angle) = pose.rotation.to_axis_angle();
        let ang_vector = if axis.is_finite() {
            axis * angle
        } else {
            Vec3::ZERO
        };

        let mut builder = RigidBodyBuilder::new(rb_type)
            .translation(Vec3::new(pose.position.x, pose.position.y, pose.position.z))
            .rotation(ang_vector)
            .gravity_scale(desc.gravity_scale)
            .linear_damping(desc.linear_damping)
            .angular_damping(desc.angular_damping)
            .linvel(Vec3::new(
                desc.linear_velocity[0],
                desc.linear_velocity[1],
                desc.linear_velocity[2],
            ))
            .angvel(Vec3::new(
                desc.angular_velocity[0],
                desc.angular_velocity[1],
                desc.angular_velocity[2],
            ))
            .ccd_enabled(desc.ccd);

        if desc.lock_translations {
            builder = builder.lock_translations();
        }
        if desc.lock_rotations {
            builder = builder.lock_rotations();
        }

        if !desc.enabled_rotations[0] || !desc.enabled_rotations[1] || !desc.enabled_rotations[2] {
            builder = builder.enabled_rotations(
                desc.enabled_rotations[0],
                desc.enabled_rotations[1],
                desc.enabled_rotations[2],
            );
        }

        if let Some(mass) = desc.mass {
            builder = builder.additional_mass(mass);
        }

        let handle = self.rigid_body_set.insert(builder.build());
        self.entity_to_body.insert(entity_id, handle);
        self.body_descs.insert(entity_id, desc.clone());
        self.body_to_entity.insert(handle, entity_id);
    }

    /// Removes the rigid body attached to an entity.
    pub fn remove_rigid_body(&mut self, entity_id: u32) -> bool {
        if let Some(handle) = self.entity_to_body.remove(&entity_id) {
            self.body_to_entity.remove(&handle);
            self.body_descs.remove(&entity_id);
            self.entity_joints.retain(|_, joint| {
                self.impulse_joint_set
                    .get(*joint)
                    .is_some_and(|j| j.body1() != handle && j.body2() != handle)
            });
            self.rigid_body_set.remove(
                handle,
                &mut self.island_manager,
                &mut self.collider_set,
                &mut self.impulse_joint_set,
                &mut self.multibody_joint_set,
                &mut self.soft_body_set,
                true,
            );
            true
        } else {
            false
        }
    }

    /// Removes an existing collider by its logical ID.
    pub fn remove_collider(&mut self, collider_id: u32) -> bool {
        let handle = self
            .collider_to_entity
            .iter()
            .find(|(_, val)| val.1 == collider_id)
            .map(|(&h, _)| h);

        if let Some(h) = handle {
            if let Some((eid, _)) = self.collider_to_entity.remove(&h)
                && let Some(cols) = self.entity_to_colliders.get_mut(&eid)
            {
                cols.retain(|&c| c != h);
            }
            self.collider_set.remove(
                h,
                &mut self.island_manager,
                &mut self.rigid_body_set,
                &mut self.soft_body_set,
                true,
            );
            true
        } else {
            false
        }
    }

    /// Checks whether an entity's rigid body is dynamic.
    pub fn is_body_dynamic(&self, entity_id: u32) -> bool {
        self.entity_to_body
            .get(&entity_id)
            .and_then(|&h| self.rigid_body_set.get(h))
            .map(|b| b.is_dynamic())
            .unwrap_or(false)
    }

    /// Attaches or synchronizes a canonical 3D collider into Rapier with model scaling.
    pub fn sync_collider(
        &mut self,
        entity_id: u32,
        collider: &Collider3D,
        desc: Option<&RigidBodyDesc3D>,
        scale: [f32; 3],
    ) {
        self.remove_collider(collider.id);
        let sx = scale[0].abs().max(1e-4);
        let sy = scale[1].abs().max(1e-4);
        let sz = scale[2].abs().max(1e-4);

        let shape = match &collider.shape {
            ColliderShape3D::Box { half_extents } => SharedShape::cuboid(
                half_extents[0] * sx,
                half_extents[1] * sy,
                half_extents[2] * sz,
            ),
            ColliderShape3D::Sphere { radius } => SharedShape::ball(*radius * sx.max(sy).max(sz)),
            ColliderShape3D::Cylinder {
                radius,
                half_height,
            } => SharedShape::cylinder(*half_height * sy, *radius * sx.max(sz)),
            ColliderShape3D::Capsule {
                radius,
                half_height,
            } => SharedShape::capsule_y(*half_height * sy, *radius * sx.max(sz)),
            ColliderShape3D::Rectangle { half_extents } => {
                SharedShape::cuboid(half_extents[0] * sx, half_extents[1] * sy, 0.01)
            }
            ColliderShape3D::Plane { normal, .. } => {
                let n = Vec3::new(normal[0], normal[1], normal[2]).normalize_or_zero();
                SharedShape::halfspace(n)
            }
        };

        let desc = desc.or_else(|| self.body_descs.get(&entity_id));
        let explicit_mass = desc.and_then(|d| d.mass).is_some();
        let restitution = desc.map(|d| d.restitution).unwrap_or(0.2);
        let friction = desc.map(|d| d.friction).unwrap_or(0.5);

        let builder = ColliderBuilder::new(shape)
            .translation(Vec3::new(
                collider.offset[0] * sx,
                collider.offset[1] * sy,
                collider.offset[2] * sz,
            ))
            .restitution(restitution)
            .friction(friction)
            .sensor(collider.sensor)
            .enabled(collider.active)
            .active_events(ActiveEvents::COLLISION_EVENTS)
            .active_collision_types(
                ActiveCollisionTypes::default() | ActiveCollisionTypes::KINEMATIC_FIXED,
            )
            .collision_groups(InteractionGroups::new(
                Group::from_bits_truncate(collider.layer),
                Group::from_bits_truncate(collider.mask),
                InteractionTestMode::default(),
            ));

        let body_handle = self.entity_to_body.get(&entity_id).copied();

        let builder = if explicit_mass {
            builder.density(0.0)
        } else {
            builder
        };

        let col_handle = if let Some(rb_handle) = body_handle {
            self.collider_set.insert_with_parent(
                builder.build(),
                rb_handle,
                &mut self.rigid_body_set,
            )
        } else {
            self.collider_set.insert(builder.build())
        };

        if let Some(handle) = body_handle
            && let Some(body) = self.rigid_body_set.get_mut(handle)
        {
            body.recompute_mass_properties_from_colliders(&self.collider_set);
        }

        self.entity_to_colliders
            .entry(entity_id)
            .or_default()
            .push(col_handle);
        self.collider_to_entity
            .insert(col_handle, (entity_id, collider.id));
    }

    /// Applies an impulse to an entity's rigid body.
    pub fn apply_impulse(&mut self, entity_id: u32, impulse: [f32; 3]) {
        if let Some(&handle) = self.entity_to_body.get(&entity_id)
            && let Some(body) = self.rigid_body_set.get_mut(handle)
        {
            body.apply_impulse(Vec3::new(impulse[0], impulse[1], impulse[2]), true);
        }
    }

    /// Applies a force to an entity's rigid body.
    pub fn apply_force(&mut self, entity_id: u32, force: [f32; 3]) {
        if let Some(&handle) = self.entity_to_body.get(&entity_id)
            && let Some(body) = self.rigid_body_set.get_mut(handle)
        {
            body.add_force(Vec3::new(force[0], force[1], force[2]), true);
        }
    }

    /// Applies torque to an entity's rigid body.
    pub fn apply_torque(&mut self, entity_id: u32, torque: [f32; 3]) {
        if let Some(&handle) = self.entity_to_body.get(&entity_id)
            && let Some(body) = self.rigid_body_set.get_mut(handle)
        {
            body.apply_torque_impulse(Vec3::new(torque[0], torque[1], torque[2]), true);
        }
    }

    /// Sets the linear velocity of an entity's rigid body.
    pub fn set_linear_velocity(&mut self, entity_id: u32, vel: [f32; 3]) {
        if let Some(&handle) = self.entity_to_body.get(&entity_id)
            && let Some(body) = self.rigid_body_set.get_mut(handle)
        {
            body.set_linvel(Vec3::new(vel[0], vel[1], vel[2]), true);
        }
    }

    /// Sets the angular velocity of an entity's rigid body.
    pub fn set_angular_velocity(&mut self, entity_id: u32, vel: [f32; 3]) {
        if let Some(&handle) = self.entity_to_body.get(&entity_id)
            && let Some(body) = self.rigid_body_set.get_mut(handle)
        {
            body.set_angvel(Vec3::new(vel[0], vel[1], vel[2]), true);
        }
    }

    /// Explicitly updates the pose (translation and rotation) of a rigid body.
    pub fn set_rigid_body_pose(&mut self, entity_id: u32, pose: &Pose3D) {
        if let Some(&handle) = self.entity_to_body.get(&entity_id)
            && let Some(body) = self.rigid_body_set.get_mut(handle)
        {
            body.set_translation(
                Vec3::new(pose.position.x, pose.position.y, pose.position.z),
                true,
            );
            body.set_rotation(pose.rotation, true);
        }
    }

    /// Creates an impulse joint between two 3D rigid bodies.
    pub fn add_joint(
        &mut self,
        entity1: u32,
        entity2: u32,
        desc: &JointDesc3D,
    ) -> Option<ImpulseJointHandle> {
        let h1 = *self.entity_to_body.get(&entity1)?;
        let h2 = *self.entity_to_body.get(&entity2)?;

        let joint: GenericJoint = match desc {
            JointDesc3D::Fixed { anchor1, anchor2 } => FixedJointBuilder::new()
                .local_anchor1(Vec3::new(anchor1[0], anchor1[1], anchor1[2]))
                .local_anchor2(Vec3::new(anchor2[0], anchor2[1], anchor2[2]))
                .into(),
            JointDesc3D::Revolute {
                anchor1,
                anchor2,
                axis,
                limits,
                motor,
                collide_connected,
            } => {
                let mut builder = RevoluteJointBuilder::new(Vec3::new(axis[0], axis[1], axis[2]))
                    .local_anchor1(Vec3::new(anchor1[0], anchor1[1], anchor1[2]))
                    .local_anchor2(Vec3::new(anchor2[0], anchor2[1], anchor2[2]));
                builder = builder.contacts_enabled(*collide_connected);
                if let Some(lim) = limits {
                    builder = builder.limits([lim[0], lim[1]]);
                }
                if let Some([target, stiffness, damping]) = motor {
                    builder = builder.motor_position(*target, *stiffness, *damping);
                }
                builder.into()
            }
            JointDesc3D::Prismatic {
                anchor1,
                anchor2,
                axis,
                limits,
            } => {
                let mut builder = PrismaticJointBuilder::new(Vec3::new(axis[0], axis[1], axis[2]))
                    .local_anchor1(Vec3::new(anchor1[0], anchor1[1], anchor1[2]))
                    .local_anchor2(Vec3::new(anchor2[0], anchor2[1], anchor2[2]));
                if let Some(lim) = limits {
                    builder = builder.limits([lim[0], lim[1]]);
                }
                builder.into()
            }
            JointDesc3D::Spherical { anchor1, anchor2 } => SphericalJointBuilder::new()
                .local_anchor1(Vec3::new(anchor1[0], anchor1[1], anchor1[2]))
                .local_anchor2(Vec3::new(anchor2[0], anchor2[1], anchor2[2]))
                .into(),
            JointDesc3D::Rope {
                anchor1,
                anchor2,
                max_length,
            } => RopeJointBuilder::new(*max_length)
                .local_anchor1(Vec3::new(anchor1[0], anchor1[1], anchor1[2]))
                .local_anchor2(Vec3::new(anchor2[0], anchor2[1], anchor2[2]))
                .into(),
            JointDesc3D::Spring {
                anchor1,
                anchor2,
                rest_length,
                stiffness,
                damping,
            } => SpringJointBuilder::new(*rest_length, *stiffness, *damping)
                .local_anchor1(Vec3::new(anchor1[0], anchor1[1], anchor1[2]))
                .local_anchor2(Vec3::new(anchor2[0], anchor2[1], anchor2[2]))
                .into(),
        };

        self.remove_joint_for_entity(entity1);
        let handle = self.impulse_joint_set.insert(h1, h2, joint, true);
        self.entity_joints.insert(entity1, handle);
        Some(handle)
    }

    /// Removes the joint associated with a hierarchy origin.
    pub fn remove_joint_for_entity(&mut self, entity_id: u32) {
        if let Some(handle) = self.entity_joints.remove(&entity_id) {
            self.impulse_joint_set.remove(handle, true);
        }
    }

    /// Removes an impulse joint by handle.
    pub fn remove_joint(&mut self, handle: ImpulseJointHandle) -> bool {
        self.impulse_joint_set.remove(handle, true).is_some()
    }

    /// Gets the current simulated world pose of an entity's rigid body.
    pub fn get_body_pose(&self, entity_id: u32) -> Option<Pose3D> {
        let handle = self.entity_to_body.get(&entity_id)?;
        let body = self.rigid_body_set.get(*handle)?;
        let pos = body.translation();
        let rot = body.rotation();
        Some(Pose3D {
            position: Vec3::new(pos.x, pos.y, pos.z),
            rotation: Quat::from_xyzw(rot.x, rot.y, rot.z, rot.w),
            scale: Vec3::ONE,
        })
    }

    /// Writes all simulated rigid body poses directly into a map of world transforms.
    pub fn write_poses_to_transforms(&self, transforms: &mut HashMap<u32, Pose3D>) {
        for (&entity_id, &handle) in &self.entity_to_body {
            if let Some(body) = self.rigid_body_set.get(handle) {
                let pos = body.translation();
                let rot = body.rotation();
                let quat = Quat::from_xyzw(rot.x, rot.y, rot.z, rot.w);
                if let Some(pose) = transforms.get_mut(&entity_id) {
                    pose.position.x = pos.x;
                    pose.position.y = pos.y;
                    pose.position.z = pos.z;
                    pose.rotation = quat;
                } else {
                    transforms.insert(
                        entity_id,
                        Pose3D {
                            position: Vec3::new(pos.x, pos.y, pos.z),
                            rotation: quat,
                            scale: Vec3::ONE,
                        },
                    );
                }
            }
        }
    }

    /// Clears and returns all buffered contact events.
    pub fn drain_contact_events(&mut self) -> Vec<PhysicsContactEvent> {
        std::mem::take(&mut self.contact_events)
    }

    /// Checks if an entity has an active rigid body.
    pub fn has_rigid_body(&self, entity_id: u32) -> bool {
        self.entity_to_body.contains_key(&entity_id)
    }

    /// Clears the physics world.
    pub fn clear(&mut self) {
        self.entity_to_body.clear();
        self.body_to_entity.clear();
        self.body_descs.clear();
        self.entity_joints.clear();
        self.entity_to_colliders.clear();
        self.collider_to_entity.clear();
        self.rigid_body_set = RigidBodySet::new();
        self.collider_set = ColliderSet::new();
        self.soft_body_set = SoftBodySet::new();
        self.impulse_joint_set = ImpulseJointSet::new();
        self.multibody_joint_set = MultibodyJointSet::new();
        self.contact_events.clear();
    }
}
