//! Diagnostic snapshot aggregation for [`MultiverseContext`].

use std::collections::BTreeMap;

use galfus_core::diagnostics::{DriftWarning, MemoryCategoryStats, RealmDiagnosticReport};
use serde::Serialize;

use crate::context::MultiverseContext;
use crate::error::MultiverseResult;

pub(crate) fn dispatch_instrumented(
    ctx: &mut MultiverseContext,
    frame_id: u64,
    delta_time: f32,
) -> MultiverseResult<()> {
    let _span = galfus_core::diagnostics::SpanGuard::new(
        galfus_core::diagnostics::tags::FRAME,
        "multiverse.dispatch",
    );
    galfus_core::diagnostics::counter_add(galfus_core::diagnostics::MetricCounter::FrameCount, 1);
    let presented_windows = crate::executor::execute_frame(ctx, frame_id, delta_time)?;
    {
        let _pub_span = galfus_core::diagnostics::SpanGuard::new(
            galfus_core::diagnostics::tags::INTERACTION,
            "interaction.publish_frame",
        );
        ctx.publish_interaction_frame(&presented_windows);
    }
    Ok(())
}

/// Aggregated diagnostics collected from [`MultiverseContext`], its [`GpuManager`],
/// and all registered realms.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiverseDiagnosticReport {
    pub targets: usize,
    pub realms_count: usize,
    pub invocations: usize,
    pub bindings: usize,
    pub surfaces: usize,
    pub window_sizes: usize,
    pub interaction_frames: usize,
    pub target_textures: usize,
    pub target_history_textures: usize,
    pub scratch_textures: usize,
    pub taa_history: usize,
    pub ping_pong_alive: bool,
    pub smaa_intermediates_alive: bool,
    pub post_processor: PostProcessorDiagnosticStats,
    pub interaction: MultiverseInteractionDiagnosticStats,
    pub gpu: Option<galfus_gpu_manager::manager::GpuManagerDiagnostics>,
    pub realms: BTreeMap<u32, serde_json::Value>,
    #[serde(skip)]
    pub memory_categories: Vec<MemoryCategoryStats>,
    #[serde(skip)]
    pub drift_warnings: Vec<DriftWarning>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostProcessorDiagnosticStats {
    pub pipelines: usize,
    pub custom_shaders: usize,
    pub smaa_pipelines: usize,
    pub taa_pipelines: usize,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiverseInteractionDiagnosticStats {
    pub surfaces: usize,
    pub ui_surfaces: usize,
    pub pointers: usize,
    pub queued_events: usize,
    pub queued_events_cap: usize,
}

impl MultiverseContext {
    /// Collects a full pull-on-demand diagnostic report across GPU manager,
    /// multiverse graph/postprocess/interaction state, and every registered realm.
    pub fn diagnostic_report(&self) -> MultiverseDiagnosticReport {
        let mut memory_categories = Vec::new();
        let mut drift_warnings = Vec::new();

        let gpu_stats = if let Some(gpu) = &self.gpu_manager {
            memory_categories.extend(gpu.memory_categories());
            Some(gpu.diagnostic_stats())
        } else {
            None
        };

        let post_processor = self
            .post_processor
            .as_ref()
            .map(|pp| {
                let (pipelines, custom_shaders, smaa_pipelines, taa_pipelines) =
                    pp.diagnostic_counts();
                PostProcessorDiagnosticStats {
                    pipelines,
                    custom_shaders,
                    smaa_pipelines,
                    taa_pipelines,
                }
            })
            .unwrap_or_default();

        let (surfaces, ui_surfaces, pointers, queued_events, queued_events_cap) =
            self.interaction.diagnostic_counts();
        let interaction = MultiverseInteractionDiagnosticStats {
            surfaces,
            ui_surfaces,
            pointers,
            queued_events,
            queued_events_cap,
        };

        // Multiverse CPU state category
        let mv_cpu_bytes = (self.targets.capacity() * 128
            + self.invocations.capacity() * 160
            + self.bindings.capacity() * 32
            + self.interaction_frames.capacity() * 256
            + queued_events_cap * 128) as u64;
        memory_categories.push(MemoryCategoryStats::new(
            "multiverse.graph_and_interaction",
            "multiverse",
            mv_cpu_bytes,
            0,
            mv_cpu_bytes,
            self.targets.len()
                + self.invocations.len()
                + self.interaction_frames.len()
                + queued_events,
        ));

        if self.interaction_frames.len() > self.surfaces.len()
            && !self.interaction_frames.is_empty()
        {
            let delta = self.interaction_frames.len() as i64 - self.surfaces.len() as i64;
            drift_warnings.push(DriftWarning {
                category: "multiverse".to_string(),
                metric: "interactionFramesLen".to_string(),
                expected: self.surfaces.len() as u64,
                actual: self.interaction_frames.len() as u64,
                delta,
                message: format!(
                    "interaction_frames retains {delta} snapshots beyond active attached surfaces"
                ),
            });
        }

        // Collect per-realm reports
        let mut realms = BTreeMap::new();
        for (&realm_id, realm) in &self.realms {
            if let Some(RealmDiagnosticReport {
                realm_kind,
                memory_categories: r_cats,
                drift_warnings: r_drifts,
                details,
            }) = realm.diagnostic_report()
            {
                memory_categories.extend(r_cats);
                drift_warnings.extend(r_drifts);
                realms.insert(
                    realm_id,
                    serde_json::json!({
                        "kind": realm_kind,
                        "details": details,
                    }),
                );
            }
        }

        MultiverseDiagnosticReport {
            targets: self.targets.len(),
            realms_count: self.realms.len(),
            invocations: self.invocations.len(),
            bindings: self.bindings.len(),
            surfaces: self.surfaces.len(),
            window_sizes: self.window_sizes.len(),
            interaction_frames: self.interaction_frames.len(),
            target_textures: self.target_textures.len(),
            target_history_textures: self.target_history_textures.len(),
            scratch_textures: self.scratch_textures.len(),
            taa_history: self.taa_history.len(),
            ping_pong_alive: self.ping_pong_texture.is_some(),
            smaa_intermediates_alive: self.smaa_intermediates.is_some(),
            post_processor,
            interaction,
            gpu: gpu_stats,
            realms,
            memory_categories,
            drift_warnings,
        }
    }
}
