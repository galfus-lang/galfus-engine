use std::time::Instant;

use galfus_multiverse::*;
use galfus_platform::*;
use galfus_realm_core::ColorRealm;
use glam::UVec2;

const TARGET_WINDOW: u32 = 1;
const REALM_COLOR: u32 = 10;
const INVOCATION_LEFT: u32 = 100;
const INVOCATION_RIGHT: u32 = 101;

/// Color palette for interactive testing [R, G, B, A]
const COLOR_PALETTE: [(&str, [f32; 4]); 5] = [
    ("Pure White (#FFFFFF)", [1.0, 1.0, 1.0, 1.0]),
    ("Sky Blue (#33B2FF)", [0.2, 0.7, 1.0, 1.0]),
    ("Forest Green (#33D94D)", [0.2, 0.85, 0.3, 1.0]),
    ("Crimson Red (#E6334D)", [0.9, 0.2, 0.3, 1.0]),
    ("Golden Amber (#FFCC33)", [1.0, 0.8, 0.2, 1.0]),
];

/// Runs Demo 1: Multiverse Split-Screen viewports with Sepia post-processing.
pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== Galfus Engine - Demo 1: Split-Screen & Sepia Post-Processing ===");

    // 1. Initialize Platform and Window
    let mut platform = PlatformContext::new()?;
    let config = WindowConfig::new(
        1,
        "Galfus Engine - Demo 1: Split-Screen & Sepia Post-Processing",
    )
    .with_size(1024, 768)
    .with_resizable(true)
    .with_decorations(true);

    let window_id = platform.create_window(config)?;
    let window_raw = platform.get_window(window_id)?.raw_window().clone();

    println!("==> Window created (ID: {window_id})");

    // 2. Initialize Multiverse Context and attach platform window
    let mut mv = MultiverseContext::new();
    mv.attach_window(window_id, window_raw, 1024, 768)?;
    println!("==> Multiverse Context initialized with GPU presentation");

    // 3. Declare Window Target directly
    mv.create_target(
        TARGET_WINDOW,
        TargetDesc {
            kind: TargetKind::Window { window_id },
            size: Some(UVec2::new(1024, 768)),
        },
    )?;
    println!("==> Target declared: Window Target (#1)");

    // 4. Register ColorRealm
    let initial_color = COLOR_PALETTE[0].1;
    let color_realm = ColorRealm::new(REALM_COLOR, initial_color);
    mv.register_realm(Box::new(color_realm))?;
    println!(
        "==> ColorRealm (#10) registered with initial color: {}",
        COLOR_PALETTE[0].0
    );

    // 5. Create Invocations: Split-Screen Viewports
    // Left side: Normal / Raw Blit (0.0 .. 0.5 horizontal normalized)
    mv.create_invocation(
        INVOCATION_LEFT,
        InvocationDesc {
            realm_id: REALM_COLOR,
            target_id: TARGET_WINDOW,
            camera_slot: Some(1),
            viewport: ViewportRect::normalized(0.0, 0.0, 0.5, 1.0),
            filters: Vec::new(),
            z_index: 0,
            enabled: true,
            clear_color: Some(initial_color),
        },
    )?;

    // Right side: Sepia Filter (0.5 .. 1.0 horizontal normalized)
    mv.create_invocation(
        INVOCATION_RIGHT,
        InvocationDesc {
            realm_id: REALM_COLOR,
            target_id: TARGET_WINDOW,
            camera_slot: Some(2),
            viewport: ViewportRect::normalized(0.5, 0.0, 0.5, 1.0),
            filters: vec![InvocationFilter::Sepia],
            z_index: 0,
            enabled: true,
            clear_color: Some(initial_color),
        },
    )?;
    println!("==> Invocations created (Split-Screen):");
    println!("    Left  (#100): Camera #1 -> Viewport (0.0..0.5) -> Normal / Raw");
    println!("    Right (#101): Camera #2 -> Viewport (0.5..1.0) -> Sepia Post-Process Filter");

    // Validate graph resolution
    let schedule = mv.resolve()?;
    println!("==> Multiverse Schedule resolved:");
    println!("    Total target blocks : {}", schedule.target_blocks.len());
    println!("    Total invocations   : {}", schedule.total_invocations());

    println!("\n==> Controls:");
    println!("  - Space / Click : Cycle input color (White -> Blue -> Green -> Red -> Gold)");
    println!("  - S             : Toggle Right Filter (Sepia <-> Normal)");
    println!("  - Escape        : Exit demo\n");

    let mut running = true;
    let mut palette_idx = 0usize;
    let mut sepia_active = true;
    let mut frame_id = 0u64;
    let mut last_instant = Instant::now();

    while running {
        let now = Instant::now();
        let dt = now.duration_since(last_instant).as_secs_f32().max(0.001);
        last_instant = now;

        let events = platform.pump_events()?;
        for event in events {
            match event {
                PlatformEvent::Window(WindowEvent::CloseRequested { .. }) => {
                    running = false;
                }
                PlatformEvent::Window(WindowEvent::Resized { width, height, .. }) => {
                    if width > 0 && height > 0 {
                        mv.update_window_size(window_id, UVec2::new(width, height));
                    }
                }
                PlatformEvent::Keyboard(KeyboardEvent::Input {
                    physical_key: KeyCode::Escape,
                    state,
                    ..
                }) if state.is_pressed() => {
                    running = false;
                }
                PlatformEvent::Keyboard(KeyboardEvent::Input {
                    physical_key: KeyCode::Space,
                    state,
                    ..
                }) if state.is_pressed() => {
                    palette_idx = (palette_idx + 1) % COLOR_PALETTE.len();
                    let (name, color) = COLOR_PALETTE[palette_idx];
                    mv.set_invocation_clear_color(INVOCATION_LEFT, Some(color))?;
                    mv.set_invocation_clear_color(INVOCATION_RIGHT, Some(color))?;
                    println!("--> Switched Color: {name}");
                }
                PlatformEvent::Pointer(PointerEvent::Button {
                    button: PointerButton::Primary,
                    state,
                    ..
                }) if state.is_pressed() => {
                    palette_idx = (palette_idx + 1) % COLOR_PALETTE.len();
                    let (name, color) = COLOR_PALETTE[palette_idx];
                    mv.set_invocation_clear_color(INVOCATION_LEFT, Some(color))?;
                    mv.set_invocation_clear_color(INVOCATION_RIGHT, Some(color))?;
                    println!("--> Switched Color: {name}");
                }
                PlatformEvent::Keyboard(KeyboardEvent::Input {
                    physical_key: KeyCode::KeyS,
                    state,
                    ..
                }) if state.is_pressed() => {
                    sepia_active = !sepia_active;
                    let filters = if sepia_active {
                        vec![InvocationFilter::Sepia]
                    } else {
                        Vec::new()
                    };
                    mv.set_invocation_filters(INVOCATION_RIGHT, filters)?;
                    let mode = if sepia_active {
                        "SEPIA FILTER"
                    } else {
                        "RAW NORMAL (No Filter)"
                    };
                    println!("--> Right Viewport Filter: {mode}");
                }
                _ => {}
            }
        }

        // Dispatch frame through Multiverse pipeline
        mv.dispatch(frame_id, dt)?;
        frame_id = frame_id.wrapping_add(1);
    }

    println!("Demo 1 closed cleanly.");
    Ok(())
}
