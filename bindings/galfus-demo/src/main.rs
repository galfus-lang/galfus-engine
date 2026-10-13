mod demos;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let demo_arg = args.get(1).map(String::as_str);

    match demo_arg {
        Some("0") | None => {
            if demo_arg.is_none() {
                println!("No demo number specified. Defaulting to Demo 0 (Platform).");
                println!("Use `cargo run -- <number>` to select a specific demo.\n");
            }
            demos::demo0_platform::run()?;
        }
        Some("1") => {
            demos::demo1_multiverse_postprocess::run()?;
        }
        Some("--help") | Some("-h") | Some("help") => {
            demos::print_available_demos();
        }
        Some(other) => {
            eprintln!("Unknown demo number or option: '{other}'\n");
            demos::print_available_demos();
            std::process::exit(1);
        }
    }

    Ok(())
}
