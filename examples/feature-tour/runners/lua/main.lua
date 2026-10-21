package.path = 'sdk/lua/?.lua;examples/feature-tour/runners/lua/?.lua;' .. package.path
local ffi = require("ffi")

pcall(function()
    ffi.cdef[[
        typedef long time_t;
        typedef struct timespec {
            time_t tv_sec;
            long tv_nsec;
        } timespec;
        int clock_gettime(int clk_id, struct timespec *tp);
    ]]
end)

local ts = ffi.new("struct timespec")
local CLOCK_MONOTONIC = 1

local function get_time_sec()
    ffi.C.clock_gettime(CLOCK_MONOTONIC, ts)
    return tonumber(ts.tv_sec) + tonumber(ts.tv_nsec) * 1e-9
end

local galfus = require('galfus')
local json = require('json')
local procedural = require('procedural')
local panel_svg = require('panel_svg')

local TARGET_WINDOW = 1
local REALM_3D = 10
local REALM_2D = 20
local INVOCATION_3D = 100
local INVOCATION_2D = 101
local CAMERA_3D_ID = 1
local CAMERA_2D_ID = 1
local SVG_HUD_ID = 1
local PATH_CAMERA_POS_ID = 401
local PATH_CAMERA_LOOK_ID = 402
local SOUND_ID = 501

local function read_file(path)
    local f = assert(io.open(path, "rb"))
    local content = f:read("*a")
    f:close()
    return content
end

local function extract_key(ev)
    if type(ev.logicalKey) == "table" then
        if ev.logicalKey.character then return string.lower(ev.logicalKey.character) end
        if ev.logicalKey.named then return string.lower(ev.logicalKey.named) end
    elseif type(ev.logicalKey) == "string" then
        return string.lower(ev.logicalKey)
    end
    local phys = string.lower(ev.physicalKey or "")
    if phys:sub(1, 3) == "key" and #phys == 4 then
        return phys:sub(4)
    end
    return phys
end

