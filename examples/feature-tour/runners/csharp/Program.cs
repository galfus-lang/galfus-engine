using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Galfus;

namespace FeatureTourRunner
{
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    public struct Vertex3DRecord
    {
        public float posX, posY, posZ;
        public float normX, normY, normZ;
        public float uvU, uvV;
        public float tanX, tanY, tanZ, tanW;
        public uint joint0, joint1, joint2, joint3;
        public float weight0, weight1, weight2, weight3;
    }

    class Program
    {
        const uint TARGET_WINDOW = 1;
        const uint REALM_3D = 10;
        const uint REALM_2D = 20;
        const uint INVOCATION_3D = 100;
        const uint INVOCATION_2D = 101;
        const uint CAMERA_3D_ID = 1;
        const uint CAMERA_2D_ID = 1;
        const uint SVG_HUD_ID = 1;
        const uint PATH_CAMERA_POS_ID = 401;
        const uint PATH_CAMERA_LOOK_ID = 402;
        const uint SOUND_ID = 501;

        static byte[] CreateChimeWav()
        {
            uint sampleRate = 44100;
            float duration = 1.0f;
            uint numSamples = (uint)(sampleRate * duration);
            uint dataSize = numSamples * 2;
            byte[] buf = new byte[44 + dataSize];

            Encoding.ASCII.GetBytes("RIFF").CopyTo(buf, 0);
            BitConverter.GetBytes(36 + dataSize).CopyTo(buf, 4);
            Encoding.ASCII.GetBytes("WAVEfmt ").CopyTo(buf, 8);
            BitConverter.GetBytes(16).CopyTo(buf, 16);
            BitConverter.GetBytes((ushort)1).CopyTo(buf, 20); // PCM
            BitConverter.GetBytes((ushort)1).CopyTo(buf, 22); // mono
            BitConverter.GetBytes(sampleRate).CopyTo(buf, 24);
            BitConverter.GetBytes(sampleRate * 2).CopyTo(buf, 28);
            BitConverter.GetBytes((ushort)2).CopyTo(buf, 32);
            BitConverter.GetBytes((ushort)16).CopyTo(buf, 34);
            Encoding.ASCII.GetBytes("data").CopyTo(buf, 36);
            BitConverter.GetBytes(dataSize).CopyTo(buf, 40);

            for (uint i = 0; i < numSamples; i++)
            {
                float t = (float)i / sampleRate;
                float env = MathF.Exp(-3.5f * t);
                float wave = 0.6f * MathF.Sin(2.0f * MathF.PI * 440.0f * t)
                           + 0.3f * MathF.Sin(3.0f * MathF.PI * 440.0f * t)
                           + 0.1f * MathF.Sin(4.0f * MathF.PI * 440.0f * t);
                float s = Math.Clamp(wave * env, -1.0f, 1.0f);
                short sampleVal = (short)(s * 32767.0f);
                BitConverter.GetBytes(sampleVal).CopyTo(buf, 44 + i * 2);
            }
            return buf;
        }

        static void ComputeBonePalette(float timeVal, float[] palette, int boneCount, float height)
        {
            float segHeight = height / (boneCount - 1);
            for (int i = 0; i < boneCount; i++)
            {
                float frac = (float)i / (boneCount - 1);
                float restY = i * segHeight;
                float wave = MathF.Sin(timeVal * 3.5f + i * 0.45f);
                float dx = wave * frac * frac * 1.5f;
                float dz = MathF.Cos(timeVal * 2.5f + i * 0.3f) * frac * 0.8f;
                float rz = wave * frac * 0.4f;

                float cz = MathF.Cos(rz);
                float sz = MathF.Sin(rz);

                float[] m = {
                    cz, sz, 0.0f, 0.0f,
                    -sz, cz, 0.0f, 0.0f,
                    0.0f, 0.0f, 1.0f, 0.0f,
                    dx, restY * (1.0f - cz), dz, 1.0f
                };
                for (int c = 0; c < 16; c++)
                {
                    palette[i * 16 + c] = m[c];
                }
            }
        }

        static string EscapeXml(string text)
        {
            if (string.IsNullOrEmpty(text)) return "";
            return text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
        }

