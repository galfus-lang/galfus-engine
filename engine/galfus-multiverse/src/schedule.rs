use glam::UVec4;
use serde::{Deserialize, Serialize};

use crate::types::InvocationFilter;

/// Step describing a single realm invocation to be executed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedInvocationStep {
    pub invocation_id: u32,
    pub realm_id: u32,
    pub camera_slot: Option<u32>,
    pub resolved_viewport: UVec4,
    pub z_index: i32,
    pub clear_color: Option<[f32; 4]>,
    pub filters: Vec<InvocationFilter>,
    pub anti_aliasing: Option<crate::types::AntiAliasingMode>,
}

/// Execution block for a single target, containing all its ordered invocations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetExecutionBlock {
    pub target_id: u32,
    pub invocations: Vec<ResolvedInvocationStep>,
}

/// Fully resolved, deterministic schedule of targets and invocations for a frame.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiverseSchedule {
    /// Ordered targets to be rendered in sequence.
    pub target_blocks: Vec<TargetExecutionBlock>,
    /// Cut dependency edges due to cyclic feedback loops (resolved via frame N-1).
    pub soft_cut_edges: Vec<(u32, u32)>,
}

impl MultiverseSchedule {
    /// Returns the total number of invocations to be executed in this schedule.
    pub fn total_invocations(&self) -> usize {
        self.target_blocks.iter().map(|b| b.invocations.len()).sum()
    }
}
