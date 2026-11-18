use std::collections::HashMap;

use galfus_realm_core::error::RealmResult;
use galfus_realm_core::hierarchy::{HierarchyConstraint3D, Pose3D};

use crate::context::Realm3DContext;
use crate::types::validate_id;

impl Realm3DContext {
    /// Attaches an origin entity to a target entity using a 3D hierarchy constraint.
    pub fn attach_3d(
        &mut self,
        origin_id: u32,
        target_id: u32,
        constraint: HierarchyConstraint3D,
    ) -> RealmResult<()> {
        validate_id(origin_id)?;
        validate_id(target_id)?;

        // Auto-promotion: if both entities have rigid bodies, promote anchor to joint
        if let Some(physics) = self.physics.as_mut()
            && physics.has_rigid_body(origin_id)
            && physics.has_rigid_body(target_id)
        {
            let joint_desc = match &constraint {
                HierarchyConstraint3D::Fixed {
                    offset,
                    local_anchor_origin,
                    local_anchor_target,
                    ..
                } => Some(galfus_physics::JointDesc3D::Fixed {
                    anchor1: local_anchor_origin.unwrap_or([0.0, 0.0, 0.0]),
                    anchor2: local_anchor_target.unwrap_or(*offset),
                }),
                HierarchyConstraint3D::Hinge {
                    axis,
                    min_angle,
                    max_angle,
                    offset,
                    local_anchor_origin,
                    local_anchor_target,
                    collide_connected,
                } => {
                    let limits = match (*min_angle, *max_angle) {
                        (Some(min), Some(max)) => Some([min, max]),
                        _ => None,
                    };
                    Some(galfus_physics::JointDesc3D::Revolute {
                        anchor1: local_anchor_origin.unwrap_or([0.0, 0.0, 0.0]),
                        anchor2: local_anchor_target.unwrap_or(*offset),
                        axis: *axis,
                        limits,
                        collide_connected: *collide_connected,
                        motor: None,
                    })
                }
                HierarchyConstraint3D::AngularSpring {
                    axis,
                    target_angle,
                    stiffness,
                    damping,
                    min_angle,
                    max_angle,
                    offset,
                    local_anchor_origin,
                    local_anchor_target,
                    collide_connected,
                    ..
                } => {
                    let limits = match (*min_angle, *max_angle) {
                        (Some(min), Some(max)) => Some([min, max]),
                        _ => None,
                    };
                    Some(galfus_physics::JointDesc3D::Revolute {
                        anchor1: local_anchor_origin.unwrap_or([0.0, 0.0, 0.0]),
                        anchor2: local_anchor_target.unwrap_or(*offset),
                        axis: *axis,
                        limits,
                        collide_connected: *collide_connected,
                        motor: Some([*target_angle, *stiffness, *damping]),
                    })
                }
                HierarchyConstraint3D::Chain {
                    offset,
                    local_anchor_origin,
                    local_anchor_target,
                    ..
                } => {
                    let (a1, a2) = match (local_anchor_origin, local_anchor_target) {
                        (Some(o), Some(t)) => (*o, *t),
                        (Some(o), None) => (*o, *offset),
                        (None, Some(t)) => ([0.0, 0.0, 0.0], *t),
                        (None, None) => {
                            if let (Some(p1), Some(p2)) = (
                                physics.get_body_pose(origin_id),
                                physics.get_body_pose(target_id),
                            ) {
                                let mid = (p1.position + p2.position) * 0.5;
                                let a1_vec = p1.rotation.inverse() * (mid - p1.position);
                                let a2_vec = p2.rotation.inverse() * (mid - p2.position);
                                (
                                    [a1_vec.x, a1_vec.y, a1_vec.z],
                                    [a2_vec.x, a2_vec.y, a2_vec.z],
                                )
                            } else {
                                ([0.0, 0.0, 0.0], *offset)
                            }
                        }
                    };
                    Some(galfus_physics::JointDesc3D::Spherical {
                        anchor1: a1,
                        anchor2: a2,
                    })
                }
                HierarchyConstraint3D::Rope {
                    max_length,
                    offset,
                    local_anchor_origin,
                    local_anchor_target,
                    ..
                } => Some(galfus_physics::JointDesc3D::Rope {
                    anchor1: local_anchor_origin.unwrap_or([0.0, 0.0, 0.0]),
                    anchor2: local_anchor_target.unwrap_or(*offset),
                    max_length: *max_length,
                }),
                HierarchyConstraint3D::Spring {
                    rest_length,
                    stiffness,
                    damping,
                    offset,
                    local_anchor_origin,
                    local_anchor_target,
                } => Some(galfus_physics::JointDesc3D::Spring {
                    anchor1: local_anchor_origin.unwrap_or([0.0, 0.0, 0.0]),
                    anchor2: local_anchor_target.unwrap_or(*offset),
                    rest_length: *rest_length,
                    stiffness: *stiffness,
                    damping: *damping,
                }),
                _ => None,
            };

            if let Some(desc) = joint_desc {
                physics.add_joint(origin_id, target_id, &desc);
                self.hierarchy
                    .attach(origin_id, target_id, constraint)
                    .map_err(galfus_realm_core::RealmError::Internal)?;
                self.hierarchy.set_managed_by_physics(origin_id, true);
                return Ok(());
            }
        }

        self.hierarchy
            .attach(origin_id, target_id, constraint)
            .map_err(galfus_realm_core::RealmError::Internal)?;
        Ok(())
    }

