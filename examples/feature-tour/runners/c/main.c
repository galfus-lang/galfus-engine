#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <math.h>
#include <time.h>
#include <assert.h>
#include "galfus.h"

#define TARGET_WINDOW 1
#define REALM_3D 10
#define REALM_2D 20
#define INVOCATION_3D 100
#define INVOCATION_2D 101
#define CAMERA_3D_ID 1
#define CAMERA_2D_ID 1
#define SVG_HUD_ID 1
#define PATH_CAMERA_POS_ID 401
#define PATH_CAMERA_LOOK_ID 402
#define SOUND_ID 501

typedef struct {
    float pos[3];
    float norm[3];
    float uv0[2];
    float uv1[2];
    float tangent[4];
    float color[4];
    uint32_t joints0[4];
    float weights0[4];
    uint32_t joints1[4];
    float weights1[4];
} Vertex3DRecord;

/* Tour-only host helper. The renderer API receives only canonical binary geometry. */
static int32_t create_demo_primitive_geometry(uint32_t realm_id, uint32_t geometry_id,
                                              const char *description) {
    float size = 1.0f;
    const char *size_key = strstr(description, "\"size\":");
    const char *radius_key = strstr(description, "\"radius\":");
    if (size_key)
        sscanf(size_key + 7, "%f", &size);
    else if (radius_key)
        sscanf(radius_key + 9, "%f", &size);

    const float h = size * 0.5f;
    const bool horizontal = strstr(description, "\"plane\"") != NULL;
    Vertex3DRecord vertices[4] = {0};
    const float positions[4][3] = {{-h, 0.0f, h}, {h, 0.0f, h}, {h, 0.0f, -h}, {-h, 0.0f, -h}};
    const float vertical_positions[4][3] = {
        {-h, -h, 0.0f}, {h, -h, 0.0f}, {h, h, 0.0f}, {-h, h, 0.0f}};
    const uint32_t indices[] = {0, 1, 2, 0, 2, 3};
    for (size_t i = 0; i < 4; ++i) {
        memcpy(vertices[i].pos, horizontal ? positions[i] : vertical_positions[i],
               sizeof(vertices[i].pos));
        vertices[i].norm[horizontal ? 1 : 2] = 1.0f;
        vertices[i].uv0[0] = (i == 1 || i == 2) ? 1.0f : 0.0f;
        vertices[i].uv0[1] = (i < 2) ? 1.0f : 0.0f;
        vertices[i].tangent[0] = 1.0f;
        vertices[i].tangent[3] = 1.0f;
        for (size_t c = 0; c < 4; ++c)
            vertices[i].color[c] = 1.0f;
    }
    return galfus_realm_3d_create_geometry(realm_id, geometry_id, 3, (const uint8_t *)vertices,
                                           sizeof(vertices), indices, 6);
}

/* Local primitive descriptions are never sent to Galfus. */
#define galfus_realm_3d_create_geometry(realm_id, geometry_id, description)                        \
    create_demo_primitive_geometry((realm_id), (geometry_id), (description))

static const char *ROOM_NAMES[10] = {"Welcome & Engine Overview", "PBR Primitives & Materials",
                                     "Dynamic Lights & Shadows",  "3D GPU Particle Systems",
                                     "Animation & Motion Paths",  "Planar Mirrors & Portals",
                                     "Procedural Skeletal Bones", "Screen-Space Refraction",
                                     "Multiverse Screen Filters", "Spatial Audio & Parity Finale"};

static const char *ROOM_CATEGORIES[10] = {
    "Architecture",       "3D Primitives & PBR", "Dynamic Lighting",   "GPU Particles",
    "Kinetic Animation",  "Mirror & Portals",    "Skeletal Animation", "Refraction",
    "Multiverse Shaders", "Audio & Platform"};

static const char *ROOM_DESCRIPTIONS[10] = {
    "Tour entry monument showcasing golden metalness, torus geometry, and dual-viewport HUD.",
    "Real-time evaluation of five standard 3D primitives with varying metallic and roughness.",
    "Multiple colored dynamic point lights with hardware shadow mapping and occluders.",
    "High-throughput particle fountain with custom velocities, gravity, and additive blending.",
    "Kinetic sculpture driven by easing transitions (Bounce, Cubic, Sine) with ping-pong loops.",
    "Planar reflection mirror quad with real-time oblique reflection rendering and secret chamber.",
    "Procedural 12-bone tentacle column running continuous skeletal skinning via vertex buffers.",
    "Screen-space optical refraction simulating emerald crown glass (IOR 1.52) over background "
    "pattern.",
    "Multiverse post-processing stack showcasing real-time chromatic aberration and vignette "
    "filters.",
    "Spatial audio beacon with synthesized harmonic chime and comprehensive tour completion."};

static const float ROOM_CAM_POS[10][3] = {
    {0.0f, 2.8f, 6.5f},   {18.0f, 2.8f, 6.5f},  {36.0f, 2.8f, 6.5f},  {54.0f, 2.8f, 6.5f},
    {72.0f, 2.8f, 6.5f},  {72.0f, 2.8f, 28.5f}, {54.0f, 2.8f, 28.5f}, {36.0f, 2.8f, 28.5f},
    {18.0f, 2.8f, 28.5f}, {0.0f, 2.8f, 28.5f}};

static const float ROOM_FOCUS[10][3] = {
    {0.0f, 1.4f, 0.0f},   {18.0f, 1.4f, 0.0f},  {36.0f, 1.4f, 0.0f},  {54.0f, 1.6f, 0.0f},
    {72.0f, 1.4f, 0.0f},  {72.0f, 1.8f, 22.0f}, {54.0f, 2.5f, 22.0f}, {36.0f, 1.4f, 22.0f},
    {18.0f, 1.4f, 22.0f}, {0.0f, 1.5f, 22.0f}};

static const char *ROOM_TELEMETRY[10][8] = {
    {"renderer", "Multiverse / WGPU", "shading", "PBR Metallic-Roughness", "antialiasing",
     "MSAA 4x", "status", "100% Operational"},
    {"primitives", "Cube / Sphere / Torus", "materials", "PBR Physically Based", "shading",
     "Direct + Ambient", "subdivisions", "24-32 Segments"},
    {"lightTypes", "Directional + Point", "shadows", "Hardware PCF Shadows", "pointLights",
     "3 Dynamic RGB", "emissive", "HDR Emissive Boost"},
    {"compute", "GPU Particle Systems", "maxParticles", "800 Active Sparks", "simRate",
     "200 Particles / Sec", "blending", "Additive Screen Blend"},
    {"transitions", "Kinetic Interpolation", "easing", "easeOutBounce / Sine", "paths",
     "Quadratic Bezier 3D", "loopMode", "Ping-Pong Oscillators"},
    {"reflections", "Planar Mirror Surface", "portals", "Active Teleport Portal", "reflectance",
     "90% Specular Mirror", "clipping", "Near-Plane Oblique"},
    {"rigging", "12-Bone Skeletal Rig", "skinning", "Interleaved 80B Verts", "weightBlend",
     "Dual-Joint Linear Blend", "animation", "Harmonic Sinusoidal"},
    {"optics", "Screen-Space Refraction", "refractionIndex", "1.52 (Crown Glass)", "distortion",
     "Dynamic Normal Ripple", "transmission", "Fresnel Transmittance"},
    {"postProcessing", "Multiverse Pipeline", "chromaticAberr", "Active Spectrum Fringe",
     "vignette", "Active Radial Falloff", "compositing", "Multi-Pass Blend"},
    {"spatialAudio", "3D Positioned Source", "waveform", "Synthesized Harmonic Chime", "sampleRate",
     "44.1 kHz 16-bit PCM", "crossPlatform", "100% Parity Achieved"}};

