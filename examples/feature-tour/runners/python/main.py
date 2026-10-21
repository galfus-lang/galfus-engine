import sys
import os
import json
import time
import ctypes
from typing import Any, Dict, List

script_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(script_dir, "../../../.."))
sys.path.append(os.path.join(root_dir, "sdk/python"))

import galfus
from procedural import build_room_scene, make_sound, compute_bone_palette
from panel_svg import render_companion_panel_svg

TARGET_WINDOW = 1
REALM_3D = 10
REALM_2D = 20
INVOCATION_3D = 100
INVOCATION_2D = 101
CAMERA_3D_ID = 1
CAMERA_2D_ID = 1
SVG_HUD_ID = 1
PATH_CAMERA_POS_ID = 401
PATH_CAMERA_LOOK_ID = 402
SOUND_ID = 501


def extract_key(ev: Dict[str, Any]) -> str:
    logical = ev.get("logicalKey")
    if isinstance(logical, dict):
        if "character" in logical:
            return str(logical["character"]).lower()
        if "named" in logical:
            return str(logical["named"]).lower()
    elif isinstance(logical, str):
        return logical.lower()

    phys = str(ev.get("physicalKey", "")).lower()
    if phys.startswith("key") and len(phys) == 4:
        return phys[3:]
    return phys