        static string RenderHudSvg(TourConfig tour, TourRoom room, float elapsedSecs, bool isPaused)
        {
            float totalDur = tour.Duration;
            float ratio = Math.Clamp(elapsedSecs / totalDur, 0.0f, 1.0f);
            int progressPct = (int)Math.Round(ratio * 100.0f);
            int barWidth = Math.Max(6, (int)Math.Round(ratio * 440.0f));
            var telemetry = new List<KeyValuePair<string, JsonElement>>(room.Telemetry);
            string telemetryLines = "";
            for (int index = 0; index < Math.Min(4, telemetry.Count); index++)
            {
                var entry = telemetry[index];
                int x = index < 2 ? 34 : 260;
                int y = 156 + (index % 2) * 20;
                telemetryLines += $"<tspan x=\"{x}\" y=\"{y}\">▸ {EscapeXml(entry.Key)}: <tspan fill=\"#38BDF8\" font-weight=\"bold\">{EscapeXml(entry.Value.ToString())}</tspan></tspan>";
            }

            string badge = isPaused
                ? "<rect x=\"390\" y=\"20\" width=\"80\" height=\"24\" rx=\"6\" fill=\"#DC2626\"/><text x=\"430\" y=\"36\" font-family=\"sans-serif\" font-size=\"11\" font-weight=\"bold\" fill=\"#FFFFFF\" text-anchor=\"middle\">PAUSED</text>"
                : "<rect x=\"390\" y=\"20\" width=\"80\" height=\"24\" rx=\"6\" fill=\"#059669\"/><text x=\"430\" y=\"36\" font-family=\"sans-serif\" font-size=\"11\" font-weight=\"bold\" fill=\"#FFFFFF\" text-anchor=\"middle\">LIVE TOUR</text>";

            return $@"<svg xmlns=""http://www.w3.org/2000/svg"" viewBox=""0 0 500 240"" width=""500"" height=""240"">
  <defs>
    <linearGradient id=""cardBg"" x1=""0%"" y1=""0%"" x2=""0%"" y2=""100%"">
      <stop offset=""0%"" stop-color=""#1E293B""/>
      <stop offset=""100%"" stop-color=""#0F172A""/>
    </linearGradient>
    <linearGradient id=""neonBar"" x1=""0%"" y1=""0%"" x2=""100%"" y2=""0%"">
      <stop offset=""0%"" stop-color=""#06B6D4""/>
      <stop offset=""50%"" stop-color=""#3B82F6""/>
      <stop offset=""100%"" stop-color=""#8B5CF6""/>
    </linearGradient>
  </defs>
  <rect x=""8"" y=""8"" width=""484"" height=""224"" rx=""14"" fill=""url(#cardBg)"" stroke=""#38BDF8"" stroke-width=""2""/>
  <path d=""M 22 8 L 478 8"" stroke=""#38BDF8"" stroke-width=""3"" stroke-linecap=""round""/>
  <text x=""28"" y=""36"" font-family=""sans-serif"" font-size=""16"" font-weight=""bold"" fill=""#FFFFFF"">{EscapeXml(tour.Title)}</text>
  <rect x=""230"" y=""22"" width=""90"" height=""20"" rx=""4"" fill=""#334155""/>
  <text x=""275"" y=""36"" font-family=""sans-serif"" font-size=""10"" font-weight=""bold"" fill=""#38BDF8"" text-anchor=""middle"">C# / Native</text>
  {badge}
  <rect x=""28"" y=""50"" width=""130"" height=""18"" rx=""4"" fill=""#0284C7""/>
  <text x=""93"" y=""63"" font-family=""sans-serif"" font-size=""10"" font-weight=""bold"" fill=""#FFFFFF"" text-anchor=""middle"">{EscapeXml(room.Category)}</text>
  <text x=""170"" y=""65"" font-family=""sans-serif"" font-size=""14"" font-weight=""bold"" fill=""#F8FAFC"">Room {room.RoomIndex + 1}/{tour.Rooms.Count}: {EscapeXml(room.Name)}</text>
  <text x=""28"" y=""86"" font-family=""sans-serif"" font-size=""12"" fill=""#E2E8F0"">{EscapeXml(room.Description)}</text>
  <rect x=""28"" y=""98"" width=""444"" height=""14"" rx=""7"" fill=""#334155"" stroke=""#475569"" stroke-width=""1""/>
  <rect x=""28"" y=""98"" width=""{barWidth}"" height=""14"" rx=""7"" fill=""url(#neonBar)""/>
  <text x=""472"" y=""124"" font-family=""sans-serif"" font-size=""11"" font-weight=""bold"" fill=""#94A3B8"" text-anchor=""end"">{progressPct}% ({elapsedSecs:F1}s / {totalDur:F1}s)</text>
  <rect x=""24"" y=""132"" width=""452"" height=""52"" rx=""8"" fill=""#1E293B"" stroke=""#475569"" stroke-width=""1.5""/>
  <text font-family=""monospace"" font-size=""11"" fill=""#CBD5E1"">{telemetryLines}</text>
  <text x=""28"" y=""210"" font-family=""sans-serif"" font-size=""11"" fill=""#94A3B8"">[Space]: Pause/Resume  |  [←/→]: Prev/Next Room  |  [R]: Restart  |  [Esc]: Exit</text>
</svg>";
        }

        static void BuildAllRooms(GalfusEngine galfus, TourConfig tour)
        {
            foreach (TourRoom room in tour.Rooms)
            {
                int i = room.RoomIndex;
                uint baseId = (uint)((i + 1) * 1000);
                float fx = room.FocusPoint[0];
                float fy = room.FocusPoint[1];
                float fz = room.FocusPoint[2];

                // Base Pedestal
                galfus.Realm3dCreateGeometry(REALM_3D, baseId + 1, "{\"primitive\":\"plane\",\"size\":16.0}");
                galfus.Realm3dCreateMaterial(REALM_3D, baseId + 2, "{\"baseColor\":[0.12,0.15,0.22,1.0],\"roughness\":0.8,\"metallic\":0.1}");
                galfus.Realm3dCreateModel(REALM_3D, baseId + 3, $"{{\"geometryId\":{baseId + 1},\"materialId\":{baseId + 2}}}", null);
                var floorTf = new GalfusTransform3D { position_x = fx, position_y = 0.0f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f };
                galfus.Realm3dSetModelTransform(REALM_3D, baseId + 3, floorTf);

                galfus.Realm3dCreateGeometry(REALM_3D, baseId + 10, "{\"primitive\":\"cylinder\",\"radius\":1.8,\"size\":0.4,\"subdivisions\":24}");
                galfus.Realm3dCreateMaterial(REALM_3D, baseId + 11, "{\"baseColor\":[0.22,0.25,0.32,1.0],\"roughness\":0.3,\"metallic\":0.4}");
                galfus.Realm3dCreateModel(REALM_3D, baseId + 12, $"{{\"geometryId\":{baseId + 10},\"materialId\":{baseId + 11}}}", null);
                galfus.Realm3dSetModelTransform(REALM_3D, baseId + 12, new GalfusTransform3D { position_x = fx, position_y = 0.2f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f });

                galfus.Realm3dCreateLight(REALM_3D, baseId + 20, "{\"kind\":\"point\",\"color\":[0.35,0.7,1.0],\"intensity\":3.8,\"range\":16.0,\"castShadow\":true}", null);
                galfus.Realm3dSetLightTransform(REALM_3D, baseId + 20, new GalfusTransform3D { position_x = fx, position_y = fy + 2.5f, position_z = fz + 1.2f, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f });

                if (i == 0) // Entrance
                {
                    galfus.Realm3dCreateGeometry(REALM_3D, baseId + 30, "{\"primitive\":\"cube\",\"size\":1.4}");
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 31, "{\"baseColor\":[1.0,0.82,0.2,1.0],\"roughness\":0.15,\"metallic\":0.95,\"emissiveColor\":[0.2,0.15,0.04,1.0],\"emissiveIntensity\":0.8}");
                    galfus.Realm3dCreateModel(REALM_3D, baseId + 32, $"{{\"geometryId\":{baseId + 30},\"materialId\":{baseId + 31}}}", null);
                    var tf = new GalfusTransform3D { position_x = fx, position_y = 1.4f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f };
                    galfus.Realm3dSetModelTransform(REALM_3D, baseId + 32, tf);
                    galfus.Realm3dCreateGeometry(REALM_3D, baseId + 33, "{\"primitive\":\"torus\",\"radius\":1.2,\"subdivisions\":24}");
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 34, "{\"baseColor\":[0.2,0.85,1.0,1.0],\"roughness\":0.1,\"metallic\":0.8,\"emissiveColor\":[0.1,0.4,0.6,1.0],\"emissiveIntensity\":1.2}");
                    galfus.Realm3dCreateModel(REALM_3D, baseId + 35, $"{{\"geometryId\":{baseId + 33},\"materialId\":{baseId + 34}}}", null);
                    galfus.Realm3dSetModelTransform(REALM_3D, baseId + 35, tf);
                }
                else if (i == 1) // Geometry
                {
                    string[] primitives = { "cube", "sphere", "cylinder", "torus", "sphere" };
                    float[][] colors = {
                        new float[] { 0.95f, 0.8f, 0.2f, 1.0f }, new float[] { 0.9f, 0.92f, 0.95f, 1.0f },
                        new float[] { 0.95f, 0.15f, 0.3f, 1.0f }, new float[] { 0.2f, 0.85f, 0.4f, 1.0f },
                        new float[] { 0.15f, 0.6f, 1.0f, 1.0f }
                    };
                    float[] roughness = { 0.1f, 0.05f, 0.15f, 0.2f, 0.7f };
                    float[] metallic = { 0.9f, 1.0f, 0.2f, 0.3f, 0.0f };
                    float[] offsets = { -2.4f, -1.2f, 0.0f, 1.2f, 2.4f };
                    for (int item = 0; item < primitives.Length; item++)
                    {
                        uint gid = baseId + 30u + (uint)item * 3u;
                        uint mid = gid + 1;
                        uint model = gid + 2;
                        string color = FormattableString.Invariant($"[{colors[item][0]:F2},{colors[item][1]:F2},{colors[item][2]:F2},1.0]");
                        galfus.Realm3dCreateGeometry(REALM_3D, gid, $"{{\"primitive\":\"{primitives[item]}\",\"size\":0.9,\"radius\":0.5,\"subdivisions\":24}}");
                        galfus.Realm3dCreateMaterial(REALM_3D, mid, FormattableString.Invariant($"{{\"baseColor\":{color},\"roughness\":{roughness[item]:F2},\"metallic\":{metallic[item]:F2}}}"));
                        galfus.Realm3dCreateModel(REALM_3D, model, $"{{\"geometryId\":{gid},\"materialId\":{mid}}}", null);
                        galfus.Realm3dSetModelTransform(REALM_3D, model, new GalfusTransform3D { position_x = fx + offsets[item], position_y = 1.3f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f });
                    }
                }
                else if (i == 2) // Lighting
                {
                    galfus.Realm3dCreateGeometry(REALM_3D, baseId + 40, "{\"primitive\":\"cylinder\",\"radius\":0.25,\"size\":2.5}");
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 41, "{\"baseColor\":[0.35,0.38,0.45,1.0],\"roughness\":0.4,\"metallic\":0.2}");
                    for (int pillar = 0; pillar < 2; pillar++)
                    {
                        uint model = baseId + 42u + (uint)pillar;
                        galfus.Realm3dCreateModel(REALM_3D, model, $"{{\"geometryId\":{baseId + 40},\"materialId\":{baseId + 41}}}", null);
                        galfus.Realm3dSetModelTransform(REALM_3D, model, new GalfusTransform3D { position_x = fx + (pillar == 0 ? -1.5f : 1.5f), position_y = 1.25f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f });
                    }
                    galfus.Realm3dCreateGeometry(REALM_3D, baseId + 45, "{\"primitive\":\"cube\",\"size\":0.8}");
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 46, "{\"baseColor\":[1.0,0.4,0.1,1.0],\"emissiveColor\":[1.0,0.5,0.1,1.0],\"emissiveIntensity\":4.5,\"roughness\":0.1,\"metallic\":0.0}");
                    galfus.Realm3dCreateModel(REALM_3D, baseId + 47, $"{{\"geometryId\":{baseId + 45},\"materialId\":{baseId + 46}}}", null);
                    var emTf = new GalfusTransform3D { position_x = fx, position_y = 1.4f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f };
                    galfus.Realm3dSetModelTransform(REALM_3D, baseId + 47, emTf);
                    float[][] lightColors = { new float[] { 1, 0.2f, 0.2f }, new float[] { 0.2f, 1, 0.3f }, new float[] { 0.2f, 0.4f, 1 } };
                    float[][] lightOffsets = { new float[] { -2, 2, -1 }, new float[] { 2, 2, -1 }, new float[] { 0, 3, 2 } };
                    for (int light = 0; light < 3; light++)
                    {
                        uint lightId = baseId + 50u + (uint)light;
                        galfus.Realm3dCreateLight(REALM_3D, lightId, FormattableString.Invariant($"{{\"kind\":\"point\",\"color\":[{lightColors[light][0]:F1},{lightColors[light][1]:F1},{lightColors[light][2]:F1}],\"intensity\":4.0,\"range\":10.0,\"castShadow\":true}}"), null);
                        galfus.Realm3dSetLightTransform(REALM_3D, lightId, new GalfusTransform3D { position_x = fx + lightOffsets[light][0], position_y = lightOffsets[light][1], position_z = fz + lightOffsets[light][2], rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f });
                    }
                }
                else if (i == 3) // Particles
                {
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 60, "{\"surfaceType\":\"additive\",\"baseColor\":[1.0,0.75,0.2,1.0]}");
                    string partDesc = $"{{\"label\":\"Tour Spark Fountain\",\"materialId\":{baseId + 60},\"maxParticles\":800,\"spawnRate\":200,\"lifetimeRange\":[0.7,1.5],\"speedRange\":[3.8,6.2],\"direction\":[0.0,1.0,0.0],\"spreadAngleRad\":0.35,\"gravity\":[0.0,-6.5,0.0],\"sizeRange\":[0.05,0.12]}}";
                    galfus.Realm3dCreateParticleEmitter(REALM_3D, baseId + 61, partDesc, null);
                    var pTf = new GalfusTransform3D { position_x = fx, position_y = 0.5f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f };
                    galfus.Realm3dSetParticleEmitterTransform(REALM_3D, baseId + 61, pTf);
                }
                else if (i == 4) // Animation
                {
                    galfus.Realm3dCreateGeometry(REALM_3D, baseId + 70, "{\"primitive\":\"cube\",\"size\":1.0}");
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 71, "{\"baseColor\":[0.2,0.7,1.0,1.0],\"roughness\":0.2,\"metallic\":0.3}");
                    galfus.Realm3dCreateModel(REALM_3D, baseId + 72, $"{{\"geometryId\":{baseId + 70},\"materialId\":{baseId + 71}}}", null);
                    var aTf = new GalfusTransform3D { position_x = fx - 1.8f, position_y = 0.6f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f };
                    galfus.Realm3dSetModelTransform(REALM_3D, baseId + 72, aTf);

