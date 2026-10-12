use std::num::NonZeroU32;
use std::time::Duration;

use galfus_platform::{PlatformContext, PlatformEvent, WindowConfig, WindowEvent};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== Galfus Engine - Platform & Windowing Demo ===");

    let mut platform = PlatformContext::new()?;
    let caps = platform.capabilities();
    println!("Platform Capabilities:");
    println!(" - Multiple windows : {}", caps.supports_multiple_windows);
    println!(" - Positioning      : {}", caps.supports_window_positioning);
    println!(" - Cursor grab      : {}", caps.supports_cursor_grab);
    println!(" - Gamepad          : {}", caps.supports_gamepad);
    println!(" - Audio            : {}", caps.supports_audio);
    println!(" - Headless         : {}", caps.is_headless);

    let config = WindowConfig::new(1, "Galfus Engine - Window Demo")
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

    // Initialize softbuffer to commit pixels on Wayland/X11
    let context = softbuffer::Context::new(raw_winit_window.clone())?;
    let mut surface = softbuffer::Surface::new(&context, raw_winit_window)?;

    println!("\n==> Event loop active.");
    println!("    Close the window or press Ctrl+C in terminal to exit.");

    let mut frame = 0u64;
    let mut running = true;
    let mut width = 1024u32;
    let mut height = 768u32;

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
                PlatformEvent::Window(WindowEvent::Moved {
                    window_id: id,
                    x,
                    y,
                }) => {
                    println!("[Event] Window {id} moved to ({x}, {y})");
                }
                PlatformEvent::Window(WindowEvent::FocusChanged {
                    window_id: id,
                    focused,
                }) => {
                    println!("[Event] Window {id} focus changed: {focused}");
                }
                _ => {}
            }
        }

        if running {
            frame += 1;

            // Render and commit a frame buffer so Wayland/X11 maps and paints the window
            if let (Some(w), Some(h)) = (NonZeroU32::new(width), NonZeroU32::new(height)) {
                surface.resize(w, h)?;
                let mut buffer = surface.buffer_mut()?;
                // Soft dark-slate background with subtle animated tint
                let tint = ((frame % 100) as u32) / 4;
                let color = 0xFF1E2028 | tint;
                buffer.fill(color);
                buffer.present()?;
            }

            if frame.is_multiple_of(120)
                && let Ok(win) = platform.get_window_mut(window_id)
            {
                win.set_title(&format!("Galfus Engine - Window Demo [Frame {frame}]"));
            }

            std::thread::sleep(Duration::from_millis(16));
        }
    }

    println!("Galfus Demo finished cleanly.");
    Ok(())
}
