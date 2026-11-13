use std::collections::{HashMap, HashSet};

use glam::{Mat4, Quat, Vec3, Vec4};

use super::script::{HierarchyScriptEngine, ScriptTransform3D};
use super::types::{AnchorNode3D, HierarchyConstraint3D, KinematicState3D, Pose3D};

/// Scene graph and hierarchy solver for 3D worlds.
pub struct HierarchyGraph3D {
    anchors: HashMap<u32, AnchorNode3D>,
    script_engine: HierarchyScriptEngine,
}

impl Default for HierarchyGraph3D {
    fn default() -> Self {
        Self::new()
    }
}

impl HierarchyGraph3D {
    /// Creates an empty 3D hierarchy graph.
    pub fn new() -> Self {
        Self {
            anchors: HashMap::new(),
            script_engine: HierarchyScriptEngine::new(),
        }
    }

    /// Attaches an origin entity to a target entity with the specified constraint.
    pub fn attach(
        &mut self,
        origin_id: u32,
        target_id: u32,
        constraint: HierarchyConstraint3D,
    ) -> Result<(), String> {
        if origin_id == target_id {
            return Err(format!(
                "Cannot attach entity {origin_id} to itself (self-loop detected)"
            ));
        }

        let ast = match &constraint {
            HierarchyConstraint3D::Script { source } => Some(self.script_engine.compile(source)?),
            _ => None,
        };

        let node = AnchorNode3D {
            target_id,
            constraint,
            ast,
            state: KinematicState3D::default(),
            managed_by_physics: false,
        };

        self.anchors.insert(origin_id, node);
        Ok(())
    }

    /// Detaches the specified entity from its anchor parent, if any.
    pub fn detach(&mut self, origin_id: u32) -> bool {
        self.anchors.remove(&origin_id).is_some()
    }

    /// Checks if the entity is currently anchored as origin.
    pub fn has_anchor(&self, origin_id: u32) -> bool {
        self.anchors.contains_key(&origin_id)
    }

    /// Gets the target ID for an origin entity, if attached.
    pub fn get_parent(&self, origin_id: u32) -> Option<u32> {
        self.anchors.get(&origin_id).map(|n| n.target_id)
    }

    /// Marks an anchor node as managed by a physical joint (skipping kinematic override).
    pub fn set_managed_by_physics(&mut self, origin_id: u32, managed: bool) {
        if let Some(node) = self.anchors.get_mut(&origin_id) {
            node.managed_by_physics = managed;
        }
    }

    /// Removes all anchors that reference the given entity as either origin or target.
    pub fn remove_entity(&mut self, id: u32) {
        self.anchors.remove(&id);
        self.anchors.retain(|_, node| node.target_id != id);
    }

    /// Clears all hierarchy anchors.
    pub fn clear(&mut self) {
        self.anchors.clear();
    }

    /// Returns true if there are no anchors in the hierarchy graph.
    pub fn is_empty(&self) -> bool {
        self.anchors.is_empty()
    }

    /// Returns the number of active anchors in the hierarchy graph.
    pub fn len(&self) -> usize {
        self.anchors.len()
    }

