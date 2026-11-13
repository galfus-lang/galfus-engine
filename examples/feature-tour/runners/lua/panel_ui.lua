local panel_ui = {}

function panel_ui.render_companion_panel_ui(
    tour,
    current_room,
    elapsed_secs,
    is_paused,
    active_binding
)
    active_binding = active_binding or "LuaJIT / FFI"
    local total_duration = tour.duration
    local progress_ratio = math.max(0.0, math.min(1.0, elapsed_secs / total_duration))
    local progress_percent = math.floor(progress_ratio * 100 + 0.5)
    local progress_bar_width = math.max(6, math.floor(progress_ratio * 444 + 0.5))

    local room_idx = current_room.roomIndex + 1
    local total_rooms = #tour.rooms

    local quads = {}
    local texts = {}

    -- 1. Outer Card Background
    table.insert(quads, {
        rect = { 8, 8, 484, 224 },
        backgroundColor = { 0.06, 0.09, 0.16, 0.95 },
        borderColor = { 0.22, 0.74, 0.97, 1.0 },
        borderWidth = { 2, 2, 2, 2 },
        borderRadius = { 14, 14, 14, 14 },
    })

    -- 2. Top Accent Glow Strip
    table.insert(quads, {
        rect = { 22, 8, 456, 3 },
        backgroundColor = { 0.22, 0.74, 0.97, 1.0 },
        borderRadius = { 1.5, 1.5, 1.5, 1.5 },
    })

    -- 3. Header Title
    table.insert(texts, {
        position = { 28, 20 },
        fontSize = 16,
        color = { 1.0, 1.0, 1.0, 1.0 },
        text = tostring(tour.title),
    })

    -- 4. Binding Badge
    table.insert(quads, {
        rect = { 230, 18, 90, 20 },
        backgroundColor = { 0.2, 0.25, 0.33, 1.0 },
        borderRadius = { 4, 4, 4, 4 },
    })
    table.insert(texts, {
        position = { 240, 22 },
        fontSize = 10,
        color = { 0.22, 0.74, 0.97, 1.0 },
        text = active_binding,
    })

    -- 5. Status Badge
    local status_bg = is_paused and { 0.86, 0.15, 0.15, 1.0 } or { 0.02, 0.59, 0.41, 1.0 }
    table.insert(quads, {
        rect = { 390, 18, 80, 22 },
        backgroundColor = status_bg,
        borderRadius = { 6, 6, 6, 6 },
    })
    table.insert(texts, {
        position = { is_paused and 408 or 402, 22 },
        fontSize = 11,
        color = { 1.0, 1.0, 1.0, 1.0 },
        text = is_paused and "PAUSED" or "LIVE TOUR",
    })

    -- 6. Category Badge
    table.insert(quads, {
        rect = { 28, 48, 120, 18 },
        backgroundColor = { 0.01, 0.52, 0.78, 1.0 },
        borderRadius = { 4, 4, 4, 4 },
    })
    table.insert(texts, {
        position = { 34, 50 },
        fontSize = 10,
        color = { 1.0, 1.0, 1.0, 1.0 },
        text = tostring(current_room.category),
    })

    -- 7. Room Name & Description
    table.insert(texts, {
        position = { 160, 50 },
        fontSize = 14,
        color = { 0.97, 0.98, 0.99, 1.0 },
        text = string.format("Room %d/%d: %s", room_idx, total_rooms, tostring(current_room.name)),
    })
    table.insert(texts, {
        position = { 28, 74 },
        fontSize = 12,
        color = { 0.89, 0.91, 0.94, 1.0 },
        text = tostring(current_room.description),
    })

    -- 8. Progress Bar Container & Fill
    table.insert(quads, {
        rect = { 28, 96, 444, 14 },
        backgroundColor = { 0.2, 0.25, 0.33, 1.0 },
        borderColor = { 0.28, 0.33, 0.41, 1.0 },
        borderWidth = { 1, 1, 1, 1 },
        borderRadius = { 7, 7, 7, 7 },
    })
    table.insert(quads, {
        rect = { 28, 96, progress_bar_width, 14 },
        backgroundColor = { 0.23, 0.51, 0.96, 1.0 },
        borderRadius = { 7, 7, 7, 7 },
    })
    table.insert(texts, {
        position = { 330, 114 },
        fontSize = 11,
        color = { 0.58, 0.64, 0.72, 1.0 },
        text = string.format(
            "%d%% (%.1fs / %.0fs)",
            progress_percent,
            elapsed_secs,
            total_duration
        ),
    })

    -- 9. Telemetry Card Box
    table.insert(quads, {
        rect = { 24, 132, 452, 52 },
        backgroundColor = { 0.12, 0.16, 0.23, 1.0 },
        borderColor = { 0.28, 0.33, 0.41, 1.0 },
        borderWidth = { 1, 1, 1, 1 },
        borderRadius = { 8, 8, 8, 8 },
    })

    local telemetry = current_room.telemetry or {}
    local telem_idx = 0
    for key, val in pairs(telemetry) do
        if telem_idx < 4 then
            local pos_x = telem_idx < 2 and 34 or 250
            local pos_y = 140 + (telem_idx % 2) * 20
            table.insert(texts, {
                position = { pos_x, pos_y },
                fontSize = 11,
                color = { 0.8, 0.84, 0.88, 1.0 },
                text = string.format("▸ %s: %s", tostring(key), tostring(val)),
            })
            telem_idx = telem_idx + 1
        end
    end

    -- 10. Controls Legend Footer
    table.insert(texts, {
        position = { 28, 198 },
        fontSize = 11,
        color = { 0.58, 0.64, 0.72, 1.0 },
        text = "[Space]: Pause/Resume  |  [←/→]: Prev/Next Room  |  [R]: Restart  |  [Esc]: Exit",
    })

    return { quads = quads, texts = texts }
end

return panel_ui
