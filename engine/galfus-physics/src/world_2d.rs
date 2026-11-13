use std::collections::HashMap;

use galfus_realm_core::collision::{Collider2D, ColliderShape2D};
use galfus_realm_core::hierarchy::Pose2D;
use glam::{Affine2, Vec2};
use rapier2d::prelude::*;

use crate::events::EventCollector2D;
use crate::types::BodyCommand2D;
use crate::types::{
    JointDesc2D, PhysicsContactEvent, PhysicsStepResult2D, RigidBodyDesc2D, RigidBodyType,
};

/// Autonomous 2D physics simulation world powered by native Rapier2D.
pub struct PhysicsWorld2D {
    pub gravity: Vec2,
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
    body_descs: HashMap<u32, RigidBodyDesc2D>,
    entity_joints: HashMap<u32, ImpulseJointHandle>,
    entity_to_colliders: HashMap<u32, Vec<ColliderHandle>>,
    collider_to_entity: HashMap<ColliderHandle, (u32, u32)>, // (entity_id, collider_id)

    // Events
    contact_events: Vec<PhysicsContactEvent>,
}

impl Default for PhysicsWorld2D {
    fn default() -> Self {
        Self::new([0.0, -9.81])
    }
}

impl PhysicsWorld2D {
    /// Creates a new 2D physics world with the given gravity vector.
    pub fn new(gravity: [f32; 2]) -> Self {
        Self {
            gravity: Vec2::new(gravity[0], gravity[1]),
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
    pub fn step(&mut self, dt: f32) -> PhysicsStepResult2D {
        self.integration_parameters.dt = dt.clamp(1e-4, 0.1);

        let physics_hooks = ();
        let collector = EventCollector2D {
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
                let r = body.rotation().angle();
                poses.push((entity_id, p.x, p.y, r));
            }
        }

        PhysicsStepResult2D {
            poses,
            events: self.drain_contact_events(),
        }
    }

    /// Applies a body command or returns its current velocities.
    pub fn command(&mut self, entity_id: u32, command: BodyCommand2D) -> Option<serde_json::Value> {
        let handle = *self.entity_to_body.get(&entity_id)?;
        let body = self.rigid_body_set.get_mut(handle)?;
        match command {
            BodyCommand2D::SetPose { position, rotation } => {
                body.set_translation(Vec2::from_array(position), true);
                body.set_rotation(Rotation::from_angle(rotation), true);
            }
            BodyCommand2D::ImpulseAtPoint { impulse, point } => body.apply_impulse_at_point(
                Vec2::from_array(impulse),
                Vec2::from_array(point),
                true,
            ),
            BodyCommand2D::ForceAtPoint { force, point } => {
                body.add_force_at_point(Vec2::from_array(force), Vec2::from_array(point), true)
            }
            BodyCommand2D::Torque { torque } => body.add_torque(torque, true),
            BodyCommand2D::Velocity => {
                return Some(
                    serde_json::json!({"linear": body.linvel().to_array(), "angular": body.angvel()}),
                );
            }
        }
        Some(serde_json::Value::Null)
    }

    /// Sets the world gravity vector.
    pub fn set_gravity(&mut self, gravity: [f32; 2]) {
        self.gravity = Vec2::new(gravity[0], gravity[1]);
    }

    /// Gets the current gravity vector.
    pub fn get_gravity(&self) -> [f32; 2] {
        [self.gravity.x, self.gravity.y]
    }

    /// Adds or replaces a rigid body for the given entity.
    pub fn add_rigid_body(&mut self, entity_id: u32, pose: &Pose2D, desc: &RigidBodyDesc2D) {
        if self.entity_to_body.contains_key(&entity_id) {
            self.remove_rigid_body(entity_id);
        }

        let rb_type = match desc.body_type {
            RigidBodyType::Dynamic => rapier2d::prelude::RigidBodyType::Dynamic,
            RigidBodyType::Fixed => rapier2d::prelude::RigidBodyType::Fixed,
            RigidBodyType::KinematicPosition => {
                rapier2d::prelude::RigidBodyType::KinematicPositionBased
            }
            RigidBodyType::KinematicVelocity => {
                rapier2d::prelude::RigidBodyType::KinematicVelocityBased
            }
        };

        let mut builder = RigidBodyBuilder::new(rb_type)
            .translation(Vec2::new(pose.position.x, pose.position.y))
            .rotation(pose.rotation)
            .gravity_scale(desc.gravity_scale)
            .linear_damping(desc.linear_damping)
            .angular_damping(desc.angular_damping)
            .linvel(Vec2::new(desc.linear_velocity[0], desc.linear_velocity[1]))
            .angvel(desc.angular_velocity)
            .ccd_enabled(desc.ccd);

        if desc.lock_translations {
            builder = builder.lock_translations();
        }
        if desc.lock_rotations {
            builder = builder.lock_rotations();
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

    /// Attaches or synchronizes a canonical 2D collider into Rapier with model scaling.
    pub fn sync_collider(
        &mut self,
        entity_id: u32,
        collider: &Collider2D,
        desc: Option<&RigidBodyDesc2D>,
        scale: [f32; 2],
    ) {
        self.remove_collider(collider.id);
        let local = collider
            .local_matrix
            .map_or(Affine2::IDENTITY, |m| Affine2::from_cols_array(&m));
        if local.matrix2.determinant() == 0.0 {
            return;
        }
        let (local_scale, angle, _) = local.to_scale_angle_translation();
        let sx = (scale[0] * local_scale.x).abs().max(1e-4);
        let sy = (scale[1] * local_scale.y).abs().max(1e-4);
        let position =
            local.transform_point2(Vec2::from_array(collider.offset)) * Vec2::from_array(scale);

        let shape = match &collider.shape {
            ColliderShape2D::Rectangle { half_extents } => {
                SharedShape::cuboid(half_extents[0] * sx, half_extents[1] * sy)
            }
            ColliderShape2D::Circle { radius } => SharedShape::ball(*radius * sx.max(sy)),
            ColliderShape2D::Polygon { vertices } => {
                let pts: Vec<Vec2> = vertices
                    .iter()
                    .map(|p| Vec2::new(p[0] * sx, p[1] * sy))
                    .collect();
                SharedShape::convex_polyline(pts).unwrap_or_else(|| SharedShape::ball(0.5))
            }
        };

        let desc = desc.or_else(|| self.body_descs.get(&entity_id));
        let explicit_mass = desc.and_then(|d| d.mass).is_some();
        let restitution = desc.map(|d| d.restitution).unwrap_or(0.2);
        let friction = desc.map(|d| d.friction).unwrap_or(0.5);

        let builder = ColliderBuilder::new(shape)
            .translation(position)
            .rotation(angle)
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
    pub fn apply_impulse(&mut self, entity_id: u32, impulse: [f32; 2]) {
        if let Some(&handle) = self.entity_to_body.get(&entity_id)
            && let Some(body) = self.rigid_body_set.get_mut(handle)
        {
            body.apply_impulse(Vec2::new(impulse[0], impulse[1]), true);
        }
    }

    /// Applies a force to an entity's rigid body.
    pub fn apply_force(&mut self, entity_id: u32, force: [f32; 2]) {
        if let Some(&handle) = self.entity_to_body.get(&entity_id)
            && let Some(body) = self.rigid_body_set.get_mut(handle)
        {
            body.add_force(Vec2::new(force[0], force[1]), true);
        }
    }

    /// Applies torque to an entity's rigid body.
    pub fn apply_torque(&mut self, entity_id: u32, torque: f32) {
        if let Some(&handle) = self.entity_to_body.get(&entity_id)
            && let Some(body) = self.rigid_body_set.get_mut(handle)
        {
            body.apply_torque_impulse(torque, true);
        }
    }

    /// Sets the linear velocity of an entity's rigid body.
    pub fn set_linear_velocity(&mut self, entity_id: u32, vel: [f32; 2]) {
        if let Some(&handle) = self.entity_to_body.get(&entity_id)
            && let Some(body) = self.rigid_body_set.get_mut(handle)
        {
            body.set_linvel(Vec2::new(vel[0], vel[1]), true);
        }
    }

    /// Sets the angular velocity of an entity's rigid body.
    pub fn set_angular_velocity(&mut self, entity_id: u32, omega: f32) {
        if let Some(&handle) = self.entity_to_body.get(&entity_id)
            && let Some(body) = self.rigid_body_set.get_mut(handle)
        {
            body.set_angvel(omega, true);
        }
    }

    /// Explicitly updates the pose (translation and rotation) of a rigid body.
    pub fn set_rigid_body_pose(&mut self, entity_id: u32, pose: &Pose2D) {
        if let Some(&handle) = self.entity_to_body.get(&entity_id)
            && let Some(body) = self.rigid_body_set.get_mut(handle)
        {
            body.set_translation(Vec2::new(pose.position.x, pose.position.y), true);
            body.set_rotation(Rotation::from_angle(pose.rotation), true);
        }
    }

    /// Creates an impulse joint between two 2D rigid bodies.
    pub fn add_joint(
        &mut self,
        entity1: u32,
        entity2: u32,
        desc: &JointDesc2D,
    ) -> Option<ImpulseJointHandle> {
        let h1 = *self.entity_to_body.get(&entity1)?;
        let h2 = *self.entity_to_body.get(&entity2)?;

        let joint: GenericJoint = match desc {
            JointDesc2D::Fixed { anchor1, anchor2 } => FixedJointBuilder::new()
                .local_anchor1(Vec2::new(anchor1[0], anchor1[1]))
                .local_anchor2(Vec2::new(anchor2[0], anchor2[1]))
                .into(),
            JointDesc2D::Revolute {
                anchor1,
                anchor2,
                limits,
                motor,
                collide_connected,
            } => {
                let mut builder = RevoluteJointBuilder::new()
                    .local_anchor1(Vec2::new(anchor1[0], anchor1[1]))
                    .local_anchor2(Vec2::new(anchor2[0], anchor2[1]));
                builder = builder.contacts_enabled(*collide_connected);
                if let Some(lim) = limits {
                    builder = builder.limits([lim[0], lim[1]]);
                }
                if let Some([target, stiffness, damping]) = motor {
                    builder = builder.motor_position(*target, *stiffness, *damping);
                }
                builder.into()
            }
            JointDesc2D::Prismatic {
                anchor1,
                anchor2,
                axis,
                limits,
            } => {
                let mut builder = PrismaticJointBuilder::new(Vec2::new(axis[0], axis[1]))
                    .local_anchor1(Vec2::new(anchor1[0], anchor1[1]))
                    .local_anchor2(Vec2::new(anchor2[0], anchor2[1]));
                if let Some(lim) = limits {
                    builder = builder.limits([lim[0], lim[1]]);
                }
                builder.into()
            }
            JointDesc2D::Rope {
                anchor1,
                anchor2,
                max_length,
            } => RopeJointBuilder::new(*max_length)
                .local_anchor1(Vec2::new(anchor1[0], anchor1[1]))
                .local_anchor2(Vec2::new(anchor2[0], anchor2[1]))
                .into(),
            JointDesc2D::Spring {
                anchor1,
                anchor2,
                rest_length,
                stiffness,
                damping,
            } => SpringJointBuilder::new(*rest_length, *stiffness, *damping)
                .local_anchor1(Vec2::new(anchor1[0], anchor1[1]))
                .local_anchor2(Vec2::new(anchor2[0], anchor2[1]))
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
    pub fn get_body_pose(&self, entity_id: u32) -> Option<Pose2D> {
        let handle = self.entity_to_body.get(&entity_id)?;
        let body = self.rigid_body_set.get(*handle)?;
        let pos = body.translation();
        let rot = body.rotation().angle();
        Some(Pose2D {
            position: Vec2::new(pos.x, pos.y),
            rotation: rot,
            scale: Vec2::ONE,
        })
    }

    /// Writes all simulated rigid body poses directly into a map of world transforms.
    pub fn write_poses_to_transforms(&self, transforms: &mut HashMap<u32, Pose2D>) {
        for (&entity_id, &handle) in &self.entity_to_body {
            if let Some(body) = self.rigid_body_set.get(handle) {
                let pos = body.translation();
                let rot = body.rotation().angle();
                if let Some(pose) = transforms.get_mut(&entity_id) {
                    pose.position.x = pos.x;
                    pose.position.y = pos.y;
                    pose.rotation = rot;
                } else {
                    transforms.insert(
                        entity_id,
                        Pose2D {
                            position: Vec2::new(pos.x, pos.y),
                            rotation: rot,
                            scale: Vec2::ONE,
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