    /// Resolves world transforms for all entities in topological order.
    pub fn solve(
        &mut self,
        local_transforms: &HashMap<u32, Pose3D>,
        world_transforms: &mut HashMap<u32, Pose3D>,
        dt: f32,
        time: f32,
    ) {
        let mut visiting = HashSet::new();
        let mut resolved = HashSet::new();

        let all_ids: Vec<u32> = local_transforms.keys().copied().collect();
        for id in all_ids {
            Self::resolve_entity(
                id,
                local_transforms,
                world_transforms,
                &mut self.anchors,
                &self.script_engine,
                &mut visiting,
                &mut resolved,
                dt,
                time,
            );
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn resolve_entity(
        id: u32,
        local_transforms: &HashMap<u32, Pose3D>,
        world_transforms: &mut HashMap<u32, Pose3D>,
        anchors: &mut HashMap<u32, AnchorNode3D>,
        script_engine: &HierarchyScriptEngine,
        visiting: &mut HashSet<u32>,
        resolved: &mut HashSet<u32>,
        dt: f32,
        time: f32,
    ) -> Option<Pose3D> {
        if resolved.contains(&id) {
            return world_transforms.get(&id).copied();
        }

        let local = *local_transforms.get(&id)?;

        let node = match anchors.get_mut(&id) {
            Some(n) => n,
            None => {
                world_transforms.insert(id, local);
                resolved.insert(id);
                return Some(local);
            }
        };

        if node.managed_by_physics {
            resolved.insert(id);
            return world_transforms.get(&id).copied().or(Some(local));
        }

        // Cycle detection fallback
        if visiting.contains(&id) {
            world_transforms.insert(id, local);
            resolved.insert(id);
            return Some(local);
        }

        let target_id = node.target_id;
        visiting.insert(id);
        let target_world = Self::resolve_entity(
            target_id,
            local_transforms,
            world_transforms,
            anchors,
            script_engine,
            visiting,
            resolved,
            dt,
            time,
        )
        .unwrap_or_else(|| {
            local_transforms
                .get(&target_id)
                .copied()
                .unwrap_or_default()
        });
        visiting.remove(&id);

        let node = anchors.get_mut(&id).unwrap();
        let world = Self::apply_constraint_3d(
            &node.constraint,
            node.ast.as_ref(),
            &mut node.state,
            target_world,
            local,
            script_engine,
            dt,
            time,
        );

        world_transforms.insert(id, world);
        resolved.insert(id);
        Some(world)
    }

    #[allow(clippy::too_many_arguments)]
    fn apply_constraint_3d(
        constraint: &HierarchyConstraint3D,
        ast: Option<&rhai::AST>,
        state: &mut KinematicState3D,
        target: Pose3D,
        local: Pose3D,
        script_engine: &HierarchyScriptEngine,
        dt: f32,
        time: f32,
    ) -> Pose3D {
        match constraint {
            HierarchyConstraint3D::Fixed {
                offset,
                rotation_offset,
                ..
            } => {
                let rot_offset = rotation_offset
                    .map(Quat::from_array)
                    .unwrap_or(Quat::IDENTITY);
                let offset_scaled = Vec3::from(*offset) * target.scale;
                let local_scaled = local.position * target.scale;
                let world_pos = target.position + target.rotation * (offset_scaled + local_scaled);
                Pose3D {
                    position: world_pos,
                    rotation: target.rotation * rot_offset * local.rotation,
                    scale: target.scale * local.scale,
                }
            }
            HierarchyConstraint3D::TranslationOnly { offset } => Pose3D {
                position: target.position + Vec3::from(*offset) + local.position,
                rotation: local.rotation,
                scale: local.scale,
            },
            HierarchyConstraint3D::RotationOnly { rotation_offset } => {
                let rot_offset = rotation_offset
                    .map(Quat::from_array)
                    .unwrap_or(Quat::IDENTITY);
                Pose3D {
                    position: local.position,
                    rotation: target.rotation * rot_offset * local.rotation,
                    scale: local.scale,
                }
            }
            HierarchyConstraint3D::LookAt { up } => {
                let f = (target.position - local.position).normalize_or_zero();
                let up_vec = Vec3::from(*up);
                let mut s = f.cross(up_vec).normalize_or_zero();
                if s.length_squared() < 0.0001 {
                    s = f.cross(Vec3::Z).normalize_or_zero();
                }
                let u = s.cross(f).normalize_or_zero();
                let rot_mat =
                    Mat4::from_cols(s.extend(0.0), u.extend(0.0), (-f).extend(0.0), Vec4::W);
                Pose3D {
                    position: local.position,
                    rotation: Quat::from_mat4(&rot_mat),
                    scale: local.scale,
                }
            }
            HierarchyConstraint3D::Spring {
                stiffness,
                damping,
                rest_length,
                offset,
                ..
            } => {
                let tx = target.position.x + offset[0];
                let ty = target.position.y + offset[1];
                let tz = target.position.z + offset[2];
                if !state.initialized {
                    state.initialized = true;
                    state.x = local.position.x;
                    state.y = local.position.y;
                    state.z = local.position.z;
                    state.vx = 0.0;
                    state.vy = 0.0;
                    state.vz = 0.0;
                }
                let frame_dt = dt.clamp(1e-4, 0.1);
                let dx = state.x - tx;
                let dy = state.y - ty;
                let dz = state.z - tz;
                let dist = (dx * dx + dy * dy + dz * dz).sqrt();
                let stretch = dist - rest_length;
                let (nx, ny, nz) = if dist > 1e-6 {
                    (dx / dist, dy / dist, dz / dist)
                } else {
                    (0.0, 1.0, 0.0)
                };
                let ax = -stiffness * stretch * nx - damping * state.vx;
                let ay = -stiffness * stretch * ny - damping * state.vy;
                let az = -stiffness * stretch * nz - damping * state.vz;
                state.vx += ax * frame_dt;
                state.vy += ay * frame_dt;
                state.vz += az * frame_dt;
                state.x += state.vx * frame_dt;
                state.y += state.vy * frame_dt;
                state.z += state.vz * frame_dt;

                Pose3D {
                    position: Vec3::new(state.x, state.y, state.z),
                    rotation: local.rotation,
                    scale: local.scale,
                }
            }
            HierarchyConstraint3D::Rope {
                max_length, offset, ..
            } => {
                let tx = target.position.x + offset[0];
                let ty = target.position.y + offset[1];
                let tz = target.position.z + offset[2];
                if !state.initialized {
                    state.initialized = true;
                    state.x = local.position.x;
                    state.y = local.position.y;
                    state.z = local.position.z;
                }
                let dx = state.x - tx;
                let dy = state.y - ty;
                let dz = state.z - tz;
                let dist = (dx * dx + dy * dy + dz * dz).sqrt();
                if dist > *max_length && dist > 1e-6 {
                    let scale = *max_length / dist;
                    state.x = tx + dx * scale;
                    state.y = ty + dy * scale;
                    state.z = tz + dz * scale;
                }
                Pose3D {
                    position: Vec3::new(state.x, state.y, state.z),
                    rotation: local.rotation,
                    scale: local.scale,
                }
            }
            HierarchyConstraint3D::Chain {
                length,
                align_rotation,
                offset,
                ..
            } => {
                let tx = target.position.x + offset[0];
                let ty = target.position.y + offset[1];
                let tz = target.position.z + offset[2];
                if !state.initialized {
                    state.initialized = true;
                    state.x = local.position.x;
                    state.y = local.position.y;
                    state.z = local.position.z;
                }
                let mut dx = state.x - tx;
                let mut dy = state.y - ty;
                let mut dz = state.z - tz;
                let mut dist = (dx * dx + dy * dy + dz * dz).sqrt();
                if dist <= 1e-6 {
                    dx = 0.0;
                    dy = -1.0;
                    dz = 0.0;
                    dist = 1.0;
                }
                let nx = dx / dist;
                let ny = dy / dist;
                let nz = dz / dist;
                state.x = tx + nx * length;
                state.y = ty + ny * length;
                state.z = tz + nz * length;

                let rotation = if *align_rotation && *length > 1e-6 {
                    let dir = Vec3::new(nx, ny, nz);
                    Quat::from_rotation_arc(Vec3::NEG_Z, dir)
                } else {
                    local.rotation
                };

                Pose3D {
                    position: Vec3::new(state.x, state.y, state.z),
                    rotation,
                    scale: local.scale,
                }
            }
            HierarchyConstraint3D::Hinge {
                axis: _,
                min_angle: _,
                max_angle: _,
                offset,
                ..
            } => {
                let tx = target.position.x + offset[0];
                let ty = target.position.y + offset[1];
                let tz = target.position.z + offset[2];
                Pose3D {
                    position: Vec3::new(tx, ty, tz),
                    rotation: local.rotation,
                    scale: local.scale,
                }
            }
            HierarchyConstraint3D::AngularSpring {
                target_angle: _,
                stiffness: _,
                damping: _,
                axis: _,
                min_angle: _,
                max_angle: _,
                offset,
                ..
            } => {
                let tx = target.position.x + offset[0];
                let ty = target.position.y + offset[1];
                let tz = target.position.z + offset[2];
                Pose3D {
                    position: Vec3::new(tx, ty, tz),
                    rotation: local.rotation,
                    scale: local.scale,
                }
            }
            HierarchyConstraint3D::Script { .. } => {
                if let Some(ast) = ast {
                    let mut script_out = ScriptTransform3D {
                        x: local.position.x,
                        y: local.position.y,
                        z: local.position.z,
                        rx: local.rotation.x,
                        ry: local.rotation.y,
                        rz: local.rotation.z,
                        rw: local.rotation.w,
                        scale_x: local.scale.x,
                        scale_y: local.scale.y,
                        scale_z: local.scale.z,
                    };
                    let script_target = ScriptTransform3D {
                        x: target.position.x,
                        y: target.position.y,
                        z: target.position.z,
                        rx: target.rotation.x,
                        ry: target.rotation.y,
                        rz: target.rotation.z,
                        rw: target.rotation.w,
                        scale_x: target.scale.x,
                        scale_y: target.scale.y,
                        scale_z: target.scale.z,
                    };
                    let script_local = ScriptTransform3D {
                        x: local.position.x,
                        y: local.position.y,
                        z: local.position.z,
                        rx: local.rotation.x,
                        ry: local.rotation.y,
                        rz: local.rotation.z,
                        rw: local.rotation.w,
                        scale_x: local.scale.x,
                        scale_y: local.scale.y,
                        scale_z: local.scale.z,
                    };
                    let _ = script_engine.eval_3d(
                        ast,
                        script_target,
                        script_local,
                        &mut script_out,
                        time,
                        dt,
                    );
                    let q =
                        Quat::from_xyzw(script_out.rx, script_out.ry, script_out.rz, script_out.rw);
                    let rotation = if q.length_squared() > 1e-6 {
                        q.normalize()
                    } else {
                        Quat::IDENTITY
                    };
                    Pose3D {
                        position: Vec3::new(script_out.x, script_out.y, script_out.z),
                        rotation,
                        scale: Vec3::new(
                            script_out.scale_x,
                            script_out.scale_y,
                            script_out.scale_z,
                        ),
                    }
                } else {
                    local
                }
            }
        }
    }
}
