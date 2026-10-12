use std::num::NonZeroU32;
use std::time::Duration;

use galfus_platform::{
    CursorGrabMode, CursorIcon, KeyCode, KeyboardEvent, PlatformContext, PlatformEvent,
    PointerButton, PointerEvent, ScrollDelta, WindowConfig, WindowEvent,
};
use glam::Vec2;

/// Runs Demo 0: Platform, Pointer, and Keyboard event normalization.
pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== Galfus Engine - Demo 0: Platform & Input ===");

    let mut platform = PlatformContext::new()?;
    let caps = platform.capabilities();
    println!("Platform Capabilities:");
    println!(" - Multiple windows : {}", caps.supports_multiple_windows);
    println!(" - Positioning      : {}", caps.supports_window_positioning);
    println!(" - Cursor grab      : {}", caps.supports_cursor_grab);
    println!(" - Gamepad          : {}", caps.supports_gamepad);
    println!(" - Audio            : {}", caps.supports_audio);
    println!(" - Headless         : {}", caps.is_headless);

    let config = WindowConfig::new(1, "Galfus Engine - Demo 0: Platform & Input")
        .with_size(1024, 768)
        .with_resizable(true)
        .with_decorations(true);

    let window_id = platform.create_window(config)?;
    println!("\n==> Window created successfully!");
    println!("    Logical ID   : {window_id}");

    let raw_winit_window = {
        let window = platform.get_window(window_id)?;
        println!("    Inner Size   : {:?}", window.inner_size());
        println!("    Outer Size   : {:?}", window.outer_size());
        println!("    Scale Factor : {}", window.scale_factor());
        println!("    Position     : {:?}", window.position());
        window.raw_window().clone()
    };

    let context = softbuffer::Context::new(raw_winit_window.clone())?;
    let mut surface = softbuffer::Surface::new(&context, raw_winit_window)?;

    println!("\n==> Controls:");
    println!("  - Mouse Move      : Reticle tracks pointer coordinates");
    println!("  - Left Click      : Cycle base background color");
    println!("  - Right Click     : Cycle cursor icon");
    println!("  - Middle Click    : Toggle cursor lock (Locked <-> None)");
    println!("  - Mouse Wheel     : Adjust screen brightness");
    println!("  - WASD / Arrows   : Move reticle via keyboard (Hold Shift for sprint)");
    println!("  - Spacebar        : Cycle base background color via keyboard");
    println!("  - 1..4 Keys       : Direct cursor icon selection");
    println!("  - Escape          : Clean exit application\n");

    let mut frame = 0u64;
    let mut running = true;
    let mut width = 1024u32;
    let mut height = 768u32;

    let palette: [u32; 5] = [
        0xFF1E2028, // Dark slate
        0xFF1A365D, // Deep blue
        0xFF22543D, // Forest green
        0xFF44337A, // Purple
        0xFF742A2A, // Wine red
    ];
    let mut palette_idx = 0usize;

    let cursor_icons = [
        CursorIcon::Default,
        CursorIcon::Pointer,
        CursorIcon::Crosshair,
        CursorIcon::Grab,
    ];
    let mut cursor_icon_idx = 0usize;
    let mut cursor_grabbed = false;

    let mut pointer_pos = Vec2::new(512.0, 384.0);
    let mut brightness_mod = 0i32;

    while running {
        let events = platform.pump_events()?;
        for event in events {
            match event {
                PlatformEvent::Window(WindowEvent::CloseRequested { window_id: id }) => {
                    println!("\n[Event] Window {id} close requested. Exiting...");
                    platform.close_window(id)?;
                    running = false;
                }
                PlatformEvent::Window(WindowEvent::Resized {
                    window_id: id,
                    width: w,
                    height: h,
                    ..
                }) => {
                    println!("[Event] Window {id} resized to {w}x{h}");
                    width = w.max(1);
                    height = h.max(1);
                }
                PlatformEvent::Window(WindowEvent::FocusChanged {
                    window_id: id,
                    focused,
                }) => {
                    println!("[Event] Window {id} focus changed: {focused}");
                }
                PlatformEvent::Pointer(PointerEvent::Move {
                    position,
                    delta,
                    pressure,
                    ..
                }) => {
                    pointer_pos = position;
                    if frame.is_multiple_of(60) {
                        println!(
                            "[Pointer Move] pos=({:.1}, {:.1}) delta=({:.1}, {:.1}) pressure={pressure:.2}",
                            position.x, position.y, delta.x, delta.y
                        );
                    }
                }
                PlatformEvent::Pointer(PointerEvent::Button {
                    button,
                    state,
                    position,
                    pressure,
                    ..
                }) => {
                    println!(
                        "[Pointer Button] {:?} {:?} at ({:.1}, {:.1}) pressure={pressure:.2}",
                        button, state, position.x, position.y
                    );
                    if state.is_pressed() {
                        match button {
                            PointerButton::Primary => {
                                palette_idx = (palette_idx + 1) % palette.len();
                                println!("  -> Background color cycled to palette #{palette_idx}");
                            }
                            PointerButton::Secondary => {
                                cursor_icon_idx = (cursor_icon_idx + 1) % cursor_icons.len();
                                let next_icon = cursor_icons[cursor_icon_idx];
                                println!("  -> Changing cursor icon to {next_icon:?}");
                                if let Ok(win) = platform.get_window_mut(window_id) {
                                    win.set_cursor_icon(next_icon);
                                }
                            }
                            PointerButton::Auxiliary => {
                                cursor_grabbed = !cursor_grabbed;
                                let grab_mode = if cursor_grabbed {
                                    CursorGrabMode::Locked
                                } else {
                                    CursorGrabMode::None
                                };
                                println!("  -> Changing cursor grab mode to {grab_mode:?}");
                                if let Ok(win) = platform.get_window_mut(window_id) {
                                    let _ = win.set_cursor_grab(grab_mode);
                                }
                            }
                            _ => {}
                        }
                    }
                }
                PlatformEvent::Pointer(PointerEvent::Scroll { delta, .. }) => match delta {
                    ScrollDelta::Lines(d) => {
                        brightness_mod = (brightness_mod + (d.y * 10.0) as i32).clamp(-50, 50);
                        println!(
                            "[Pointer Scroll] lines=({:.1}, {:.1}) brightness_mod={brightness_mod}",
                            d.x, d.y
                        );
                    }
                    ScrollDelta::Pixels(d) => {
                        brightness_mod = (brightness_mod + (d.y * 0.2) as i32).clamp(-50, 50);
                        println!(
                            "[Pointer Scroll] pixels=({:.1}, {:.1}) brightness_mod={brightness_mod}",
                            d.x, d.y
                        );
                    }
                },
                PlatformEvent::Pointer(PointerEvent::Enter { position, .. }) => {
                    println!("[Pointer Enter] ({:.1}, {:.1})", position.x, position.y);
                }
                PlatformEvent::Pointer(PointerEvent::Leave { position, .. }) => {
                    println!("[Pointer Leave] ({:.1}, {:.1})", position.x, position.y);
                }
                PlatformEvent::Keyboard(KeyboardEvent::Input {
                    physical_key,
                    logical_key,
                    state,
                    modifiers,
                    repeat,
                    text,
                    ..
                }) => {
                    println!(
                        "[Key Input] phys={physical_key:?} log={logical_key:?} state={state:?} repeat={repeat} text={text:?} mods=(shift={}, ctrl={}, alt={})",
                        modifiers.shift, modifiers.ctrl, modifiers.alt
                    );

                    if state.is_pressed() {
                        let step = if modifiers.shift { 40.0 } else { 15.0 };
                        match physical_key {
                            KeyCode::KeyW | KeyCode::ArrowUp => {
                                pointer_pos.y = (pointer_pos.y - step).max(0.0);
                            }
                            KeyCode::KeyS | KeyCode::ArrowDown => {
                                pointer_pos.y = (pointer_pos.y + step).min(height as f32);
                            }
                            KeyCode::KeyA | KeyCode::ArrowLeft => {
                                pointer_pos.x = (pointer_pos.x - step).max(0.0);
                            }
                            KeyCode::KeyD | KeyCode::ArrowRight => {
                                pointer_pos.x = (pointer_pos.x + step).min(width as f32);
                            }
                            KeyCode::Space => {
                                palette_idx = (palette_idx + 1) % palette.len();
                                println!(
                                    "  -> Background color cycled via Spacebar to palette #{palette_idx}"
                                );
                            }
                            KeyCode::Digit1 => {
                                cursor_icon_idx = 0;
                                if let Ok(win) = platform.get_window_mut(window_id) {
                                    win.set_cursor_icon(CursorIcon::Default);
                                }
                            }
                            KeyCode::Digit2 => {
                                cursor_icon_idx = 1;
                                if let Ok(win) = platform.get_window_mut(window_id) {
                                    win.set_cursor_icon(CursorIcon::Pointer);
                                }
                            }
                            KeyCode::Digit3 => {
                                cursor_icon_idx = 2;
                                if let Ok(win) = platform.get_window_mut(window_id) {
                                    win.set_cursor_icon(CursorIcon::Crosshair);
                                }
                            }
                            KeyCode::Digit4 => {
                                cursor_icon_idx = 3;
                                if let Ok(win) = platform.get_window_mut(window_id) {
                                    win.set_cursor_icon(CursorIcon::Grab);
                                }
                            }
                            KeyCode::Escape => {
                                println!("\n[Key] Escape pressed. Exiting cleanly...");
                                platform.close_window(window_id)?;
                                running = false;
                            }
                            _ => {}
                        }
                    }
                }
                PlatformEvent::Keyboard(KeyboardEvent::ModifiersChanged { modifiers, .. }) => {
                    println!(
                        "[Modifiers] shift={} ctrl={} alt={} super={}",
                        modifiers.shift, modifiers.ctrl, modifiers.alt, modifiers.super_key
                    );
                }
                _ => {}
            }
        }

        if running {
            frame += 1;

            if let (Some(w), Some(h)) = (NonZeroU32::new(width), NonZeroU32::new(height)) {
                surface.resize(w, h)?;
                let mut buffer = surface.buffer_mut()?;

                // Base color with brightness adjustment
                let base_rgb = palette[palette_idx];
                let r = (((base_rgb >> 16) & 0xFF) as i32 + brightness_mod).clamp(0, 255) as u32;
                let g = (((base_rgb >> 8) & 0xFF) as i32 + brightness_mod).clamp(0, 255) as u32;
                let b = ((base_rgb & 0xFF) as i32 + brightness_mod).clamp(0, 255) as u32;
                let bg_color = 0xFF000000 | (r << 16) | (g << 8) | b;

                buffer.fill(bg_color);

                // Draw a 16x16 interactive pointer cursor reticle
                let px = pointer_pos.x as i32;
                let py = pointer_pos.y as i32;
                let u_w = width as usize;
                let u_h = height as usize;

                for dy in -8i32..=8i32 {
                    for dx in -8i32..=8i32 {
                        let cx = px + dx;
                        let cy = py + dy;
                        if cx >= 0 && (cx as usize) < u_w && cy >= 0 && (cy as usize) < u_h {
                            // Crosshair pattern with outer box
                            if dx == 0 || dy == 0 || dx.abs() == 8 || dy.abs() == 8 {
                                let idx = (cy as usize) * u_w + (cx as usize);
                                if idx < buffer.len() {
                                    buffer[idx] = 0xFFFFFFFF;
                                }
                            }
                        }
                    }
                }

                buffer.present()?;
            }

            if frame.is_multiple_of(120)
                && let Ok(win) = platform.get_window_mut(window_id)
            {
                win.set_title(&format!(
                    "Galfus Engine - Demo 0: Platform [Frame {frame}] pos: ({:.0}, {:.0})",
                    pointer_pos.x, pointer_pos.y
                ));
            }

            std::thread::sleep(Duration::from_millis(16));
        }
    }

    println!("Demo 0 finished cleanly.");
    Ok(())
}
