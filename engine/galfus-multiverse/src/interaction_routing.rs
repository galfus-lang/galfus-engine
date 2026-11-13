//! Routing of pointer hits through windows and texture presentation surfaces.

use std::collections::{HashMap, HashSet};

use galfus_core::interaction::{InteractionGeometry, InteractionHit};
use galfus_realm_core::{Realm, RealmKind};
use glam::{UVec2, Vec2};

use crate::interaction::InteractionSurface;
use crate::types::{InvocationDesc, TargetDesc, TargetKind, TargetTextureBinding};

/// The window realm counts as the first presentation level.
const MAX_PRESENTATION_DEPTH: usize = 3;

pub(crate) struct InteractionRouting<'a> {
    pub window_sizes: &'a HashMap<u32, UVec2>,
    pub targets: &'a HashMap<u32, TargetDesc>,
    pub invocations: &'a HashMap<u32, InvocationDesc>,
    pub realms: &'a HashMap<u32, Box<dyn Realm>>,
    pub bindings: &'a [TargetTextureBinding],
    pub surfaces: &'a HashMap<(u32, u32), InteractionSurface>,
    pub cut_edges: &'a [(u32, u32)],
}

impl InteractionRouting<'_> {
    /// Determines whether a realm is reachable from a window's current presentation graph.
    pub fn realm_is_presented(&self, window_id: u32, realm_id: u32, target_id: u32) -> bool {
        let window_size = self
            .window_sizes
            .get(&window_id)
            .copied()
            .unwrap_or(UVec2::new(800, 600));
        let mut pending: Vec<_> = self
            .targets
            .iter()
            .filter_map(|(&id, target)| {
                matches!(target.kind, TargetKind::Window { window_id: id } if id == window_id)
                    .then_some((id, window_size, 1usize))
            })
            .collect();
        let mut visited = HashMap::new();
        while let Some((destination, size, depth)) = pending.pop() {
            if visited
                .get(&destination)
                .is_some_and(|previous| *previous <= depth)
            {
                continue;
            }
            visited.insert(destination, depth);
            for inv in self
                .invocations
                .values()
                .filter(|inv| inv.enabled && inv.target_id == destination)
            {
                let Some(viewport) = inv.viewport.resolve_clipped(size) else {
                    continue;
                };
                let extent = Vec2::new(viewport.z as f32, viewport.w as f32);
                let Some(realm) = self.realms.get(&inv.realm_id) else {
                    continue;
                };
                let pickable = match realm.kind() {
                    RealmKind::TwoD => realm
                        .viewport_point_2d(inv.camera_slot, extent * 0.5, extent)
                        .is_some(),
                    RealmKind::ThreeD => realm
                        .viewport_ray_3d(inv.camera_slot, extent * 0.5, extent)
                        .is_some(),
                    _ => false,
                };
                if !pickable {
                    continue;
                }
                if inv.realm_id == realm_id && destination == target_id {
                    return true;
                }
                if depth >= MAX_PRESENTATION_DEPTH {
                    continue;
                }
                for surface in self
                    .surfaces
                    .values()
                    .filter(|surface| surface.realm_id == inv.realm_id)
                {
                    if !realm.has_interactive_collider(surface.model_id, surface.collider_id) {
                        continue;
                    }
                    let Some(binding) = self.bindings.iter().find(|binding| {
                        binding.realm_id == surface.realm_id && binding.slot == surface.slot
                    }) else {
                        continue;
                    };
                    let source = binding.source_target_id;
                    if self.cut_edges.contains(&(source, destination)) {
                        continue;
                    }
                    if let Some(TargetDesc {
                        kind: TargetKind::Texture { width, height, .. },
                        ..
                    }) = self.targets.get(&source)
                        && *width > 0
                        && *height > 0
                    {
                        pending.push((source, UVec2::new(*width, *height), depth + 1));
                    }
                }
            }
        }
        false
    }

    pub fn pick_window(&self, window_id: u32, position: Vec2) -> Option<InteractionHit> {
        let size = self
            .window_sizes
            .get(&window_id)
            .copied()
            .unwrap_or(UVec2::new(800, 600));
        self.pick(position, size, |_, target| {
            matches!(target.kind, TargetKind::Window { window_id: id } if id == window_id)
        }, &mut HashSet::new())
    }

    fn pick(
        &self,
        position: Vec2,
        size: UVec2,
        matches_target: impl Fn(u32, &TargetDesc) -> bool,
        visited: &mut HashSet<u32>,
    ) -> Option<InteractionHit> {
        let mut candidates: Vec<_> = self
            .invocations
            .iter()
            .filter(|(_, inv)| {
                inv.enabled
                    && self
                        .targets
                        .get(&inv.target_id)
                        .is_some_and(|target| matches_target(inv.target_id, target))
            })
            .collect();
        candidates.sort_by_key(|(id, inv)| std::cmp::Reverse((inv.z_index, **id)));
        for (_, inv) in candidates {
            let Some(viewport) = inv.viewport.resolve_clipped(size) else {
                continue;
            };
            let origin = Vec2::new(viewport.x as f32, viewport.y as f32);
            let extent = Vec2::new(viewport.z as f32, viewport.w as f32);
            let local = position - origin;
            if local.x < 0.0 || local.y < 0.0 || local.x >= extent.x || local.y >= extent.y {
                continue;
            }
            let Some(realm) = self.realms.get(&inv.realm_id) else {
                continue;
            };
            let hit = match realm.kind() {
                RealmKind::TwoD => realm
                    .viewport_point_2d(inv.camera_slot, local, extent)
                    .and_then(|point| realm.pick_2d(inv.camera_slot, point))
                    .map(|hit| InteractionHit {
                        realm_id: inv.realm_id,
                        model_id: hit.model_id,
                        collider_id: hit.collider_id,
                        presentation_target_id: inv.target_id,
                        local_pos: hit.point.to_array(),
                        uv: hit.uv.to_array(),
                        geometry: InteractionGeometry::TwoD {
                            point: hit.point.to_array(),
                            normal: hit.normal.to_array(),
                        },
                        element_id: hit.element_id,
                    }),
                RealmKind::ThreeD => realm
                    .viewport_ray_3d(inv.camera_slot, local, extent)
                    .and_then(|(ray, max)| realm.pick_3d_with_limit(inv.camera_slot, ray, max))
                    .map(|hit| InteractionHit {
                        realm_id: inv.realm_id,
                        model_id: hit.model_id,
                        collider_id: hit.collider_id,
                        presentation_target_id: inv.target_id,
                        local_pos: [hit.point.x, hit.point.y],
                        uv: hit.uv.to_array(),
                        geometry: InteractionGeometry::ThreeD {
                            point: hit.point.to_array(),
                            normal: hit.normal.to_array(),
                            distance: hit.distance,
                        },
                        element_id: None,
                    }),
                _ => None,
            };
            if let Some(hit) = hit {
                visited.insert(inv.target_id);
                let nested = self.descend(&hit, inv.target_id, visited);
                visited.remove(&inv.target_id);
                return Some(nested.unwrap_or(hit));
            }
        }
        None
    }

    fn descend(
        &self,
        hit: &InteractionHit,
        destination: u32,
        visited: &mut HashSet<u32>,
    ) -> Option<InteractionHit> {
        if visited.len() >= MAX_PRESENTATION_DEPTH {
            return None;
        }
        let surface = self.surfaces.get(&(hit.realm_id, hit.collider_id))?;
        if surface.model_id != hit.model_id {
            return None;
        }
        let binding = self
            .bindings
            .iter()
            .find(|b| b.realm_id == hit.realm_id && b.slot == surface.slot)?;
        let source = binding.source_target_id;
        if visited.contains(&source) || self.cut_edges.contains(&(source, destination)) {
            return None;
        }
        let target = self.targets.get(&source)?;
        let TargetKind::Texture { width, height, .. } = target.kind else {
            return None;
        };
        if width == 0 || height == 0 {
            return None;
        }
        let [u, mut v] = hit.uv;
        if !u.is_finite()
            || !v.is_finite()
            || !(0.0..=1.0).contains(&u)
            || !(0.0..=1.0).contains(&v)
        {
            return None;
        }
        if surface.flip_y {
            v = 1.0 - v;
        }
        let position = Vec2::new(
            u.min(1.0 - f32::EPSILON) * width as f32,
            v.min(1.0 - f32::EPSILON) * height as f32,
        );
        self.pick(
            position,
            UVec2::new(width, height),
            |candidate_id, _| candidate_id == source,
            visited,
        )
    }
}

#[cfg(test)]
#[path = "interaction_routing_tests.rs"]
mod tests;