static uint8_t *create_chime_wav(size_t *out_size) {
    uint32_t sample_rate = 44100;
    float duration = 1.0f;
    uint32_t num_samples = (uint32_t)(sample_rate * duration);
    uint32_t data_size = num_samples * 2;
    size_t total_size = 44 + data_size;
    uint8_t *buf = (uint8_t *)malloc(total_size);
    if (!buf)
        return NULL;

    memcpy(buf, "RIFF", 4);
    uint32_t riff_size = 36 + data_size;
    memcpy(buf + 4, &riff_size, 4);
    memcpy(buf + 8, "WAVEfmt ", 8);
    uint32_t fmt_len = 16;
    uint16_t format = 1;
    uint16_t channels = 1;
    uint32_t byte_rate = sample_rate * 2;
    uint16_t block_align = 2;
    uint16_t bits = 16;
    memcpy(buf + 16, &fmt_len, 4);
    memcpy(buf + 20, &format, 2);
    memcpy(buf + 22, &channels, 2);
    memcpy(buf + 24, &sample_rate, 4);
    memcpy(buf + 28, &byte_rate, 4);
    memcpy(buf + 32, &block_align, 2);
    memcpy(buf + 34, &bits, 2);
    memcpy(buf + 36, "data", 4);
    memcpy(buf + 40, &data_size, 4);

    int16_t *samples = (int16_t *)(buf + 44);
    for (uint32_t i = 0; i < num_samples; i++) {
        float t = (float)i / (float)sample_rate;
        float env = expf(-3.5f * t);
        float wave = 0.6f * sinf(2.0f * 3.14159265f * 440.0f * t) +
                     0.3f * sinf(3.0f * 3.14159265f * 440.0f * t) +
                     0.1f * sinf(4.0f * 3.14159265f * 440.0f * t);
        float s = wave * env;
        if (s > 1.0f)
            s = 1.0f;
        if (s < -1.0f)
            s = -1.0f;
        samples[i] = (int16_t)(s * 32767.0f);
    }

    *out_size = total_size;
    return buf;
}

static void compute_bone_palette(float time_val, float *palette, int bone_count, float height) {
    float seg_height = height / (float)(bone_count > 1 ? bone_count - 1 : 1);
    for (int i = 0; i < bone_count; i++) {
        float frac = (float)i / (float)(bone_count - 1);
        float rest_y = (float)i * seg_height;
        float wave = sinf(time_val * 3.5f + (float)i * 0.45f);
        float dx = wave * frac * frac * 1.5f;
        float dz = cosf(time_val * 2.5f + (float)i * 0.3f) * frac * 0.8f;
        float rz = wave * frac * 0.4f;

        float cz = cosf(rz);
        float sz = sinf(rz);

        float m[16] = {cz,   sz,   0.0f, 0.0f, -sz,  cz, 0.0f,
                       0.0f, 0.0f, 0.0f, 1.0f, 0.0f, dx, rest_y * (1.0f - cz),
                       dz,   1.0f};
        for (int c = 0; c < 16; c++) {
            palette[i * 16 + c] = m[c];
        }
    }
}

static void build_skinned_mesh(Vertex3DRecord **out_verts, size_t *out_vert_count,
                               uint32_t **out_indices, size_t *out_idx_count) {
    int rings = 24;
    int radial_segs = 16;
    float height = 5.0f;
    int bone_count = 12;

    size_t vert_count = (rings + 1) * (radial_segs + 1);
    Vertex3DRecord *verts = (Vertex3DRecord *)malloc(vert_count * sizeof(Vertex3DRecord));
    size_t idx_count = rings * radial_segs * 6;
    uint32_t *indices = (uint32_t *)malloc(idx_count * sizeof(uint32_t));

    int segments = bone_count > 1 ? bone_count - 1 : 1;
    size_t v_idx = 0;
    for (int r = 0; r <= rings; r++) {
        float v = (float)r / (float)rings;
        float y = v * height;
        float radius = 0.6f * (1.0f - 0.6f * v);
        float bone_f = v * (float)segments;
        int bone_idx = (int)bone_f;
        if (bone_idx > bone_count - 1)
            bone_idx = bone_count - 1;
        int next_idx = bone_idx + 1;
        if (next_idx > bone_count - 1)
            next_idx = bone_count - 1;
        float t = bone_f - (float)bone_idx;

        for (int s = 0; s <= radial_segs; s++) {
            float u = (float)s / (float)radial_segs;
            float theta = u * 3.14159265f * 2.0f;
            float cos_t = cosf(theta);
            float sin_t = sinf(theta);

            Vertex3DRecord *rec = &verts[v_idx++];
            rec->pos[0] = cos_t * radius;
            rec->pos[1] = y;
            rec->pos[2] = sin_t * radius;
            rec->norm[0] = cos_t;
            rec->norm[1] = 0.0f;
            rec->norm[2] = sin_t;
            rec->uv0[0] = u;
            rec->uv0[1] = v;
            rec->uv1[0] = 0.0f;
            rec->uv1[1] = 0.0f;
            rec->tangent[0] = 1.0f;
            rec->tangent[1] = 0.0f;
            rec->tangent[2] = 0.0f;
            rec->tangent[3] = 1.0f;
            rec->color[0] = 1.0f;
            rec->color[1] = 1.0f;
            rec->color[2] = 1.0f;
            rec->color[3] = 1.0f;
            rec->joints0[0] = (uint32_t)bone_idx;
            rec->joints0[1] = (uint32_t)next_idx;
            rec->joints0[2] = 0;
            rec->joints0[3] = 0;
            rec->weights0[0] = 1.0f - t;
            rec->weights0[1] = t;
            rec->weights0[2] = 0.0f;
            rec->weights0[3] = 0.0f;
            memset(rec->joints1, 0, sizeof(rec->joints1));
            memset(rec->weights1, 0, sizeof(rec->weights1));
        }
    }

    size_t i_idx = 0;
    int ring_verts = radial_segs + 1;
    for (int r = 0; r < rings; r++) {
        for (int s = 0; s < radial_segs; s++) {
            uint32_t i0 = (uint32_t)(r * ring_verts + s);
            uint32_t i1 = i0 + 1;
            uint32_t i2 = (uint32_t)((r + 1) * ring_verts + s);
            uint32_t i3 = i2 + 1;
            indices[i_idx++] = i0;
            indices[i_idx++] = i2;
            indices[i_idx++] = i1;
            indices[i_idx++] = i1;
            indices[i_idx++] = i2;
            indices[i_idx++] = i3;
        }
    }

    *out_verts = verts;
    *out_vert_count = vert_count;
    *out_indices = indices;
    *out_idx_count = idx_count;
}

static void escape_xml(const char *src, char *dst, size_t max_dst) {
    if (!src || !dst || max_dst == 0)
        return;
    size_t d = 0;
    for (size_t s = 0; src[s] != '\0' && d + 6 < max_dst; s++) {
        switch (src[s]) {
        case '&':
            memcpy(dst + d, "&amp;", 5);
            d += 5;
            break;
        case '<':
            memcpy(dst + d, "&lt;", 4);
            d += 4;
            break;
        case '>':
            memcpy(dst + d, "&gt;", 4);
            d += 4;
            break;
        case '"':
            memcpy(dst + d, "&quot;", 6);
            d += 6;
            break;
        case '\'':
            memcpy(dst + d, "&apos;", 6);
            d += 6;
            break;
        default:
            dst[d++] = src[s];
            break;
        }
    }
    dst[d] = '\0';
}

