use super::*;
use std::thread;

#[test]
fn test_main_thread_enforcement() {
    let ctx = PlatformContext::new_headless();
    assert_eq!(ctx.main_thread_id(), thread::current().id());
    assert!(ctx.ensure_main_thread().is_ok());

    let worker_thread_id = thread::spawn(|| thread::current().id()).join().unwrap();
    assert_ne!(ctx.main_thread_id(), worker_thread_id);
}

#[test]
fn test_reserved_logical_id_rejection() {
    let mut ctx = PlatformContext::new_headless();
    let config = WindowConfig::new(u32::MAX, "Illegal Window");
    assert!(matches!(
        ctx.create_window(config),
        Err(PlatformError::Core(
            galfus_core::CoreError::ReservedLogicalId { .. }
        ))
    ));
}

#[test]
fn test_headless_mode_disallows_window_creation() {
    let mut ctx = PlatformContext::new_headless();
    let config = WindowConfig::new(1, "Legal Window");
    assert_eq!(
        ctx.create_window(config),
        Err(PlatformError::UnsupportedCapability(
            "Window creation is not supported in headless mode"
        ))
    );
}

#[test]
fn test_clipboard_get_and_set_roundtrip() {
    let mut ctx = PlatformContext::new_headless();
    assert_eq!(ctx.get_clipboard_text().unwrap(), "");
    ctx.set_clipboard_text("Galfus UI Clipboard").unwrap();
    assert_eq!(ctx.get_clipboard_text().unwrap(), "Galfus UI Clipboard");
}
