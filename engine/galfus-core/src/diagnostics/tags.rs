//! Bitmask tag definitions and string parsing for the tagged debug & metrics system.

pub const GPU: u64 = 1 << 0;
pub const BUFFERS: u64 = 1 << 1;
pub const TEXTURES: u64 = 1 << 2;
pub const PIPELINES: u64 = 1 << 3;
pub const BIND_GROUPS: u64 = 1 << 4;
pub const MULTIVERSE: u64 = 1 << 5;
pub const FRAME: u64 = 1 << 6;
pub const REALM_2D: u64 = 1 << 7;
pub const REALM_2D_UI: u64 = 1 << 8;
pub const REALM_3D: u64 = 1 << 9;
pub const PHYSICS: u64 = 1 << 10;
pub const HIERARCHY: u64 = 1 << 11;
pub const ANIMATION: u64 = 1 << 12;
pub const PLATFORM: u64 = 1 << 13;
pub const AUDIO: u64 = 1 << 14;
pub const INTERACTION: u64 = 1 << 15;
pub const FFI: u64 = 1 << 16;
pub const MEMORY: u64 = 1 << 17;

pub const NONE: u64 = 0;
pub const ALL: u64 = (1 << 18) - 1;

const TAG_TABLE: &[(&str, u64)] = &[
    ("gpu", GPU),
    ("gpu.buffers", BUFFERS),
    ("gpu.textures", TEXTURES),
    ("gpu.pipelines", PIPELINES),
    ("gpu.bind_groups", BIND_GROUPS),
    ("multiverse", MULTIVERSE),
    ("frame", FRAME),
    ("realm2d", REALM_2D),
    ("realm2d.ui", REALM_2D_UI),
    ("realm3d", REALM_3D),
    ("physics", PHYSICS),
    ("hierarchy", HIERARCHY),
    ("animation", ANIMATION),
    ("platform", PLATFORM),
    ("audio", AUDIO),
    ("interaction", INTERACTION),
    ("ffi", FFI),
    ("memory", MEMORY),
];

/// Parses a single tag name (case-insensitive) into its bitmask.
/// Supports wildcard `"*"` / `"all"` and group aliases (`"gpu.*"`).
pub fn parse_tag(name: &str) -> u64 {
    let trimmed = name.trim().to_ascii_lowercase();
    match trimmed.as_str() {
        "" | "none" => NONE,
        "*" | "all" => ALL,
        "gpu.*" => GPU | BUFFERS | TEXTURES | PIPELINES | BIND_GROUPS,
        "realm2d.*" => REALM_2D | REALM_2D_UI,
        other => TAG_TABLE
            .iter()
            .find(|(k, _)| *k == other)
            .map(|(_, mask)| *mask)
            .unwrap_or(NONE),
    }
}

/// Parses a comma-separated list of tags (e.g. `"gpu,physics,ffi,memory"`).
pub fn parse_tags_csv(csv: &str) -> u64 {
    csv.split(',').fold(NONE, |acc, part| acc | parse_tag(part))
}

/// Parses a slice of tag strings into a combined bitmask.
pub fn parse_tag_list<S: AsRef<str>>(tags: &[S]) -> u64 {
    tags.iter().fold(NONE, |acc, s| acc | parse_tag(s.as_ref()))
}

/// Converts a single tag bit into its canonical string name.
pub fn tag_name(bit: u64) -> &'static str {
    TAG_TABLE
        .iter()
        .find(|(_, mask)| *mask == bit)
        .map(|(name, _)| *name)
        .unwrap_or("unknown")
}

/// Returns the list of canonical tag names enabled in `mask`.
pub fn mask_to_names(mask: u64) -> Vec<&'static str> {
    TAG_TABLE
        .iter()
        .filter(|(_, bit)| (mask & *bit) != 0)
        .map(|(name, _)| *name)
        .collect()
}

/// Reads initial tag mask from `GALFUS_DEBUG_TAGS` on native targets.
pub fn initial_mask_from_env() -> u64 {
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::env::var("GALFUS_DEBUG_TAGS")
            .ok()
            .map(|v| parse_tags_csv(&v))
            .unwrap_or(NONE)
    }
    #[cfg(target_arch = "wasm32")]
    {
        NONE
    }
}
