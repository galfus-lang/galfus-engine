use std::cell::RefCell;

use galfus_platform::PlatformContext;

thread_local! {
    static CONTEXT: RefCell<Option<PlatformContext>> = const { RefCell::new(None) };
    static MULTIVERSE: RefCell<Option<galfus_multiverse::MultiverseContext>> = const { RefCell::new(None) };
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
    let mv_dropped = MULTIVERSE.with(|cell| cell.borrow_mut().take().is_some());
    let ctx_dropped = CONTEXT.with(|cell| cell.borrow_mut().take().is_some());
    if mv_dropped || ctx_dropped {
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
        *borrow = Some(galfus_multiverse::MultiverseContext::new());
        Ok(())
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
        Err("Window attachment not supported on wasm32 in this build".into())
    }
}
