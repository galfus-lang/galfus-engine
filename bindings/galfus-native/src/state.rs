use std::cell::RefCell;

use galfus_platform::PlatformContext;

thread_local! {
    static CONTEXT: RefCell<Option<PlatformContext>> = const { RefCell::new(None) };
    static MULTIVERSE: RefCell<Option<galfus_multiverse::MultiverseContext>> = const { RefCell::new(None) };
    static ANIMATION: RefCell<Option<galfus_animation::AnimationContext>> = const { RefCell::new(None) };
}

/// Initializes the global platform context on the calling thread.
pub fn init_context() -> Result<(), String> {
    CONTEXT.with(|cell| {
        let mut borrow = cell.borrow_mut();
        if borrow.is_some() {
            return Err("PlatformContext is already initialized".into());
        }
        let ctx = PlatformContext::new().map_err(|e| e.to_string())?;
        *borrow = Some(ctx);
        Ok(())
    })
}

/// Initializes the global platform context in headless mode (useful for unit tests and CI).
pub fn init_context_headless() -> Result<(), String> {
    CONTEXT.with(|cell| {
        let mut borrow = cell.borrow_mut();
        if borrow.is_some() {
            return Err("PlatformContext is already initialized".into());
        }
        let ctx = PlatformContext::new_headless();
        *borrow = Some(ctx);
        Ok(())
    })
}

/// Shuts down and drops the global platform context and multiverse context.
pub fn shutdown_context() -> Result<(), String> {
    let mut mv_err: Option<String> = None;
    let mv_dropped = MULTIVERSE.with(|cell| {
        let mut borrow = cell.borrow_mut();
        if let Some(multiverse) = borrow.as_mut()
            && let Err(e) = multiverse.shutdown()
        {
            mv_err = Some(e.to_string());
        }
        borrow.take().is_some()
    });
    let anim_dropped = ANIMATION.with(|cell| cell.borrow_mut().take().is_some());
    let ctx_dropped = CONTEXT.with(|cell| cell.borrow_mut().take().is_some());
    crate::ffi_event_batch::clear_pending_events();
    crate::ffi::clear_last_error();
    if let Some(err) = mv_err {
        return Err(err);
    }
    if anim_dropped || mv_dropped || ctx_dropped {
        Ok(())
    } else {
        Err("PlatformContext is not initialized".into())
    }
}

/// Returns `true` if the platform context has been initialized on this thread.
pub fn is_initialized() -> bool {
    CONTEXT.with(|cell| cell.borrow().is_some())
}

/// Executes a closure with an immutable reference to the active platform context.
pub fn with_context<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&PlatformContext) -> Result<R, String>,
{
    CONTEXT.with(|cell| {
        let borrow = cell.borrow();
        match borrow.as_ref() {
            Some(ctx) => f(ctx),
            None => Err("PlatformContext is not initialized".into()),
        }
    })
}

/// Executes a closure with a mutable reference to the active platform context.
pub fn with_context_mut<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut PlatformContext) -> Result<R, String>,
{
    CONTEXT.with(|cell| {
        let mut borrow = cell.borrow_mut();
        match borrow.as_mut() {
            Some(ctx) => f(ctx),
            None => Err("PlatformContext is not initialized".into()),
        }
    })
}

/// Initializes or resets the global multiverse context.
pub fn init_multiverse() -> Result<(), String> {
    MULTIVERSE.with(|cell| {
        let mut borrow = cell.borrow_mut();
        if let Some(multiverse) = borrow.as_mut() {
            multiverse.shutdown().map_err(|e| e.to_string())?;
        }
        *borrow = Some(galfus_multiverse::MultiverseContext::new());
        Ok(())
    })
}

/// Executes a closure with an immutable reference to the active multiverse context.
pub fn with_multiverse<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&galfus_multiverse::MultiverseContext) -> Result<R, String>,
{
    MULTIVERSE.with(|cell| {
        let borrow = cell.borrow();
        match borrow.as_ref() {
            Some(mv) => f(mv),
            None => Err("MultiverseContext is not initialized".into()),
        }
    })
}

/// Executes a closure with a mutable reference to the active multiverse context.
pub fn with_multiverse_mut<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut galfus_multiverse::MultiverseContext) -> Result<R, String>,
{
    MULTIVERSE.with(|cell| {
        let mut borrow = cell.borrow_mut();
        if borrow.is_none() {
            *borrow = Some(galfus_multiverse::MultiverseContext::new());
        }
        match borrow.as_mut() {
            Some(mv) => f(mv),
            None => Err("MultiverseContext is not initialized".into()),
        }
    })
}

/// Detaches a window surface if a Multiverse context exists without initializing a new one.
fn detach_window_from_multiverse(window_id: u32) -> Result<(), String> {
    MULTIVERSE.with(|cell| {
        let mut borrow = cell.borrow_mut();
        if let Some(multiverse) = borrow.as_mut() {
            multiverse
                .detach_window(window_id)
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    })
}

/// Detaches a window from rendering before releasing the platform-owned window.
pub fn close_window(window_id: u32) -> Result<(), String> {
    with_context(|context| {
        context
            .get_window(window_id)
            .map(|_| ())
            .map_err(|e| e.to_string())
    })?;
    detach_window_from_multiverse(window_id)?;
    with_context_mut(|context| context.close_window(window_id).map_err(|e| e.to_string()))
}

/// Attaches a window created in the platform context to the multiverse context.
pub fn attach_window_to_multiverse(window_id: u32) -> Result<(), String> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        let (window_raw, width, height) = with_context(|ctx| {
            let win = ctx.get_window(window_id).map_err(|e| e.to_string())?;
            let raw = win.raw_window().clone();
            let size = raw.inner_size();
            Ok((raw, size.width, size.height))
        })?;

        with_multiverse_mut(|mv| {
            mv.attach_window(window_id, window_raw, width, height)
                .map_err(|e| e.to_string())
        })
    }
    #[cfg(target_arch = "wasm32")]
    {
        let _ = window_id;
        Err("Window attachment not supported on wasm32 in this build".into())
    }
}

