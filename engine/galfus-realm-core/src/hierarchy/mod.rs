pub mod script;
pub mod solver_2d;
pub mod solver_3d;
pub mod types;

#[cfg(test)]
mod tests;

pub use script::{HierarchyScriptEngine, ScriptTransform2D, ScriptTransform3D};
pub use solver_2d::HierarchyGraph2D;
pub use solver_3d::HierarchyGraph3D;
pub use types::*;

use galfus_core::diagnostics::MemoryCategoryStats;
use serde::Serialize;

/// Diagnostic statistics for a 2D or 3D hierarchy graph.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HierarchyDiagnosticsStats {
    pub anchors_len: usize,
    pub rhai_scripts_len: usize,
    pub physics_managed_len: usize,
    pub estimated_cpu_bytes: u64,
}

impl HierarchyDiagnosticsStats {
    pub fn memory_category(&self, category: &str) -> MemoryCategoryStats {
        MemoryCategoryStats::new(
            category,
            "hierarchy",
            self.estimated_cpu_bytes,
            0,
            self.estimated_cpu_bytes,
            self.anchors_len,
        )
    }
}
