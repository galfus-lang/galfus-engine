use std::num::NonZeroU32;
use std::time::Duration;

use galfus_platform::{
    CursorGrabMode, CursorIcon, PlatformContext, PlatformEvent, PointerButton, PointerEvent,
    ScrollDelta, WindowConfig, WindowEvent,
};
use glam::Vec2;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== Galfus Engine - Platform & Pointer Demo ===");

    let mut platform = PlatformContext::new()?;
    let caps = platform.capabilities();
    println!("Platform Capabilities:");
    println!(" - Multiple windows : {}", caps.supports_multiple_windows);
    println!(" - Positioning      : {}", caps.supports_window_positioning);
    println!(" - Cursor grab      : {}", caps.supports_cursor_grab);
    println!(" - Gamepad          : {}", caps.supports_gamepad);
    println!(" - Audio            : {}", caps.supports_audio);
    println!(" - Headless         : {}", caps.is_headless);

    let config = WindowConfig::new(1, "Galfus Engine - Pointer & Surface Demo")
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
    println!("  - Move mouse      : Pointer position updates in real time");
    println!("  - Left Click      : Cycle base background color");
    println!("  - Right Click     : Cycle cursor icon (Default -> Pointer -> Crosshair -> Grab)");
    println!("  - Middle Click    : Toggle cursor grab (Locked <-> None)");
    println!("  - Mouse Wheel     : Adjust screen brightness");
    println!("  - Close Window    : Exit application\n");

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
                    "Galfus Engine - Pointer Demo [Frame {frame}] pos: ({:.0}, {:.0})",
                    pointer_pos.x, pointer_pos.y
                ));
            }

            std::thread::sleep(Duration::from_millis(16));
        }
    }

    println!("Galfus Demo finished cleanly.");
    Ok(())
}
