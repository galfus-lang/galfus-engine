//! Core-owned Inverse Kinematics (IK) solvers for `Realm3DContext`.

use galfus_realm_core::error::{RealmError, RealmResult};
use glam::{Mat3, Quat, Vec3};
use serde::{Deserialize, Serialize};

use crate::context::Realm3DContext;
use crate::types::validate_id;

fn default_weight() -> f32 {
    1.0
}

fn default_true() -> bool {
    true
}

fn default_iterations() -> u32 {
    8
}

fn default_tolerance() -> f32 {
    1e-3
}

fn default_forward() -> [f32; 3] {
    [0.0, 0.0, 1.0]
}

fn default_up() -> [f32; 3] {
    [0.0, 1.0, 0.0]
}

/// 3D Inverse Kinematics constraint solved in world space after hierarchy resolution.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum IkConstraint3D {
    /// Analytic 2-bone IK solver with optional pole hint (legs, arms).
    #[serde(rename_all = "camelCase")]
    TwoBone {
        root_id: u32,
        mid_id: u32,
        effector_id: u32,
        target: [f32; 3],
        #[serde(default)]
        pole_target: Option<[f32; 3]>,
        #[serde(default = "default_weight")]
        weight: f32,
        #[serde(default = "default_true")]
        active: bool,
    },
    /// Iterative FABRIK chain solver (spines, tails, tentacles, multi-joint limbs).
    #[serde(rename_all = "camelCase")]
    Fabrik {
        chain: Vec<u32>,
        target: [f32; 3],
        #[serde(default)]
        pole_target: Option<[f32; 3]>,
        #[serde(default = "default_iterations")]
        iterations: u32,
        #[serde(default = "default_tolerance")]
        tolerance: f32,
        #[serde(default = "default_weight")]
        weight: f32,
        #[serde(default = "default_true")]
        active: bool,
    },
    /// Aim / Look-At constraint rotating a single bone or entity toward a world target.
    #[serde(rename_all = "camelCase")]
    LookAt {
        entity_id: u32,
        target: [f32; 3],
        #[serde(default = "default_forward")]
        forward_axis: [f32; 3],
        #[serde(default = "default_up")]
        up_axis: [f32; 3],
        #[serde(default = "default_weight")]
        weight: f32,
        #[serde(default = "default_true")]
        active: bool,
    },
}

impl IkConstraint3D {
    /// Returns true if this constraint directly references the given entity/model ID.
    pub fn references_entity(&self, id: u32) -> bool {
        match self {
            Self::TwoBone {
                root_id,
                mid_id,
                effector_id,
                ..
            } => *root_id == id || *mid_id == id || *effector_id == id,
            Self::Fabrik { chain, .. } => chain.contains(&id),
            Self::LookAt { entity_id, .. } => *entity_id == id,
        }
    }

    fn validate(&self) -> RealmResult<()> {
        match self {
            Self::TwoBone {
                root_id,
                mid_id,
                effector_id,
                target,
                pole_target,
                weight,
                ..
            } => {
                validate_id(*root_id)?;
                validate_id(*mid_id)?;
                validate_id(*effector_id)?;
                if !Vec3::from_array(*target).is_finite()
                    || !weight.is_finite()
                    || pole_target.is_some_and(|p| !Vec3::from_array(p).is_finite())
                {
                    return Err(RealmError::Internal("Invalid TwoBone IK parameters".into()));
                }
            }
            Self::Fabrik {
                chain,
                target,
                tolerance,
                weight,
                ..
            } => {
                if chain.len() < 2 {
                    return Err(RealmError::Internal(
                        "FABRIK chain requires at least 2 entities".into(),
                    ));
                }
                for &id in chain {
                    validate_id(id)?;
                }
                if !Vec3::from_array(*target).is_finite()
                    || !tolerance.is_finite()
                    || !weight.is_finite()
                {
                    return Err(RealmError::Internal("Invalid FABRIK IK parameters".into()));
                }
            }
            Self::LookAt {
                entity_id,
                target,
                forward_axis,
                up_axis,
                weight,
                ..
            } => {
                validate_id(*entity_id)?;
                if !Vec3::from_array(*target).is_finite()
                    || Vec3::from_array(*forward_axis).length_squared() < 1e-8
                    || Vec3::from_array(*up_axis).length_squared() < 1e-8
                    || !weight.is_finite()
                {
                    return Err(RealmError::Internal("Invalid LookAt IK parameters".into()));
                }
            }
        }
        Ok(())
    }
}