def main(max_frames: Any = None) -> None:
    tour_json_path = os.path.join(script_dir, "../../tour.json")
    with open(tour_json_path, "r", encoding="utf-8") as f:
        tour = json.load(f)

    active_binding = "Python / ctypes"
    print(f"=== {tour['title']} [{active_binding}] (v{tour['version']}) ===\n")

    try:
        galfus.platform_init()
    except Exception:
        pass

    window_id = 1
    width, height = 1024, 768

    galfus.window_create(
        {
            "id": window_id,
            "title": f"{tour['title']} — Python Runner",
            "size": [width, height],
            "resizable": True,
            "decorations": True,
        }
    )
    galfus.multiverse_attach_window(window_id)

    # 1. Create Target
    galfus.multiverse_create_target(
        TARGET_WINDOW, {"kind": {"type": "window", "windowId": window_id}}
    )

    # 2. Create Realms
    galfus.realm3d_create(REALM_3D)
    galfus.realm2d_create(REALM_2D)

    # 3. Multiverse Invocations: Top 50vh 3D, Bottom 50vh 2D
    galfus.multiverse_create_invocation(
        INVOCATION_3D,
        {
            "realmId": REALM_3D,
            "targetId": TARGET_WINDOW,
            "cameraSlot": 0,
            "viewport": {
                "anchorX": "left",
                "anchorY": "top",
                "width": {"vw": 100},
                "height": {"vh": 50},
            },
            "clearColor": [0.06, 0.08, 0.12, 1.0],
            "enabled": True,
            "zIndex": 0,
        },
    )

    galfus.multiverse_create_invocation(
        INVOCATION_2D,
        {
            "realmId": REALM_2D,
            "targetId": TARGET_WINDOW,
            "cameraSlot": 0,
            "viewport": {
                "anchorX": "left",
                "anchorY": "bottom",
                "width": {"vw": 100},
                "height": {"vh": 50},
            },
            "clearColor": [0.08, 0.1, 0.15, 1.0],
            "enabled": True,
            "zIndex": 1,
        },
    )

    # 3b. 2D Ambient Light for bright SVG rendering
    galfus.realm2d_create_light(
        REALM_2D,
        1,
        {"color": [1.0, 1.0, 1.0], "intensity": 1.0, "range": 1000.0, "active": True},
        {"position": [0.0, 0.0]},
    )

    # 4. Cameras
    first_pos = tour["cameraPositionPath"]["commands"][0].get("to", [0.0, 2.5, 7.0])
    first_look = tour["cameraLookTargetPath"]["commands"][0].get("to", [0.0, 1.2, 0.0])

    galfus.realm3d_create_camera(
        REALM_3D,
        CAMERA_3D_ID,
        {
            "fovY": 60.0,
            "near": 0.1,
            "far": 1000.0,
            "cameraSlot": 0,
            "lookAt": {"target": first_look, "up": [0.0, 1.0, 0.0]},
        },
        {"position": first_pos},
    )

    galfus.realm2d_create_camera(
        REALM_2D, CAMERA_2D_ID, {"orthoScale": 240, "cameraSlot": 0}, {"position": [0.0, 0.0]}
    )

    # 5. Environment & Skybox
    galfus.realm3d_set_environment(
        REALM_3D,
        {
            "ambientColor": [0.15, 0.18, 0.22, 1.0],
            "exposure": 1.1,
            "skybox": {
                "mode": "procedural",
                "skyColor": [0.2, 0.4, 0.7, 1.0],
                "horizonColor": [0.55, 0.65, 0.75, 1.0],
                "groundColor": [0.06, 0.08, 0.1, 1.0],
                "sunDirection": [0.6, 0.8, 0.3, 0.0],
                "sunColor": [1.0, 0.95, 0.85, 2.0],
                "intensity": 1.2,
            },
        },
    )

    # 6. Procedural exhibit rooms
    for room in tour["rooms"]:
        build_room_scene(REALM_3D, room, tour["defaultSeed"], galfus)

    # 7. Audio load
    try:
        sound_bytes = make_sound(tour["defaultSeed"], 440.0, 1.0)
        c_sound = (ctypes.c_char * len(sound_bytes)).from_buffer_copy(sound_bytes)
        galfus.audio_load_sound(SOUND_ID, ctypes.cast(c_sound, ctypes.c_void_p), len(sound_bytes))
    except Exception as err:
        print("[Audio] Sound load skipped or failed:", err)

    # 8. Companion SVG panel
    initial_room = tour["rooms"][0]
    initial_svg = render_companion_panel_svg(tour, initial_room, 0.0, False, active_binding)
    galfus.realm2d_create_svg(
        REALM_2D, SVG_HUD_ID, {"source": initial_svg}, {"position": [0, 0], "scale": [1, 1]}
    )

    # 9. Path followers setup
    def rotate_path_commands(
        commands: List[Dict[str, Any]], room_idx: int, origin: List[float]
    ) -> List[Dict[str, Any]]:
        rotated = [{"type": "moveTo", "to": origin}]
        num_rooms = len(tour["rooms"])
        for offset in range(num_rooms):
            r = (room_idx + offset) % num_rooms
            linger = commands[1 + 2 * r]
            travel = commands[2 + 2 * r]
            if linger:
                rotated.append(linger)
            if travel:
                rotated.append(travel)
        return rotated

    def setup_paths(room_idx: int) -> None:
        try:
            galfus.animation_destroy_path_follow(PATH_CAMERA_POS_ID)
        except Exception:
            pass
        try:
            galfus.animation_destroy_path_follow(PATH_CAMERA_LOOK_ID)
        except Exception:
            pass

        room = tour["rooms"][room_idx]
        pos_commands = rotate_path_commands(
            tour["cameraPositionPath"]["commands"], room_idx, room["cameraPoint"]
        )
        look_commands = rotate_path_commands(
            tour["cameraLookTargetPath"]["commands"], room_idx, room["focusPoint"]
        )

        galfus.animation_create_path_follow(
            PATH_CAMERA_POS_ID, pos_commands, tour["cameraPositionPath"]["config"]
        )
        galfus.animation_bind_path_follow_target(
            PATH_CAMERA_POS_ID,
            {"kind": "camera3DTransform", "realmId": REALM_3D, "cameraId": CAMERA_3D_ID},
        )

        galfus.animation_create_path_follow(
            PATH_CAMERA_LOOK_ID, look_commands, tour["cameraLookTargetPath"]["config"]
        )
        galfus.animation_bind_path_follow_target(
            PATH_CAMERA_LOOK_ID,
            {"kind": "camera3DLookAt", "realmId": REALM_3D, "cameraId": CAMERA_3D_ID},
        )

        galfus.realm3d_set_camera_transform(
            REALM_3D, CAMERA_3D_ID, {"position": room["cameraPoint"]}
        )
        galfus.realm3d_set_camera_look_at(
            REALM_3D, CAMERA_3D_ID, {"target": room["focusPoint"], "up": [0.0, 1.0, 0.0]}
        )

    setup_paths(0)
    print("✔ Tour paths and rooms configured successfully!\n")

    # 10. Tour playback clock & state
    running = True
    is_paused = False
    tour_clock = 0.0
    anim_clock = 0.0
    current_room_index = 0
    frame = 0
    last_time = time.perf_counter()

    def update_hud() -> None:
        active_room = tour["rooms"][current_room_index]
        updated_svg = render_companion_panel_svg(
            tour, active_room, tour_clock, is_paused, active_binding
        )
        galfus.realm2d_set_svg_source(REALM_2D, SVG_HUD_ID, updated_svg)

    def apply_room_state(room_idx: int) -> None:
        nonlocal current_room_index
        current_room_index = room_idx
        update_hud()

        # Multiverse screen shader filters for Room 8 (Effects)
        if room_idx == 8:
            try:
                galfus.multiverse_set_invocation_filters(
                    INVOCATION_3D, ["chromaticAberration", "vignette"]
                )
            except Exception:
                pass
        else:
            try:
                galfus.multiverse_set_invocation_filters(INVOCATION_3D, [])
            except Exception:
                pass

        # Audio for Room 9 (Spatial Audio & Finale)
        if room_idx == 9:
            try:
                galfus.audio_play_sound(SOUND_ID, 0.9, 0.0, 1.0, False)
            except Exception as e:
                print("[Audio] Play sound failed:", e)

    def seek_to_room(target_idx: int) -> None:
        nonlocal tour_clock
        wrapped = (target_idx + len(tour["rooms"])) % len(tour["rooms"])
        room = tour["rooms"][wrapped]
        tour_clock = room["startTime"]
        setup_paths(wrapped)
        apply_room_state(wrapped)
        print(f"[Tour] Jumped to Room {wrapped + 1}: {room['name']}")

    while running:
        now = time.perf_counter()
        dt = min(0.1, max(0.001, now - last_time))
        last_time = now

        # Pump events
        events = galfus.platform_pump_events()
        for ev in events:
            if ev.get("kind") == "window":
                ev_type = ev.get("type")
                if ev_type == "closeRequested":
                    running = False
                elif ev_type == "resized":
                    galfus.multiverse_update_window_size(
                        window_id, int(ev.get("width", width)), int(ev.get("height", height))
                    )
            elif ev.get("kind") == "keyboard" and ev.get("type") == "input":
                if ev.get("state") == "pressed":
                    key = extract_key(ev)
                    if key == "escape":
                        running = False
                    elif key in (" ", "space"):
                        is_paused = not is_paused
                        if not is_paused:
                            setup_paths(current_room_index)
                        update_hud()
                        print(f"[Tour] Playback {'PAUSED' if is_paused else 'RESUMED'}")
                    elif key == "r":
                        seek_to_room(0)
                    elif key in ("arrowright", "right"):
                        seek_to_room(current_room_index + 1)
                    elif key in ("arrowleft", "left"):
                        seek_to_room(current_room_index - 1)

        anim_clock += dt

        if not is_paused:
            tour_clock = (tour_clock + dt) % tour["duration"]
            for r in tour["rooms"]:
                if tour_clock >= r["startTime"] and tour_clock < r["startTime"] + r["duration"]:
                    if r["roomIndex"] != current_room_index:
                        apply_room_state(r["roomIndex"])
                    break

        galfus.animation_step(dt)

        if is_paused:
            active_room = tour["rooms"][current_room_index]
            try:
                galfus.realm3d_set_camera_transform(
                    REALM_3D, CAMERA_3D_ID, {"position": active_room["cameraPoint"]}
                )
                galfus.realm3d_set_camera_look_at(
                    REALM_3D,
                    CAMERA_3D_ID,
                    {"target": active_room["focusPoint"], "up": [0.0, 1.0, 0.0]},
                )
            except Exception:
                pass

        # Update procedural skeletal bones in Room 6
        bone_palette = compute_bone_palette(anim_clock, 12, 5.0)
        c_palette = (ctypes.c_float * len(bone_palette))(*bone_palette)
        try:
            galfus.realm3d_update_bones(REALM_3D, 7102, c_palette, len(bone_palette))
        except Exception:
            pass

        galfus.multiverse_resolve()
        galfus.multiverse_dispatch(frame, dt)
        frame += 1

        if max_frames is not None and frame >= max_frames:
            break

    # Cleanup
    try:
        galfus.animation_destroy_path_follow(PATH_CAMERA_POS_ID)
        galfus.animation_destroy_path_follow(PATH_CAMERA_LOOK_ID)
        for tr_id in [5080, 5081, 5082]:
            try:
                galfus.animation_destroy_transition(tr_id)
            except Exception:
                pass
        galfus.realm3d_destroy(REALM_3D)
        galfus.realm2d_destroy(REALM_2D)
        galfus.multiverse_destroy_target(TARGET_WINDOW)
        galfus.platform_shutdown()
    except Exception:
        pass

    print("✔ Python feature tour finished gracefully.")


if __name__ == "__main__":
    max_frames_arg = int(sys.argv[1]) if len(sys.argv) > 1 else None
    main(max_frames_arg)
