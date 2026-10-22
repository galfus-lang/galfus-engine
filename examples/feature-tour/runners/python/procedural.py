import math
import struct
import ctypes
from typing import Any, Dict, List, Tuple


class DeterministicRng:
    """Deterministic pseudo-random number generator (LCG)."""

    def __init__(self, seed: int):
        self.state = seed & 0xFFFFFFFF

    def next_float(self) -> float:
        self.state = (1664525 * self.state + 1013904223) & 0xFFFFFFFF
        return (self.state >> 8) / 16777216.0


def make_palette(room_index: int) -> Dict[str, List[float]]:
    """Returns deterministic room palette colors matching procedural.ts."""
    hues = [0.6, 0.12, 0.02, 0.16, 0.38, 0.55, 0.8, 0.45, 0.72, 0.15]
    h = hues[room_index % len(hues)]

    def to_rgb(hue: float, sat: float, lit: float) -> List[float]:
        q = lit * (1.0 + sat) if lit < 0.5 else lit + sat - lit * sat
        p = 2.0 * lit - q

        def hue2rgb(t: float) -> float:
            t_norm = t
            if t_norm < 0.0:
                t_norm += 1.0
            if t_norm > 1.0:
                t_norm -= 1.0
            if t_norm < 1.0 / 6.0:
                return p + (q - p) * 6.0 * t_norm
            if t_norm < 1.0 / 2.0:
                return q
            if t_norm < 2.0 / 3.0:
                return p + (q - p) * (2.0 / 3.0 - t_norm) * 6.0
            return p

        return [hue2rgb(hue + 1.0 / 3.0), hue2rgb(hue), hue2rgb(hue - 1.0 / 3.0), 1.0]

    return {
        "primary": to_rgb(h, 0.85, 0.6),
        "secondary": to_rgb((h + 0.3) % 1.0, 0.8, 0.55),
        "accent": to_rgb((h + 0.6) % 1.0, 0.9, 0.7),
    }


