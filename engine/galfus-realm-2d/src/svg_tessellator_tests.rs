//! SVG tessellation tests.

use super::*;

#[test]
fn test_tessellate_svg_rect() {
    let db = fontdb::Database::new();
    let xml = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
            <rect x="10" y="10" width="80" height="40" fill="#ff0000"/>
        </svg>"##;
    let mesh = tessellate_svg(xml, Arc::new(db), "sans-serif").unwrap();
    assert!(!mesh.vertices.is_empty(), "Mesh should have vertices");
    assert!(!mesh.indices.is_empty(), "Mesh should have indices");
    assert_eq!(mesh.dimensions, Vec2::new(200.0, 100.0));
}

#[test]
fn test_tessellate_svg_complex() {
    let db = fontdb::Database::new();
    let xml = r##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
            <g transform="translate(20, 30)">
                <circle cx="50" cy="50" r="40" fill="#00ff00" stroke="#0000ff" stroke-width="4"/>
                <path d="M 10 10 L 90 90 L 10 90 Z" fill="#ffff00"/>
            </g>
        </svg>"##;
    let mesh = tessellate_svg(xml, Arc::new(db), "sans-serif").unwrap();
    assert!(
        mesh.vertices.len() > 20,
        "Should have tesselated vertices from circle and path"
    );
    assert!(mesh.indices.len() > 30, "Should have tesselated indices");
    assert_eq!(mesh.dimensions, Vec2::new(300.0, 200.0));
}

#[test]
fn test_tessellate_svg_text() {
    let db = fontdb::Database::new();
    let xml = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
            <text x="10" y="50" font-size="20" fill="#000000">Galfus Engine</text>
        </svg>"##;
    let mesh = tessellate_svg(xml, Arc::new(db), "sans-serif").unwrap();
    assert_eq!(mesh.dimensions, Vec2::new(200.0, 100.0));
}

