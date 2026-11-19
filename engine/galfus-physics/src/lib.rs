//! # Galfus Physics
//!
//! Autonomous 2D and 3D native physics simulation engine powered by Rapier.

pub(crate) mod events;
pub mod types;
pub mod world_2d;
pub mod world_3d;

#[cfg(test)]
mod tests;

pub use types::*;
pub use world_2d::PhysicsWorld2D;
pub use world_3d::PhysicsWorld3D;

use galfus_core::diagnostics::{DriftWarning, MemoryCategoryStats};
use serde::Serialize;

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