                    uint transBounce = baseId + 80;
                    string initVal = FormattableString.Invariant($"{{\"type\":\"transform3D\",\"value\":[{fx - 1.8f:F1},0.6,{fz:F1},0,0,0,1,1,1,1]}}");
                    string toVal = FormattableString.Invariant($"{{\"type\":\"transform3D\",\"value\":[{fx - 1.8f:F1},3.2,{fz:F1},0,0.707,0,0.707,1,1,1]}}");
                    string cfgBounce = "{\"duration\":1.6,\"delay\":0.1,\"easing\":\"easeOutBounce\",\"loopMode\":\"pingPong\"}";
                    galfus.AnimationCreateTransition(transBounce, initVal, cfgBounce);
                    galfus.AnimationBindTarget(transBounce, $"{{\"kind\":\"modelTransform3D\",\"realmId\":10,\"modelId\":{baseId + 72}}}");
                    galfus.AnimationTransitionTo(transBounce, toVal, cfgBounce);

                    galfus.Realm3dCreateGeometry(REALM_3D, baseId + 73, "{\"primitive\":\"sphere\",\"radius\":0.6,\"subdivisions\":24}");
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 74, "{\"baseColor\":[1.0,0.25,0.45,1.0],\"roughness\":0.15,\"metallic\":0.7}");
                    galfus.Realm3dCreateModel(REALM_3D, baseId + 75, $"{{\"geometryId\":{baseId + 73},\"materialId\":{baseId + 74}}}", null);
                    galfus.Realm3dSetModelTransform(REALM_3D, baseId + 75, new GalfusTransform3D { position_x = fx, position_y = 1.4f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f });
                    uint transPulse = baseId + 81;
                    galfus.AnimationCreateTransition(transPulse, FormattableString.Invariant($"{{\"type\":\"transform3D\",\"value\":[{fx:F1},1.4,{fz:F1},0,0,0,1,0.7,0.7,0.7]}}"), "{\"duration\":1.3,\"delay\":0.0,\"easing\":\"easeInOutCubic\",\"loopMode\":\"pingPong\"}");
                    galfus.AnimationBindTarget(transPulse, $"{{\"kind\":\"modelTransform3D\",\"realmId\":10,\"modelId\":{baseId + 75}}}");
                    galfus.AnimationTransitionTo(transPulse, FormattableString.Invariant($"{{\"type\":\"transform3D\",\"value\":[{fx:F1},1.4,{fz:F1},0,0,0,1,1.5,1.5,1.5]}}"), "{\"duration\":1.3,\"delay\":0.0,\"easing\":\"easeInOutCubic\",\"loopMode\":\"pingPong\"}");

                    galfus.Realm3dCreateGeometry(REALM_3D, baseId + 76, "{\"primitive\":\"torus\",\"radius\":0.7,\"subdivisions\":24}");
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 77, "{\"baseColor\":[0.3,0.9,0.4,1.0],\"roughness\":0.25,\"metallic\":0.4}");
                    galfus.Realm3dCreateModel(REALM_3D, baseId + 78, $"{{\"geometryId\":{baseId + 76},\"materialId\":{baseId + 77}}}", null);
                    galfus.Realm3dSetModelTransform(REALM_3D, baseId + 78, new GalfusTransform3D { position_x = fx + 1.8f, position_y = 1.4f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f });
                    uint transTorus = baseId + 82;
                    galfus.AnimationCreateTransition(transTorus, FormattableString.Invariant($"{{\"type\":\"transform3D\",\"value\":[{fx + 1.8f:F1},0.8,{fz:F1},0,0,0,1,1,1,1]}}"), "{\"duration\":1.5,\"delay\":0.2,\"easing\":\"easeInOutSine\",\"loopMode\":\"pingPong\"}");
                    galfus.AnimationBindTarget(transTorus, $"{{\"kind\":\"modelTransform3D\",\"realmId\":10,\"modelId\":{baseId + 78}}}");
                    galfus.AnimationTransitionTo(transTorus, FormattableString.Invariant($"{{\"type\":\"transform3D\",\"value\":[{fx + 1.8f:F1},2.4,{fz:F1},0.5,0.5,0.5,0.5,1,1,1]}}"), "{\"duration\":1.5,\"delay\":0.2,\"easing\":\"easeInOutSine\",\"loopMode\":\"pingPong\"}");
                }
                else if (i == 5) // Mirror
                {
                    galfus.Realm3dCreateGeometry(REALM_3D, baseId + 90, "{\"primitive\":\"plane\",\"size\":3.2}");
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 91, "{\"surfaceType\":\"mirror\",\"baseColor\":[0.95,0.97,1.0,1.0],\"roughness\":0.02,\"metallic\":0.98,\"reflectance\":0.9}");
                    galfus.Realm3dCreateModel(REALM_3D, baseId + 92, $"{{\"geometryId\":{baseId + 90},\"materialId\":{baseId + 91}}}", null);
                    var mTf = new GalfusTransform3D { position_x = fx, position_y = 1.8f, position_z = fz - 1.5f, rotation_x = 0.7071f, rotation_w = 0.7071f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f };
                    galfus.Realm3dSetModelTransform(REALM_3D, baseId + 92, mTf);
                    galfus.Realm3dCreatePortal(REALM_3D, baseId + 93, $"{{\"modelId\":{baseId + 92},\"active\":true}}");
                    galfus.Realm3dCreateGeometry(REALM_3D, baseId + 94, "{\"primitive\":\"cylinder\",\"radius\":0.1,\"size\":3.4}");
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 95, "{\"baseColor\":[0.85,0.7,0.25,1.0],\"roughness\":0.25,\"metallic\":0.85}");
                    for (int side = 0; side < 2; side++)
                    {
                        uint model = baseId + 96u + (uint)side;
                        galfus.Realm3dCreateModel(REALM_3D, model, $"{{\"geometryId\":{baseId + 94},\"materialId\":{baseId + 95}}}", null);
                        galfus.Realm3dSetModelTransform(REALM_3D, model, new GalfusTransform3D { position_x = fx + (side == 0 ? -1.6f : 1.6f), position_y = 1.8f, position_z = fz - 1.5f, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f });
                    }
                }
                else if (i == 6) // Skinned column
                {
                    int rings = 24, segs = 16;
                    int vertCount = (rings + 1) * (segs + 1);
                    var verts = new Vertex3DRecord[vertCount];
                    int idxCount = rings * segs * 6;
                    var indices = new uint[idxCount];

                    int vIdx = 0;
                    for (int r = 0; r <= rings; r++)
                    {
                        float v = (float)r / rings;
                        float y = v * 5.0f;
                        float radius = 0.6f * (1.0f - 0.6f * v);
                        float boneF = v * 11.0f;
                        int b0 = Math.Min(11, (int)boneF);
                        int b1 = Math.Min(11, b0 + 1);
                        float t = boneF - b0;

                        for (int s = 0; s <= segs; s++)
                        {
                            float u = (float)s / segs;
                            float th = u * MathF.PI * 2.0f;
                            float ct = MathF.Cos(th), st = MathF.Sin(th);

                            verts[vIdx] = new Vertex3DRecord
                            {
                                posX = ct * radius,
                                posY = y,
                                posZ = st * radius,
                                normX = ct,
                                normY = 0.0f,
                                normZ = st,
                                uvU = u,
                                uvV = v,
                                tanX = 1.0f,
                                tanY = 0.0f,
                                tanZ = 0.0f,
                                tanW = 1.0f,
                                joint0 = (uint)b0,
                                joint1 = (uint)b1,
                                joint2 = 0,
                                joint3 = 0,
                                weight0 = 1.0f - t,
                                weight1 = t,
                                weight2 = 0.0f,
                                weight3 = 0.0f
                            };
                            vIdx++;
                        }
                    }

                    int iIdx = 0;
                    int rverts = segs + 1;
                    for (int r = 0; r < rings; r++)
                    {
                        for (int s = 0; s < segs; s++)
                        {
                            uint i0 = (uint)(r * rverts + s);
                            uint i1 = i0 + 1;
                            uint i2 = (uint)((r + 1) * rverts + s);
                            uint i3 = i2 + 1;
                            indices[iIdx++] = i0; indices[iIdx++] = i2; indices[iIdx++] = i1;
                            indices[iIdx++] = i1; indices[iIdx++] = i2; indices[iIdx++] = i3;
                        }
                    }

                    GCHandle vHandle = GCHandle.Alloc(verts, GCHandleType.Pinned);
                    GCHandle iHandle = GCHandle.Alloc(indices, GCHandleType.Pinned);
                    try
                    {
                        galfus.Realm3dCreateGeometryRaw(REALM_3D, baseId + 100, vHandle.AddrOfPinnedObject(), (ulong)(vertCount * Marshal.SizeOf<Vertex3DRecord>()), iHandle.AddrOfPinnedObject(), (ulong)idxCount);
                    }
                    finally
                    {
                        vHandle.Free();
                        iHandle.Free();
                    }

                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 101, "{\"baseColor\":[0.15,0.85,0.95,1.0],\"emissiveColor\":[0.05,0.25,0.35,1.0],\"roughness\":0.2,\"metallic\":0.6}");
                    galfus.Realm3dCreateModel(REALM_3D, baseId + 102, $"{{\"geometryId\":{baseId + 100},\"materialId\":{baseId + 101},\"castShadow\":true,\"boneCount\":12,\"boneOffset\":0,\"active\":true}}", null);
                    var skTf = new GalfusTransform3D { position_x = fx, position_y = 0.2f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f };
                    galfus.Realm3dSetModelTransform(REALM_3D, baseId + 102, skTf);
                }
                else if (i == 7) // Refraction
                {
                    galfus.Realm3dCreateGeometry(REALM_3D, baseId + 110, "{\"primitive\":\"sphere\",\"radius\":1.0,\"subdivisions\":32}");
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 111, "{\"surfaceType\":\"refractive\",\"refractionIndex\":1.52,\"refractionDistortion\":0.1,\"reflectance\":0.7,\"baseColor\":[0.1,0.85,0.4,0.35],\"roughness\":0.04,\"metallic\":0.0}");
                    galfus.Realm3dCreateModel(REALM_3D, baseId + 112, $"{{\"geometryId\":{baseId + 110},\"materialId\":{baseId + 111}}}", null);
                    var rfTf = new GalfusTransform3D { position_x = fx, position_y = 1.5f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f };
                    galfus.Realm3dSetModelTransform(REALM_3D, baseId + 112, rfTf);
                    galfus.Realm3dCreateGeometry(REALM_3D, baseId + 113, "{\"primitive\":\"cube\",\"size\":1.2}");
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 114, "{\"baseColor\":[0.95,0.2,0.35,1.0],\"emissiveColor\":[0.3,0.05,0.1,1.0],\"roughness\":0.2,\"metallic\":0.5}");
                    galfus.Realm3dCreateModel(REALM_3D, baseId + 115, $"{{\"geometryId\":{baseId + 113},\"materialId\":{baseId + 114}}}", null);
                    galfus.Realm3dSetModelTransform(REALM_3D, baseId + 115, new GalfusTransform3D { position_x = fx, position_y = 1.5f, position_z = fz - 2.5f, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f });
                }
                else if (i == 8) // Effects
                {
                    galfus.Realm3dCreateGeometry(REALM_3D, baseId + 120, "{\"primitive\":\"torus\",\"radius\":1.1,\"subdivisions\":32}");
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 121, "{\"baseColor\":[0.85,0.3,0.9,1.0],\"emissiveColor\":[0.4,0.1,0.5,1.0],\"roughness\":0.1,\"metallic\":0.8}");
                    galfus.Realm3dCreateModel(REALM_3D, baseId + 122, $"{{\"geometryId\":{baseId + 120},\"materialId\":{baseId + 121}}}", null);
                    var efTf = new GalfusTransform3D { position_x = fx, position_y = 1.5f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f };
                    galfus.Realm3dSetModelTransform(REALM_3D, baseId + 122, efTf);
                }
                else if (i == 9) // Audio Finale
                {
                    galfus.Realm3dCreateGeometry(REALM_3D, baseId + 130, "{\"primitive\":\"cylinder\",\"radius\":0.7,\"size\":1.6}");
                    galfus.Realm3dCreateMaterial(REALM_3D, baseId + 131, "{\"baseColor\":[1.0,0.85,0.2,1.0],\"emissiveColor\":[1.0,0.85,0.2,1.0],\"emissiveIntensity\":2.0}");
                    galfus.Realm3dCreateModel(REALM_3D, baseId + 132, $"{{\"geometryId\":{baseId + 130},\"materialId\":{baseId + 131}}}", null);
                    var auTf = new GalfusTransform3D { position_x = fx, position_y = 1.5f, position_z = fz, rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f };
                    galfus.Realm3dSetModelTransform(REALM_3D, baseId + 132, auTf);
                }
            }
        }

        static List<JsonElement> RotatePathCommands(List<JsonElement> commands, int roomIndex, float[] origin, int roomCount)
        {
            var rotated = new List<JsonElement>
            {
                JsonSerializer.SerializeToElement(new { type = "moveTo", to = origin })
            };
            for (int offset = 0; offset < roomCount; offset++)
            {
                int room = (roomIndex + offset) % roomCount;
                int lingerIndex = 1 + 2 * room;
                int travelIndex = lingerIndex + 1;
                if (lingerIndex < commands.Count) rotated.Add(commands[lingerIndex]);
                if (travelIndex < commands.Count) rotated.Add(commands[travelIndex]);
            }
            return rotated;
        }

        static void SetupCameraPaths(GalfusEngine galfus, TourConfig tour, int startRoom)
        {
            try { galfus.AnimationDestroyPathFollow(PATH_CAMERA_POS_ID); } catch { }
            try { galfus.AnimationDestroyPathFollow(PATH_CAMERA_LOOK_ID); } catch { }

            TourRoom room = tour.Rooms[startRoom];
            var posCommands = RotatePathCommands(tour.CameraPositionPath.Commands, startRoom, room.CameraPoint, tour.Rooms.Count);
            var lookCommands = RotatePathCommands(tour.CameraLookTargetPath.Commands, startRoom, room.FocusPoint, tour.Rooms.Count);
            galfus.AnimationCreatePathFollow(PATH_CAMERA_POS_ID, JsonSerializer.Serialize(posCommands), tour.CameraPositionPath.Config.GetRawText());
            galfus.AnimationBindPathFollowTarget(PATH_CAMERA_POS_ID, "{\"kind\":\"camera3DTransform\",\"realmId\":10,\"cameraId\":1}");
            galfus.AnimationCreatePathFollow(PATH_CAMERA_LOOK_ID, JsonSerializer.Serialize(lookCommands), tour.CameraLookTargetPath.Config.GetRawText());
            galfus.AnimationBindPathFollowTarget(PATH_CAMERA_LOOK_ID, "{\"kind\":\"camera3DLookAt\",\"realmId\":10,\"cameraId\":1}");

            var cTf = new GalfusTransform3D { position_x = room.CameraPoint[0], position_y = room.CameraPoint[1], position_z = room.CameraPoint[2], rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f };
            galfus.Realm3dSetCameraTransform(REALM_3D, CAMERA_3D_ID, cTf);
            var lTf = new GalfusCameraLookAt3D { enabled = 1, target_x = room.FocusPoint[0], target_y = room.FocusPoint[1], target_z = room.FocusPoint[2], up_y = 1.0f };
            galfus.Realm3dSetCameraLookAt(REALM_3D, CAMERA_3D_ID, lTf);
        }

        static void ApplyRoom(GalfusEngine galfus, TourConfig tour, int roomIndex, float tourClock, bool isPaused)
        {
            TourRoom room = tour.Rooms[roomIndex];
            string svg = RenderHudSvg(tour, room, tourClock, isPaused);
            galfus.Realm2dSetSvgSource(REALM_2D, SVG_HUD_ID, svg);

            if (room.Id == "effects")
                galfus.MultiverseSetInvocationFilters(INVOCATION_3D, "[\"chromaticAberration\",\"vignette\"]");
            else
                galfus.MultiverseSetInvocationFilters(INVOCATION_3D, "[]");

            if (room.Id == "audio_finale")
                galfus.AudioPlaySound(SOUND_ID, 0.9f, 0.0f, 1.0f, false);
        }

        static void Main(string[] args)
        {
            System.Globalization.CultureInfo.DefaultThreadCurrentCulture = System.Globalization.CultureInfo.InvariantCulture;
            System.Globalization.CultureInfo.DefaultThreadCurrentUICulture = System.Globalization.CultureInfo.InvariantCulture;

            int maxFrames = -1;
            if (args.Length > 0 && int.TryParse(args[0], out int parsedFrames))
            {
                maxFrames = parsedFrames;
            }

            TourConfig tour = TourConfig.Load();
            Console.WriteLine($"=== {tour.Title} [C# / Native] (v{tour.Version}) ===\n");

            var galfus = new GalfusEngine();
            galfus.PlatformInit();

            const uint windowId = 1;
            galfus.WindowCreate("{\"id\":1,\"title\":\"Galfus Engine Feature Tour — C# Runner\",\"size\":[1024,768],\"resizable\":true,\"decorations\":true}");
            galfus.MultiverseAttachWindow(windowId);

            // 1. Create Target
            galfus.MultiverseCreateTarget(TARGET_WINDOW, "{\"kind\":{\"type\":\"window\",\"windowId\":1}}");

            // 2. Realms
            galfus.Realm3dCreate(REALM_3D);
            galfus.Realm2dCreate(REALM_2D);

            // 3. Viewport split (Top 50vh = 3D, Bottom 50vh = 2D)
            galfus.MultiverseCreateInvocation(INVOCATION_3D, "{\"realmId\":10,\"targetId\":1,\"cameraSlot\":0,\"viewport\":{\"anchorX\":\"left\",\"anchorY\":\"top\",\"width\":{\"vw\":100},\"height\":{\"vh\":50}},\"clearColor\":[0.06,0.08,0.12,1.0],\"enabled\":true,\"zIndex\":0}");
            galfus.MultiverseCreateInvocation(INVOCATION_2D, "{\"realmId\":20,\"targetId\":1,\"cameraSlot\":0,\"viewport\":{\"anchorX\":\"left\",\"anchorY\":\"bottom\",\"width\":{\"vw\":100},\"height\":{\"vh\":50}},\"clearColor\":[0.08,0.1,0.15,1.0],\"enabled\":true,\"zIndex\":1}");

            // 2D Ambient Light
            var l2dTf = new GalfusTransform2D { scale_x = 1.0f, scale_y = 1.0f };
            galfus.Realm2dCreateLight(REALM_2D, 1, "{\"color\":[1.0,1.0,1.0],\"intensity\":1.0,\"range\":1000.0,\"active\":true}", null);
            galfus.Realm2dSetLightTransform(REALM_2D, 1, l2dTf);

            // Cameras
            TourRoom firstRoom = tour.Rooms[0];
            var camTf = new GalfusTransform3D { position_x = firstRoom.CameraPoint[0], position_y = firstRoom.CameraPoint[1], position_z = firstRoom.CameraPoint[2], rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f };
            string cameraDesc = FormattableString.Invariant($"{{\"fovY\":60.0,\"near\":0.1,\"far\":1000.0,\"cameraSlot\":0,\"lookAt\":{{\"target\":[{firstRoom.FocusPoint[0]:F1},{firstRoom.FocusPoint[1]:F1},{firstRoom.FocusPoint[2]:F1}],\"up\":[0.0,1.0,0.0]}}}}");
            galfus.Realm3dCreateCamera(REALM_3D, CAMERA_3D_ID, cameraDesc, null);
            galfus.Realm3dSetCameraTransform(REALM_3D, CAMERA_3D_ID, camTf);

            var c2dTf = new GalfusTransform2D { scale_x = 1.0f, scale_y = 1.0f };
            galfus.Realm2dCreateCamera(REALM_2D, CAMERA_2D_ID, "{\"orthoScale\":240,\"cameraSlot\":0}", null);
            galfus.Realm2dSetCameraTransform(REALM_2D, CAMERA_2D_ID, c2dTf);

            // Skybox
            galfus.Realm3dSetEnvironment(REALM_3D, "{\"ambientColor\":[0.15,0.18,0.22,1.0],\"exposure\":1.1,\"skybox\":{\"mode\":\"procedural\",\"skyColor\":[0.2,0.4,0.7,1.0],\"horizonColor\":[0.55,0.65,0.75,1.0],\"groundColor\":[0.06,0.08,0.1,1.0],\"sunDirection\":[0.6,0.8,0.3,0.0],\"sunColor\":[1.0,0.95,0.85,2.0],\"intensity\":1.2}}");

            // Build exhibit rooms
            BuildAllRooms(galfus, tour);

            // Load procedural audio chime
            byte[] wavBytes = CreateChimeWav();
            GCHandle wavHandle = GCHandle.Alloc(wavBytes, GCHandleType.Pinned);
            try
            {
                galfus.AudioLoadSound(SOUND_ID, wavHandle.AddrOfPinnedObject(), (ulong)wavBytes.Length);
            }
            finally
            {
                wavHandle.Free();
            }

            // SVG HUD companion
            string initSvg = RenderHudSvg(tour, firstRoom, 0.0f, false);
            var svgTf = new GalfusTransform2D { scale_x = 1.0f, scale_y = 1.0f };
            galfus.Realm2dCreateSvg(REALM_2D, SVG_HUD_ID, "{\"source\":\"<svg></svg>\"}", null);
            galfus.Realm2dSetSvgTransform(REALM_2D, SVG_HUD_ID, svgTf);
            galfus.Realm2dSetSvgSource(REALM_2D, SVG_HUD_ID, initSvg);

            SetupCameraPaths(galfus, tour, 0);
            Console.WriteLine("✔ Tour paths and rooms configured successfully!\n");

            bool running = true;
            bool isPaused = false;
            float tourClock = 0.0f;
            float animClock = 0.0f;
            int currentRoom = 0;
            ulong frame = 0;

            var stopwatch = Stopwatch.StartNew();
            double lastTime = stopwatch.Elapsed.TotalSeconds;

            float[] bonePalette = new float[192];
            GCHandle boneHandle = GCHandle.Alloc(bonePalette, GCHandleType.Pinned);

            try
            {
                while (running)
                {
                    double now = stopwatch.Elapsed.TotalSeconds;
                    float dt = (float)(now - lastTime);
                    if (dt < 0.001f) dt = 0.001f;
                    if (dt > 0.1f) dt = 0.1f;
                    lastTime = now;

                    var events = galfus.PlatformPumpEvents();
                    foreach (var ev in events)
                    {
                        string kind = ev.ContainsKey("kind") ? ev["kind"].ToString() : "";
                        string type = ev.ContainsKey("type") ? ev["type"].ToString() : "";

                        if (kind == "window")
                        {
                            if (type == "closeRequested")
                            {
                                running = false;
                            }
                            else if (type == "resized")
                            {
                                uint w = Convert.ToUInt32(ev["width"]);
                                uint h = Convert.ToUInt32(ev["height"]);
                                galfus.MultiverseUpdateWindowSize(windowId, w, h);
                            }
                        }
                        else if (kind == "keyboard" && type == "input")
                        {
                            string state = ev.ContainsKey("state") ? ev["state"].ToString() : "";
                            if (state == "pressed")
                            {
                                string physKey = ev.ContainsKey("physicalKey") ? ev["physicalKey"].ToString() : "";
                                string logKey = "";
                                if (ev.ContainsKey("logicalKey"))
                                {
                                    if (ev["logicalKey"] is Dictionary<string, object> dict && dict.ContainsKey("named"))
                                        logKey = dict["named"].ToString();
                                    else
                                        logKey = ev["logicalKey"].ToString();
                                }

                                if (physKey == "escape" || logKey == "escape" || physKey == "Escape")
                                {
                                    running = false;
                                }
                                else if (physKey == "space" || logKey == " " || logKey == "space")
                                {
                                    isPaused = !isPaused;
                                    if (!isPaused)
                                    {
                                        SetupCameraPaths(galfus, tour, currentRoom);
                                    }
                                    ApplyRoom(galfus, tour, currentRoom, tourClock, isPaused);
                                    Console.WriteLine($"[Tour] Playback {(isPaused ? "PAUSED" : "RESUMED")}");
                                }
                                else if (physKey == "keyR" || logKey == "r" || logKey == "R")
                                {
                                    currentRoom = 0;
                                    tourClock = 0.0f;
                                    SetupCameraPaths(galfus, tour, 0);
                                    ApplyRoom(galfus, tour, 0, tourClock, isPaused);
                                    Console.WriteLine($"[Tour] Jumped to Room 1: {tour.Rooms[0].Name}");
                                }
                                else if (physKey == "arrowRight" || logKey == "arrowRight")
                                {
                                    currentRoom = (currentRoom + 1) % tour.Rooms.Count;
                                    tourClock = tour.Rooms[currentRoom].StartTime;
                                    SetupCameraPaths(galfus, tour, currentRoom);
                                    ApplyRoom(galfus, tour, currentRoom, tourClock, isPaused);
                                    Console.WriteLine($"[Tour] Jumped to Room {currentRoom + 1}: {tour.Rooms[currentRoom].Name}");
                                }
                                else if (physKey == "arrowLeft" || logKey == "arrowLeft")
                                {
                                    currentRoom = (currentRoom + tour.Rooms.Count - 1) % tour.Rooms.Count;
                                    tourClock = tour.Rooms[currentRoom].StartTime;
                                    SetupCameraPaths(galfus, tour, currentRoom);
                                    ApplyRoom(galfus, tour, currentRoom, tourClock, isPaused);
                                    Console.WriteLine($"[Tour] Jumped to Room {currentRoom + 1}: {tour.Rooms[currentRoom].Name}");
                                }
                            }
                        }
                    }

                    animClock += dt;

                    if (!isPaused)
                    {
                        tourClock = (tourClock + dt) % tour.Duration;
                        int activeR = tour.Rooms.FindIndex(room => tourClock >= room.StartTime && tourClock < room.StartTime + room.Duration);
                        if (activeR >= 0 && activeR != currentRoom)
                        {
                            currentRoom = activeR;
                            ApplyRoom(galfus, tour, activeR, tourClock, isPaused);
                        }
                    }

                    galfus.AnimationStep(dt);

                    if (isPaused)
                    {
                        TourRoom activeRoom = tour.Rooms[currentRoom];
                        var cTf = new GalfusTransform3D { position_x = activeRoom.CameraPoint[0], position_y = activeRoom.CameraPoint[1], position_z = activeRoom.CameraPoint[2], rotation_w = 1.0f, scale_x = 1.0f, scale_y = 1.0f, scale_z = 1.0f };
                        galfus.Realm3dSetCameraTransform(REALM_3D, CAMERA_3D_ID, cTf);
                        var lTf = new GalfusCameraLookAt3D { enabled = 1, target_x = activeRoom.FocusPoint[0], target_y = activeRoom.FocusPoint[1], target_z = activeRoom.FocusPoint[2], up_y = 1.0f };
                        galfus.Realm3dSetCameraLookAt(REALM_3D, CAMERA_3D_ID, lTf);
                    }

                    ComputeBonePalette(animClock, bonePalette, 12, 5.0f);
                    galfus.Realm3dUpdateBones(REALM_3D, 7102, boneHandle.AddrOfPinnedObject(), 192);

                    galfus.MultiverseResolve();
                    galfus.MultiverseDispatch(frame, dt);
                    frame++;

                    if (maxFrames > 0 && (int)frame >= maxFrames)
                    {
                        break;
                    }
                }
            }
            finally
            {
                boneHandle.Free();
            }

            try { galfus.AnimationDestroyPathFollow(PATH_CAMERA_POS_ID); } catch { }
            try { galfus.AnimationDestroyPathFollow(PATH_CAMERA_LOOK_ID); } catch { }
            foreach (uint transitionId in new uint[] { 5080, 5081, 5082 })
            {
                try { galfus.AnimationDestroyTransition(transitionId); } catch { }
            }
            try { galfus.AudioUnloadSound(SOUND_ID); } catch { }
            try { galfus.Realm3dDestroy(REALM_3D); } catch { }
            try { galfus.Realm2dDestroy(REALM_2D); } catch { }
            try { galfus.MultiverseDestroyTarget(TARGET_WINDOW); } catch { }
            try { galfus.PlatformShutdown(); } catch { }

            Console.WriteLine("✔ C# feature tour finished gracefully.");
        }
    }
}