/// Executes a closure with an immutable reference to the active animation context.
pub fn with_animation<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&galfus_animation::AnimationContext) -> Result<R, String>,
{
    ANIMATION.with(|cell| {
        let borrow = cell.borrow();
        match borrow.as_ref() {
            Some(anim) => f(anim),
            None => Err("AnimationContext is not initialized".into()),
        }
    })
}

/// Executes a closure with a mutable reference to the active animation context.
pub fn with_animation_mut<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut galfus_animation::AnimationContext) -> Result<R, String>,
{
    ANIMATION.with(|cell| {
        let mut borrow = cell.borrow_mut();
        if borrow.is_none() {
            *borrow = Some(galfus_animation::AnimationContext::new());
        }
        match borrow.as_mut() {
            Some(anim) => f(anim),
            None => Err("AnimationContext is not initialized".into()),
        }
    })
}

/// Collects a full pull-on-demand diagnostic snapshot without lazily initializing
/// any uninitialized thread-local contexts.
pub fn collect_diagnostics_snapshot(
    tag_filter: u64,
) -> galfus_core::diagnostics::DiagnosticsSnapshot {
    use galfus_core::diagnostics::{
        self, DiagnosticsSnapshot, DriftWarning, MemoryBreakdown, MemoryCategoryStats, tags,
    };

    let mut categories: Vec<MemoryCategoryStats> = Vec::new();
    let mut drift_warnings: Vec<DriftWarning> = Vec::new();

    let (context_alive, platform_json) = CONTEXT.with(|cell| {
        let borrow = cell.borrow();
        if let Some(ctx) = borrow.as_ref() {
            let stats = ctx.diagnostic_stats();
            categories.extend(stats.memory_categories());
            drift_warnings.extend(stats.drift_warnings());
            (true, serde_json::to_value(&stats).unwrap_or_default())
        } else {
            (false, serde_json::Value::Null)
        }
    });

    let (multiverse_alive, multiverse_json) = MULTIVERSE.with(|cell| {
        let borrow = cell.borrow();
        if let Some(mv) = borrow.as_ref() {
            let report = mv.diagnostic_report();
            categories.extend(report.memory_categories.clone());
            drift_warnings.extend(report.drift_warnings.clone());
            (true, serde_json::to_value(&report).unwrap_or_default())
        } else {
            (false, serde_json::Value::Null)
        }
    });

    let (animation_alive, animation_json) = ANIMATION.with(|cell| {
        let borrow = cell.borrow();
        if let Some(anim) = borrow.as_ref() {
            let stats = anim.diagnostic_stats();
            categories.push(stats.memory_category());
            drift_warnings.extend(stats.drift_warnings());
            (true, serde_json::to_value(&stats).unwrap_or_default())
        } else {
            (false, serde_json::Value::Null)
        }
    });

    let (pending_len, pending_cap, current_text_bytes) =
        crate::ffi_event_batch::event_batch_diagnostics();
    let ffi_events_bytes = (pending_cap * 160 + current_text_bytes) as u64;
    categories.push(MemoryCategoryStats::new(
        "ffi.events",
        "ffi",
        ffi_events_bytes,
        0,
        ffi_events_bytes,
        pending_len,
    ));

    let counters = diagnostics::counters_snapshot();
    if counters.ffi_cstring_live > 0 {
        drift_warnings.push(DriftWarning {
            category: "ffi".to_string(),
            metric: "ffiCStringLive".to_string(),
            expected: 0,
            actual: counters.ffi_cstring_live,
            delta: counters.ffi_cstring_live as i64,
            message: format!(
                "{} CStrings allocated by FFI have not been freed via galfus_string_free",
                counters.ffi_cstring_live
            ),
        });
    }

    let enabled_mask = diagnostics::enabled_tags_mask();
    DiagnosticsSnapshot {
        frame_index: counters.frame_count,
        timestamp_ms: diagnostics::now_ms(),
        enabled_tags: tags::mask_to_names(enabled_mask),
        memory: MemoryBreakdown::from_categories(categories),
        counters,
        timings: diagnostics::timings_snapshot(tag_filter),
        drift_warnings,
        resources: serde_json::json!({
            "tls": {
                "contextAlive": context_alive,
                "multiverseAlive": multiverse_alive,
                "animationAlive": animation_alive,
                "pendingEventsLen": pending_len,
                "pendingEventsCap": pending_cap,
                "currentTextBytes": current_text_bytes,
            },
            "platform": platform_json,
            "multiverse": multiverse_json,
            "animation": animation_json,
        }),
        recent_logs: diagnostics::recent_logs(64),
    }
}