static void render_hud_svg(char *out_buf, size_t max_len, int room_idx, float elapsed_secs,
                           bool is_paused) {
    float total_dur = 40.0f;
    float ratio = elapsed_secs / total_dur;
    if (ratio < 0.0f)
        ratio = 0.0f;
    if (ratio > 1.0f)
        ratio = 1.0f;
    int progress_pct = (int)(ratio * 100.0f + 0.5f);
    int bar_width = (int)(ratio * 440.0f + 0.5f);
    if (bar_width < 6)
        bar_width = 6;

    const char *badge = is_paused
                            ? "<rect x=\"390\" y=\"20\" width=\"80\" height=\"24\" rx=\"6\" "
                              "fill=\"#DC2626\"/><text x=\"430\" y=\"36\" "
                              "font-family=\"sans-serif\" font-size=\"11\" font-weight=\"bold\" "
                              "fill=\"#FFFFFF\" text-anchor=\"middle\">PAUSED</text>"
                            : "<rect x=\"390\" y=\"20\" width=\"80\" height=\"24\" rx=\"6\" "
                              "fill=\"#059669\"/><text x=\"430\" y=\"36\" "
                              "font-family=\"sans-serif\" font-size=\"11\" font-weight=\"bold\" "
                              "fill=\"#FFFFFF\" text-anchor=\"middle\">LIVE TOUR</text>";

    const char **telem = ROOM_TELEMETRY[room_idx];

    char safe_cat[128], safe_name[128], safe_desc[256];
    char safe_k0[64], safe_v0[128], safe_k1[64], safe_v1[128];
    char safe_k2[64], safe_v2[128], safe_k3[64], safe_v3[128];

    escape_xml(ROOM_CATEGORIES[room_idx], safe_cat, sizeof(safe_cat));
    escape_xml(ROOM_NAMES[room_idx], safe_name, sizeof(safe_name));
    escape_xml(ROOM_DESCRIPTIONS[room_idx], safe_desc, sizeof(safe_desc));
    escape_xml(telem[0], safe_k0, sizeof(safe_k0));
    escape_xml(telem[1], safe_v0, sizeof(safe_v0));
    escape_xml(telem[2], safe_k1, sizeof(safe_k1));
    escape_xml(telem[3], safe_v1, sizeof(safe_v1));
    escape_xml(telem[4], safe_k2, sizeof(safe_k2));
    escape_xml(telem[5], safe_v2, sizeof(safe_v2));
    escape_xml(telem[6], safe_k3, sizeof(safe_k3));
    escape_xml(telem[7], safe_v3, sizeof(safe_v3));

    snprintf(
        out_buf, max_len,
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 500 240\" width=\"500\" "
        "height=\"240\">"
        "<defs>"
        "<linearGradient id=\"cardBg\" x1=\"0%%\" y1=\"0%%\" x2=\"0%%\" y2=\"100%%\">"
        "<stop offset=\"0%%\" stop-color=\"#1E293B\"/><stop offset=\"100%%\" "
        "stop-color=\"#0F172A\"/>"
        "</linearGradient>"
        "<linearGradient id=\"neonBar\" x1=\"0%%\" y1=\"0%%\" x2=\"100%%\" y2=\"0%%\">"
        "<stop offset=\"0%%\" stop-color=\"#06B6D4\"/><stop offset=\"50%%\" "
        "stop-color=\"#3B82F6\"/><stop offset=\"100%%\" stop-color=\"#8B5CF6\"/>"
        "</linearGradient>"
        "</defs>"
        "<rect x=\"8\" y=\"8\" width=\"484\" height=\"224\" rx=\"14\" fill=\"url(#cardBg)\" "
        "stroke=\"#38BDF8\" stroke-width=\"2\"/>"
        "<path d=\"M 22 8 L 478 8\" stroke=\"#38BDF8\" stroke-width=\"3\" "
        "stroke-linecap=\"round\"/>"
        "<text x=\"28\" y=\"36\" font-family=\"sans-serif\" font-size=\"16\" font-weight=\"bold\" "
        "fill=\"#FFFFFF\">Galfus Engine Feature Tour</text>"
        "<rect x=\"230\" y=\"22\" width=\"90\" height=\"20\" rx=\"4\" fill=\"#334155\"/>"
        "<text x=\"275\" y=\"36\" font-family=\"sans-serif\" font-size=\"10\" font-weight=\"bold\" "
        "fill=\"#38BDF8\" text-anchor=\"middle\">C99 / Native</text>"
        "%s"
        "<rect x=\"28\" y=\"50\" width=\"130\" height=\"18\" rx=\"4\" fill=\"#0284C7\"/>"
        "<text x=\"93\" y=\"63\" font-family=\"sans-serif\" font-size=\"10\" font-weight=\"bold\" "
        "fill=\"#FFFFFF\" text-anchor=\"middle\">%s</text>"
        "<text x=\"170\" y=\"65\" font-family=\"sans-serif\" font-size=\"14\" font-weight=\"bold\" "
        "fill=\"#F8FAFC\">Room %d/10: %s</text>"
        "<text x=\"28\" y=\"86\" font-family=\"sans-serif\" font-size=\"12\" "
        "fill=\"#E2E8F0\">%s</text>"
        "<rect x=\"28\" y=\"98\" width=\"444\" height=\"14\" rx=\"7\" fill=\"#334155\" "
        "stroke=\"#475569\" stroke-width=\"1\"/>"
        "<rect x=\"28\" y=\"98\" width=\"%d\" height=\"14\" rx=\"7\" fill=\"url(#neonBar)\"/>"
        "<text x=\"472\" y=\"124\" font-family=\"sans-serif\" font-size=\"11\" "
        "font-weight=\"bold\" fill=\"#94A3B8\" text-anchor=\"end\">%d%%%% (%.1fs / %.1fs)</text>"
        "<rect x=\"24\" y=\"132\" width=\"452\" height=\"52\" rx=\"8\" fill=\"#1E293B\" "
        "stroke=\"#475569\" stroke-width=\"1.5\"/>"
        "<text font-family=\"monospace\" font-size=\"11\" fill=\"#CBD5E1\">"
        "<tspan x=\"34\" y=\"156\">▸ %s: <tspan fill=\"#38BDF8\" "
        "font-weight=\"bold\">%s</tspan></tspan>"
        "<tspan x=\"34\" y=\"176\">▸ %s: <tspan fill=\"#38BDF8\" "
        "font-weight=\"bold\">%s</tspan></tspan>"
        "<tspan x=\"260\" y=\"156\">▸ %s: <tspan fill=\"#38BDF8\" "
        "font-weight=\"bold\">%s</tspan></tspan>"
        "<tspan x=\"260\" y=\"176\">▸ %s: <tspan fill=\"#38BDF8\" "
        "font-weight=\"bold\">%s</tspan></tspan>"
        "</text>"
        "<text x=\"28\" y=\"210\" font-family=\"sans-serif\" font-size=\"11\" "
        "fill=\"#94A3B8\">[Space]: Pause/Resume  |  [←/→]: Prev/Next Room  |  [R]: Restart  |  "
        "[Esc]: Exit</text>"
        "</svg>",
        badge, safe_cat, room_idx + 1, safe_name, safe_desc, bar_width, progress_pct, elapsed_secs,
        total_dur, safe_k0, safe_v0, safe_k1, safe_v1, safe_k2, safe_v2, safe_k3, safe_v3);
}

