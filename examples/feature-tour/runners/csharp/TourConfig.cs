using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace FeatureTourRunner
{
    public sealed class TourConfig
    {
        public string Title { get; set; } = "Galfus Engine Feature Tour";
        public string Version { get; set; } = "unknown";
        public float Duration { get; set; }
        public uint DefaultSeed { get; set; }
        public string LoopPolicy { get; set; } = "loop";
        public TourPath CameraPositionPath { get; set; } = new TourPath();
        public TourPath CameraLookTargetPath { get; set; } = new TourPath();
        public List<TourRoom> Rooms { get; set; } = new List<TourRoom>();

        public static TourConfig Load()
        {
            string path = Path.Combine(AppContext.BaseDirectory, "tour.json");
            if (!File.Exists(path))
            {
                throw new FileNotFoundException("The shared feature-tour configuration was not copied beside the C# runner.", path);
            }

            string json = File.ReadAllText(path);
            TourConfig config = JsonSerializer.Deserialize<TourConfig>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? throw new InvalidDataException("tour.json did not deserialize to a tour configuration.");

            if (config.Duration <= 0 || config.Rooms.Count == 0 || config.CameraPositionPath.Commands.Count == 0 || config.CameraLookTargetPath.Commands.Count == 0)
            {
                throw new InvalidDataException("tour.json is missing required rooms or camera paths.");
            }
            return config;
        }
    }

    public sealed class TourPath
    {
        public JsonElement Config { get; set; }
        public List<JsonElement> Commands { get; set; } = new List<JsonElement>();
    }

    public sealed class TourRoom
    {
        public string Id { get; set; } = "";
        public int RoomIndex { get; set; }
        public string Name { get; set; } = "";
        public string Category { get; set; } = "";
        public float StartTime { get; set; }
        public float Duration { get; set; }
        public float[] FocusPoint { get; set; } = Array.Empty<float>();
        public float[] CameraPoint { get; set; } = Array.Empty<float>();
        public string Description { get; set; } = "";
        public Dictionary<string, JsonElement> Telemetry { get; set; } = new Dictionary<string, JsonElement>();
    }
}
