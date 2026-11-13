use std::collections::{HashMap, HashSet};

use glam::Vec2;

use super::script::{HierarchyScriptEngine, ScriptTransform2D};
use super::types::{AnchorNode2D, HierarchyConstraint2D, KinematicState2D, Pose2D};

/// Scene graph and hierarchy solver for 2D worlds.
pub struct HierarchyGraph2D {
    anchors: HashMap<u32, AnchorNode2D>,
    script_engine: HierarchyScriptEngine,
}

impl Default for HierarchyGraph2D {
    fn default() -> Self {
        Self::new()
    }
}

impl HierarchyGraph2D {
    /// Creates an empty 2D hierarchy graph.
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
        constraint: HierarchyConstraint2D,
    ) -> Result<(), String> {
        if origin_id == target_id {
            return Err(format!(
                "Cannot attach entity {origin_id} to itself (self-loop detected)"
            ));
        }

        let ast = match &constraint {
            HierarchyConstraint2D::Script { source } => Some(self.script_engine.compile(source)?),
            _ => None,
        };

        let node = AnchorNode2D {
            target_id,
            constraint,
            ast,
            state: KinematicState2D::default(),
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
        local_transforms: &HashMap<u32, Pose2D>,
        world_transforms: &mut HashMap<u32, Pose2D>,
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
        local_transforms: &HashMap<u32, Pose2D>,
        world_transforms: &mut HashMap<u32, Pose2D>,
        anchors: &mut HashMap<u32, AnchorNode2D>,
        script_engine: &HierarchyScriptEngine,
        visiting: &mut HashSet<u32>,
        resolved: &mut HashSet<u32>,
        dt: f32,
        time: f32,
    ) -> Option<Pose2D> {
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
            // World pose is already computed by the physics simulation.
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
        let world = Self::apply_constraint_2d(
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
    fn apply_constraint_2d(
        constraint: &HierarchyConstraint2D,
        ast: Option<&rhai::AST>,
        state: &mut KinematicState2D,
        target: Pose2D,
        local: Pose2D,
        script_engine: &HierarchyScriptEngine,
        dt: f32,
        time: f32,
    ) -> Pose2D {
        match constraint {
            HierarchyConstraint2D::Fixed {
                offset,
                rotation_offset,
                ..
            } => {
                let cos_t = target.rotation.cos();
                let sin_t = target.rotation.sin();
                let ox = offset[0] + local.position.x;
                let oy = offset[1] + local.position.y;
                let rx = ox * target.scale.x;
                let ry = oy * target.scale.y;
                let world_pos =
                    target.position + Vec2::new(rx * cos_t - ry * sin_t, rx * sin_t + ry * cos_t);
                Pose2D {
                    position: world_pos,
                    rotation: target.rotation + rotation_offset + local.rotation,
                    scale: target.scale * local.scale,
                }
            }
            HierarchyConstraint2D::TranslationOnly { offset } => Pose2D {
                position: target.position + Vec2::from(*offset) + local.position,
                rotation: local.rotation,
                scale: local.scale,
            },
            HierarchyConstraint2D::RotationOnly { rotation_offset } => Pose2D {
                position: local.position,
                rotation: target.rotation + rotation_offset + local.rotation,
                scale: local.scale,
            },
            HierarchyConstraint2D::LookAt => {
                let dir = target.position - local.position;
                let rotation = if dir.length_squared() > 1e-6 {
                    dir.y.atan2(dir.x)
                } else {
                    local.rotation
                };
                Pose2D {
                    position: local.position,
                    rotation,
                    scale: local.scale,
                }
            }
            HierarchyConstraint2D::Spring {
                stiffness,
                damping,
                rest_length,
                offset,
                ..
            } => {
                let tx = target.position.x + offset[0];
                let ty = target.position.y + offset[1];
                if !state.initialized {
                    state.initialized = true;
                    state.x = local.position.x;
                    state.y = local.position.y;
                    state.vx = 0.0;
                    state.vy = 0.0;
                }
                let frame_dt = dt.clamp(1e-4, 0.1);
                let dx = state.x - tx;
                let dy = state.y - ty;
                let dist = dx.hypot(dy);
                let stretch = dist - rest_length;
                let nx = if dist > 1e-6 { dx / dist } else { 0.0 };
                let ny = if dist > 1e-6 { dy / dist } else { 1.0 };
                let ax = -stiffness * stretch * nx - damping * state.vx;
                let ay = -stiffness * stretch * ny - damping * state.vy;
                state.vx += ax * frame_dt;
                state.vy += ay * frame_dt;
                state.x += state.vx * frame_dt;
                state.y += state.vy * frame_dt;

                Pose2D {
                    position: Vec2::new(state.x, state.y),
                    rotation: local.rotation,
                    scale: local.scale,
                }
            }
            HierarchyConstraint2D::Rope {
                max_length, offset, ..
            } => {
                let tx = target.position.x + offset[0];
                let ty = target.position.y + offset[1];
                if !state.initialized {
                    state.initialized = true;
                    state.x = local.position.x;
                    state.y = local.position.y;
                }
                let dx = state.x - tx;
                let dy = state.y - ty;
                let dist = dx.hypot(dy);
                if dist > *max_length && dist > 1e-6 {
                    let scale = *max_length / dist;
                    state.x = tx + dx * scale;
                    state.y = ty + dy * scale;
                }
                Pose2D {
                    position: Vec2::new(state.x, state.y),
                    rotation: local.rotation,
                    scale: local.scale,
                }
            }
            HierarchyConstraint2D::Chain {
                length,
                align_rotation,
                offset,
                ..
            } => {
                let tx = target.position.x + offset[0];
                let ty = target.position.y + offset[1];
                if !state.initialized {
                    state.initialized = true;
                    state.x = local.position.x;
                    state.y = local.position.y;
                }
                let mut dx = state.x - tx;
                let mut dy = state.y - ty;
                let mut dist = dx.hypot(dy);
                if dist <= 1e-6 {
                    dx = if local.position.x != 0.0 || local.position.y != 0.0 {
                        local.position.x
                    } else {
                        0.0
                    };
                    dy = if local.position.x != 0.0 || local.position.y != 0.0 {
                        local.position.y
                    } else {
                        -1.0
                    };
                    dist = dx.hypot(dy).max(1e-4);
                }
                let nx = dx / dist;
                let ny = dy / dist;
                state.x = tx + nx * length;
                state.y = ty + ny * length;

                let rotation = if *align_rotation && *length > 1e-6 {
                    (-ny).atan2(-nx)
                } else {
                    local.rotation
                };

                Pose2D {
                    position: Vec2::new(state.x, state.y),
                    rotation,
                    scale: local.scale,
                }
            }
            HierarchyConstraint2D::Hinge {
                min_angle,
                max_angle,
                offset,
                ..
            } => {
                let tx = target.position.x + offset[0];
                let ty = target.position.y + offset[1];
                let rotation = if let (Some(min), Some(max)) = (min_angle, max_angle) {
                    local.rotation.clamp(*min, *max)
                } else {
                    local.rotation
                };
                Pose2D {
                    position: Vec2::new(tx, ty),
                    rotation,
                    scale: local.scale,
                }
            }
            HierarchyConstraint2D::AngularSpring {
                target_angle,
                stiffness,
                damping,
                min_angle,
                max_angle,
                offset,
                ..
            } => {
                let tx = target.position.x + offset[0];
                let ty = target.position.y + offset[1];
                if !state.initialized {
                    state.initialized = true;
                    state.angle = local.rotation;
                    state.w = 0.0;
                }
                let frame_dt = dt.clamp(1e-4, 0.1);
                let diff = target_angle - state.angle;
                let accel = diff * stiffness - state.w * damping;
                state.w += accel * frame_dt;
                state.angle += state.w * frame_dt;

                if let Some(min) = min_angle
                    && state.angle < *min
                {
                    state.angle = *min;
                    state.w = 0.0;
                }
                if let Some(max) = max_angle
                    && state.angle > *max
                {
                    state.angle = *max;
                    state.w = 0.0;
                }

                Pose2D {
                    position: Vec2::new(tx, ty),
                    rotation: state.angle,
                    scale: local.scale,
                }
            }
            HierarchyConstraint2D::Script { .. } => {
                if let Some(ast) = ast {
                    let mut script_out = ScriptTransform2D::new(
                        local.position.x,
                        local.position.y,
                        local.rotation,
                        local.scale.x,
                        local.scale.y,
                    );
                    let script_target = ScriptTransform2D::new(
                        target.position.x,
                        target.position.y,
                        target.rotation,
                        target.scale.x,
                        target.scale.y,
                    );
                    let script_local = ScriptTransform2D::new(
                        local.position.x,
                        local.position.y,
                        local.rotation,
                        local.scale.x,
                        local.scale.y,
                    );
                    if let Err(err) = script_engine.eval_2d(
                        ast,
                        script_target,
                        script_local,
                        &mut script_out,
                        time,
                        dt,
                    ) {
                        eprintln!("[Rhai eval_2d error] {}", err);
                    }
                    Pose2D {
                        position: Vec2::new(script_out.x, script_out.y),
                        rotation: script_out.rotation,
                        scale: Vec2::new(script_out.scale_x, script_out.scale_y),
                    }
                } else {
                    local
                }
            }
        }
    }
}
