#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include "galfus.h"

int main() {
    printf("=== C Runner: Galfus Engine Feature Tour ===\n");

    int res = galfus_platform_init_headless();
    assert(res == 0);

    const uint32_t TARGET_ID = 1;
    const uint32_t REALM_3D = 10;
    const uint32_t REALM_2D = 20;

    res = galfus_multiverse_create_target(
        TARGET_ID,
        "{\"kind\":{\"type\":\"texture\",\"width\":640,\"height\":480,\"format\":\"rgba8unorm\"},\"size\":[640,480]}"
    );
    assert(res == 0);

    res = galfus_realm_3d_create(REALM_3D);
    assert(res == 0);
    res = galfus_realm_2d_create(REALM_2D);
    assert(res == 0);

    res = galfus_realm_3d_create_camera(
        REALM_3D,
        1,
        "{\"fovY\":60.0,\"near\":0.1,\"far\":1000.0,\"cameraSlot\":0,\"lookAt\":{\"target\":[0.0,1.2,0.0],\"up\":[0.0,1.0,0.0]}}",
        "{\"position\":[0.0,2.5,7.0]}"
    );
    assert(res == 0);

    res = galfus_multiverse_create_invocation(
        100,
        "{\"realmId\":10,\"targetId\":1,\"cameraSlot\":0,\"viewport\":{\"anchorX\":\"left\",\"anchorY\":\"top\",\"width\":{\"vw\":100},\"height\":{\"vh\":50}},\"clearColor\":[0.06,0.08,0.12,1.0]}"
    );
    assert(res == 0);

    res = galfus_multiverse_create_invocation(
        101,
        "{\"realmId\":20,\"targetId\":1,\"cameraSlot\":0,\"viewport\":{\"anchorX\":\"left\",\"anchorY\":\"bottom\",\"width\":{\"vw\":100},\"height\":{\"vh\":50}},\"clearColor\":[0.02,0.03,0.05,1.0]}"
    );
    assert(res == 0);

    const char* pos_cmds = "[{\"type\":\"moveTo\",\"to\":[0.0,2.5,7.0]},{\"type\":\"lineTo\",\"to\":[16.0,2.5,7.0],\"duration\":4.0}]";
    const char* pos_cfg = "{\"duration\":36.0,\"loopMode\":\"loop\",\"valueType\":\"position3D\"}";
    res = galfus_animation_create_path_follow(401, pos_cmds, pos_cfg);
    assert(res == 0);
    res = galfus_animation_bind_path_follow_target(401, "{\"kind\":\"camera3DTransform\",\"realmId\":10,\"cameraId\":1}");
    assert(res == 0);

    const char* look_cmds = "[{\"type\":\"moveTo\",\"to\":[0.0,1.2,0.0]},{\"type\":\"lineTo\",\"to\":[16.0,1.2,0.0],\"duration\":4.0}]";
    const char* look_cfg = "{\"duration\":36.0,\"loopMode\":\"loop\",\"valueType\":\"position3D\"}";
    res = galfus_animation_create_path_follow(402, look_cmds, look_cfg);
    assert(res == 0);
    res = galfus_animation_bind_path_follow_target(402, "{\"kind\":\"camera3DLookAt\",\"realmId\":10,\"cameraId\":1}");
    assert(res == 0);

    for (uint64_t f = 0; f < 5; f++) {
        galfus_animation_step(0.016f);
        galfus_multiverse_resolve();
        galfus_multiverse_dispatch(f, 0.016f);
    }

    galfus_animation_destroy_path_follow(401);
    galfus_animation_destroy_path_follow(402);
    galfus_realm_destroy(REALM_3D);
    galfus_realm_destroy(REALM_2D);
    galfus_multiverse_destroy_target(TARGET_ID);
    galfus_platform_shutdown();

    printf("✔ C feature tour runner completed successfully!\n");
    return 0;
}
