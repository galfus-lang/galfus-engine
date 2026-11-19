//! Diagnostic statistics for [`PhysicsWorld2D`] and [`PhysicsWorld3D`].

use galfus_core::diagnostics::{DriftWarning, MemoryCategoryStats};
use serde::Serialize;

use crate::types::{PhysicsContactEvent, RigidBodyDesc2D, RigidBodyDesc3D};
use crate::{PhysicsWorld2D, PhysicsWorld3D};

/// Diagnostic statistics for a 2D or 3D physics world.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsDiagnosticsStats {
    pub rigid_bodies: usize,
    pub colliders: usize,
    pub joints: usize,
    pub active_bodies: usize,
    pub entity_to_body_len: usize,
    pub body_to_entity_len: usize,
    pub body_descs_len: usize,
    pub entity_joints_len: usize,
    pub entity_to_colliders_len: usize,
    pub collider_to_entity_len: usize,
    pub contact_events_cap: usize,
    pub estimated_cpu_bytes: u64,
}

impl PhysicsDiagnosticsStats {
    pub fn memory_category(&self, category: &str) -> MemoryCategoryStats {
        MemoryCategoryStats::new(
            category,
            "physics",
            self.estimated_cpu_bytes,
            0,
            self.estimated_cpu_bytes,
            self.rigid_bodies + self.colliders + self.joints,
        )
    }

    pub fn drift_warnings(&self, category: &str) -> Vec<DriftWarning> {
        let mut warnings = Vec::new();
        if self.collider_to_entity_len > self.colliders {
            let delta = self.collider_to_entity_len as i64 - self.colliders as i64;
            warnings.push(DriftWarning {
                category: category.to_string(),
                metric: "colliderToEntityLen".to_string(),
                expected: self.colliders as u64,
                actual: self.collider_to_entity_len as u64,
                delta,
                message: format!(
                    "collider_to_entity has {delta} stale entries compared to Rapier collider_set"
                ),
            });
        }
        if self.entity_joints_len > self.joints {
            let delta = self.entity_joints_len as i64 - self.joints as i64;
            warnings.push(DriftWarning {
                category: category.to_string(),
                metric: "entityJointsLen".to_string(),
                expected: self.joints as u64,
                actual: self.entity_joints_len as u64,
                delta,
                message: format!(
                    "entity_joints has {delta} stale entries compared to Rapier impulse_joint_set"
                ),
            });
        }
        warnings
    }
}

impl PhysicsWorld2D {
    /// Clears the physics world including Rapier acceleration and contact structures.
    pub fn clear(&mut self) {
        self.entity_to_body.clear();
        self.body_to_entity.clear();
        self.body_descs.clear();
        self.entity_joints.clear();
        self.entity_to_colliders.clear();
        self.collider_to_entity.clear();
        self.rigid_body_set = rapier2d::prelude::RigidBodySet::new();
        self.collider_set = rapier2d::prelude::ColliderSet::new();
        self.soft_body_set = rapier2d::prelude::SoftBodySet::new();
        self.island_manager = rapier2d::prelude::IslandManager::new();
        self.broad_phase = rapier2d::prelude::DefaultBroadPhase::new();
        self.narrow_phase = rapier2d::prelude::NarrowPhase::new();
        self.impulse_joint_set = rapier2d::prelude::ImpulseJointSet::new();
        self.multibody_joint_set = rapier2d::prelude::MultibodyJointSet::new();
        self.ccd_solver = rapier2d::prelude::CCDSolver::new();
        self.contact_events.clear();
    }

