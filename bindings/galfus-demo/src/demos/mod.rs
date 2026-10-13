//! Catalog and dispatcher of interactive demonstration modules.

pub mod audio_gen;
pub mod demo0_platform;

/// Prints the list of available demos with CLI invocation instructions.
pub fn print_available_demos() {
    println!("=== Galfus Engine - Available Demos ===");
    println!("  0 - Platform & Input (Windows, surfaces, pointer & keyboard events)");
    println!("\nUsage:");
    println!("  cargo run -- <demo_number>");
    println!("\nExample:");
    println!("  cargo run -- 0");
}
