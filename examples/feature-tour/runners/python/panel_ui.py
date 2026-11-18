from typing import Any, Dict, List


def render_companion_panel_ui(
    tour: Dict[str, Any],
    current_room: Dict[str, Any],
    elapsed_secs: float,
    is_paused: bool,
    active_binding: str = "Python / ctypes",
) -> Dict[str, Any]:
    total_duration = tour["duration"]
    progress_ratio = max(0.0, min(1.0, elapsed_secs / total_duration))
    progress_percent = round(progress_ratio * 100)
    progress_bar_width = max(6, round(progress_ratio * 444))

    room_idx = current_room["roomIndex"] + 1
    total_rooms = len(tour["rooms"])

    quads: List[Dict[str, Any]] = []
    texts: List[Dict[str, Any]] = []

    # 1. Outer Card Background
    quads.append(
        {
            "rect": [8, 8, 484, 224],
            "backgroundColor": [0.06, 0.09, 0.16, 0.95],
            "borderColor": [0.22, 0.74, 0.97, 1.0],
            "borderWidth": [2, 2, 2, 2],
            "borderRadius": [14, 14, 14, 14],
        }
    )

    # 2. Top Accent Glow Strip
    quads.append(
        {
            "rect": [22, 8, 456, 3],
            "backgroundColor": [0.22, 0.74, 0.97, 1.0],
            "borderRadius": [1.5, 1.5, 1.5, 1.5],
        }
    )

    # 3. Header Title
    texts.append(
        {
            "position": [28, 20],
            "fontSize": 16,
            "color": [1.0, 1.0, 1.0, 1.0],
            "text": str(tour["title"]),
        }
    )

    # 4. Binding Badge
    quads.append(
        {
            "rect": [230, 18, 90, 20],
            "backgroundColor": [0.2, 0.25, 0.33, 1.0],
            "borderRadius": [4, 4, 4, 4],
        }
    )
    texts.append(
        {
            "position": [240, 22],
            "fontSize": 10,
            "color": [0.22, 0.74, 0.97, 1.0],
            "text": active_binding,
        }
    )

    # 5. Status Badge
    status_bg = [0.86, 0.15, 0.15, 1.0] if is_paused else [0.02, 0.59, 0.41, 1.0]
    quads.append(
        {"rect": [390, 18, 80, 22], "backgroundColor": status_bg, "borderRadius": [6, 6, 6, 6]}
    )
    texts.append(
        {
            "position": [408 if is_paused else 402, 22],
            "fontSize": 11,
            "color": [1.0, 1.0, 1.0, 1.0],
            "text": "PAUSED" if is_paused else "LIVE TOUR",
        }
    )

    # 6. Category Badge
    quads.append(
        {
            "rect": [28, 48, 120, 18],
            "backgroundColor": [0.01, 0.52, 0.78, 1.0],
            "borderRadius": [4, 4, 4, 4],
        }
    )
    texts.append(
        {
            "position": [34, 50],
            "fontSize": 10,
            "color": [1.0, 1.0, 1.0, 1.0],
            "text": str(current_room["category"]),
        }
    )

    # 7. Room Name & Description
    texts.append(
        {
            "position": [160, 50],
            "fontSize": 14,
            "color": [0.97, 0.98, 0.99, 1.0],
            "text": f"Room {room_idx}/{total_rooms}: {current_room['name']}",
        }
    )
    texts.append(
        {
            "position": [28, 74],
            "fontSize": 12,
            "color": [0.89, 0.91, 0.94, 1.0],
            "text": str(current_room["description"]),
        }
    )

    # 8. Progress Bar Container & Fill
    quads.append(
        {
            "rect": [28, 96, 444, 14],
            "backgroundColor": [0.2, 0.25, 0.33, 1.0],
            "borderColor": [0.28, 0.33, 0.41, 1.0],
            "borderWidth": [1, 1, 1, 1],
            "borderRadius": [7, 7, 7, 7],
        }
    )
    quads.append(
        {
            "rect": [28, 96, progress_bar_width, 14],
            "backgroundColor": [0.23, 0.51, 0.96, 1.0],
            "borderRadius": [7, 7, 7, 7],
        }
    )
    texts.append(
        {
            "position": [330, 114],
            "fontSize": 11,
            "color": [0.58, 0.64, 0.72, 1.0],
            "text": f"{progress_percent}% ({elapsed_secs:.1f}s / {total_duration}s)",
        }
    )

    # 9. Telemetry Card Box
    quads.append(
        {
            "rect": [24, 132, 452, 52],
            "backgroundColor": [0.12, 0.16, 0.23, 1.0],
            "borderColor": [0.28, 0.33, 0.41, 1.0],
            "borderWidth": [1, 1, 1, 1],
            "borderRadius": [8, 8, 8, 8],
        }
    )

    telemetry = current_room.get("telemetry", {})
    for idx, (key, val) in enumerate(list(telemetry.items())[:4]):
        pos_x = 34 if idx < 2 else 250
        pos_y = 140 + (idx % 2) * 20
        texts.append(
            {
                "position": [pos_x, pos_y],
                "fontSize": 11,
                "color": [0.8, 0.84, 0.88, 1.0],
                "text": f"▸ {key}: {val}",
            }
        )

    # 10. Controls Legend Footer
    texts.append(
        {
            "position": [28, 198],
            "fontSize": 11,
            "color": [0.58, 0.64, 0.72, 1.0],
            "text": "[Space]: Pause/Resume  |  [←/→]: Prev/Next Room  |  [R]: Restart  |  [Esc]: Exit",
        }
    )

    return {"quads": quads, "texts": texts}
