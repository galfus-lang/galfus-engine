//! Node-API bindings for the tagged debug & diagnostic metrics system.

use super::*;

#[napi]
pub fn diagnostics_configure(env: Env, config_val: JsUnknown) -> Result<()> {
    let config: galfus_core::diagnostics::DiagnosticsConfig = env.from_js_value(config_val)?;
    galfus_core::diagnostics::configure(&config);
    Ok(())
}

#[napi]
pub fn diagnostics_set_tags(tags_mask: u32) -> Result<()> {
    galfus_core::diagnostics::set_enabled_tags_mask(u64::from(tags_mask));
    Ok(())
}

#[napi]
pub fn diagnostics_snapshot(env: Env, tags_mask: Option<u32>) -> Result<JsUnknown> {
    let snapshot = crate::state::collect_diagnostics_snapshot(u64::from(tags_mask.unwrap_or(0)));
    env.to_js_value(&snapshot)
}

#[napi]
pub fn diagnostics_drain_logs(env: Env, max_entries: Option<u32>) -> Result<JsUnknown> {
    let logs = galfus_core::diagnostics::drain_logs(max_entries.unwrap_or(512) as usize);
    env.to_js_value(&logs)
}

#[napi]
pub fn diagnostics_reset() -> Result<()> {
    galfus_core::diagnostics::reset();
    Ok(())
}
