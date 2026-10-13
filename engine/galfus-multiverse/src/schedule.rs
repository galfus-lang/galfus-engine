use glam::UVec4;
use serde::{Deserialize, Serialize};

use crate::types::{ConnectorEffect, InvocationFilter};

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
}

/// Step describing a connector transfer, blit, or post-processing step between targets.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedConnectorStep {
    pub connector_id: u32,
    pub source_target_id: u32,
    pub destination_target_id: u32,
    pub effect: ConnectorEffect,
    pub custom_shader_id: Option<u32>,
    pub z_index: i32,
}

/// Execution block for a single target, containing all its ordered invocations and connectors.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetExecutionBlock {
    pub target_id: u32,
    pub invocations: Vec<ResolvedInvocationStep>,
    pub connectors: Vec<ResolvedConnectorStep>,
}

/// Fully resolved, deterministic schedule of targets, invocations, and connectors for a frame.
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

    /// Returns the total number of connector steps to be executed in this schedule.
    pub fn total_connectors(&self) -> usize {
        self.target_blocks.iter().map(|b| b.connectors.len()).sum()
    }
}
