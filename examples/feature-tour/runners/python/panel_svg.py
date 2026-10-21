import html
from typing import Any, Dict


def escape_xml(unsafe: Any) -> str:
    return (
        str(unsafe)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def render_companion_panel_svg(
    tour: Dict[str, Any],
    current_room: Dict[str, Any],
    elapsed_secs: float,
    is_paused: bool,
    active_binding: str = "Python / ctypes",
) -> str:
    total_duration = tour["duration"]
    progress_ratio = max(0.0, min(1.0, elapsed_secs / total_duration))
    progress_percent = round(progress_ratio * 100)
    progress_bar_width = max(6, round(progress_ratio * 440))

    room_idx = current_room["roomIndex"] + 1
    total_rooms = len(tour["rooms"])

    telemetry = current_room.get("telemetry", {})
    telemetry_items = list(telemetry.items())[:4]
    telemetry_lines = []
    for idx, (k, v) in enumerate(telemetry_items):
        x = 34 if idx < 2 else 260
        y = 156 + (idx % 2) * 20
        telemetry_lines.append(
            f'<tspan x="{x}" y="{y}">▸ {escape_xml(k)}: <tspan fill="#38BDF8" font-weight="bold">{escape_xml(v)}</tspan></tspan>'
        )
    telemetry_str = "".join(telemetry_lines)

    status_badge = (
        '<rect x="390" y="20" width="80" height="24" rx="6" fill="#DC2626"/>'
        '<text x="430" y="36" font-family="sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">PAUSED</text>'
        if is_paused
        else '<rect x="390" y="20" width="80" height="24" rx="6" fill="#059669"/>'
        '<text x="430" y="36" font-family="sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">LIVE TOUR</text>'
    )

    safe_title = escape_xml(tour["title"])
    safe_binding = escape_xml(active_binding)
    safe_category = escape_xml(current_room["category"])
    safe_room_name = escape_xml(current_room["name"])
    safe_room_desc = escape_xml(current_room["description"])

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 240" width="500" height="240">
  <defs>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1E293B"/>
      <stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>
    <linearGradient id="neonBar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06B6D4"/>
      <stop offset="50%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
  </defs>

  <!-- Panel Card Outer Frame -->
  <rect x="8" y="8" width="484" height="224" rx="14" fill="url(#cardBg)" stroke="#38BDF8" stroke-width="2"/>

  <!-- Top Accent Glowing Strip -->
  <path d="M 22 8 L 478 8" stroke="#38BDF8" stroke-width="3" stroke-linecap="round"/>

  <!-- Header -->
  <text x="28" y="36" font-family="sans-serif" font-size="16" font-weight="bold" fill="#FFFFFF">{safe_title}</text>
  <rect x="230" y="22" width="100" height="20" rx="4" fill="#334155"/>
  <text x="280" y="36" font-family="sans-serif" font-size="10" font-weight="bold" fill="#38BDF8" text-anchor="middle">{safe_binding}</text>
  {status_badge}

  <!-- Category & Room Name -->
  <rect x="28" y="50" width="130" height="18" rx="4" fill="#0284C7"/>
  <text x="93" y="63" font-family="sans-serif" font-size="10" font-weight="bold" fill="#FFFFFF" text-anchor="middle">{safe_category}</text>
  <text x="170" y="65" font-family="sans-serif" font-size="14" font-weight="bold" fill="#F8FAFC">Room {room_idx}/{total_rooms}: {safe_room_name}</text>
  <text x="28" y="86" font-family="sans-serif" font-size="12" fill="#E2E8F0">{safe_room_desc}</text>

  <!-- Progress Bar Container -->
  <rect x="28" y="98" width="444" height="14" rx="7" fill="#334155" stroke="#475569" stroke-width="1"/>
  <rect x="28" y="98" width="{progress_bar_width}" height="14" rx="7" fill="url(#neonBar)"/>
  <text x="472" y="124" font-family="sans-serif" font-size="11" font-weight="bold" fill="#94A3B8" text-anchor="end">{progress_percent}% ({elapsed_secs:.1f}s / {total_duration}s)</text>

  <!-- Telemetry Card Box -->
  <rect x="24" y="132" width="452" height="52" rx="8" fill="#1E293B" stroke="#475569" stroke-width="1.5"/>
  <text font-family="monospace" font-size="11" fill="#CBD5E1">
    {telemetry_str}
  </text>

  <!-- Controls Legend Footer -->
  <text x="28" y="210" font-family="sans-serif" font-size="11" fill="#94A3B8">[Space]: Pause/Resume  |  [←/→]: Prev/Next Room  |  [R]: Restart  |  [Esc]: Exit</text>
</svg>"""