impl Realm3DContext {
    /// Registers or replaces an IK constraint by logical ID.
    pub fn set_ik_constraint_3d(&mut self, id: u32, constraint: IkConstraint3D) -> RealmResult<()> {
        validate_id(id)?;
        constraint.validate()?;
        self.ik_constraints.insert(id, constraint);
        self.dirty = true;
        Ok(())
    }

    /// Updates the target (and optional pole target / weight) of an existing IK constraint.
    pub fn set_ik_target_3d(
        &mut self,
        id: u32,
        target: [f32; 3],
        pole_target: Option<[f32; 3]>,
        weight: Option<f32>,
    ) -> RealmResult<()> {
        validate_id(id)?;
        if !Vec3::from_array(target).is_finite() {
            return Err(RealmError::Internal("IK target must be finite".into()));
        }
        let Some(constraint) = self.ik_constraints.get_mut(&id) else {
            return Err(RealmError::ResourceNotFound(
                self.id,
                format!("IkConstraint3D {id} not found"),
            ));
        };
        match constraint {
            IkConstraint3D::TwoBone {
                target: t,
                pole_target: p,
                weight: w,
                ..
            }
            | IkConstraint3D::Fabrik {
                target: t,
                pole_target: p,
                weight: w,
                ..
            } => {
                *t = target;
                if pole_target.is_some() {
                    *p = pole_target;
                }
                if let Some(nw) = weight {
                    *w = nw;
                }
            }
            IkConstraint3D::LookAt {
                target: t,
                weight: w,
                ..
            } => {
                *t = target;
                if let Some(nw) = weight {
                    *w = nw;
                }
            }
        }
        self.dirty = true;
        Ok(())
    }

    /// Removes an IK constraint by logical ID.
    pub fn remove_ik_constraint_3d(&mut self, id: u32) -> RealmResult<()> {
        validate_id(id)?;
        self.ik_constraints.remove(&id).map(|_| ()).ok_or_else(|| {
            RealmError::ResourceNotFound(self.id, format!("IkConstraint3D {id} not found"))
        })
    }

    /// Evaluates all active IK constraints against the current world transforms.
    pub fn solve_ik(&mut self) {
        if self.ik_constraints.is_empty() {
            return;
        }
        let constraints: Vec<IkConstraint3D> = self.ik_constraints.values().cloned().collect();
        for constraint in constraints {
            match constraint {
                IkConstraint3D::TwoBone {
                    root_id,
                    mid_id,
                    effector_id,
                    target,
                    pole_target,
                    weight,
                    active,
                } if active => {
                    self.solve_two_bone(
                        root_id,
                        mid_id,
                        effector_id,
                        Vec3::from_array(target),
                        pole_target.map(Vec3::from_array),
                        weight.clamp(0.0, 1.0),
                    );
                }
                IkConstraint3D::Fabrik {
                    chain,
                    target,
                    pole_target,
                    iterations,
                    tolerance,
                    weight,
                    active,
                } if active => {
                    self.solve_fabrik(
                        &chain,
                        Vec3::from_array(target),
                        pole_target.map(Vec3::from_array),
                        iterations.clamp(1, 64),
                        tolerance.max(1e-6),
                        weight.clamp(0.0, 1.0),
                    );
                }
                IkConstraint3D::LookAt {
                    entity_id,
                    target,
                    forward_axis,
                    up_axis,
                    weight,
                    active,
                } if active => {
                    self.solve_look_at(
                        entity_id,
                        Vec3::from_array(target),
                        Vec3::from_array(forward_axis).normalize(),
                        Vec3::from_array(up_axis).normalize(),
                        weight.clamp(0.0, 1.0),
                    );
                }
                _ => {}
            }
        }
    }

