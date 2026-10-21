local ffi = require("ffi")

ffi.cdef([[
    typedef struct {
        float pos[3];
        float norm[3];
        float uv[2];
        float tangent[4];
        uint32_t joints[4];
        float weights[4];
    } Vertex3DRecord;
]])

local procedural = {}

function procedural.make_palette(room_index)
    local hues = { 0.6, 0.12, 0.02, 0.16, 0.38, 0.55, 0.8, 0.45, 0.72, 0.15 }
    local h = hues[(room_index % #hues) + 1] or 0.5

    local function to_rgb(hue, sat, lit)
        local q = (lit < 0.5) and (lit * (1 + sat)) or (lit + sat - lit * sat)
        local p = 2 * lit - q
        local function hue2rgb(t)
            local t_norm = t
            if t_norm < 0 then
                t_norm = t_norm + 1
            end
            if t_norm > 1 then
                t_norm = t_norm - 1
            end
            if t_norm < 1 / 6 then
                return p + (q - p) * 6 * t_norm
            end
            if t_norm < 1 / 2 then
                return q
            end
            if t_norm < 2 / 3 then
                return p + (q - p) * (2 / 3 - t_norm) * 6
            end
            return p
        end
        return { hue2rgb(hue + 1 / 3), hue2rgb(hue), hue2rgb(hue - 1 / 3), 1.0 }
    end

    return {
        primary = to_rgb(h, 0.85, 0.6),
        secondary = to_rgb((h + 0.3) % 1.0, 0.8, 0.55),
        accent = to_rgb((h + 0.6) % 1.0, 0.9, 0.7),
    }
end

function procedural.make_texture(seed, width, height)
    width = width or 64
    height = height or 64
    local size = width * height * 4
    local buf = ffi.new("uint8_t[?]", size)
    for y = 0, height - 1 do
        for x = 0, width - 1 do
            local check = bit.band(bit.bxor(math.floor(x / 8), math.floor(y / 8)), 1)
            local idx = (y * width + x) * 4
            if check == 1 then
                buf[idx + 0] = (seed * 37) % 180 + 75
                buf[idx + 1] = (seed * 59) % 180 + 75
                buf[idx + 2] = (seed * 83) % 180 + 75
                buf[idx + 3] = 255
            else
                buf[idx + 0] = 30
                buf[idx + 1] = 35
                buf[idx + 2] = 45
                buf[idx + 3] = 255
            end
        end
    end
    return buf, size
end

function procedural.make_sound(seed, freq, duration)
    freq = freq or 440.0
    duration = duration or 1.0
    local sample_rate = 44100
    local num_samples = math.floor(sample_rate * duration)
    local data_size = num_samples * 2
    local total_size = 44 + data_size
    local buf = ffi.new("uint8_t[?]", total_size)

    -- RIFF header
    buf[0] = 0x52
    buf[1] = 0x49
    buf[2] = 0x46
    buf[3] = 0x46 -- "RIFF"
    local riff_size = 36 + data_size
    buf[4] = bit.band(riff_size, 0xFF)
    buf[5] = bit.band(bit.rshift(riff_size, 8), 0xFF)
    buf[6] = bit.band(bit.rshift(riff_size, 16), 0xFF)
    buf[7] = bit.band(bit.rshift(riff_size, 24), 0xFF)

    buf[8] = 0x57
    buf[9] = 0x41
    buf[10] = 0x56
    buf[11] = 0x45 -- "WAVE"
    buf[12] = 0x66
    buf[13] = 0x6d
    buf[14] = 0x74
    buf[15] = 0x20 -- "fmt "
    buf[16] = 16
    buf[17] = 0
    buf[18] = 0
    buf[19] = 0 -- 16
    buf[20] = 1
    buf[21] = 0 -- PCM
    buf[22] = 1
    buf[23] = 0 -- Mono
    buf[24] = bit.band(sample_rate, 0xFF)
    buf[25] = bit.band(bit.rshift(sample_rate, 8), 0xFF)
    buf[26] = bit.band(bit.rshift(sample_rate, 16), 0xFF)
    buf[27] = bit.band(bit.rshift(sample_rate, 24), 0xFF)
    local byte_rate = sample_rate * 2
    buf[28] = bit.band(byte_rate, 0xFF)
    buf[29] = bit.band(bit.rshift(byte_rate, 8), 0xFF)
    buf[30] = bit.band(bit.rshift(byte_rate, 16), 0xFF)
    buf[31] = bit.band(bit.rshift(byte_rate, 24), 0xFF)
    buf[32] = 2
    buf[33] = 0 -- Block align
    buf[34] = 16
    buf[35] = 0 -- Bits per sample
    buf[36] = 0x64
    buf[37] = 0x61
    buf[38] = 0x74
    buf[39] = 0x61 -- "data"
    buf[40] = bit.band(data_size, 0xFF)
    buf[41] = bit.band(bit.rshift(data_size, 8), 0xFF)
    buf[42] = bit.band(bit.rshift(data_size, 16), 0xFF)
    buf[43] = bit.band(bit.rshift(data_size, 24), 0xFF)

    local int16_samples = ffi.cast("int16_t*", buf + 44)
    for i = 0, num_samples - 1 do
        local t = i / sample_rate
        local env = math.exp(-3.5 * t)
        local wave = (
            0.6 * math.sin(2.0 * math.pi * freq * t)
            + 0.3 * math.sin(3.0 * math.pi * freq * t)
            + 0.1 * math.sin(4.0 * math.pi * freq * t)
        )
        local sample = math.max(-1.0, math.min(1.0, wave * env))
        int16_samples[i] = math.floor(sample * 32767)
    end

    return buf, total_size
end

function procedural.build_procedural_skinned_mesh(rings, radial_segs, height, bone_count)
    rings = rings or 24
    radial_segs = radial_segs or 16
    height = height or 5.0
    bone_count = bone_count or 12

    local vert_count = (rings + 1) * (radial_segs + 1)
    local vbuf = ffi.new("Vertex3DRecord[?]", vert_count)
    local idx_count = rings * radial_segs * 6
    local ibuf = ffi.new("uint32_t[?]", idx_count)

    local segments = math.max(1, bone_count - 1)
    local v_idx = 0
    for r = 0, rings do
        local v = r / rings
        local y = v * height
        local radius = 0.6 * (1.0 - 0.6 * v)
        local bone_f = v * segments
        local bone_idx = math.min(math.floor(bone_f), bone_count - 1)
        local next_idx = math.min(bone_idx + 1, bone_count - 1)
        local t = bone_f - bone_idx

        for s = 0, radial_segs do
            local u = s / radial_segs
            local theta = u * math.pi * 2.0
            local cos_t = math.cos(theta)
            local sin_t = math.sin(theta)

            local rec = vbuf[v_idx]
            rec.pos[0] = cos_t * radius
            rec.pos[1] = y
            rec.pos[2] = sin_t * radius
            rec.norm[0] = cos_t
            rec.norm[1] = 0.0
            rec.norm[2] = sin_t
            rec.uv[0] = u
            rec.uv[1] = v
            rec.tangent[0] = 1.0
            rec.tangent[1] = 0.0
            rec.tangent[2] = 0.0
            rec.tangent[3] = 1.0
            rec.joints[0] = bone_idx
            rec.joints[1] = next_idx
            rec.joints[2] = 0
            rec.joints[3] = 0
            rec.weights[0] = 1.0 - t
            rec.weights[1] = t
            rec.weights[2] = 0.0
            rec.weights[3] = 0.0

            v_idx = v_idx + 1
        end
    end

    local i_idx = 0
    local ring_verts = radial_segs + 1
    for r = 0, rings - 1 do
        for s = 0, radial_segs - 1 do
            local i0 = r * ring_verts + s
            local i1 = i0 + 1
            local i2 = (r + 1) * ring_verts + s
            local i3 = i2 + 1
            ibuf[i_idx + 0] = i0
            ibuf[i_idx + 1] = i2
            ibuf[i_idx + 2] = i1
            ibuf[i_idx + 3] = i1
            ibuf[i_idx + 4] = i2
            ibuf[i_idx + 5] = i3
            i_idx = i_idx + 6
        end
    end

    return vbuf, vert_count * ffi.sizeof("Vertex3DRecord"), ibuf, idx_count
end

function procedural.compute_bone_palette(time_val, bone_count, height)
    bone_count = bone_count or 12
    height = height or 5.0
    local palette = ffi.new("float[192]")
    local seg_height = height / math.max(1, bone_count - 1)

    for i = 0, bone_count - 1 do
        local frac = i / (bone_count - 1)
        local rest_y = i * seg_height
        local wave = math.sin(time_val * 3.5 + i * 0.45)
        local dx = wave * frac * frac * 1.5
        local dz = math.cos(time_val * 2.5 + i * 0.3) * frac * 0.8
        local rz = wave * frac * 0.4

        local cz = math.cos(rz)
        local sz = math.sin(rz)

        local m = { cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, dx, rest_y * (1.0 - cz), dz, 1 }
        for c = 0, 15 do
            palette[i * 16 + c] = m[c + 1]
        end
    end

    return palette, bone_count * 16
end

function procedural.build_room_scene(realm_id, room, seed, galfus)
    local room_idx = room.roomIndex
    local base_id = (room_idx + 1) * 1000
    local fx = room.focusPoint[1]
    local fy = room.focusPoint[2]
    local fz = room.focusPoint[3]
    local palette = procedural.make_palette(room_idx)
    local recipe = room.id or "entrance"

    -- 1. Common Floor tile per room
    local geom_floor = base_id + 1
    local mat_floor = base_id + 2
    local model_floor = base_id + 3

    galfus.realm3d_create_geometry(realm_id, geom_floor, '{"primitive":"plane","size":16.0}')
    galfus.realm3d_create_material(
        realm_id,
        mat_floor,
        '{"baseColor":[0.15,0.17,0.22,1.0],"roughness":0.7,"metallic":0.15}'
    )
    galfus.realm3d_create_model(
        realm_id,
        model_floor,
        string.format('{"geometryId":%d,"materialId":%d}', geom_floor, mat_floor),
        string.format('{"position":[%f,0,%f]}', fx, fz)
    )

    -- 2. Pedestal
    local geom_pedestal = base_id + 10
    local mat_pedestal = base_id + 11
    local model_pedestal = base_id + 12

    galfus.realm3d_create_geometry(
        realm_id,
        geom_pedestal,
        '{"primitive":"cylinder","radius":1.8,"size":0.4,"subdivisions":24}'
    )
    galfus.realm3d_create_material(
        realm_id,
        mat_pedestal,
        '{"baseColor":[0.22,0.25,0.32,1.0],"roughness":0.3,"metallic":0.4}'
    )
    galfus.realm3d_create_model(
        realm_id,
        model_pedestal,
        string.format('{"geometryId":%d,"materialId":%d}', geom_pedestal, mat_pedestal),
        string.format('{"position":[%f,0.2,%f]}', fx, fz)
    )

    -- 3. Room Light (Point light illuminating room exhibit)
    local light_id = base_id + 20
    galfus.realm3d_create_light(
        realm_id,
        light_id,
        string.format(
            '{"kind":"point","color":[%f,%f,%f],"intensity":3.8,"range":16.0,"castShadow":true}',
            palette.primary[1],
            palette.primary[2],
            palette.primary[3]
        ),
        string.format('{"position":[%f,%f,%f]}', fx, fy + 2.5, fz + 1.2)
    )

    -- 4. Room-specific feature exhibits
    if recipe == "entrance" then
        -- Golden Cube Monument + Cyan Accent Ring
        local geom_cube = base_id + 30
        local mat_gold = base_id + 31
        local model_cube = base_id + 32

        galfus.realm3d_create_geometry(realm_id, geom_cube, '{"primitive":"cube","size":1.4}')
        galfus.realm3d_create_material(
            realm_id,
            mat_gold,
            '{"baseColor":[1.0,0.82,0.2,1.0],"roughness":0.15,"metallic":0.95,"emissiveColor":[0.2,0.15,0.04,1.0],"emissiveIntensity":0.8}'
        )
        galfus.realm3d_create_model(
            realm_id,
            model_cube,
            string.format('{"geometryId":%d,"materialId":%d}', geom_cube, mat_gold),
            string.format('{"position":[%f,1.5,%f]}', fx, fz)
        )

        -- Accent Torus Halo
        local geom_halo = base_id + 33
        local mat_halo = base_id + 34
        local model_halo = base_id + 35
        galfus.realm3d_create_geometry(
            realm_id,
            geom_halo,
            '{"primitive":"torus","radius":1.2,"subdivisions":24}'
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_halo,
            '{"baseColor":[0.2,0.85,1.0,1.0],"roughness":0.1,"metallic":0.8,"emissiveColor":[0.1,0.4,0.6,1.0],"emissiveIntensity":1.2}'
        )
        galfus.realm3d_create_model(
            realm_id,
            model_halo,
            string.format('{"geometryId":%d,"materialId":%d}', geom_halo, mat_halo),
            string.format('{"position":[%f,1.5,%f]}', fx, fz)
        )
    elseif recipe == "geometry" then
        -- 5 distinct PBR Primitives: Cube, Sphere, Cylinder, Torus, Matte Plastic
        local items = {
            {
                prim = "cube",
                pos = { -2.4, 1.3, 0 },
                color = "[0.95, 0.8, 0.2, 1.0]",
                rough = 0.1,
                metal = 0.9,
            }, -- Gold
            {
                prim = "sphere",
                pos = { -1.2, 1.3, 0 },
                color = "[0.9, 0.92, 0.95, 1.0]",
                rough = 0.05,
                metal = 1.0,
            }, -- Chrome
            {
                prim = "cylinder",
                pos = { 0.0, 1.3, 0 },
                color = "[0.95, 0.15, 0.3, 1.0]",
                rough = 0.15,
                metal = 0.2,
            }, -- Ruby
            {
                prim = "torus",
                pos = { 1.2, 1.3, 0 },
                color = "[0.2, 0.85, 0.4, 1.0]",
                rough = 0.2,
                metal = 0.3,
            }, -- Emerald
            {
                prim = "sphere",
                pos = { 2.4, 1.3, 0 },
                color = "[0.15, 0.6, 1.0, 1.0]",
                rough = 0.7,
                metal = 0.0,
            }, -- Matte Plastic
        }

        for idx, item in ipairs(items) do
            local gid = base_id + 30 + (idx - 1) * 3
            local mid = base_id + 31 + (idx - 1) * 3
            local mod_id = base_id + 32 + (idx - 1) * 3
            galfus.realm3d_create_geometry(
                realm_id,
                gid,
                string.format(
                    '{"primitive":"%s","size":0.9,"radius":0.5,"subdivisions":24}',
                    item.prim
                )
            )
            galfus.realm3d_create_material(
                realm_id,
                mid,
                string.format(
                    '{"baseColor":%s,"roughness":%f,"metallic":%f}',
                    item.color,
                    item.rough,
                    item.metal
                )
            )
            galfus.realm3d_create_model(
                realm_id,
                mod_id,
                string.format('{"geometryId":%d,"materialId":%d}', gid, mid),
                string.format(
                    '{"position":[%f,%f,%f]}',
                    fx + item.pos[1],
                    item.pos[2],
                    fz + item.pos[3]
                )
            )
        end
    elseif recipe == "lighting" then
        -- Occluder Pillars casting shadows + 3 RGB Dynamic Lights + Glowing Emissive Box
        local p1 = base_id + 40
        local m1 = base_id + 41
        galfus.realm3d_create_geometry(
            realm_id,
            p1,
            '{"primitive":"cylinder","radius":0.25,"size":2.5}'
        )
        galfus.realm3d_create_material(
            realm_id,
            m1,
            '{"baseColor":[0.35,0.38,0.45,1.0],"roughness":0.4,"metallic":0.2}'
        )

        local offsets = { -1.5, 1.5 }
        for idx, ox in ipairs(offsets) do
            galfus.realm3d_create_model(
                realm_id,
                base_id + 42 + (idx - 1),
                string.format('{"geometryId":%d,"materialId":%d}', p1, m1),
                string.format('{"position":[%f,1.25,%f]}', fx + ox, fz)
            )
        end

        -- Emissive Glowing Box
        local geom_box = base_id + 45
        local mat_emiss = base_id + 46
        galfus.realm3d_create_geometry(realm_id, geom_box, '{"primitive":"cube","size":0.8}')
        galfus.realm3d_create_material(
            realm_id,
            mat_emiss,
            '{"baseColor":[1.0,0.4,0.1,1.0],"emissiveColor":[1.0,0.5,0.1,1.0],"emissiveIntensity":4.5,"roughness":0.1,"metallic":0.0}'
        )
        galfus.realm3d_create_model(
            realm_id,
            base_id + 47,
            string.format('{"geometryId":%d,"materialId":%d}', geom_box, mat_emiss),
            string.format('{"position":[%f,1.4,%f]}', fx, fz)
        )

        -- RGB Point lights
        galfus.realm3d_create_light(
            realm_id,
            base_id + 50,
            '{"kind":"point","color":[1.0,0.2,0.2],"intensity":4.0,"range":10.0,"castShadow":true}',
            string.format('{"position":[%f,2.0,%f]}', fx - 2.0, fz - 1.0)
        )
        galfus.realm3d_create_light(
            realm_id,
            base_id + 51,
            '{"kind":"point","color":[0.2,1.0,0.3],"intensity":4.0,"range":10.0,"castShadow":true}',
            string.format('{"position":[%f,2.0,%f]}', fx + 2.0, fz - 1.0)
        )
        galfus.realm3d_create_light(
            realm_id,
            base_id + 52,
            '{"kind":"point","color":[0.2,0.4,1.0],"intensity":4.0,"range":10.0,"castShadow":true}',
            string.format('{"position":[%f,3.0,%f]}', fx, fz + 2.0)
        )
    elseif recipe == "particles" then
        -- GPU Sparks Fountain
        local mat_part = base_id + 60
        galfus.realm3d_create_material(
            realm_id,
            mat_part,
            '{"surfaceType":"additive","baseColor":[1.0,0.75,0.2,1.0]}'
        )
        galfus.realm3d_create_particle_emitter(
            realm_id,
            base_id + 61,
            string.format(
                '{"label":"Tour Spark Fountain","materialId":%d,"maxParticles":800,"spawnRate":200,"lifetimeRange":[0.7,1.5],"speedRange":[3.8,6.2],"direction":[0.0,1.0,0.0],"spreadAngleRad":0.35,"gravity":[0.0,-6.5,0.0],"sizeRange":[0.05,0.12]}',
                mat_part
            ),
            string.format('{"position":[%f,0.5,%f]}', fx, fz)
        )
    elseif recipe == "animation" then
        -- Kinetic sculptures actively driven by transitions
        -- Model 1: Vertical Bouncing Cube
        local geom_cube = base_id + 70
        local mat_bounce = base_id + 71
        local model_bounce = base_id + 72

        galfus.realm3d_create_geometry(realm_id, geom_cube, '{"primitive":"cube","size":1.0}')
        galfus.realm3d_create_material(
            realm_id,
            mat_bounce,
            '{"baseColor":[0.2,0.7,1.0,1.0],"roughness":0.2,"metallic":0.3}'
        )
        galfus.realm3d_create_model(
            realm_id,
            model_bounce,
            string.format('{"geometryId":%d,"materialId":%d}', geom_cube, mat_bounce),
            string.format('{"position":[%f,0.6,%f]}', fx - 1.8, fz)
        )

        local trans_bounce = base_id + 80
        pcall(function()
            galfus.animation_destroy_transition(trans_bounce)
        end)
        local cfg_bounce =
            '{"duration":1.6,"delay":0.1,"easing":"easeOutBounce","loopMode":"pingPong"}'
        galfus.animation_create_transition(
            trans_bounce,
            string.format('{"type":"transform3D","value":[%f,0.6,%f,0,0,0,1,1,1,1]}', fx - 1.8, fz),
            cfg_bounce
        )
        galfus.animation_bind_target(
            trans_bounce,
            string.format(
                '{"kind":"modelTransform3D","realmId":%d,"modelId":%d}',
                realm_id,
                model_bounce
            )
        )
        galfus.animation_transition_to(
            trans_bounce,
            string.format(
                '{"type":"transform3D","value":[%f,3.2,%f,0,0.707,0,0.707,1,1,1]}',
                fx - 1.8,
                fz
            ),
            cfg_bounce
        )

        -- Model 2: Elastic Pulsing Sphere
        local geom_sphere = base_id + 73
        local mat_pulse = base_id + 74
        local model_pulse = base_id + 75
        galfus.realm3d_create_geometry(
            realm_id,
            geom_sphere,
            '{"primitive":"sphere","radius":0.6,"subdivisions":24}'
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_pulse,
            '{"baseColor":[1.0,0.25,0.45,1.0],"roughness":0.15,"metallic":0.7}'
        )
        galfus.realm3d_create_model(
            realm_id,
            model_pulse,
            string.format('{"geometryId":%d,"materialId":%d}', geom_sphere, mat_pulse),
            string.format('{"position":[%f,1.4,%f]}', fx, fz)
        )

        local trans_pulse = base_id + 81
        pcall(function()
            galfus.animation_destroy_transition(trans_pulse)
        end)
        local cfg_pulse =
            '{"duration":1.3,"delay":0.0,"easing":"easeInOutCubic","loopMode":"pingPong"}'
        galfus.animation_create_transition(
            trans_pulse,
            string.format('{"type":"transform3D","value":[%f,1.4,%f,0,0,0,1,0.7,0.7,0.7]}', fx, fz),
            cfg_pulse
        )
        galfus.animation_bind_target(
            trans_pulse,
            string.format(
                '{"kind":"modelTransform3D","realmId":%d,"modelId":%d}',
                realm_id,
                model_pulse
            )
        )
        galfus.animation_transition_to(
            trans_pulse,
            string.format('{"type":"transform3D","value":[%f,1.4,%f,0,0,0,1,1.5,1.5,1.5]}', fx, fz),
            cfg_pulse
        )

        -- Model 3: Rotating Torus
        local geom_torus = base_id + 76
        local mat_torus = base_id + 77
        local model_torus = base_id + 78
        galfus.realm3d_create_geometry(
            realm_id,
            geom_torus,
            '{"primitive":"torus","radius":0.7,"subdivisions":24}'
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_torus,
            '{"baseColor":[0.3,0.9,0.4,1.0],"roughness":0.25,"metallic":0.4}'
        )
        galfus.realm3d_create_model(
            realm_id,
            model_torus,
            string.format('{"geometryId":%d,"materialId":%d}', geom_torus, mat_torus),
            string.format('{"position":[%f,1.4,%f]}', fx + 1.8, fz)
        )

        local trans_torus = base_id + 82
        pcall(function()
            galfus.animation_destroy_transition(trans_torus)
        end)
        local cfg_torus =
            '{"duration":1.5,"delay":0.2,"easing":"easeInOutSine","loopMode":"pingPong"}'
        galfus.animation_create_transition(
            trans_torus,
            string.format('{"type":"transform3D","value":[%f,0.8,%f,0,0,0,1,1,1,1]}', fx + 1.8, fz),
            cfg_torus
        )
        galfus.animation_bind_target(
            trans_torus,
            string.format(
                '{"kind":"modelTransform3D","realmId":%d,"modelId":%d}',
                realm_id,
                model_torus
            )
        )
        galfus.animation_transition_to(
            trans_torus,
            string.format(
                '{"type":"transform3D","value":[%f,2.4,%f,0.5,0.5,0.5,0.5,1,1,1]}',
                fx + 1.8,
                fz
            ),
            cfg_torus
        )
    elseif recipe == "mirror_portal" then
        -- Planar Reflection Mirror Quad + Portal Frame
        local geom_mirror = base_id + 90
        local mat_mirror = base_id + 91
        local model_mirror = base_id + 92

        galfus.realm3d_create_geometry(realm_id, geom_mirror, '{"primitive":"plane","size":3.2}')
        galfus.realm3d_create_material(
            realm_id,
            mat_mirror,
            '{"surfaceType":"mirror","baseColor":[0.95,0.97,1.0,1.0],"roughness":0.02,"metallic":0.98,"reflectance":0.9}'
        )
        galfus.realm3d_create_model(
            realm_id,
            model_mirror,
            string.format('{"geometryId":%d,"materialId":%d}', geom_mirror, mat_mirror),
            string.format('{"position":[%f,1.8,%f],"rotation":[0.7071,0,0,0.7071]}', fx, fz - 1.5)
        )

        galfus.realm3d_create_portal(
            realm_id,
            base_id + 93,
            string.format('{"modelId":%d,"active":true}', model_mirror)
        )

        -- Decorative Mirror Frame
        local geom_frame = base_id + 94
        local mat_frame = base_id + 95
        galfus.realm3d_create_geometry(
            realm_id,
            geom_frame,
            '{"primitive":"cylinder","radius":0.1,"size":3.4}'
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_frame,
            '{"baseColor":[0.85,0.7,0.25,1.0],"roughness":0.25,"metallic":0.85}'
        )
        galfus.realm3d_create_model(
            realm_id,
            base_id + 96,
            string.format('{"geometryId":%d,"materialId":%d}', geom_frame, mat_frame),
            string.format('{"position":[%f,1.8,%f]}', fx - 1.6, fz - 1.5)
        )
        galfus.realm3d_create_model(
            realm_id,
            base_id + 97,
            string.format('{"geometryId":%d,"materialId":%d}', geom_frame, mat_frame),
            string.format('{"position":[%f,1.8,%f]}', fx + 1.6, fz - 1.5)
        )
    elseif recipe == "bones" then
        -- 12-Joint Skinned Column / Tentacle
        local geom_skinned = base_id + 100
        local mat_skinned = base_id + 101
        local model_skinned = base_id + 102

        local vbuf, vlen, ibuf, icount = procedural.build_procedural_skinned_mesh(24, 16, 5.0, 12)
        local v_raw = ffi.cast("const uint8_t*", vbuf)
        local i_raw = ffi.cast("const uint32_t*", ibuf)
        galfus.realm3d_create_geometry_raw(realm_id, geom_skinned, v_raw, vlen, i_raw, icount)
        galfus.realm3d_create_material(
            realm_id,
            mat_skinned,
            '{"baseColor":[0.15,0.85,0.95,1.0],"emissiveColor":[0.05,0.25,0.35,1.0],"roughness":0.2,"metallic":0.6}'
        )
        galfus.realm3d_create_model(
            realm_id,
            model_skinned,
            string.format(
                '{"geometryId":%d,"materialId":%d,"castShadow":true,"boneCount":12,"boneOffset":0,"active":true}',
                geom_skinned,
                mat_skinned
            ),
            string.format('{"position":[%f,0.4,%f]}', fx, fz)
        )
    elseif recipe == "refraction" then
        -- Screen-Space Refraction Glass Gems
        local geom_sphere = base_id + 110
        local mat_glass = base_id + 111
        local model_glass = base_id + 112

        galfus.realm3d_create_geometry(
            realm_id,
            geom_sphere,
            '{"primitive":"sphere","radius":1.0,"subdivisions":32}'
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_glass,
            '{"surfaceType":"refractive","baseColor":[0.1,0.85,0.4,0.35],"roughness":0.04,"metallic":0.0,"reflectance":0.7,"refractionIndex":1.52,"refractionDistortion":0.1}'
        )
        galfus.realm3d_create_model(
            realm_id,
            model_glass,
            string.format('{"geometryId":%d,"materialId":%d}', geom_sphere, mat_glass),
            string.format('{"position":[%f,1.5,%f]}', fx, fz)
        )

        -- Background patterned pillar behind glass
        local geom_back = base_id + 113
        local mat_back = base_id + 114
        galfus.realm3d_create_geometry(realm_id, geom_back, '{"primitive":"cube","size":1.2}')
        galfus.realm3d_create_material(
            realm_id,
            mat_back,
            '{"baseColor":[0.95,0.2,0.35,1.0],"emissiveColor":[0.3,0.05,0.1,1.0],"roughness":0.2,"metallic":0.5}'
        )
        galfus.realm3d_create_model(
            realm_id,
            base_id + 115,
            string.format('{"geometryId":%d,"materialId":%d}', geom_back, mat_back),
            string.format('{"position":[%f,1.5,%f]}', fx, fz - 2.5)
        )
    elseif recipe == "effects" then
        -- Post-Processing & Screen Effects Exhibit
        local geom_podium = base_id + 120
        local mat_podium = base_id + 121
        galfus.realm3d_create_geometry(
            realm_id,
            geom_podium,
            '{"primitive":"torus","radius":1.1,"subdivisions":32}'
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_podium,
            '{"baseColor":[0.85,0.3,0.9,1.0],"emissiveColor":[0.4,0.1,0.5,1.0],"roughness":0.1,"metallic":0.8}'
        )
        galfus.realm3d_create_model(
            realm_id,
            base_id + 122,
            string.format('{"geometryId":%d,"materialId":%d}', geom_podium, mat_podium),
            string.format('{"position":[%f,1.5,%f]}', fx, fz)
        )
    else
        -- Spatial Audio Beacon & Finale Room
        local geom_beacon = base_id + 130
        local mat_beacon = base_id + 131
        galfus.realm3d_create_geometry(
            realm_id,
            geom_beacon,
            '{"primitive":"cylinder","radius":0.7,"size":2.0,"subdivisions":24}'
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_beacon,
            '{"baseColor":[0.95,0.8,0.2,1.0],"emissiveColor":[0.35,0.28,0.05,1.0],"roughness":0.2,"metallic":0.8}'
        )
        galfus.realm3d_create_model(
            realm_id,
            base_id + 132,
            string.format('{"geometryId":%d,"materialId":%d}', geom_beacon, mat_beacon),
            string.format('{"position":[%f,1.4,%f]}', fx, fz)
        )
    end
end

return procedural
