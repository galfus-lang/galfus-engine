//! Core-owned skeletal skinning evaluation for `Realm3DContext`.

use galfus_realm_3d_resources::transform::Transform3D;
use galfus_realm_core::error::{RealmError, RealmResult};
use glam::Mat4;

use crate::context::Realm3DContext;
use crate::types::validate_id;

/// Registered skeletal skin binding a target model to joint entities and inverse bind matrices.
#[derive(Debug, Clone)]
pub struct Skin3D {
    pub model_id: u32,
    pub joint_model_ids: Vec<u32>,
    pub inverse_bind_matrices: Vec<Mat4>,
}

impl Realm3DContext {
    /// Registers or replaces a core-evaluated skeletal skin.
    pub fn create_skin_3d(
        &mut self,
        skin_id: u32,
        model_id: u32,
        joint_model_ids: Vec<u32>,
        inverse_bind_matrices: Vec<Mat4>,
    ) -> RealmResult<()> {
        validate_id(skin_id)?;
        validate_id(model_id)?;
        if joint_model_ids.is_empty() {
            return Err(RealmError::Internal(
                "Skin3D must define at least one joint".into(),
            ));
        }
        if joint_model_ids.len() != inverse_bind_matrices.len() {
            return Err(RealmError::Internal(format!(
                "Skin3D joint count ({}) does not match inverse bind matrix count ({})",
                joint_model_ids.len(),
                inverse_bind_matrices.len()
            )));
        }
        for &joint_id in &joint_model_ids {
            validate_id(joint_id)?;
        }

        self.skins.insert(
            skin_id,
            Skin3D {
                model_id,
                joint_model_ids,
                inverse_bind_matrices,
            },
        );
        self.bones_dirty = true;
        Ok(())
    }

    /// Removes a registered skeletal skin by logical ID.
    pub fn destroy_skin_3d(&mut self, skin_id: u32) -> RealmResult<()> {
        validate_id(skin_id)?;
        if let Some(removed) = self.skins.remove(&skin_id) {
            let still_skinned = self
                .skins
                .values()
                .any(|skin| skin.model_id == removed.model_id);
            if !still_skinned {
                self.model_bones.remove(&removed.model_id);
                self.bones_dirty = true;
            }
            Ok(())
        } else {
            Err(RealmError::ResourceNotFound(
                self.id,
                format!("Skin3D {skin_id} not found"),
            ))
        }
    }

    /// Evaluates all core-registered skins from current model/joint world transforms.
    pub fn solve_skins(&mut self) {
        if self.skins.is_empty() {
            return;
        }

        let mut updated: Vec<(u32, Vec<Mat4>)> = Vec::with_capacity(self.skins.len());
        for skin in self.skins.values() {
            let model_tf = self
                .resolve_entity_transform(skin.model_id)
                .unwrap_or_default();
            let model_mat = model_tf.to_mat4();
            let inv_model = if model_mat.determinant().abs() > 1e-12 {
                model_mat.inverse()
            } else {
                Mat4::IDENTITY
            };

            let mut palette = Vec::with_capacity(skin.joint_model_ids.len());
            for (&joint_id, &inv_bind) in skin
                .joint_model_ids
                .iter()
                .zip(skin.inverse_bind_matrices.iter())
            {
                let joint_tf = self.resolve_entity_transform(joint_id).unwrap_or_default();
                let skin_mat = inv_model * joint_tf.to_mat4() * inv_bind;
                palette.push(skin_mat);
            }
            updated.push((skin.model_id, palette));
        }

        for (model_id, palette) in updated {
            let changed = self
                .model_bones
                .get(&model_id)
                .is_none_or(|existing| existing != &palette);
            if changed {
                self.model_bones.insert(model_id, palette);
                self.bones_dirty = true;
            }
        }
    }

    pub(crate) fn resolve_entity_transform(&self, id: u32) -> Option<Transform3D> {
        self.model_transforms
            .get(&id)
            .copied()
            .or_else(|| self.models.get(&id).map(|entry| entry.1))
    }

    pub(crate) fn write_entity_transform(&mut self, id: u32, tf: Transform3D) {
        self.model_transforms.insert(id, tf);
        if let Some(entry) = self.models.get_mut(&id) {
            entry.1 = tf;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use glam::{Quat, Vec3};

    #[test]
    fn solve_skins_computes_skin_matrices_from_world_transforms() {
        let mut realm = Realm3DContext::new(1);
        realm.model_transforms.insert(
            10,
            Transform3D {
                position: Vec3::new(1.0, 0.0, 0.0),
                rotation: Quat::IDENTITY,
                scale: Vec3::ONE,
            },
        );
        realm.model_transforms.insert(
            11,
            Transform3D {
                position: Vec3::new(4.0, 2.0, 0.0),
                rotation: Quat::IDENTITY,
                scale: Vec3::ONE,
            },
        );
        let inv_bind = Mat4::from_translation(Vec3::new(-1.0, 0.0, 0.0));
        realm
            .create_skin_3d(1, 10, vec![11], vec![inv_bind])
            .unwrap();

        realm.solve_skins();

        let bones = realm.model_bones.get(&10).expect("bone palette populated");
        assert_eq!(bones.len(), 1);
        let translation = bones[0].w_axis.truncate();
        assert!((translation - Vec3::new(2.0, 2.0, 0.0)).length() < 1e-5);
    }
}