    fn solve_two_bone(
        &mut self,
        root_id: u32,
        mid_id: u32,
        effector_id: u32,
        target: Vec3,
        pole_target: Option<Vec3>,
        weight: f32,
    ) {
        if weight <= 1e-6 {
            return;
        }
        let (Some(mut root_tf), Some(mut mid_tf), Some(mut eff_tf)) = (
            self.resolve_entity_transform(root_id),
            self.resolve_entity_transform(mid_id),
            self.resolve_entity_transform(effector_id),
        ) else {
            return;
        };

        let p_root = root_tf.position;
        let p_mid = mid_tf.position;
        let p_eff = eff_tf.position;

        let upper = p_mid - p_root;
        let lower = p_eff - p_mid;
        let l1 = upper.length();
        let l2 = lower.length();
        if l1 < 1e-6 || l2 < 1e-6 {
            return;
        }

        let to_target = target - p_root;
        let target_dist = to_target.length();
        if target_dist < 1e-6 {
            return;
        }
        let dir = to_target / target_dist;

        let min_dist = (l1 - l2).abs() + 1e-4;
        let max_dist = (l1 + l2 - 1e-4).max(min_dist);
        let d = target_dist.clamp(min_dist, max_dist);

        // Determine bend plane perpendicular to `dir`
        let pole_hint = pole_target
            .map(|p| p - p_root)
            .unwrap_or_else(|| upper - dir * upper.dot(dir));
        let mut bend_dir = pole_hint - dir * pole_hint.dot(dir);
        if bend_dir.length_squared() < 1e-8 {
            let fallback = if dir.y.abs() < 0.9 { Vec3::Y } else { Vec3::X };
            bend_dir = dir.cross(fallback);
        }
        bend_dir = bend_dir.normalize();

        let cos_angle = ((l1 * l1 + d * d - l2 * l2) / (2.0 * l1 * d)).clamp(-1.0, 1.0);
        let sin_angle = (1.0 - cos_angle * cos_angle).max(0.0).sqrt();

        let solved_mid = p_root + (dir * cos_angle + bend_dir * sin_angle) * l1;
        let solved_eff = p_root + dir * d;

        let old_u1 = upper / l1;
        let new_u1 = (solved_mid - p_root).normalize_or_zero();
        let delta_r1 = Quat::from_rotation_arc(old_u1, new_u1);
        let solved_r1 = (delta_r1 * root_tf.rotation).normalize();

        let old_u2 = (delta_r1 * (lower / l2)).normalize_or_zero();
        let new_u2 = (solved_eff - solved_mid).normalize_or_zero();
        let delta_r2 = Quat::from_rotation_arc(old_u2, new_u2);
        let solved_r2 = (delta_r2 * delta_r1 * mid_tf.rotation).normalize();

        root_tf.rotation = root_tf.rotation.slerp(solved_r1, weight);
        mid_tf.position = p_mid.lerp(solved_mid, weight);
        mid_tf.rotation = mid_tf.rotation.slerp(solved_r2, weight);
        eff_tf.position = p_eff.lerp(solved_eff, weight);

        self.write_entity_transform(root_id, root_tf);
        self.write_entity_transform(mid_id, mid_tf);
        self.write_entity_transform(effector_id, eff_tf);
    }