def make_texture(seed: int = 1337, width: int = 64, height: int = 64, tile_size: int = 8) -> bytes:
    """Generates deterministic procedural RGBA texture pixels (64x64 checker / grid)."""
    buffer = bytearray(width * height * 4)
    rng = DeterministicRng(seed)
    base_hue = rng.next_float()

    for y in range(height):
        for x in range(width):
            is_alt = ((x // tile_size) % 2) == ((y // tile_size) % 2)
            idx = (y * width + x) * 4
            brightness = 220 if is_alt else 70
            buffer[idx + 0] = min(255, int(brightness * (0.6 + base_hue * 0.4)))
            buffer[idx + 1] = min(255, int(brightness * (0.7 + (1.0 - base_hue) * 0.3)))
            buffer[idx + 2] = brightness
            buffer[idx + 3] = 255

    return bytes(buffer)


def make_sound(seed: int = 1234, freq: float = 440.0, duration: float = 1.0) -> bytes:
    """Synthesizes a deterministic 16-bit PCM WAV audio buffer (harmonic chime)."""
    sample_rate = 44100
    num_samples = int(sample_rate * duration)
    data_size = num_samples * 2

    header = bytearray(44)
    # RIFF header
    header[0:4] = b"RIFF"
    struct.pack_into("<I", header, 4, 36 + data_size)
    header[8:12] = b"WAVE"
    # "fmt " chunk
    header[12:16] = b"fmt "
    struct.pack_into("<I", header, 16, 16)
    struct.pack_into("<H", header, 20, 1)  # PCM
    struct.pack_into("<H", header, 22, 1)  # Mono
    struct.pack_into("<I", header, 24, sample_rate)
    struct.pack_into("<I", header, 28, sample_rate * 2)  # Byte rate
    struct.pack_into("<H", header, 32, 2)  # Block align
    struct.pack_into("<H", header, 34, 16)  # Bits per sample
    # "data" chunk
    header[36:40] = b"data"
    struct.pack_into("<I", header, 40, data_size)

    samples = bytearray(data_size)
    for i in range(num_samples):
        t = i / sample_rate
        env = math.exp(-3.5 * t)
        wave = (
            0.6 * math.sin(2.0 * math.pi * freq * t)
            + 0.3 * math.sin(3.0 * math.pi * freq * t)
            + 0.1 * math.sin(4.0 * math.pi * freq * t)
        )
        sample = max(-1.0, min(1.0, wave * env))
        val = int(sample * 32767)
        struct.pack_into("<h", samples, i * 2, val)

    return bytes(header + samples)


def build_procedural_skinned_mesh(
    rings: int = 24, radial_segs: int = 16, height: float = 5.0, bone_count: int = 12
) -> Tuple[bytes, List[int]]:
    """Builds a procedural skinned column mesh with 12 bones and smooth joint blend weights."""
    vertices = []
    indices = []
    segments = max(1, bone_count - 1)

    for r in range(rings + 1):
        v = r / rings
        y = v * height
        radius = 0.6 * (1.0 - 0.6 * v)
        bone_f = v * segments
        bone_idx = min(int(bone_f), bone_count - 1)
        next_idx = min(bone_idx + 1, bone_count - 1)
        t = bone_f - bone_idx

        for s in range(radial_segs + 1):
            u = s / radial_segs
            theta = u * math.pi * 2.0
            cos_t = math.cos(theta)
            sin_t = math.sin(theta)

            # Pack 136-byte canonical Vertex3D record.
            packed = struct.pack(
                "<3f3f2f2f4f4f4I4f4I4f",
                cos_t * radius,
                y,
                sin_t * radius,
                cos_t,
                0.0,
                sin_t,
                u,
                v,
                0.0,
                0.0,
                1.0,
                0.0,
                0.0,
                1.0,
                1.0,
                1.0,
                1.0,
                1.0,
                bone_idx,
                next_idx,
                0,
                0,
                1.0 - t,
                t,
                0.0,
                0.0,
                0,
                0,
                0,
                0,
                0.0,
                0.0,
                0.0,
                0.0,
            )
            vertices.append(packed)

    ring_verts = radial_segs + 1
    for r in range(rings):
        for s in range(radial_segs):
            i0 = r * ring_verts + s
            i1 = i0 + 1
            i2 = (r + 1) * ring_verts + s
            i3 = i2 + 1
            indices.extend([i0, i2, i1, i1, i2, i3])

    return b"".join(vertices), indices


def compute_bone_palette(time_val: float, bone_count: int = 12, height: float = 5.0) -> List[float]:
    """Computes 16-float bone matrix palette for procedural tentacle waving."""
    palette = [0.0] * (bone_count * 16)
    seg_height = height / max(1, bone_count - 1)

    for i in range(bone_count):
        frac = i / (bone_count - 1)
        rest_y = i * seg_height
        wave = math.sin(time_val * 3.5 + i * 0.45)
        dx = wave * frac * frac * 1.5
        dz = math.cos(time_val * 2.5 + i * 0.3) * frac * 0.8
        rz = wave * frac * 0.4

        cz = math.cos(rz)
        sz = math.sin(rz)

        m = [cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, dx, rest_y * (1.0 - cz), dz, 1]
        for c in range(16):
            palette[i * 16 + c] = m[c]

    return palette


def install_primitive_geometry_helper(galfus: Any) -> None:
    """Converts tour-only primitive descriptions into canonical binary geometry."""
    if getattr(galfus, "_feature_tour_binary_geometry", False):
        return
    upload_binary = galfus.realm3d_create_geometry

    def upload_primitive(realm_id: int, geometry_id: int, description: Dict[str, Any]) -> None:
        size = float(description.get("size", description.get("radius", 1.0)))
        half = size * 0.5
        horizontal = description.get("primitive") == "plane"
        positions = [(-half, 0.0, half), (half, 0.0, half), (half, 0.0, -half), (-half, 0.0, -half)]
        if not horizontal:
            positions = [
                (-half, -half, 0.0),
                (half, -half, 0.0),
                (half, half, 0.0),
                (-half, half, 0.0),
            ]
        vertex_data = bytearray(4 * 136)
        for index, position in enumerate(positions):
            offset = index * 136
            normal = (0.0, 1.0, 0.0) if horizontal else (0.0, 0.0, 1.0)
            uv = (1.0 if index in (1, 2) else 0.0, 1.0 if index < 2 else 0.0)
            struct.pack_into(
                "<3f3f2f2f4f4f4I4f4I4f",
                vertex_data,
                offset,
                *position,
                *normal,
                *uv,
                0.0,
                0.0,
                1.0,
                0.0,
                0.0,
                1.0,
                1.0,
                1.0,
                1.0,
                1.0,
                *(0 for _ in range(4)),
                *(0.0 for _ in range(4)),
                *(0 for _ in range(4)),
                *(0.0 for _ in range(4)),
            )
        vertices = (ctypes.c_uint8 * len(vertex_data)).from_buffer(vertex_data)
        indices = (ctypes.c_uint32 * 6)(0, 1, 2, 0, 2, 3)
        upload_binary(realm_id, geometry_id, 3, vertices, len(vertex_data), indices, 6)

    def create_geometry(*args: Any) -> None:
        if len(args) == 3 and isinstance(args[2], dict):
            upload_primitive(args[0], args[1], args[2])
            return
        upload_binary(*args)

    galfus.realm3d_create_geometry = create_geometry
    galfus._feature_tour_binary_geometry = True


def build_room_scene(realm_id: int, room: Dict[str, Any], seed: int, galfus: Any) -> None:
    """Populates rich procedural 3D scene elements for each room exhibit matching procedural.ts 1:1."""
    install_primitive_geometry_helper(galfus)
    room_idx = room["roomIndex"]
    base_id = (room_idx + 1) * 1000
    fx, fy, fz = room["focusPoint"]
    palette = make_palette(room_idx)
    recipe = room.get("id", "entrance")

    # Common Floor tile per room
    geom_floor = base_id + 1
    mat_floor = base_id + 2
    model_floor = base_id + 3

    galfus.realm3d_create_geometry(realm_id, geom_floor, {"primitive": "plane", "size": 16.0})
    galfus.realm3d_create_material(
        realm_id,
        mat_floor,
        {"baseColor": [0.15, 0.17, 0.22, 1.0], "roughness": 0.7, "metallic": 0.15},
    )
    galfus.realm3d_create_model(
        realm_id,
        model_floor,
        {"geometryId": geom_floor, "materialId": mat_floor},
        {"position": [fx, 0, fz]},
    )

    # Pedestal
    geom_pedestal = base_id + 10
    mat_pedestal = base_id + 11
    model_pedestal = base_id + 12

    galfus.realm3d_create_geometry(
        realm_id,
        geom_pedestal,
        {"primitive": "cylinder", "radius": 1.8, "size": 0.4, "subdivisions": 24},
    )
    galfus.realm3d_create_material(
        realm_id,
        mat_pedestal,
        {"baseColor": [0.22, 0.25, 0.32, 1.0], "roughness": 0.3, "metallic": 0.4},
    )
    galfus.realm3d_create_model(
        realm_id,
        model_pedestal,
        {"geometryId": geom_pedestal, "materialId": mat_pedestal},
        {"position": [fx, 0.2, fz]},
    )

    # Room Light (Point light illuminating room exhibit)
    light_id = base_id + 20
    galfus.realm3d_create_light(
        realm_id,
        light_id,
        {
            "kind": "point",
            "color": palette["primary"][:3],
            "intensity": 3.8,
            "range": 16.0,
            "castShadow": True,
        },
        {"position": [fx, fy + 2.5, fz + 1.2]},
    )

    # Room-specific feature exhibits
    if recipe == "entrance":
        # Golden Cube Monument + Cyan Accent Ring
        geom_cube = base_id + 30
        mat_gold = base_id + 31
        model_cube = base_id + 32

        galfus.realm3d_create_geometry(realm_id, geom_cube, {"primitive": "cube", "size": 1.4})
        galfus.realm3d_create_material(
            realm_id,
            mat_gold,
            {
                "baseColor": [1.0, 0.82, 0.2, 1.0],
                "roughness": 0.15,
                "metallic": 0.95,
                "emissiveColor": [0.2, 0.15, 0.04, 1.0],
                "emissiveIntensity": 0.8,
            },
        )
        galfus.realm3d_create_model(
            realm_id,
            model_cube,
            {"geometryId": geom_cube, "materialId": mat_gold},
            {"position": [fx, 1.5, fz]},
        )

        # Accent Torus Halo
        geom_halo = base_id + 33
        mat_halo = base_id + 34
        model_halo = base_id + 35
        galfus.realm3d_create_geometry(
            realm_id, geom_halo, {"primitive": "torus", "radius": 1.2, "subdivisions": 24}
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_halo,
            {
                "baseColor": [0.2, 0.85, 1.0, 1.0],
                "roughness": 0.1,
                "metallic": 0.8,
                "emissiveColor": [0.1, 0.4, 0.6, 1.0],
                "emissiveIntensity": 1.2,
            },
        )
        galfus.realm3d_create_model(
            realm_id,
            model_halo,
            {"geometryId": geom_halo, "materialId": mat_halo},
            {"position": [fx, 1.5, fz]},
        )

    elif recipe == "geometry":
        # 5 distinct PBR Primitives: Cube, Sphere, Cylinder, Torus, Matte Plastic
        items = [
            {
                "prim": "cube",
                "pos": [-2.4, 1.3, 0],
                "color": [0.95, 0.8, 0.2, 1.0],
                "rough": 0.1,
                "metal": 0.9,
            },  # Gold
            {
                "prim": "sphere",
                "pos": [-1.2, 1.3, 0],
                "color": [0.9, 0.92, 0.95, 1.0],
                "rough": 0.05,
                "metal": 1.0,
            },  # Chrome
            {
                "prim": "cylinder",
                "pos": [0.0, 1.3, 0],
                "color": [0.95, 0.15, 0.3, 1.0],
                "rough": 0.15,
                "metal": 0.2,
            },  # Ruby
            {
                "prim": "torus",
                "pos": [1.2, 1.3, 0],
                "color": [0.2, 0.85, 0.4, 1.0],
                "rough": 0.2,
                "metal": 0.3,
            },  # Emerald
            {
                "prim": "sphere",
                "pos": [2.4, 1.3, 0],
                "color": [0.15, 0.6, 1.0, 1.0],
                "rough": 0.7,
                "metal": 0.0,
            },  # Matte Plastic
        ]

        for idx, item in enumerate(items):
            gid = base_id + 30 + idx * 3
            mid = base_id + 31 + idx * 3
            mod_id = base_id + 32 + idx * 3
            galfus.realm3d_create_geometry(
                realm_id,
                gid,
                {"primitive": item["prim"], "size": 0.9, "radius": 0.5, "subdivisions": 24},
            )
            galfus.realm3d_create_material(
                realm_id,
                mid,
                {"baseColor": item["color"], "roughness": item["rough"], "metallic": item["metal"]},
            )
            galfus.realm3d_create_model(
                realm_id,
                mod_id,
                {"geometryId": gid, "materialId": mid},
                {"position": [fx + item["pos"][0], item["pos"][1], fz + item["pos"][2]]},
            )

    elif recipe == "lighting":
        # Occluder Pillars casting shadows + 3 RGB Dynamic Lights + Glowing Emissive Box
        p1 = base_id + 40
        m1 = base_id + 41
        galfus.realm3d_create_geometry(
            realm_id, p1, {"primitive": "cylinder", "radius": 0.25, "size": 2.5}
        )
        galfus.realm3d_create_material(
            realm_id, m1, {"baseColor": [0.35, 0.38, 0.45, 1.0], "roughness": 0.4, "metallic": 0.2}
        )

        for idx, ox in enumerate([-1.5, 1.5]):
            galfus.realm3d_create_model(
                realm_id,
                base_id + 42 + idx,
                {"geometryId": p1, "materialId": m1},
                {"position": [fx + ox, 1.25, fz]},
            )

        # Emissive Glowing Box
        geom_box = base_id + 45
        mat_emiss = base_id + 46
        galfus.realm3d_create_geometry(realm_id, geom_box, {"primitive": "cube", "size": 0.8})
        galfus.realm3d_create_material(
            realm_id,
            mat_emiss,
            {
                "baseColor": [1.0, 0.4, 0.1, 1.0],
                "emissiveColor": [1.0, 0.5, 0.1, 1.0],
                "emissiveIntensity": 4.5,
                "roughness": 0.1,
                "metallic": 0.0,
            },
        )
        galfus.realm3d_create_model(
            realm_id,
            base_id + 47,
            {"geometryId": geom_box, "materialId": mat_emiss},
            {"position": [fx, 1.4, fz]},
        )

        # RGB Point lights
        galfus.realm3d_create_light(
            realm_id,
            base_id + 50,
            {
                "kind": "point",
                "color": [1.0, 0.2, 0.2],
                "intensity": 4.0,
                "range": 10.0,
                "castShadow": True,
            },
            {"position": [fx - 2.0, 2.0, fz - 1.0]},
        )
        galfus.realm3d_create_light(
            realm_id,
            base_id + 51,
            {
                "kind": "point",
                "color": [0.2, 1.0, 0.3],
                "intensity": 4.0,
                "range": 10.0,
                "castShadow": True,
            },
            {"position": [fx + 2.0, 2.0, fz - 1.0]},
        )
        galfus.realm3d_create_light(
            realm_id,
            base_id + 52,
            {
                "kind": "point",
                "color": [0.2, 0.4, 1.0],
                "intensity": 4.0,
                "range": 10.0,
                "castShadow": True,
            },
            {"position": [fx, 3.0, fz + 2.0]},
        )

    elif recipe == "particles":
        # GPU Sparks Fountain
        mat_part = base_id + 60
        galfus.realm3d_create_material(
            realm_id, mat_part, {"surfaceType": "additive", "baseColor": [1.0, 0.75, 0.2, 1.0]}
        )
        galfus.realm3d_create_particle_emitter(
            realm_id,
            base_id + 61,
            {
                "label": "Tour Spark Fountain",
                "materialId": mat_part,
                "maxParticles": 800,
                "spawnRate": 200,
                "lifetimeRange": [0.7, 1.5],
                "speedRange": [3.8, 6.2],
                "direction": [0.0, 1.0, 0.0],
                "spreadAngleRad": 0.35,
                "gravity": [0.0, -6.5, 0.0],
                "sizeRange": [0.05, 0.12],
            },
            {"position": [fx, 0.5, fz]},
        )

    elif recipe == "animation":
        # Kinetic sculptures actively driven by transitions
        # Model 1: Vertical Bouncing Cube
        geom_cube = base_id + 70
        mat_bounce = base_id + 71
        model_bounce = base_id + 72

        galfus.realm3d_create_geometry(realm_id, geom_cube, {"primitive": "cube", "size": 1.0})
        galfus.realm3d_create_material(
            realm_id,
            mat_bounce,
            {"baseColor": [0.2, 0.7, 1.0, 1.0], "roughness": 0.2, "metallic": 0.3},
        )
        galfus.realm3d_create_model(
            realm_id,
            model_bounce,
            {"geometryId": geom_cube, "materialId": mat_bounce},
            {"position": [fx - 1.8, 0.6, fz]},
        )

        trans_bounce = base_id + 80
        try:
            galfus.animation_destroy_transition(trans_bounce)
        except Exception:
            pass
        cfg_bounce = {
            "duration": 1.6,
            "delay": 0.1,
            "easing": "easeOutBounce",
            "loopMode": "pingPong",
        }
        galfus.animation_create_transition(
            trans_bounce,
            {"type": "transform3D", "value": [fx - 1.8, 0.6, fz, 0, 0, 0, 1, 1, 1, 1]},
            cfg_bounce,
        )
        galfus.animation_bind_target(
            trans_bounce, {"kind": "modelTransform3D", "realmId": realm_id, "modelId": model_bounce}
        )
        galfus.animation_transition_to(
            trans_bounce,
            {"type": "transform3D", "value": [fx - 1.8, 3.2, fz, 0, 0.707, 0, 0.707, 1, 1, 1]},
            cfg_bounce,
        )

        # Model 2: Elastic Pulsing Sphere
        geom_sphere = base_id + 73
        mat_pulse = base_id + 74
        model_pulse = base_id + 75
        galfus.realm3d_create_geometry(
            realm_id, geom_sphere, {"primitive": "sphere", "radius": 0.6, "subdivisions": 24}
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_pulse,
            {"baseColor": [1.0, 0.25, 0.45, 1.0], "roughness": 0.15, "metallic": 0.7},
        )
        galfus.realm3d_create_model(
            realm_id,
            model_pulse,
            {"geometryId": geom_sphere, "materialId": mat_pulse},
            {"position": [fx, 1.4, fz]},
        )

        trans_pulse = base_id + 81
        try:
            galfus.animation_destroy_transition(trans_pulse)
        except Exception:
            pass
        cfg_pulse = {
            "duration": 1.3,
            "delay": 0.0,
            "easing": "easeInOutCubic",
            "loopMode": "pingPong",
        }
        galfus.animation_create_transition(
            trans_pulse,
            {"type": "transform3D", "value": [fx, 1.4, fz, 0, 0, 0, 1, 0.7, 0.7, 0.7]},
            cfg_pulse,
        )
        galfus.animation_bind_target(
            trans_pulse, {"kind": "modelTransform3D", "realmId": realm_id, "modelId": model_pulse}
        )
        galfus.animation_transition_to(
            trans_pulse,
            {"type": "transform3D", "value": [fx, 1.4, fz, 0, 0, 0, 1, 1.5, 1.5, 1.5]},
            cfg_pulse,
        )

        # Model 3: Rotating Torus
        geom_torus = base_id + 76
        mat_torus = base_id + 77
        model_torus = base_id + 78
        galfus.realm3d_create_geometry(
            realm_id, geom_torus, {"primitive": "torus", "radius": 0.7, "subdivisions": 24}
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_torus,
            {"baseColor": [0.3, 0.9, 0.4, 1.0], "roughness": 0.25, "metallic": 0.4},
        )
        galfus.realm3d_create_model(
            realm_id,
            model_torus,
            {"geometryId": geom_torus, "materialId": mat_torus},
            {"position": [fx + 1.8, 1.4, fz]},
        )

        trans_torus = base_id + 82
        try:
            galfus.animation_destroy_transition(trans_torus)
        except Exception:
            pass
        cfg_torus = {
            "duration": 1.5,
            "delay": 0.2,
            "easing": "easeInOutSine",
            "loopMode": "pingPong",
        }
        galfus.animation_create_transition(
            trans_torus,
            {"type": "transform3D", "value": [fx + 1.8, 0.8, fz, 0, 0, 0, 1, 1, 1, 1]},
            cfg_torus,
        )
        galfus.animation_bind_target(
            trans_torus, {"kind": "modelTransform3D", "realmId": realm_id, "modelId": model_torus}
        )
        galfus.animation_transition_to(
            trans_torus,
            {"type": "transform3D", "value": [fx + 1.8, 2.4, fz, 0.5, 0.5, 0.5, 0.5, 1, 1, 1]},
            cfg_torus,
        )

    elif recipe == "mirror_portal":
        # Planar Reflection Mirror Quad + Portal Frame
        geom_mirror = base_id + 90
        mat_mirror = base_id + 91
        model_mirror = base_id + 92

        galfus.realm3d_create_geometry(realm_id, geom_mirror, {"primitive": "plane", "size": 3.2})
        galfus.realm3d_create_material(
            realm_id,
            mat_mirror,
            {
                "surfaceType": "mirror",
                "baseColor": [0.95, 0.97, 1.0, 1.0],
                "roughness": 0.02,
                "metallic": 0.98,
                "reflectance": 0.9,
            },
        )
        galfus.realm3d_create_model(
            realm_id,
            model_mirror,
            {"geometryId": geom_mirror, "materialId": mat_mirror},
            {"position": [fx, 1.8, fz - 1.5], "rotation": [0.7071, 0, 0, 0.7071]},
        )

        galfus.realm3d_create_portal(
            realm_id, base_id + 93, {"modelId": model_mirror, "active": True}
        )

        # Decorative Mirror Frame
        geom_frame = base_id + 94
        mat_frame = base_id + 95
        galfus.realm3d_create_geometry(
            realm_id, geom_frame, {"primitive": "cylinder", "radius": 0.1, "size": 3.4}
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_frame,
            {"baseColor": [0.85, 0.7, 0.25, 1.0], "roughness": 0.25, "metallic": 0.85},
        )
        galfus.realm3d_create_model(
            realm_id,
            base_id + 96,
            {"geometryId": geom_frame, "materialId": mat_frame},
            {"position": [fx - 1.6, 1.8, fz - 1.5]},
        )
        galfus.realm3d_create_model(
            realm_id,
            base_id + 97,
            {"geometryId": geom_frame, "materialId": mat_frame},
            {"position": [fx + 1.6, 1.8, fz - 1.5]},
        )

    elif recipe == "bones":
        # 12-Joint Skinned Column / Tentacle
        geom_skinned = base_id + 100
        mat_skinned = base_id + 101
        model_skinned = base_id + 102

        v_bytes, indices = build_procedural_skinned_mesh(24, 16, 5.0, 12)
        c_vbytes = (ctypes.c_uint8 * len(v_bytes)).from_buffer_copy(v_bytes)
        c_indices = (ctypes.c_uint32 * len(indices))(*indices)

        galfus.realm3d_create_geometry(
            realm_id, geom_skinned, 3, c_vbytes, len(v_bytes), c_indices, len(indices)
        )

        galfus.realm3d_create_material(
            realm_id,
            mat_skinned,
            {
                "baseColor": [0.15, 0.85, 0.95, 1.0],
                "emissiveColor": [0.05, 0.25, 0.35, 1.0],
                "roughness": 0.2,
                "metallic": 0.6,
            },
        )

        galfus.realm3d_create_model(
            realm_id,
            model_skinned,
            {
                "geometryId": geom_skinned,
                "materialId": mat_skinned,
                "castShadow": True,
                "boneCount": 12,
                "boneOffset": 0,
                "active": True,
            },
            {"position": [fx, 0.4, fz]},
        )

    elif recipe == "refraction":
        # Screen-Space Refraction Glass Gems
        geom_sphere = base_id + 110
        mat_glass = base_id + 111
        model_glass = base_id + 112

        galfus.realm3d_create_geometry(
            realm_id, geom_sphere, {"primitive": "sphere", "radius": 1.0, "subdivisions": 32}
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_glass,
            {
                "surfaceType": "refractive",
                "baseColor": [0.1, 0.85, 0.4, 0.35],
                "roughness": 0.04,
                "metallic": 0.0,
                "reflectance": 0.7,
                "refractionIndex": 1.52,
                "refractionDistortion": 0.1,
            },
        )
        galfus.realm3d_create_model(
            realm_id,
            model_glass,
            {"geometryId": geom_sphere, "materialId": mat_glass},
            {"position": [fx, 1.5, fz]},
        )

        # Background patterned pillar behind glass
        geom_back = base_id + 113
        mat_back = base_id + 114
        galfus.realm3d_create_geometry(realm_id, geom_back, {"primitive": "cube", "size": 1.2})
        galfus.realm3d_create_material(
            realm_id,
            mat_back,
            {
                "baseColor": [0.95, 0.2, 0.35, 1.0],
                "emissiveColor": [0.3, 0.05, 0.1, 1.0],
                "roughness": 0.2,
                "metallic": 0.5,
            },
        )
        galfus.realm3d_create_model(
            realm_id,
            base_id + 115,
            {"geometryId": geom_back, "materialId": mat_back},
            {"position": [fx, 1.5, fz - 2.5]},
        )

    elif recipe == "effects":
        # Post-Processing & Screen Effects Exhibit
        geom_podium = base_id + 120
        mat_podium = base_id + 121
        galfus.realm3d_create_geometry(
            realm_id, geom_podium, {"primitive": "torus", "radius": 1.1, "subdivisions": 32}
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_podium,
            {
                "baseColor": [0.85, 0.3, 0.9, 1.0],
                "emissiveColor": [0.4, 0.1, 0.5, 1.0],
                "roughness": 0.1,
                "metallic": 0.8,
            },
        )
        galfus.realm3d_create_model(
            realm_id,
            base_id + 122,
            {"geometryId": geom_podium, "materialId": mat_podium},
            {"position": [fx, 1.5, fz]},
        )

    else:
        # Spatial Audio Beacon & Finale Room
        geom_beacon = base_id + 130
        mat_beacon = base_id + 131
        galfus.realm3d_create_geometry(
            realm_id,
            geom_beacon,
            {"primitive": "cylinder", "radius": 0.7, "size": 2.0, "subdivisions": 24},
        )
        galfus.realm3d_create_material(
            realm_id,
            mat_beacon,
            {
                "baseColor": [0.95, 0.8, 0.2, 1.0],
                "emissiveColor": [0.35, 0.28, 0.05, 1.0],
                "roughness": 0.2,
                "metallic": 0.8,
            },
        )
        galfus.realm3d_create_model(
            realm_id,
            base_id + 132,
            {"geometryId": geom_beacon, "materialId": mat_beacon},
            {"position": [fx, 1.4, fz]},
        )