local function run_tour(max_frames)
    local tour_path = "examples/feature-tour/tour.json"
    local tour_content = read_file(tour_path)
    local tour = json.decode(tour_content)

    local active_binding = "Lua / LuaJIT FFI"
    print(string.format("=== %s [%s] (v%s) ===\n", tour.title, active_binding, tour.version))

    pcall(function() galfus.platform_init() end)

    local window_id = 1
    local width, height = 1024, 768

    galfus.window_create(string.format('{"id":%d,"title":"%s — Lua Runner","size":[%d,%d],"resizable":true,"decorations":true}', window_id, tour.title, width, height))
    galfus.multiverse_attach_window(window_id)

    -- 1. Create Target
    galfus.multiverse_create_target(TARGET_WINDOW, string.format('{"kind":{"type":"window","windowId":%d}}', window_id))

    -- 2. Create Realms
    galfus.realm3d_create(REALM_3D)
    galfus.realm2d_create(REALM_2D)

    -- 3. Invocations (Split Viewport)
    galfus.multiverse_create_invocation(INVOCATION_3D, '{"realmId":10,"targetId":1,"cameraSlot":0,"viewport":{"anchorX":"left","anchorY":"top","width":{"vw":100},"height":{"vh":50}},"clearColor":[0.06,0.08,0.12,1.0],"enabled":true,"zIndex":0}')
    galfus.multiverse_create_invocation(INVOCATION_2D, '{"realmId":20,"targetId":1,"cameraSlot":0,"viewport":{"anchorX":"left","anchorY":"bottom","width":{"vw":100},"height":{"vh":50}},"clearColor":[0.08,0.1,0.15,1.0],"enabled":true,"zIndex":1}')

    -- 2D Ambient Light
    galfus.realm2d_create_light(REALM_2D, 1, '{"color":[1.0,1.0,1.0],"intensity":1.0,"range":1000.0,"active":true}', '{"position":[0.0,0.0]}')

    -- Cameras
    local first_pos = tour.cameraPositionPath.commands[1].to or {0.0, 2.5, 7.0}
    local first_look = tour.cameraLookTargetPath.commands[1].to or {0.0, 1.2, 0.0}

    galfus.realm3d_create_camera(
        REALM_3D, CAMERA_3D_ID,
        string.format('{"fovY":60.0,"near":0.1,"far":1000.0,"cameraSlot":0,"lookAt":{"target":[%f,%f,%f],"up":[0.0,1.0,0.0]}}', first_look[1], first_look[2], first_look[3]),
        string.format('{"position":[%f,%f,%f]}', first_pos[1], first_pos[2], first_pos[3])
    )

    galfus.realm2d_create_camera(REALM_2D, CAMERA_2D_ID, '{"orthoScale":240,"cameraSlot":0}', '{"position":[0.0,0.0]}')

    -- Skybox
    galfus.realm3d_set_environment(REALM_3D, '{"ambientColor":[0.15,0.18,0.22,1.0],"exposure":1.1,"skybox":{"mode":"procedural","skyColor":[0.2,0.4,0.7,1.0],"horizonColor":[0.55,0.65,0.75,1.0],"groundColor":[0.06,0.08,0.1,1.0],"sunDirection":[0.6,0.8,0.3,0.0],"sunColor":[1.0,0.95,0.85,2.0],"intensity":1.2}}')

    -- Build 3D exhibit rooms
    for _, room in ipairs(tour.rooms) do
        procedural.build_room_scene(REALM_3D, room, tour.defaultSeed, galfus)
    end

    -- Audio load
    pcall(function()
        local s_buf, s_len = procedural.make_sound(tour.defaultSeed, 440.0, 1.0)
        galfus.audio_load_sound(SOUND_ID, s_buf, s_len)
    end)

    -- Companion SVG panel
    local initial_room = tour.rooms[1]
    local initial_svg = panel_svg.render_companion_panel_svg(tour, initial_room, 0.0, false, active_binding)
    galfus.realm2d_create_svg(REALM_2D, SVG_HUD_ID, string.format('{"source":%s}', json.encode(initial_svg)), '{"position":[0,0],"scale":[1,1]}')

    -- Circular path follow helper
    local function rotate_path_commands(commands, room_idx, origin)
        local rotated = {{type = "moveTo", to = origin}}
        local num_rooms = #tour.rooms
        for offset = 0, num_rooms - 1 do
            local r = (room_idx + offset) % num_rooms
            local linger = commands[1 + 2 * r + 1]
            local travel = commands[2 + 2 * r + 1]
            if linger then table.insert(rotated, linger) end
            if travel then table.insert(rotated, travel) end
        end
        return rotated
    end

    local function setup_paths(room_idx)
        pcall(function() galfus.animation_destroy_path_follow(PATH_CAMERA_POS_ID) end)
        pcall(function() galfus.animation_destroy_path_follow(PATH_CAMERA_LOOK_ID) end)

        local room = tour.rooms[room_idx + 1]
        local pos_commands = rotate_path_commands(tour.cameraPositionPath.commands, room_idx, room.cameraPoint)
        local look_commands = rotate_path_commands(tour.cameraLookTargetPath.commands, room_idx, room.focusPoint)

        galfus.animation_create_path_follow(PATH_CAMERA_POS_ID, json.encode(pos_commands), json.encode(tour.cameraPositionPath.config))
        galfus.animation_bind_path_follow_target(PATH_CAMERA_POS_ID, '{"kind":"camera3DTransform","realmId":10,"cameraId":1}')

        galfus.animation_create_path_follow(PATH_CAMERA_LOOK_ID, json.encode(look_commands), json.encode(tour.cameraLookTargetPath.config))
        galfus.animation_bind_path_follow_target(PATH_CAMERA_LOOK_ID, '{"kind":"camera3DLookAt","realmId":10,"cameraId":1}')

        galfus.realm3d_set_camera_transform(REALM_3D, CAMERA_3D_ID, { position = room.cameraPoint })
        galfus.realm3d_set_camera_look_at(REALM_3D, CAMERA_3D_ID, { target = room.focusPoint, up = {0.0, 1.0, 0.0} })
    end

    setup_paths(0)
    print("✔ Tour paths and rooms configured successfully!\n")

    local running = true
    local is_paused = false
    local tour_clock = 0.0
    local anim_clock = 0.0
    local current_room_index = 0
    local frame = 0
    local last_time = get_time_sec()

    local function update_hud()
        local active_room = tour.rooms[current_room_index + 1]
        local updated_svg = panel_svg.render_companion_panel_svg(tour, active_room, tour_clock, is_paused, active_binding)
        galfus.realm2d_set_svg_source(REALM_2D, SVG_HUD_ID, updated_svg)
    end

    local function apply_room_state(room_idx)
        current_room_index = room_idx
        update_hud()

        -- Shader filters for Room 8
        if room_idx == 8 then
            pcall(function() galfus.multiverse_set_invocation_filters(INVOCATION_3D, '["chromaticAberration","vignette"]') end)
        else
            pcall(function() galfus.multiverse_set_invocation_filters(INVOCATION_3D, '[]') end)
        end

        -- Audio chime for Room 9
        if room_idx == 9 then
            pcall(function() galfus.audio_play_sound(SOUND_ID, 0.9, 0.0, 1.0, false) end)
        end
    end

    local function seek_to_room(target_idx)
        local num_rooms = #tour.rooms
        local wrapped = (target_idx % num_rooms + num_rooms) % num_rooms
        local room = tour.rooms[wrapped + 1]
        tour_clock = room.startTime
        setup_paths(wrapped)
        apply_room_state(wrapped)
        print(string.format("[Tour] Jumped to Room %d: %s", wrapped + 1, room.name))
    end

    while running do
        local now = get_time_sec()
        local dt = math.min(0.1, math.max(0.001, now - last_time))
        last_time = now

        local events = galfus.platform_pump_events()
        for _, ev in ipairs(events) do
            if ev.kind == "window" then
                if ev.type == "closeRequested" then
                    running = false
                elseif ev.type == "resized" then
                    galfus.multiverse_update_window_size(window_id, math.floor(ev.width or width), math.floor(ev.height or height))
                end
            elseif ev.kind == "keyboard" and ev.type == "input" then
                if ev.state == "pressed" then
                    local key = extract_key(ev)
                    if key == "escape" then
                        running = false
                    elseif key == " " or key == "space" then
                        is_paused = not is_paused
                        if not is_paused then
                            setup_paths(current_room_index)
                        end
                        update_hud()
                        print(string.format("[Tour] Playback %s", is_paused and "PAUSED" or "RESUMED"))
                    elseif key == "r" then
                        seek_to_room(0)
                    elseif key == "arrowright" or key == "right" then
                        seek_to_room(current_room_index + 1)
                    elseif key == "arrowleft" or key == "left" then
                        seek_to_room(current_room_index - 1)
                    end
                end
            end
        end

        anim_clock = anim_clock + dt

        if not is_paused then
            tour_clock = (tour_clock + dt) % tour.duration
            for _, r in ipairs(tour.rooms) do
                if tour_clock >= r.startTime and tour_clock < r.startTime + r.duration then
                    if r.roomIndex ~= current_room_index then
                        apply_room_state(r.roomIndex)
                    end
                    break
                end
            end
        end

        galfus.animation_step(dt)

        if is_paused then
            local active_room = tour.rooms[current_room_index + 1]
            pcall(function()
                galfus.realm3d_set_camera_transform(REALM_3D, CAMERA_3D_ID, { position = active_room.cameraPoint })
                galfus.realm3d_set_camera_look_at(REALM_3D, CAMERA_3D_ID, { target = active_room.focusPoint, up = {0.0, 1.0, 0.0} })
            end)
        end

        -- Update bones in Room 6
        local b_pal, b_count = procedural.compute_bone_palette(anim_clock, 12, 5.0)
        pcall(function()
            galfus.realm3d_update_bones(REALM_3D, 7102, b_pal, b_count)
        end)

        galfus.multiverse_resolve()
        galfus.multiverse_dispatch(frame, dt)
        frame = frame + 1

        if max_frames and frame >= max_frames then
            break
        end
    end

    -- Cleanup
    pcall(function()
        galfus.animation_destroy_path_follow(PATH_CAMERA_POS_ID)
        galfus.animation_destroy_path_follow(PATH_CAMERA_LOOK_ID)
        for _, id in ipairs({5080, 5081, 5082}) do
            pcall(function() galfus.animation_destroy_transition(id) end)
        end
        galfus.realm3d_destroy(REALM_3D)
        galfus.realm2d_destroy(REALM_2D)
        galfus.multiverse_destroy_target(TARGET_WINDOW)
        galfus.platform_shutdown()
    end)

    print("✔ Lua feature tour finished gracefully.")
end

local max_f = tonumber(arg and arg[1])
run_tour(max_f)
