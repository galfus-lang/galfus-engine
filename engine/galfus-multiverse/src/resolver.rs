use std::collections::{HashMap, HashSet, VecDeque};

use glam::UVec2;

use crate::error::MultiverseResult;
use crate::schedule::{MultiverseSchedule, ResolvedInvocationStep, TargetExecutionBlock};
use crate::types::{InvocationDesc, TargetDesc, TargetKind, TargetTextureBinding};

/// Resolves the dependencies between targets and builds a deterministic execution schedule.
pub fn resolve_schedule(
    targets: &HashMap<u32, TargetDesc>,
    invocations: &HashMap<u32, InvocationDesc>,
    bindings: &[TargetTextureBinding],
    window_sizes: &HashMap<u32, UVec2>,
) -> MultiverseResult<MultiverseSchedule> {
    // 1. Map which targets are used by which realms
    let mut targets_by_realm: HashMap<u32, Vec<u32>> = HashMap::new();
    for inv in invocations.values() {
        if inv.enabled {
            targets_by_realm
                .entry(inv.realm_id)
                .or_default()
                .push(inv.target_id);
        }
    }
    for list in targets_by_realm.values_mut() {
        list.sort();
        list.dedup();
    }

    // 2. Build target dependency edges: (source_target -> dependent_target)
    // If Realm R reads from SourceTarget (via TargetTextureBinding), and Realm R renders to DestTarget,
    // then SourceTarget must be rendered BEFORE DestTarget.
    let mut edges: Vec<(u32, u32)> = Vec::new();
    for binding in bindings {
        if let Some(dest_targets) = targets_by_realm.get(&binding.realm_id) {
            for dest_target in dest_targets {
                if *dest_target != binding.source_target_id
                    && targets.contains_key(&binding.source_target_id)
                    && targets.contains_key(dest_target)
                {
                    edges.push((binding.source_target_id, *dest_target));
                }
            }
        }
    }

    edges.sort();
    edges.dedup();

    // 3. Topological sort of targets with soft cuts for cycles
    let all_targets: HashSet<u32> = targets.keys().copied().collect();
    let (ordered_target_ids, soft_cut_edges) = topological_sort_targets(&all_targets, &edges);

    // 4. Group invocations per target and sort them by z_index
    let mut invocations_by_target: HashMap<u32, Vec<(u32, &InvocationDesc)>> = HashMap::new();
    for (inv_id, inv) in invocations {
        if inv.enabled && targets.contains_key(&inv.target_id) {
            invocations_by_target
                .entry(inv.target_id)
                .or_default()
                .push((*inv_id, inv));
        }
    }

    let mut target_blocks = Vec::with_capacity(ordered_target_ids.len());

    for target_id in ordered_target_ids {
        let Some(target) = targets.get(&target_id) else {
            continue;
        };

        let target_size = match &target.kind {
            TargetKind::Window { window_id } => window_sizes
                .get(window_id)
                .copied()
                .or(target.size)
                .unwrap_or(UVec2::new(1, 1)),
            TargetKind::Texture { width, height, .. } => UVec2::new(*width, *height),
        };

        let mut block_invocations = Vec::new();
        if let Some(mut target_invs) = invocations_by_target.remove(&target_id) {
            // Sort by z_index, then by invocation_id for deterministic tie-breaking
            target_invs.sort_by_key(|(id, inv)| (inv.z_index, *id));

            for (inv_id, inv) in target_invs {
                let resolved_viewport = inv.viewport.resolve(target_size);
                block_invocations.push(ResolvedInvocationStep {
                    invocation_id: inv_id,
                    realm_id: inv.realm_id,
                    camera_slot: inv.camera_slot,
                    resolved_viewport,
                    z_index: inv.z_index,
                    clear_color: inv.clear_color,
                    filters: inv.filters.clone(),
                });
            }
        }

        // Include target if it has active invocations
        if !block_invocations.is_empty() {
            target_blocks.push(TargetExecutionBlock {
                target_id,
                invocations: block_invocations,
            });
        }
    }

    Ok(MultiverseSchedule {
        target_blocks,
        soft_cut_edges,
    })
}

/// Topological sort with cycle breaking via soft cuts (Kahn's algorithm).
fn topological_sort_targets(
    nodes: &HashSet<u32>,
    edges: &[(u32, u32)],
) -> (Vec<u32>, Vec<(u32, u32)>) {
    let mut final_order = Vec::new();
    let mut cut_edges = Vec::new();
    let mut remaining_nodes: HashSet<u32> = nodes.iter().copied().collect();
    let mut remaining_edges: Vec<(u32, u32)> = edges.to_vec();
    let mut guard = 0;

    while !remaining_nodes.is_empty() {
        guard += 1;
        if guard > 64 {
            let mut leftover: Vec<_> = remaining_nodes.into_iter().collect();
            leftover.sort();
            final_order.extend(leftover);
            break;
        }

        let order = kahn_order(&remaining_nodes, &remaining_edges);
        for node in &order {
            remaining_nodes.remove(node);
        }
        final_order.extend(order);

        if remaining_nodes.is_empty() {
            break;
        }

        // Cycle detected: cut edges between remaining nodes
        let mut pruned = Vec::new();
        for edge in remaining_edges {
            if remaining_nodes.contains(&edge.0) && remaining_nodes.contains(&edge.1) {
                cut_edges.push(edge);
            } else {
                pruned.push(edge);
            }
        }
        remaining_edges = pruned;
    }

    (final_order, cut_edges)
}

fn kahn_order(nodes: &HashSet<u32>, edges: &[(u32, u32)]) -> Vec<u32> {
    let mut in_degrees: HashMap<u32, usize> = nodes.iter().map(|id| (*id, 0)).collect();

    for edge in edges {
        if in_degrees.contains_key(&edge.1) {
            *in_degrees.entry(edge.1).or_insert(0) += 1;
        }
    }

    let mut queue_vec: Vec<u32> = in_degrees
        .iter()
        .filter_map(|(id, count)| if *count == 0 { Some(*id) } else { None })
        .collect();
    queue_vec.sort(); // Deterministic tie-breaking
    let mut queue: VecDeque<u32> = queue_vec.into();

    let mut edges_by_source: HashMap<u32, Vec<u32>> = HashMap::new();
    for edge in edges {
        edges_by_source.entry(edge.0).or_default().push(edge.1);
    }

    let mut order = Vec::new();
    while let Some(node) = queue.pop_front() {
        order.push(node);
        if let Some(children) = edges_by_source.get(&node) {
            for child in children {
                if let Some(count) = in_degrees.get_mut(child) {
                    *count = count.saturating_sub(1);
                    if *count == 0 {
                        queue.push_back(*child);
                    }
                }
            }
        }
    }

    order
}