    /// Returns diagnostic statistics for this 2D physics world.
    pub fn diagnostic_stats(&self) -> PhysicsDiagnosticsStats {
        let rigid_bodies = self.rigid_body_set.len();
        let colliders = self.collider_set.len();
        let joints = self.impulse_joint_set.len();
        let collider_vec_entries: usize =
            self.entity_to_colliders.values().map(Vec::capacity).sum();
        let estimated_cpu_bytes = (rigid_bodies
            * std::mem::size_of::<rapier2d::prelude::RigidBody>()
            + colliders * std::mem::size_of::<rapier2d::prelude::Collider>()
            + joints * 128
            + self.entity_to_body.capacity() * 16
            + self.body_to_entity.capacity() * 16
            + self.body_descs.capacity() * std::mem::size_of::<(u32, RigidBodyDesc2D)>()
            + self.entity_joints.capacity() * 16
            + self.entity_to_colliders.capacity() * 32
            + collider_vec_entries * std::mem::size_of::<rapier2d::prelude::ColliderHandle>()
            + self.collider_to_entity.capacity() * 24
            + self.contact_events.capacity() * std::mem::size_of::<PhysicsContactEvent>())
            as u64;

        PhysicsDiagnosticsStats {
            rigid_bodies,
            colliders,
            joints,
            active_bodies: self.island_manager.active_bodies().count(),
            entity_to_body_len: self.entity_to_body.len(),
            body_to_entity_len: self.body_to_entity.len(),
            body_descs_len: self.body_descs.len(),
            entity_joints_len: self.entity_joints.len(),
            entity_to_colliders_len: self.entity_to_colliders.len(),
            collider_to_entity_len: self.collider_to_entity.len(),
            contact_events_cap: self.contact_events.capacity(),
            estimated_cpu_bytes,
        }
    }
}

impl PhysicsWorld3D {
    /// Clears the physics world including Rapier acceleration and contact structures.
    pub fn clear(&mut self) {
        self.entity_to_body.clear();
        self.body_to_entity.clear();
        self.body_descs.clear();
        self.entity_joints.clear();
        self.entity_to_colliders.clear();
        self.collider_to_entity.clear();
        self.rigid_body_set = rapier3d::prelude::RigidBodySet::new();
        self.collider_set = rapier3d::prelude::ColliderSet::new();
        self.soft_body_set = rapier3d::prelude::SoftBodySet::new();
        self.island_manager = rapier3d::prelude::IslandManager::new();
        self.broad_phase = rapier3d::prelude::DefaultBroadPhase::new();
        self.narrow_phase = rapier3d::prelude::NarrowPhase::new();
        self.impulse_joint_set = rapier3d::prelude::ImpulseJointSet::new();
        self.multibody_joint_set = rapier3d::prelude::MultibodyJointSet::new();
        self.ccd_solver = rapier3d::prelude::CCDSolver::new();
        self.contact_events.clear();
    }

    /// Returns diagnostic statistics for this 3D physics world.
    pub fn diagnostic_stats(&self) -> PhysicsDiagnosticsStats {
        let rigid_bodies = self.rigid_body_set.len();
        let colliders = self.collider_set.len();
        let joints = self.impulse_joint_set.len();
        let collider_vec_entries: usize =
            self.entity_to_colliders.values().map(Vec::capacity).sum();
        let estimated_cpu_bytes = (rigid_bodies
            * std::mem::size_of::<rapier3d::prelude::RigidBody>()
            + colliders * std::mem::size_of::<rapier3d::prelude::Collider>()
            + joints * 128
            + self.entity_to_body.capacity() * 16
            + self.body_to_entity.capacity() * 16
            + self.body_descs.capacity() * std::mem::size_of::<(u32, RigidBodyDesc3D)>()
            + self.entity_joints.capacity() * 16
            + self.entity_to_colliders.capacity() * 32
            + collider_vec_entries * std::mem::size_of::<rapier3d::prelude::ColliderHandle>()
            + self.collider_to_entity.capacity() * 24
            + self.contact_events.capacity() * std::mem::size_of::<PhysicsContactEvent>())
            as u64;

        PhysicsDiagnosticsStats {
            rigid_bodies,
            colliders,
            joints,
            active_bodies: self.island_manager.active_bodies().count(),
            entity_to_body_len: self.entity_to_body.len(),
            body_to_entity_len: self.body_to_entity.len(),
            body_descs_len: self.body_descs.len(),
            entity_joints_len: self.entity_joints.len(),
            entity_to_colliders_len: self.entity_to_colliders.len(),
            collider_to_entity_len: self.collider_to_entity.len(),
            contact_events_cap: self.contact_events.capacity(),
            estimated_cpu_bytes,
        }
    }
}
