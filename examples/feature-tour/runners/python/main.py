import sys
import os
import json

script_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(script_dir, '../../../..'))
sys.path.append(os.path.join(root_dir, 'sdk/python'))

import galfus

tour_json_path = os.path.join(script_dir, '../../tour.json')
with open(tour_json_path, 'r', encoding='utf-8') as f:
    tour = json.load(f)

print(f"=== Python Runner: {tour['title']} (v{tour['version']}) ===")

try:
    galfus.platform_init_headless()
except Exception:
    pass

TARGET_ID = 1
REALM_3D = 10
REALM_2D = 20

galfus.multiverse_create_target(TARGET_ID, {
    "kind": {"type": "texture", "width": 640, "height": 480, "format": "rgba8unorm"},
    "size": [640, 480]
})

galfus.realm3d_create(REALM_3D)
galfus.realm2d_create(REALM_2D)

galfus.realm3d_create_camera(
    REALM_3D,
    1,
    {"fovY": 60.0, "near": 0.1, "far": 1000.0, "cameraSlot": 0, "lookAt": {"target": [0.0, 1.2, 0.0], "up": [0.0, 1.0, 0.0]}},
    {"position": [0.0, 2.5, 7.0]}
)

galfus.multiverse_create_invocation(100, {
    "realmId": REALM_3D,
    "targetId": TARGET_ID,
    "cameraSlot": 0,
    "viewport": {"anchorX": "left", "anchorY": "top", "width": {"vw": 100}, "height": {"vh": 50}},
    "clearColor": [0.06, 0.08, 0.12, 1.0]
})

galfus.multiverse_create_invocation(101, {
    "realmId": REALM_2D,
    "targetId": TARGET_ID,
    "cameraSlot": 0,
    "viewport": {"anchorX": "left", "anchorY": "bottom", "width": {"vw": 100}, "height": {"vh": 50}},
    "clearColor": [0.02, 0.03, 0.05, 1.0]
})

# Setup camera paths
galfus.animation_create_path_follow(401, tour["cameraPositionPath"]["commands"], tour["cameraPositionPath"]["config"])
galfus.animation_bind_path_follow_target(401, {"kind": "camera3DTransform", "realmId": REALM_3D, "cameraId": 1})

galfus.animation_create_path_follow(402, tour["cameraLookTargetPath"]["commands"], tour["cameraLookTargetPath"]["config"])
galfus.animation_bind_path_follow_target(402, {"kind": "camera3DLookAt", "realmId": REALM_3D, "cameraId": 1})

# Dispatch loop
for f in range(5):
    galfus.animation_step(0.016)
    galfus.multiverse_resolve()
    galfus.multiverse_dispatch(f, 0.016)

galfus.animation_destroy_path_follow(401)
galfus.animation_destroy_path_follow(402)
galfus.realm_destroy(REALM_3D)
galfus.realm_destroy(REALM_2D)
galfus.multiverse_destroy_target(TARGET_ID)
galfus.platform_shutdown()

print("✔ Python feature tour runner completed successfully!")