#[test]
fn test_tessellate_svg_with_css_style() {
    let db = fontdb::Database::new();
    let xml = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
            <style>
                .danger { fill: #ff0000; stroke: #00ff00; stroke-width: 2px; }
                #highlight { fill: #0000ff; }
            </style>
            <rect class="danger" x="10" y="10" width="40" height="40"/>
            <circle id="highlight" cx="100" cy="50" r="30"/>
            <rect style="fill: #ffff00; stroke: #ff00ff;" x="150" y="10" width="20" height="20"/>
        </svg>"##;
    let mesh = tessellate_svg(xml, Arc::new(db), "sans-serif").unwrap();
    assert!(!mesh.vertices.is_empty());
    // Verify red color from class .danger (RGBA: [5..9])
    let has_red = mesh
        .vertices
        .iter()
        .any(|v| (v[5] - 1.0).abs() < 0.05 && v[6] < 0.05 && v[7] < 0.05);
    // Verify blue color from id #highlight
    let has_blue = mesh
        .vertices
        .iter()
        .any(|v| v[5] < 0.05 && v[6] < 0.05 && (v[7] - 1.0).abs() < 0.05);
    // Verify yellow color from inline style (RGBA: [1, 1, 0, 1])
    let has_yellow = mesh
        .vertices
        .iter()
        .any(|v| (v[5] - 1.0).abs() < 0.05 && (v[6] - 1.0).abs() < 0.05 && v[7] < 0.05);
    assert!(has_red, "Should apply class-based CSS fill");
    assert!(has_blue, "Should apply ID-based CSS fill");
    assert!(has_yellow, "Should apply inline style fill");
}

#[test]
fn test_tessellate_demo_2d3_hud_card() {
    let mut db = fontdb::Database::new();
    db.load_font_data(crate::svg_manager::DEFAULT_FONT_BYTES.to_vec());
    db.set_sans_serif_family("Liberation Sans");
    db.set_monospace_family("Liberation Sans");
    let xml = r##"<svg width="400" height="240" viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="card-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0.92"/>
    </linearGradient>
    <linearGradient id="bar-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06b6d4"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>

    <!-- State Icons -->
    <g id="state-core">
      <circle cx="36" cy="36" r="18" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="4 3"/>
      <circle cx="36" cy="36" r="10" fill="#0284c7"/>
      <circle cx="36" cy="36" r="4" fill="#e0f2fe"/>
    </g>
    <g id="state-combat">
      <circle cx="36" cy="36" r="18" fill="none" stroke="#ef4444" stroke-width="2.5"/>
      <path d="M26 46 L46 26 M46 46 L26 26" stroke="#f87171" stroke-width="3" stroke-linecap="round"/>
      <circle cx="36" cy="36" r="5" fill="#fca5a5"/>
    </g>
    <g id="state-shield">
      <circle cx="36" cy="36" r="18" fill="none" stroke="#10b981" stroke-width="2.5"/>
      <path d="M26 30 Q36 24 46 30 Q46 44 36 50 Q26 44 26 30 Z" fill="#059669" stroke="#34d399" stroke-width="1.5"/>
    </g>
  </defs>

  <!-- Card Backdrop -->
  <rect id="card-bg" x="4" y="4" width="392" height="232" rx="16" fill="url(#card-grad)" stroke="#38bdf8" stroke-width="2"/>
  
  <!-- Corner Tech Accents -->
  <path d="M4 28 L4 4 L28 4" fill="none" stroke="#00ffff" stroke-width="3"/>
  <path d="M372 4 L396 4 L396 28" fill="none" stroke="#00ffff" stroke-width="3"/>
  <path d="M4 212 L4 236 L28 236" fill="none" stroke="#00ffff" stroke-width="3"/>
  <path d="M372 236 L396 236 L396 212" fill="none" stroke="#00ffff" stroke-width="3"/>

  <!-- Icon Slot (Dynamically Swapped via use href) -->
  <g transform="translate(18, 18)">
    <use id="icon-ref" href="#state-core"/>
  </g>

  <!-- Header Titles -->
  <text id="card-title" x="90" y="46" font-family="monospace" font-size="20" font-weight="bold" fill="#f8fafc" letter-spacing="1.5">GALFUS QUANTUM DECK</text>
  <text id="status-label" x="90" y="66" font-family="monospace" font-size="12" fill="#38bdf8">SYSTEM: ONLINE [DEFENSE]</text>

  <!-- Divider Line -->
  <line x1="20" y1="84" x2="380" y2="84" stroke="#334155" stroke-width="1.5"/>

  <!-- Telemetry Bar -->
  <text x="24" y="112" font-family="monospace" font-size="13" fill="#94a3b8">FLUX CAPACITANCE</text>
  <rect x="24" y="122" width="352" height="18" rx="6" fill="#0f172a" stroke="#1e293b" stroke-width="1"/>
  <rect id="flux-bar" x="26" y="124" width="280" height="14" rx="4" fill="url(#bar-grad)"/>

  <!-- Live Stats -->
  <text id="flux-percent" x="320" y="112" font-family="monospace" font-size="13" font-weight="bold" fill="#38bdf8">80%</text>

  <!-- Dynamic Uptime & Instructions -->
  <text id="uptime-text" x="24" y="172" font-family="monospace" font-size="13" fill="#cbd5e1">CYCLE TICK: 00000</text>
  <text id="mode-text" x="24" y="196" font-family="monospace" font-size="12" fill="#a78bfa">MODE: IDLE (PRESS SPACE TO TOGGLE)</text>
  <text x="24" y="218" font-family="monospace" font-size="10" fill="#64748b">WASD: MOVE | Q/E: SCALE | C: THEME PALETTE</text>
</svg>"##;
    let mesh =
        tessellate_svg(xml, Arc::new(db), "sans-serif").expect("Failed to tessellate HUD card");
    println!(
        "Vertices: {}, Indices: {}",
        mesh.vertices.len(),
        mesh.indices.len()
    );
    for i in 0..5.min(mesh.vertices.len()) {
        println!("v[{i}]: {:?}", mesh.vertices[i]);
    }
    assert!(!mesh.vertices.is_empty());
}