    /// Detaches the specified entity from its parent anchor.
    pub fn detach_3d(&mut self, origin_id: u32) -> RealmResult<()> {
        validate_id(origin_id)?;
        if let Some(physics) = self.physics.as_mut() {
            physics.remove_joint_for_entity(origin_id);
        }
        self.hierarchy.detach(origin_id);
        Ok(())
    }

    /// Resolves the 3D scene graph hierarchy in topological order and updates model/light/camera transforms.
    pub fn solve_hierarchy(&mut self, dt: f32) {
        if self.hierarchy.is_empty() {
            return;
        }

        let mut locals: HashMap<u32, Pose3D> = self
            .model_transforms
            .iter()
            .map(|(&id, &tf)| {
                (
                    id,
                    Pose3D {
                        position: tf.position,
                        rotation: tf.rotation,
                        scale: tf.scale,
                    },
                )
            })
            .collect();

        // Include any model not yet in model_transforms
        for (&id, entry) in &self.models {
            locals.entry(id).or_insert_with(|| Pose3D {
                position: entry.1.position,
                rotation: entry.1.rotation,
                scale: entry.1.scale,
            });
        }
        for (&id, (_, tf)) in &self.lights {
            locals.entry(id).or_insert_with(|| Pose3D {
                position: tf.position,
                rotation: tf.rotation,
                scale: tf.scale,
            });
        }
        for (&id, (_, tf)) in &self.cameras {
            locals.entry(id).or_insert_with(|| Pose3D {
                position: tf.position,
                rotation: tf.rotation,
                scale: tf.scale,
            });
        }

        let mut worlds = HashMap::new();
        self.hierarchy
            .solve(&locals, &mut worlds, dt, self.total_time);

        for (id, pose) in worlds {
            let tf = galfus_realm_3d_resources::transform::Transform3D {
                position: pose.position,
                rotation: pose.rotation,
                scale: pose.scale,
            };
            self.model_transforms.insert(id, tf);
            if let Some(entry) = self.models.get_mut(&id) {
                entry.1 = tf;
            }
            if let Some((_, light_tf)) = self.lights.get_mut(&id) {
                *light_tf = tf;
            }
            if let Some((_, cam_tf)) = self.cameras.get_mut(&id) {
                *cam_tf = tf;
            }
        }
    }
}