    fn solve_fabrik(
        &mut self,
        chain: &[u32],
        target: Vec3,
        pole_target: Option<Vec3>,
        iterations: u32,
        tolerance: f32,
        weight: f32,
    ) {
        if weight <= 1e-6 || chain.len() < 2 {
            return;
        }
        let mut transforms = Vec::with_capacity(chain.len());
        for &id in chain {
            let Some(tf) = self.resolve_entity_transform(id) else {
                return;
            };
            transforms.push(tf);
        }

        let orig_positions: Vec<Vec3> = transforms.iter().map(|t| t.position).collect();
        let mut positions = orig_positions.clone();
        let mut lengths = Vec::with_capacity(chain.len() - 1);
        let mut total_len = 0.0f32;
        for i in 0..chain.len() - 1 {
            let len = (positions[i + 1] - positions[i]).length();
            lengths.push(len);
            total_len += len;
        }
        if total_len < 1e-6 {
            return;
        }

        let root_pos = positions[0];
        let to_target = target - root_pos;
        if to_target.length() >= total_len {
            let dir = to_target.normalize_or_zero();
            for i in 0..lengths.len() {
                positions[i + 1] = positions[i] + dir * lengths[i];
            }
        } else {
            let last = positions.len() - 1;
            let dist = to_target.length();
            if let Some(pole) = pole_target {
                let axis = to_target.normalize_or_zero();
                let pv = pole - root_pos;
                let bend = (pv - axis * pv.dot(axis)).normalize_or_zero();
                if axis.length_squared() > 1e-6 && bend.length_squared() > 1e-6 {
                    // Seed an upward parabolic arch in the (root, target, pole) plane so all
                    // FABRIK iterations stay strictly in-plane, arch toward `pole`, and finish
                    // on the forward pass with exact bone lengths.
                    let arch = (total_len * total_len - dist * dist).max(0.0).sqrt() * 0.5;
                    for (i, p) in positions.iter_mut().enumerate().take(last).skip(1) {
                        let frac = i as f32 / last as f32;
                        let lift = (frac * std::f32::consts::PI).sin() * arch.max(0.1);
                        *p = root_pos + axis * (dist * frac) + bend * lift;
                    }
                    positions[last] = target;
                }
            }
            for _ in 0..iterations {
                if (positions[last] - target).length() <= tolerance && pole_target.is_none() {
                    break;
                }
                positions[last] = target;
                for i in (0..last).rev() {
                    let dir = (positions[i] - positions[i + 1]).normalize_or_zero();
                    positions[i] = positions[i + 1] + dir * lengths[i];
                }
                positions[0] = root_pos;
                for i in 0..last {
                    let dir = (positions[i + 1] - positions[i]).normalize_or_zero();
                    positions[i + 1] = positions[i] + dir * lengths[i];
                }
                if (positions[last] - target).length() <= tolerance {
                    break;
                }
            }
        }

        for i in 0..chain.len() {
            let mut tf = transforms[i];
            tf.position = orig_positions[i].lerp(positions[i], weight);
            if i + 1 < chain.len() {
                let old_dir = (orig_positions[i + 1] - orig_positions[i]).normalize_or_zero();
                let new_dir = (positions[i + 1] - positions[i]).normalize_or_zero();
                if old_dir.length_squared() > 1e-6 && new_dir.length_squared() > 1e-6 {
                    let solved_rot =
                        (Quat::from_rotation_arc(old_dir, new_dir) * tf.rotation).normalize();
                    tf.rotation = tf.rotation.slerp(solved_rot, weight);
                }
            }
            self.write_entity_transform(chain[i], tf);
        }
    }

    fn solve_look_at(
        &mut self,
        entity_id: u32,
        target: Vec3,
        forward_axis: Vec3,
        up_axis: Vec3,
        weight: f32,
    ) {
        if weight <= 1e-6 {
            return;
        }
        let Some(mut tf) = self.resolve_entity_transform(entity_id) else {
            return;
        };
        let to_target = target - tf.position;
        if to_target.length_squared() < 1e-8 {
            return;
        }
        let target_dir = to_target.normalize();
        let ref_up = if target_dir.dot(up_axis).abs() > 0.99 {
            if target_dir.x.abs() < 0.9 {
                Vec3::X
            } else {
                Vec3::Z
            }
        } else {
            up_axis
        };
        let right = ref_up.cross(target_dir).normalize();
        let ortho_up = target_dir.cross(right).normalize();
        let target_basis = Mat3::from_cols(right, ortho_up, target_dir);

        let local_right = up_axis
            .cross(forward_axis)
            .try_normalize()
            .unwrap_or(Vec3::X);
        let local_up = forward_axis.cross(local_right).normalize();
        let local_basis = Mat3::from_cols(local_right, local_up, forward_axis);

        let solved_rot = Quat::from_mat3(&(target_basis * local_basis.transpose())).normalize();
        tf.rotation = tf.rotation.slerp(solved_rot, weight);
        self.write_entity_transform(entity_id, tf);
    }
}

#[cfg(test)]
#[path = "context_ik_tests.rs"]
mod tests;
