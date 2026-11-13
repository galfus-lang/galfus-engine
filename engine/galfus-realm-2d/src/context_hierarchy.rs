use std::collections::HashMap;

use galfus_realm_core::error::RealmResult;
use galfus_realm_core::hierarchy::{HierarchyConstraint2D, Pose2D};

use crate::context::Realm2DContext;

impl Realm2DContext {
    /// Attaches an origin entity to a target entity using a hierarchy constraint.
    pub fn attach_2d(
        &mut self,
        origin_id: u32,
        target_id: u32,
        constraint: HierarchyConstraint2D,
    ) -> RealmResult<()> {
        self.validate_id(origin_id)?;
        self.validate_id(target_id)?;

        // Auto-promotion: if both entities have rigid bodies, promote anchor to joint
        if let Some(physics) = self.physics.as_mut()
            && physics.has_rigid_body(origin_id)
            && physics.has_rigid_body(target_id)
        {
            let joint_desc = match &constraint {
                HierarchyConstraint2D::Fixed {
                    offset,
                    local_anchor_origin,
                    local_anchor_target,
                    ..
                } => Some(galfus_physics::JointDesc2D::Fixed {
                    anchor1: local_anchor_origin.unwrap_or([0.0, 0.0]),
                    anchor2: local_anchor_target.unwrap_or(*offset),
                }),
                HierarchyConstraint2D::Hinge {
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
                    Some(galfus_physics::JointDesc2D::Revolute {
                        anchor1: local_anchor_origin.unwrap_or([0.0, 0.0]),
                        anchor2: local_anchor_target.unwrap_or(*offset),
                        limits,
                        collide_connected: *collide_connected,
                        motor: None,
                    })
                }
                HierarchyConstraint2D::AngularSpring {
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
                    Some(galfus_physics::JointDesc2D::Revolute {
                        anchor1: local_anchor_origin.unwrap_or([0.0, 0.0]),
                        anchor2: local_anchor_target.unwrap_or(*offset),
                        limits,
                        collide_connected: *collide_connected,
                        motor: Some([*target_angle, *stiffness, *damping]),
                    })
                }
                HierarchyConstraint2D::Chain {
                    offset,
                    local_anchor_origin,
                    local_anchor_target,
                    ..
                } => {
                    let (a1, a2) = match (local_anchor_origin, local_anchor_target) {
                        (Some(o), Some(t)) => (*o, *t),
                        (Some(o), None) => (*o, *offset),
                        (None, Some(t)) => ([0.0, 0.0], *t),
                        (None, None) => {
                            if let (Some(p1), Some(p2)) = (
                                physics.get_body_pose(origin_id),
                                physics.get_body_pose(target_id),
                            ) {
                                let mid = (p1.position + p2.position) * 0.5;
                                let rot1 = glam::Mat2::from_angle(-p1.rotation);
                                let rot2 = glam::Mat2::from_angle(-p2.rotation);
                                let a1_vec = rot1 * (mid - p1.position);
                                let a2_vec = rot2 * (mid - p2.position);
                                ([a1_vec.x, a1_vec.y], [a2_vec.x, a2_vec.y])
                            } else {
                                ([0.0, 0.0], *offset)
                            }
                        }
                    };
                    Some(galfus_physics::JointDesc2D::Revolute {
                        anchor1: a1,
                        anchor2: a2,
                        limits: None,
                        motor: None,
                        collide_connected: true,
                    })
                }
                HierarchyConstraint2D::Rope {
                    max_length,
                    offset,
                    local_anchor_origin,
                    local_anchor_target,
                    ..
                } => Some(galfus_physics::JointDesc2D::Rope {
                    anchor1: local_anchor_origin.unwrap_or([0.0, 0.0]),
                    anchor2: local_anchor_target.unwrap_or(*offset),
                    max_length: *max_length,
                }),
                HierarchyConstraint2D::Spring {
                    rest_length,
                    stiffness,
                    damping,
                    offset,
                    local_anchor_origin,
                    local_anchor_target,
                } => Some(galfus_physics::JointDesc2D::Spring {
                    anchor1: local_anchor_origin.unwrap_or([0.0, 0.0]),
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
    pub fn detach_2d(&mut self, origin_id: u32) -> RealmResult<()> {
        self.validate_id(origin_id)?;
        if let Some(physics) = self.physics.as_mut() {
            physics.remove_joint_for_entity(origin_id);
        }
        self.hierarchy.detach(origin_id);
        Ok(())
    }

    /// Resolves the 2D scene graph hierarchy in topological order and updates model transforms.
    pub fn solve_hierarchy(&mut self, dt: f32) {
        if self.hierarchy.is_empty() {
            return;
        }

        let locals: HashMap<u32, Pose2D> = self
            .model_transforms
            .iter()
            .map(|(&id, &tf)| {
                (
                    id,
                    Pose2D {
                        position: tf.position,
                        rotation: tf.rotation,
                        scale: tf.scale,
                    },
                )
            })
            .collect();

        let mut worlds = HashMap::new();
        self.hierarchy
            .solve(&locals, &mut worlds, dt, self.total_time);

        for (id, pose) in worlds {
            if let Some(tf) = self.model_transforms.get_mut(&id) {
                tf.position = pose.position;
                tf.rotation = pose.rotation;
                tf.scale = pose.scale;
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
    }
}