static void build_all_rooms(void) {
    for (int i = 0; i < 10; i++) {
        uint32_t base_id = (i + 1) * 1000;
        float fx = ROOM_FOCUS[i][0];
        float fy = ROOM_FOCUS[i][1];
        float fz = ROOM_FOCUS[i][2];

        // 1. Common Floor Tile (plane 16.0)
        galfus_realm_3d_create_geometry(REALM_3D, base_id + 1,
                                        "{\"primitive\":\"plane\",\"size\":16.0}");
        galfus_realm_3d_create_material(
            REALM_3D, base_id + 2,
            "{\"baseColor\":[0.15,0.17,0.22,1.0],\"roughness\":0.7,\"metallic\":0.15}");
        char floor_mod[128];
        snprintf(floor_mod, sizeof(floor_mod), "{\"geometryId\":%u,\"materialId\":%u}", base_id + 1,
                 base_id + 2);
        GalfusTransform3D floor_tf = {fx, 0.0f, fz, 0, 0, 0, 1, 1.0f, 1.0f, 1.0f};
        galfus_realm_3d_create_model(REALM_3D, base_id + 3, floor_mod, NULL);
        galfus_realm_3d_set_model_transform(REALM_3D, base_id + 3, &floor_tf);

        // 2. Pedestal (cylinder radius 1.8, height 0.4)
        galfus_realm_3d_create_geometry(
            REALM_3D, base_id + 10,
            "{\"primitive\":\"cylinder\",\"radius\":1.8,\"size\":0.4,\"subdivisions\":24}");
        galfus_realm_3d_create_material(
            REALM_3D, base_id + 11,
            "{\"baseColor\":[0.22,0.25,0.32,1.0],\"roughness\":0.3,\"metallic\":0.4}");
        char ped_mod[128];
        snprintf(ped_mod, sizeof(ped_mod), "{\"geometryId\":%u,\"materialId\":%u}", base_id + 10,
                 base_id + 11);
        GalfusTransform3D ped_tf = {fx, 0.2f, fz, 0, 0, 0, 1, 1.0f, 1.0f, 1.0f};
        galfus_realm_3d_create_model(REALM_3D, base_id + 12, ped_mod, NULL);
        galfus_realm_3d_set_model_transform(REALM_3D, base_id + 12, &ped_tf);

        // 3. Room Light (Dynamic point light)
        GalfusTransform3D l_tf = {fx, fy + 2.5f, fz + 1.2f, 0, 0, 0, 1, 1.0f, 1.0f, 1.0f};
        galfus_realm_3d_create_light(REALM_3D, base_id + 20,
                                     "{\"kind\":\"point\",\"color\":[0.2,0.85,1.0],\"intensity\":3."
                                     "8,\"range\":16.0,\"castShadow\":true}",
                                     NULL);
        galfus_realm_3d_set_light_transform(REALM_3D, base_id + 20, &l_tf);

        // 4. Room Exhibits
        if (i == 0) { // Entrance
            galfus_realm_3d_create_geometry(REALM_3D, base_id + 30,
                                            "{\"primitive\":\"cube\",\"size\":1.4}");
            galfus_realm_3d_create_material(
                REALM_3D, base_id + 31,
                "{\"baseColor\":[1.0,0.82,0.2,1.0],\"roughness\":0.15,\"metallic\":0.95,"
                "\"emissiveColor\":[0.2,0.15,0.04,1.0],\"emissiveIntensity\":0.8}");
            char cube_mod[128];
            snprintf(cube_mod, sizeof(cube_mod), "{\"geometryId\":%u,\"materialId\":%u}",
                     base_id + 30, base_id + 31);
            GalfusTransform3D c_tf = {fx, 1.5f, fz, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_model(REALM_3D, base_id + 32, cube_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, base_id + 32, &c_tf);

            galfus_realm_3d_create_geometry(
                REALM_3D, base_id + 33,
                "{\"primitive\":\"torus\",\"radius\":1.2,\"subdivisions\":24}");
            galfus_realm_3d_create_material(
                REALM_3D, base_id + 34,
                "{\"baseColor\":[0.2,0.85,1.0,1.0],\"roughness\":0.1,\"metallic\":0.8,"
                "\"emissiveColor\":[0.1,0.4,0.6,1.0],\"emissiveIntensity\":1.2}");
            char halo_mod[128];
            snprintf(halo_mod, sizeof(halo_mod), "{\"geometryId\":%u,\"materialId\":%u}",
                     base_id + 33, base_id + 34);
            galfus_realm_3d_create_model(REALM_3D, base_id + 35, halo_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, base_id + 35, &c_tf);
        } else if (i == 1) { // Geometry (5 PBR Primitives)
            struct {
                const char *prim;
                float ox;
                const char *color;
                float rough;
                float metal;
            } prims[5] = {{"cube", -2.4f, "[0.95,0.8,0.2,1.0]", 0.1f, 0.9f},
                          {"sphere", -1.2f, "[0.9,0.92,0.95,1.0]", 0.05f, 1.0f},
                          {"cylinder", 0.0f, "[0.95,0.15,0.3,1.0]", 0.15f, 0.2f},
                          {"torus", 1.2f, "[0.2,0.85,0.4,1.0]", 0.2f, 0.3f},
                          {"sphere", 2.4f, "[0.15,0.6,1.0,1.0]", 0.7f, 0.0f}};
            for (int p = 0; p < 5; p++) {
                uint32_t gid = base_id + 30 + p * 3;
                uint32_t mid = base_id + 31 + p * 3;
                uint32_t mod_id = base_id + 32 + p * 3;
                char g_json[128], m_json[128], mo_json[128];
                snprintf(g_json, sizeof(g_json),
                         "{\"primitive\":\"%s\",\"size\":0.9,\"radius\":0.5,\"subdivisions\":24}",
                         prims[p].prim);
                snprintf(m_json, sizeof(m_json),
                         "{\"baseColor\":%s,\"roughness\":%f,\"metallic\":%f}", prims[p].color,
                         prims[p].rough, prims[p].metal);
                snprintf(mo_json, sizeof(mo_json), "{\"geometryId\":%u,\"materialId\":%u}", gid,
                         mid);
                galfus_realm_3d_create_geometry(REALM_3D, gid, g_json);
                galfus_realm_3d_create_material(REALM_3D, mid, m_json);
                GalfusTransform3D p_tf = {fx + prims[p].ox, 1.3f, fz, 0, 0, 0, 1, 1, 1, 1};
                galfus_realm_3d_create_model(REALM_3D, mod_id, mo_json, NULL);
                galfus_realm_3d_set_model_transform(REALM_3D, mod_id, &p_tf);
            }
        } else if (i == 2) { // Lighting
            galfus_realm_3d_create_geometry(
                REALM_3D, base_id + 40,
                "{\"primitive\":\"cylinder\",\"radius\":0.25,\"size\":2.5}");
            galfus_realm_3d_create_material(
                REALM_3D, base_id + 41,
                "{\"baseColor\":[0.35,0.38,0.45,1.0],\"roughness\":0.4,\"metallic\":0.2}");
            char pil_mod[128];
            snprintf(pil_mod, sizeof(pil_mod), "{\"geometryId\":%u,\"materialId\":%u}",
                     base_id + 40, base_id + 41);
            float offsets[2] = {-1.5f, 1.5f};
            for (int o = 0; o < 2; o++) {
                GalfusTransform3D pil_tf = {fx + offsets[o], 1.25f, fz, 0, 0, 0, 1, 1, 1, 1};
                galfus_realm_3d_create_model(REALM_3D, base_id + 42 + o, pil_mod, NULL);
                galfus_realm_3d_set_model_transform(REALM_3D, base_id + 42 + o, &pil_tf);
            }

            // Emissive glowing cube
            galfus_realm_3d_create_geometry(REALM_3D, base_id + 45,
                                            "{\"primitive\":\"cube\",\"size\":0.8}");
            galfus_realm_3d_create_material(
                REALM_3D, base_id + 46,
                "{\"baseColor\":[1.0,0.4,0.1,1.0],\"emissiveColor\":[1.0,0.5,0.1,1.0],"
                "\"emissiveIntensity\":4.5,\"roughness\":0.1,\"metallic\":0.0}");
            char em_mod[128];
            snprintf(em_mod, sizeof(em_mod), "{\"geometryId\":%u,\"materialId\":%u}", base_id + 45,
                     base_id + 46);
            GalfusTransform3D em_tf = {fx, 1.4f, fz, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_model(REALM_3D, base_id + 47, em_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, base_id + 47, &em_tf);

            // 3 RGB Point lights
            GalfusTransform3D r_tf = {fx - 2.0f, 2.0f, fz - 1.0f, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_light(REALM_3D, base_id + 50,
                                         "{\"kind\":\"point\",\"color\":[1.0,0.2,0.2],"
                                         "\"intensity\":4.0,\"range\":10.0,\"castShadow\":true}",
                                         NULL);
            galfus_realm_3d_set_light_transform(REALM_3D, base_id + 50, &r_tf);

            GalfusTransform3D g_tf = {fx + 2.0f, 2.0f, fz - 1.0f, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_light(REALM_3D, base_id + 51,
                                         "{\"kind\":\"point\",\"color\":[0.2,1.0,0.3],"
                                         "\"intensity\":4.0,\"range\":10.0,\"castShadow\":true}",
                                         NULL);
            galfus_realm_3d_set_light_transform(REALM_3D, base_id + 51, &g_tf);

            GalfusTransform3D b_tf = {fx, 3.0f, fz + 2.0f, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_light(REALM_3D, base_id + 52,
                                         "{\"kind\":\"point\",\"color\":[0.2,0.4,1.0],"
                                         "\"intensity\":4.0,\"range\":10.0,\"castShadow\":true}",
                                         NULL);
            galfus_realm_3d_set_light_transform(REALM_3D, base_id + 52, &b_tf);
        } else if (i == 3) { // Particles
            galfus_realm_3d_create_material(
                REALM_3D, base_id + 60,
                "{\"surfaceType\":\"additive\",\"baseColor\":[1.0,0.75,0.2,1.0]}");
            char part_desc[512];
            snprintf(
                part_desc, sizeof(part_desc),
                "{\"label\":\"Tour Spark "
                "Fountain\",\"materialId\":%u,\"maxParticles\":800,\"spawnRate\":200,"
                "\"lifetimeRange\":[0.7,1.5],\"speedRange\":[3.8,6.2],\"direction\":[0.0,1.0,0.0],"
                "\"spreadAngleRad\":0.35,\"gravity\":[0.0,-6.5,0.0],\"sizeRange\":[0.05,0.12]}",
                base_id + 60);
            GalfusTransform3D p_tf = {fx, 0.5f, fz, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_particle_emitter(REALM_3D, base_id + 61, part_desc, NULL);
            galfus_realm_3d_set_particle_emitter_transform(REALM_3D, base_id + 61, &p_tf);
        } else if (i == 4) { // Animation
            // 1. Bouncing Cube
            galfus_realm_3d_create_geometry(REALM_3D, base_id + 70,
                                            "{\"primitive\":\"cube\",\"size\":1.0}");
            galfus_realm_3d_create_material(
                REALM_3D, base_id + 71,
                "{\"baseColor\":[0.2,0.7,1.0,1.0],\"roughness\":0.2,\"metallic\":0.3}");
            char b_mod[128];
            snprintf(b_mod, sizeof(b_mod), "{\"geometryId\":%u,\"materialId\":%u}", base_id + 70,
                     base_id + 71);
            GalfusTransform3D b_tf = {fx - 1.8f, 0.6f, fz, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_model(REALM_3D, base_id + 72, b_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, base_id + 72, &b_tf);

            uint32_t trans_bounce = base_id + 80;
            galfus_animation_destroy_transition(trans_bounce);
            char b_init[256], b_target[256];
            snprintf(b_init, sizeof(b_init),
                     "{\"type\":\"transform3D\",\"value\":[%f,0.6,%f,0,0,0,1,1,1,1]}", fx - 1.8f,
                     fz);
            snprintf(b_target, sizeof(b_target),
                     "{\"type\":\"transform3D\",\"value\":[%f,3.2,%f,0,0.707,0,0.707,1,1,1]}",
                     fx - 1.8f, fz);
            const char *b_cfg = "{\"duration\":1.6,\"delay\":0.1,\"easing\":\"easeOutBounce\","
                                "\"loopMode\":\"pingPong\"}";
            galfus_animation_create_transition(trans_bounce, b_init, b_cfg);
            char b_bind[128];
            snprintf(b_bind, sizeof(b_bind),
                     "{\"kind\":\"modelTransform3D\",\"realmId\":10,\"modelId\":%u}", base_id + 72);
            galfus_animation_bind_target(trans_bounce, b_bind);
            galfus_animation_transition_to(trans_bounce, b_target, b_cfg);

            // 2. Pulsing Sphere
            galfus_realm_3d_create_geometry(
                REALM_3D, base_id + 73,
                "{\"primitive\":\"sphere\",\"radius\":0.6,\"subdivisions\":24}");
            galfus_realm_3d_create_material(
                REALM_3D, base_id + 74,
                "{\"baseColor\":[1.0,0.25,0.45,1.0],\"roughness\":0.15,\"metallic\":0.7}");
            char p_mod[128];
            snprintf(p_mod, sizeof(p_mod), "{\"geometryId\":%u,\"materialId\":%u}", base_id + 73,
                     base_id + 74);
            GalfusTransform3D pl_tf = {fx, 1.4f, fz, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_model(REALM_3D, base_id + 75, p_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, base_id + 75, &pl_tf);

            uint32_t trans_pulse = base_id + 81;
            galfus_animation_destroy_transition(trans_pulse);
            char p_init[256], p_target[256];
            snprintf(p_init, sizeof(p_init),
                     "{\"type\":\"transform3D\",\"value\":[%f,1.4,%f,0,0,0,1,0.7,0.7,0.7]}", fx,
                     fz);
            snprintf(p_target, sizeof(p_target),
                     "{\"type\":\"transform3D\",\"value\":[%f,1.4,%f,0,0,0,1,1.5,1.5,1.5]}", fx,
                     fz);
            const char *p_cfg = "{\"duration\":1.3,\"delay\":0.0,\"easing\":\"easeInOutCubic\","
                                "\"loopMode\":\"pingPong\"}";
            galfus_animation_create_transition(trans_pulse, p_init, p_cfg);
            char p_bind[128];
            snprintf(p_bind, sizeof(p_bind),
                     "{\"kind\":\"modelTransform3D\",\"realmId\":10,\"modelId\":%u}", base_id + 75);
            galfus_animation_bind_target(trans_pulse, p_bind);
            galfus_animation_transition_to(trans_pulse, p_target, p_cfg);

            // 3. Rotating Torus
            galfus_realm_3d_create_geometry(
                REALM_3D, base_id + 76,
                "{\"primitive\":\"torus\",\"radius\":0.7,\"subdivisions\":24}");
            galfus_realm_3d_create_material(
                REALM_3D, base_id + 77,
                "{\"baseColor\":[0.3,0.9,0.4,1.0],\"roughness\":0.25,\"metallic\":0.4}");
            char t_mod[128];
            snprintf(t_mod, sizeof(t_mod), "{\"geometryId\":%u,\"materialId\":%u}", base_id + 76,
                     base_id + 77);
            GalfusTransform3D tr_tf = {fx + 1.8f, 1.4f, fz, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_model(REALM_3D, base_id + 78, t_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, base_id + 78, &tr_tf);

            uint32_t trans_torus = base_id + 82;
            galfus_animation_destroy_transition(trans_torus);
            char t_init[256], t_target[256];
            snprintf(t_init, sizeof(t_init),
                     "{\"type\":\"transform3D\",\"value\":[%f,0.8,%f,0,0,0,1,1,1,1]}", fx + 1.8f,
                     fz);
            snprintf(t_target, sizeof(t_target),
                     "{\"type\":\"transform3D\",\"value\":[%f,2.4,%f,0.5,0.5,0.5,0.5,1,1,1]}",
                     fx + 1.8f, fz);
            const char *t_cfg = "{\"duration\":1.5,\"delay\":0.2,\"easing\":\"easeInOutSine\","
                                "\"loopMode\":\"pingPong\"}";
            galfus_animation_create_transition(trans_torus, t_init, t_cfg);
            char t_bind[128];
            snprintf(t_bind, sizeof(t_bind),
                     "{\"kind\":\"modelTransform3D\",\"realmId\":10,\"modelId\":%u}", base_id + 78);
            galfus_animation_bind_target(trans_torus, t_bind);
            galfus_animation_transition_to(trans_torus, t_target, t_cfg);
        } else if (i == 5) { // Planar Mirrors & Portals
            galfus_realm_3d_create_geometry(REALM_3D, base_id + 90,
                                            "{\"primitive\":\"plane\",\"size\":3.2}");
            galfus_realm_3d_create_material(
                REALM_3D, base_id + 91,
                "{\"surfaceType\":\"mirror\",\"baseColor\":[0.95,0.97,1.0,1.0],\"roughness\":0.02,"
                "\"metallic\":0.98,\"reflectance\":0.9}");
            char mir_mod[128];
            snprintf(mir_mod, sizeof(mir_mod), "{\"geometryId\":%u,\"materialId\":%u}",
                     base_id + 90, base_id + 91);
            GalfusTransform3D mir_tf = {fx, 1.8f, fz - 1.5f, 0.7071f, 0.0f, 0.0f, 0.7071f, 1, 1, 1};
            galfus_realm_3d_create_model(REALM_3D, base_id + 92, mir_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, base_id + 92, &mir_tf);

            char port_desc[128];
            snprintf(port_desc, sizeof(port_desc), "{\"modelId\":%u,\"active\":true}",
                     base_id + 92);
            galfus_realm_3d_create_portal(REALM_3D, base_id + 93, port_desc);

            // Mirror Frame
            galfus_realm_3d_create_geometry(
                REALM_3D, base_id + 94, "{\"primitive\":\"cylinder\",\"radius\":0.1,\"size\":3.4}");
            galfus_realm_3d_create_material(
                REALM_3D, base_id + 95,
                "{\"baseColor\":[0.85,0.7,0.25,1.0],\"roughness\":0.25,\"metallic\":0.85}");
            char f_mod[128];
            snprintf(f_mod, sizeof(f_mod), "{\"geometryId\":%u,\"materialId\":%u}", base_id + 94,
                     base_id + 95);
            GalfusTransform3D f1_tf = {fx - 1.6f, 1.8f, fz - 1.5f, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_model(REALM_3D, base_id + 96, f_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, base_id + 96, &f1_tf);
            GalfusTransform3D f2_tf = {fx + 1.6f, 1.8f, fz - 1.5f, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_model(REALM_3D, base_id + 97, f_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, base_id + 97, &f2_tf);
        } else if (i == 6) { // Bones (Procedural Rigging)
            Vertex3DRecord *verts = NULL;
            uint32_t *indices = NULL;
            size_t vert_count = 0, idx_count = 0;
            build_skinned_mesh(&verts, &vert_count, &indices, &idx_count);

            uint32_t geom_skin = base_id + 100;
            uint32_t mat_skin = base_id + 101;
            uint32_t mod_skin = 7102; // Matches tour_runner model ID
            (galfus_realm_3d_create_geometry)(REALM_3D, geom_skin, 3, (const uint8_t *)verts,
                                              vert_count * sizeof(Vertex3DRecord), indices,
                                              idx_count);
            galfus_realm_3d_create_material(
                REALM_3D, mat_skin,
                "{\"baseColor\":[0.15,0.85,0.95,1.0],\"emissiveColor\":[0.05,0.25,0.35,1.0],"
                "\"roughness\":0.2,\"metallic\":0.6}");
            char sk_mod[256];
            snprintf(sk_mod, sizeof(sk_mod),
                     "{\"geometryId\":%u,\"materialId\":%u,\"castShadow\":true,\"boneCount\":12,"
                     "\"boneOffset\":0,\"active\":true}",
                     geom_skin, mat_skin);
            GalfusTransform3D sk_tf = {fx, 0.4f, fz, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_model(REALM_3D, mod_skin, sk_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, mod_skin, &sk_tf);

            free(verts);
            free(indices);
        } else if (i == 7) { // Refraction
            galfus_realm_3d_create_geometry(
                REALM_3D, base_id + 110,
                "{\"primitive\":\"sphere\",\"radius\":1.0,\"subdivisions\":32}");
            galfus_realm_3d_create_material(
                REALM_3D, base_id + 111,
                "{\"surfaceType\":\"refractive\",\"baseColor\":[0.1,0.85,0.4,0.35],\"roughness\":0."
                "04,\"metallic\":0.0,\"reflectance\":0.7,\"refractionIndex\":1.52,"
                "\"refractionDistortion\":0.1}");
            char ref_mod[128];
            snprintf(ref_mod, sizeof(ref_mod), "{\"geometryId\":%u,\"materialId\":%u}",
                     base_id + 110, base_id + 111);
            GalfusTransform3D rf_tf = {fx, 1.5f, fz, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_model(REALM_3D, base_id + 112, ref_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, base_id + 112, &rf_tf);

            // Patterned background pillar
            galfus_realm_3d_create_geometry(REALM_3D, base_id + 113,
                                            "{\"primitive\":\"cube\",\"size\":1.2}");
            galfus_realm_3d_create_material(
                REALM_3D, base_id + 114,
                "{\"baseColor\":[0.95,0.2,0.35,1.0],\"emissiveColor\":[0.3,0.05,0.1,1.0],"
                "\"roughness\":0.2,\"metallic\":0.5}");
            char bk_mod[128];
            snprintf(bk_mod, sizeof(bk_mod), "{\"geometryId\":%u,\"materialId\":%u}", base_id + 113,
                     base_id + 114);
            GalfusTransform3D bk_tf = {fx, 1.5f, fz - 2.5f, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_model(REALM_3D, base_id + 115, bk_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, base_id + 115, &bk_tf);
        } else if (i == 8) { // Effects
            galfus_realm_3d_create_geometry(
                REALM_3D, base_id + 120,
                "{\"primitive\":\"torus\",\"radius\":1.1,\"subdivisions\":32}");
            galfus_realm_3d_create_material(REALM_3D, base_id + 121,
                                            "{\"baseColor\":[0.85,0.3,0.9,1.0],\"emissiveColor\":["
                                            "0.4,0.1,0.5,1.0],\"roughness\":0.1,\"metallic\":0.8}");
            char eff_mod[128];
            snprintf(eff_mod, sizeof(eff_mod), "{\"geometryId\":%u,\"materialId\":%u}",
                     base_id + 120, base_id + 121);
            GalfusTransform3D ef_tf = {fx, 1.5f, fz, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_model(REALM_3D, base_id + 122, eff_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, base_id + 122, &ef_tf);
        } else if (i == 9) { // Audio Finale
            galfus_realm_3d_create_geometry(
                REALM_3D, base_id + 130,
                "{\"primitive\":\"cylinder\",\"radius\":0.7,\"size\":2.0,\"subdivisions\":24}");
            galfus_realm_3d_create_material(
                REALM_3D, base_id + 131,
                "{\"baseColor\":[0.95,0.8,0.2,1.0],\"emissiveColor\":[0.35,0.28,0.05,1.0],"
                "\"roughness\":0.2,\"metallic\":0.8}");
            char aud_mod[128];
            snprintf(aud_mod, sizeof(aud_mod), "{\"geometryId\":%u,\"materialId\":%u}",
                     base_id + 130, base_id + 131);
            GalfusTransform3D au_tf = {fx, 1.4f, fz, 0, 0, 0, 1, 1, 1, 1};
            galfus_realm_3d_create_model(REALM_3D, base_id + 132, aud_mod, NULL);
            galfus_realm_3d_set_model_transform(REALM_3D, base_id + 132, &au_tf);
        }
    }
}

static void setup_camera_paths(int start_room) {
    galfus_animation_destroy_path_follow(PATH_CAMERA_POS_ID);
    galfus_animation_destroy_path_follow(PATH_CAMERA_LOOK_ID);

    char pos_cmds[4096];
    char look_cmds[4096];

    int pos_off = snprintf(
        pos_cmds, sizeof(pos_cmds), "[{\"type\":\"moveTo\",\"to\":[%.1f,%.1f,%.1f]}",
        ROOM_CAM_POS[start_room][0], ROOM_CAM_POS[start_room][1], ROOM_CAM_POS[start_room][2]);
    int look_off =
        snprintf(look_cmds, sizeof(look_cmds), "[{\"type\":\"moveTo\",\"to\":[%.1f,%.1f,%.1f]}",
                 ROOM_FOCUS[start_room][0], ROOM_FOCUS[start_room][1], ROOM_FOCUS[start_room][2]);

    for (int offset = 0; offset < 10; offset++) {
        int r = (start_room + offset) % 10;
        int next_r = (r + 1) % 10;

        float pos_linger_x = (r < 5) ? (ROOM_CAM_POS[r][0] + 0.6f) : (ROOM_CAM_POS[r][0] - 0.6f);
        float pos_linger_y = ROOM_CAM_POS[r][1];
        float pos_linger_z = ROOM_CAM_POS[r][2];

        float pos_travel_x = ROOM_CAM_POS[next_r][0];
        float pos_travel_y = ROOM_CAM_POS[next_r][1];
        float pos_travel_z = ROOM_CAM_POS[next_r][2];

        pos_off += snprintf(pos_cmds + pos_off, sizeof(pos_cmds) - pos_off,
                            ",{\"type\":\"lineTo\",\"to\":[%.1f,%.1f,%.1f],\"duration\":3.0,"
                            "\"easing\":\"easeInOutSine\"}"
                            ",{\"type\":\"lineTo\",\"to\":[%.1f,%.1f,%.1f],\"duration\":1.0,"
                            "\"easing\":\"easeInOutQuad\"}",
                            pos_linger_x, pos_linger_y, pos_linger_z, pos_travel_x, pos_travel_y,
                            pos_travel_z);

        look_off += snprintf(look_cmds + look_off, sizeof(look_cmds) - look_off,
                             ",{\"type\":\"lineTo\",\"to\":[%.1f,%.1f,%.1f],\"duration\":3.0,"
                             "\"easing\":\"easeInOutSine\"}"
                             ",{\"type\":\"lineTo\",\"to\":[%.1f,%.1f,%.1f],\"duration\":1.0,"
                             "\"easing\":\"easeInOutQuad\"}",
                             ROOM_FOCUS[r][0], ROOM_FOCUS[r][1], ROOM_FOCUS[r][2],
                             ROOM_FOCUS[next_r][0], ROOM_FOCUS[next_r][1], ROOM_FOCUS[next_r][2]);
    }
    snprintf(pos_cmds + pos_off, sizeof(pos_cmds) - pos_off, "]");
    snprintf(look_cmds + look_off, sizeof(look_cmds) - look_off, "]");

    const char *path_cfg = "{\"duration\":40.0,\"loopMode\":\"loop\",\"valueType\":\"position3D\"}";
    if (galfus_animation_create_path_follow(PATH_CAMERA_POS_ID, pos_cmds, path_cfg) != 0) {
        fprintf(stderr, "[Error] Failed to create pos path follow: %s\n", galfus_get_last_error());
    }
    if (galfus_animation_bind_path_follow_target(
            PATH_CAMERA_POS_ID, "{\"kind\":\"camera3DTransform\",\"realmId\":10,\"cameraId\":1}") !=
        0) {
        fprintf(stderr, "[Error] Failed to bind pos path follow: %s\n", galfus_get_last_error());
    }

    if (galfus_animation_create_path_follow(PATH_CAMERA_LOOK_ID, look_cmds, path_cfg) != 0) {
        fprintf(stderr, "[Error] Failed to create look path follow: %s\n", galfus_get_last_error());
    }
    if (galfus_animation_bind_path_follow_target(
            PATH_CAMERA_LOOK_ID, "{\"kind\":\"camera3DLookAt\",\"realmId\":10,\"cameraId\":1}") !=
        0) {
        fprintf(stderr, "[Error] Failed to bind look path follow: %s\n", galfus_get_last_error());
    }

    GalfusTransform3D c_tf = {ROOM_CAM_POS[start_room][0],
                              ROOM_CAM_POS[start_room][1],
                              ROOM_CAM_POS[start_room][2],
                              0,
                              0,
                              0,
                              1,
                              1,
                              1,
                              1};
    galfus_realm_3d_set_camera_transform(REALM_3D, CAMERA_3D_ID, &c_tf);
    GalfusCameraLookAt3D l_tf = {1,
                                 ROOM_FOCUS[start_room][0],
                                 ROOM_FOCUS[start_room][1],
                                 ROOM_FOCUS[start_room][2],
                                 0.0f,
                                 1.0f,
                                 0.0f};
    galfus_realm_3d_set_camera_look_at(REALM_3D, CAMERA_3D_ID, &l_tf);
}

static double get_time_sec(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec + (double)ts.tv_nsec * 1e-9;
}

static void apply_room(int r, float tour_clock, bool is_paused) {
    char svg_buf[4096];
    render_hud_svg(svg_buf, sizeof(svg_buf), r, tour_clock, is_paused);
    galfus_realm_2d_set_svg_source(REALM_2D, SVG_HUD_ID, svg_buf);

    if (r == 8) {
        galfus_multiverse_set_invocation_filters(INVOCATION_3D,
                                                 "[\"chromaticAberration\",\"vignette\"]");
    } else {
        galfus_multiverse_set_invocation_filters(INVOCATION_3D, "[]");
    }

    if (r == 9) {
        galfus_audio_play_sound(SOUND_ID, 0.9f, 0.0f, 1.0f, false);
    }
}

static void seek_room(int target_room, float *tour_clock, int *current_room, bool is_paused) {
    int wrapped = (target_room % 10 + 10) % 10;
    *current_room = wrapped;
    *tour_clock = (float)wrapped * 4.0f;
    setup_camera_paths(wrapped);
    apply_room(wrapped, *tour_clock, is_paused);
    printf("[Tour] Jumped to Room %d: %s\n", wrapped + 1, ROOM_NAMES[wrapped]);
}

int main(int argc, char **argv) {
    int max_frames = -1;
    if (argc > 1) {
        max_frames = atoi(argv[1]);
    }

    printf("=== Galfus Engine Feature Tour [C99 / Native] (v1.1.0) ===\n\n");

    galfus_platform_init();

    uint32_t window_id = 1;
    galfus_window_create("{\"id\":1,\"title\":\"Galfus Engine Feature Tour — C "
                         "Runner\",\"size\":[1024,768],\"resizable\":true,\"decorations\":true}");
    galfus_multiverse_attach_window(window_id);

    // 1. Create Target
    galfus_multiverse_create_target(TARGET_WINDOW,
                                    "{\"kind\":{\"type\":\"window\",\"windowId\":1}}");

    // 2. Realms
    galfus_realm_3d_create(REALM_3D);
    galfus_realm_2d_create(REALM_2D);

    // 3. Viewport split (Top 50vh = 3D, Bottom 50vh = 2D)
    galfus_multiverse_create_invocation(
        INVOCATION_3D, "{\"realmId\":10,\"targetId\":1,\"cameraSlot\":0,\"viewport\":{\"anchorX\":"
                       "\"left\",\"anchorY\":\"top\",\"width\":{\"vw\":100},\"height\":{\"vh\":50}}"
                       ",\"clearColor\":[0.06,0.08,0.12,1.0],\"enabled\":true,\"zIndex\":0}");
    galfus_multiverse_create_invocation(
        INVOCATION_2D, "{\"realmId\":20,\"targetId\":1,\"cameraSlot\":0,\"viewport\":{\"anchorX\":"
                       "\"left\",\"anchorY\":\"bottom\",\"width\":{\"vw\":100},\"height\":{\"vh\":"
                       "50}},\"clearColor\":[0.08,0.1,0.15,1.0],\"enabled\":true,\"zIndex\":1}");

    // 2D Ambient Light
    GalfusTransform2D l2d_tf = {0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 0, 0};
    galfus_realm_2d_create_light(
        REALM_2D, 1, "{\"color\":[1.0,1.0,1.0],\"intensity\":1.0,\"range\":1000.0,\"active\":true}",
        "{\"position\":[0,0]}");
    galfus_realm_2d_set_light_transform(REALM_2D, 1, &l2d_tf);

    // Cameras
    GalfusTransform3D cam_tf = {
        ROOM_CAM_POS[0][0], ROOM_CAM_POS[0][1], ROOM_CAM_POS[0][2], 0, 0, 0, 1, 1, 1, 1};
    galfus_realm_3d_create_camera(REALM_3D, CAMERA_3D_ID,
                                  "{\"fovY\":60.0,\"near\":0.1,\"far\":1000.0,\"cameraSlot\":0,"
                                  "\"lookAt\":{\"target\":[0.0,1.2,0.0],\"up\":[0.0,1.0,0.0]}}",
                                  "{\"position\":[0.0,2.5,7.0]}");
    galfus_realm_3d_set_camera_transform(REALM_3D, CAMERA_3D_ID, &cam_tf);

    GalfusTransform2D c2d_tf = {0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 0, 0};
    galfus_realm_2d_create_camera(REALM_2D, CAMERA_2D_ID, "{\"orthoScale\":240,\"cameraSlot\":0}",
                                  "{\"position\":[0,0]}");
    galfus_realm_2d_set_camera_transform(REALM_2D, CAMERA_2D_ID, &c2d_tf);

    // Procedural Skybox
    galfus_realm_3d_set_environment(
        REALM_3D, "{\"ambientColor\":[0.15,0.18,0.22,1.0],\"exposure\":1.1,\"skybox\":{\"mode\":"
                  "\"procedural\",\"skyColor\":[0.2,0.4,0.7,1.0],\"horizonColor\":[0.55,0.65,0.75,"
                  "1.0],\"groundColor\":[0.06,0.08,0.1,1.0],\"sunDirection\":[0.6,0.8,0.3,0.0],"
                  "\"sunColor\":[1.0,0.95,0.85,2.0],\"intensity\":1.2}}");

    // Build 10 Rooms
    build_all_rooms();

    // Audio chime
    size_t wav_size = 0;
    uint8_t *wav_bytes = create_chime_wav(&wav_size);
    if (wav_bytes) {
        galfus_audio_load_sound(SOUND_ID, wav_bytes, wav_size);
        free(wav_bytes);
    }

    // SVG companion panel
    char svg_buf[4096];
    render_hud_svg(svg_buf, sizeof(svg_buf), 0, 0.0f, false);
    GalfusTransform2D svg_tf = {0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 0, 0};
    galfus_realm_2d_create_svg(REALM_2D, SVG_HUD_ID, "{\"source\":\"<svg></svg>\"}",
                               "{\"position\":[0,0]}");
    galfus_realm_2d_set_svg_transform(REALM_2D, SVG_HUD_ID, &svg_tf);
    galfus_realm_2d_set_svg_source(REALM_2D, SVG_HUD_ID, svg_buf);

    setup_camera_paths(0);
    printf("✔ Tour paths and rooms configured successfully!\n\n");

    bool running = true;
    bool is_paused = false;
    float tour_clock = 0.0f;
    float anim_clock = 0.0f;
    int current_room = 0;
    uint64_t frame = 0;
    double last_time = get_time_sec();

    while (running) {
        double now = get_time_sec();
        float dt = (float)(now - last_time);
        if (dt < 0.001f)
            dt = 0.001f;
        if (dt > 0.1f)
            dt = 0.1f;
        last_time = now;

        GalfusEventBatch batch;
        if (galfus_platform_pump_events(&batch) == 0) {
            for (uint32_t i = 0; i < batch.event_count; i++) {
                const GalfusPlatformEvent *ev = &batch.events[i];
                if (ev->kind == 1) {           // Window
                    if (ev->event_type == 3) { // closeRequested
                        running = false;
                    } else if (ev->event_type == 1) { // resized
                        galfus_multiverse_update_window_size(window_id, (uint32_t)ev->values[0],
                                                             (uint32_t)ev->values[1]);
                    }
                } else if (ev->kind == 3 && ev->event_type == 1) { // Keyboard input
                    bool is_pressed = (ev->flags & 1) != 0;
                    if (is_pressed && batch.text_data) {
                        char text0[64] = {0};
                        char text1[64] = {0};
                        if (ev->text0_length > 0 && ev->text0_length < 63) {
                            memcpy(text0, batch.text_data + ev->text0_offset, ev->text0_length);
                        }
                        if (ev->text1_length > 0 && ev->text1_length < 63) {
                            memcpy(text1, batch.text_data + ev->text1_offset, ev->text1_length);
                        }

                        if (strcmp(text0, "Escape") == 0 || strcmp(text1, "Escape") == 0) {
                            running = false;
                        } else if (strcmp(text0, "Space") == 0 || strcmp(text1, " ") == 0 ||
                                   strcmp(text1, "Space") == 0) {
                            is_paused = !is_paused;
                            if (!is_paused) {
                                setup_camera_paths(current_room);
                            }
                            apply_room(current_room, tour_clock, is_paused);
                            printf("[Tour] Playback %s\n", is_paused ? "PAUSED" : "RESUMED");
                        } else if (strcmp(text0, "KeyR") == 0 || strcmp(text1, "r") == 0 ||
                                   strcmp(text1, "R") == 0) {
                            seek_room(0, &tour_clock, &current_room, is_paused);
                        } else if (strcmp(text0, "ArrowRight") == 0 ||
                                   strcmp(text1, "ArrowRight") == 0) {
                            seek_room(current_room + 1, &tour_clock, &current_room, is_paused);
                        } else if (strcmp(text0, "ArrowLeft") == 0 ||
                                   strcmp(text1, "ArrowLeft") == 0) {
                            seek_room(current_room - 1, &tour_clock, &current_room, is_paused);
                        }
                    }
                }
            }
            galfus_platform_release_event_batch(batch.batch_id);
        }

        anim_clock += dt;

        if (!is_paused) {
            tour_clock = fmodf(tour_clock + dt, 40.0f);
            int active_r = (int)(tour_clock / 4.0f);
            if (active_r >= 0 && active_r < 10 && active_r != current_room) {
                current_room = active_r;
                apply_room(active_r, tour_clock, is_paused);
            }
        }

        galfus_animation_step(dt);

        if (is_paused) {
            GalfusTransform3D c_tf = {ROOM_CAM_POS[current_room][0],
                                      ROOM_CAM_POS[current_room][1],
                                      ROOM_CAM_POS[current_room][2],
                                      0,
                                      0,
                                      0,
                                      1,
                                      1,
                                      1,
                                      1};
            galfus_realm_3d_set_camera_transform(REALM_3D, CAMERA_3D_ID, &c_tf);
            GalfusCameraLookAt3D l_tf = {1,
                                         ROOM_FOCUS[current_room][0],
                                         ROOM_FOCUS[current_room][1],
                                         ROOM_FOCUS[current_room][2],
                                         0.0f,
                                         1.0f,
                                         0.0f};
            galfus_realm_3d_set_camera_look_at(REALM_3D, CAMERA_3D_ID, &l_tf);
        }

        float bone_palette[192];
        compute_bone_palette(anim_clock, bone_palette, 12, 5.0f);
        galfus_realm_3d_update_bones(REALM_3D, 7102, bone_palette, 192);

        galfus_multiverse_resolve();
        galfus_multiverse_dispatch(frame, dt);
        frame++;

        if (max_frames > 0 && (int)frame >= max_frames) {
            break;
        }
    }

    galfus_animation_destroy_path_follow(PATH_CAMERA_POS_ID);
    galfus_animation_destroy_path_follow(PATH_CAMERA_LOOK_ID);
    galfus_animation_destroy_transition(5080);
    galfus_animation_destroy_transition(5081);
    galfus_animation_destroy_transition(5082);
    galfus_realm_3d_destroy(REALM_3D);
    galfus_realm_2d_destroy(REALM_2D);
    galfus_multiverse_destroy_target(TARGET_WINDOW);
    galfus_platform_shutdown();

    printf("✔ C feature tour finished gracefully.\n");
    return 0;
}
