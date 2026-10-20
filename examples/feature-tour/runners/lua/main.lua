package.path = 'sdk/lua/?.lua;' .. package.path
local galfus = require('galfus')

print("=== Lua Runner: Galfus Engine Feature Tour ===")

local ok = pcall(function()
    galfus.platform_init_headless()
end)

local TARGET_ID = 1
local REALM_3D = 10
local REALM_2D = 20

galfus.multiverse_create_target(TARGET_ID, '{"kind":{"type":"texture","width":640,"height":480,"format":"rgba8unorm"},"size":[640,480]}')

galfus.realm3d_create(REALM_3D)
galfus.realm2d_create(REALM_2D)

galfus.realm3d_create_camera(
    REALM_3D,
    1,
    '{"fovY":60.0,"near":0.1,"far":1000.0,"cameraSlot":0,"lookAt":{"target":[0.0,1.2,0.0],"up":[0.0,1.0,0.0]}}',
    '{"position":[0.0,2.5,7.0]}'
)

galfus.multiverse_create_invocation(100, '{"realmId":10,"targetId":1,"cameraSlot":0,"viewport":{"anchorX":"left","anchorY":"top","width":{"vw":100},"height":{"vh":50}},"clearColor":[0.06,0.08,0.12,1.0]}')
galfus.multiverse_create_invocation(101, '{"realmId":20,"targetId":1,"cameraSlot":0,"viewport":{"anchorX":"left","anchorY":"bottom","width":{"vw":100},"height":{"vh":50}},"clearColor":[0.02,0.03,0.05,1.0]}')

-- Path following
local posCmds = '[{"type":"moveTo","to":[0.0,2.5,7.0]},{"type":"lineTo","to":[16.0,2.5,7.0],"duration":4.0}]'
local posCfg = '{"duration":36.0,"loopMode":"loop","valueType":"position3D"}'
galfus.animation_create_path_follow(401, posCmds, posCfg)
galfus.animation_bind_path_follow_target(401, '{"kind":"camera3DTransform","realmId":10,"cameraId":1}')

local lookCmds = '[{"type":"moveTo","to":[0.0,1.2,0.0]},{"type":"lineTo","to":[16.0,1.2,0.0],"duration":4.0}]'
local lookCfg = '{"duration":36.0,"loopMode":"loop","valueType":"position3D"}'
galfus.animation_create_path_follow(402, lookCmds, lookCfg)
galfus.animation_bind_path_follow_target(402, '{"kind":"camera3DLookAt","realmId":10,"cameraId":1}')

for f = 0, 4 do
    galfus.animation_step(0.016)
    galfus.multiverse_resolve()
    galfus.multiverse_dispatch(f, 0.016)
end

galfus.animation_destroy_path_follow(401)
galfus.animation_destroy_path_follow(402)
galfus.realm_destroy(REALM_3D)
galfus.realm_destroy(REALM_2D)
galfus.multiverse_destroy_target(TARGET_ID)
galfus.platform_shutdown()

print("✔ Lua feature tour runner completed successfully!")
