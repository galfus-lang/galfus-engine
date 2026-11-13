use std::collections::HashMap;

use galfus_realm_core::hierarchy::Pose3D;
use glam::{Quat, Vec3};

use super::PhysicsWorld3D;

impl PhysicsWorld3D {
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
}
