local panel_svg = {}

local function escape_xml(s)
    s = tostring(s or "")
    s = s:gsub("&", "&amp;")
        :gsub("<", "&lt;")
        :gsub(">", "&gt;")
        :gsub('"', "&quot;")
        :gsub("'", "&apos;")
    return s
end

function panel_svg.render_companion_panel_svg(
    tour,
    current_room,
    elapsed_secs,
    is_paused,
    active_binding
)
    active_binding = active_binding or "Lua / LuaJIT FFI"
    local total_duration = tour.duration
    local progress_ratio = math.max(0.0, math.min(1.0, elapsed_secs / total_duration))
    local progress_percent = math.floor(progress_ratio * 100 + 0.5)
    local progress_bar_width = math.max(6, math.floor(progress_ratio * 440 + 0.5))

    local room_idx = current_room.roomIndex + 1
    local total_rooms = #tour.rooms

    local telemetry_lines = {}
    local idx = 0
    if current_room.telemetry then
        for k, v in pairs(current_room.telemetry) do
            if idx < 4 then
                local x = (idx < 2) and 34 or 260
                local y = 156 + (idx % 2) * 20
                table.insert(
                    telemetry_lines,
                    string.format(
                        '<tspan x="%d" y="%d">▸ %s: <tspan fill="#38BDF8" font-weight="bold">%s</tspan></tspan>',
                        x,
                        y,
                        escape_xml(k),
                        escape_xml(v)
                    )
                )
                idx = idx + 1
            end
        end
    end
    local telemetry_str = table.concat(telemetry_lines, "")

    local status_badge
    if is_paused then
        status_badge =
            '<rect x="390" y="20" width="80" height="24" rx="6" fill="#DC2626"/><text x="430" y="36" font-family="sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">PAUSED</text>'
    else
        status_badge =
            '<rect x="390" y="20" width="80" height="24" rx="6" fill="#059669"/><text x="430" y="36" font-family="sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">LIVE TOUR</text>'
    end

    local safe_title = escape_xml(tour.title)
    local safe_binding = escape_xml(active_binding)
    local safe_category = escape_xml(current_room.category)
    local safe_room_name = escape_xml(current_room.name)
    local safe_room_desc = escape_xml(current_room.description)

    return string.format(
        [[<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 240" width="500" height="240">
  <defs>
    <linearGradient id="cardBg" x1="0%%" y1="0%%" x2="0%%" y2="100%%">
      <stop offset="0%%" stop-color="#1E293B"/>
      <stop offset="100%%" stop-color="#0F172A"/>
    </linearGradient>
    <linearGradient id="neonBar" x1="0%%" y1="0%%" x2="100%%" y2="0%%">
      <stop offset="0%%" stop-color="#06B6D4"/>
      <stop offset="50%%" stop-color="#3B82F6"/>
      <stop offset="100%%" stop-color="#8B5CF6"/>
    </linearGradient>
  </defs>

  <!-- Panel Card Outer Frame -->
  <rect x="8" y="8" width="484" height="224" rx="14" fill="url(#cardBg)" stroke="#38BDF8" stroke-width="2"/>

  <!-- Top Accent Glowing Strip -->
  <path d="M 22 8 L 478 8" stroke="#38BDF8" stroke-width="3" stroke-linecap="round"/>

  <!-- Header -->
  <text x="28" y="36" font-family="sans-serif" font-size="16" font-weight="bold" fill="#FFFFFF">%s</text>
  <rect x="230" y="22" width="110" height="20" rx="4" fill="#334155"/>
  <text x="285" y="36" font-family="sans-serif" font-size="10" font-weight="bold" fill="#38BDF8" text-anchor="middle">%s</text>
  %s

  <!-- Category & Room Name -->
  <rect x="28" y="50" width="130" height="18" rx="4" fill="#0284C7"/>
  <text x="93" y="63" font-family="sans-serif" font-size="10" font-weight="bold" fill="#FFFFFF" text-anchor="middle">%s</text>
  <text x="170" y="65" font-family="sans-serif" font-size="14" font-weight="bold" fill="#F8FAFC">Room %d/%d: %s</text>
  <text x="28" y="86" font-family="sans-serif" font-size="12" fill="#E2E8F0">%s</text>

  <!-- Progress Bar Container -->
  <rect x="28" y="98" width="444" height="14" rx="7" fill="#334155" stroke="#475569" stroke-width="1"/>
  <rect x="28" y="98" width="%d" height="14" rx="7" fill="url(#neonBar)"/>
  <text x="472" y="124" font-family="sans-serif" font-size="11" font-weight="bold" fill="#94A3B8" text-anchor="end">%d%%%% (%.1fs / %.1fs)</text>

  <!-- Telemetry Card Box -->
  <rect x="24" y="132" width="452" height="52" rx="8" fill="#1E293B" stroke="#475569" stroke-width="1.5"/>
  <text font-family="monospace" font-size="11" fill="#CBD5E1">
    %s
  </text>

  <!-- Controls Legend Footer -->
  <text x="28" y="210" font-family="sans-serif" font-size="11" fill="#94A3B8">[Space]: Pause/Resume  |  [←/→]: Prev/Next Room  |  [R]: Restart  |  [Esc]: Exit</text>
</svg>]],
        safe_title,
        safe_binding,
        status_badge,
        safe_category,
        room_idx,
        total_rooms,
        safe_room_name,
        safe_room_desc,
        progress_bar_width,
        progress_percent,
        elapsed_secs,
        total_duration,
        telemetry_str
    )
end

return panel_svg
