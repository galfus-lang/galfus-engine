use serde::{Deserialize, Serialize};

/// Playback state of an audio sound instance.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackState {
    /// Sound is actively playing.
    Playing,
    /// Sound is paused and can be resumed.
    Paused,
    /// Sound has stopped or finished.
    Stopped,
}

/// Configuration used when playing or instantiating a sound.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackConfig {
    /// Volume factor (`0.0` = mute, `1.0` = standard, `> 1.0` = amplify).
    pub volume: f32,
    /// Panning position (`-1.0` = full left, `0.0` = center, `1.0` = full right).
    pub panning: f32,
    /// Playback speed / pitch multiplier (`1.0` = normal speed).
    pub speed: f32,
    /// Whether the sound should loop indefinitely until stopped.
    pub looping: bool,
}

impl Default for PlaybackConfig {
    fn default() -> Self {
        Self {
            volume: 1.0,
            panning: 0.0,
            speed: 1.0,
            looping: false,
        }
    }
}

/// Information describing a loaded audio sound resource.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundInfo {
    /// Host-controlled logical ID.
    pub id: u32,
    /// Duration of the sound in seconds.
    pub duration_seconds: f32,
}

/// 3D/2D Spatial Transform for positional audio emitters and listener ears/microphones.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpatialTransform {
    /// 3D position `[x, y, z]`.
    pub position: [f32; 3],
    /// Orientation quaternion `[x, y, z, w]` (default identity).
    #[serde(default = "default_rotation")]
    pub rotation: [f32; 4],
}

fn default_rotation() -> [f32; 4] {
    [0.0, 0.0, 0.0, 1.0]
}

impl Default for SpatialTransform {
    fn default() -> Self {
        Self {
            position: [0.0, 0.0, 0.0],
            rotation: default_rotation(),
        }
    }
}

/// Configuration parameters for spatial sound attenuation and stereo panning.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpatialAudioConfig {
    /// Base volume multiplier (default 1.0).
    #[serde(default = "default_one")]
    pub volume: f32,
    /// Minimum distance where sound is heard at 100% volume (default 1.0).
    #[serde(default = "default_one")]
    pub min_distance: f32,
    /// Maximum distance beyond which sound is silent (default 50.0).
    #[serde(default = "default_max_distance")]
    pub max_distance: f32,
    /// Rolloff attenuation exponent factor (default 1.0).
    #[serde(default = "default_one")]
    pub rolloff: f32,
    /// Playback speed / pitch multiplier (default 1.0).
    #[serde(default = "default_one")]
    pub speed: f32,
    /// Whether the sound loops indefinitely.
    #[serde(default)]
    pub looping: bool,
}

fn default_one() -> f32 {
    1.0
}

fn default_max_distance() -> f32 {
    50.0
}

impl Default for SpatialAudioConfig {
    fn default() -> Self {
        Self {
            volume: 1.0,
            min_distance: 1.0,
            max_distance: 50.0,
            rolloff: 1.0,
            speed: 1.0,
            looping: false,
        }
    }
}

/// Calculates distance-attenuated volume and stereo panning (-1.0 to 1.0) given two transforms.
pub fn calculate_spatial_playback(
    emitter: &SpatialTransform,
    listener: &SpatialTransform,
    config: &SpatialAudioConfig,
) -> (f32, f32) {
    let emitter_pos = glam::Vec3::from(emitter.position);
    let listener_pos = glam::Vec3::from(listener.position);
    let rel_vec = emitter_pos - listener_pos;
    let distance = rel_vec.length();

    // 1. Distance attenuation
    let dist_clamped = distance.clamp(config.min_distance, config.max_distance);
    let span = (config.max_distance - config.min_distance).max(0.001);
    let dist_factor = (1.0 - (dist_clamped - config.min_distance) / span).clamp(0.0, 1.0);
    let dist_volume = dist_factor.powf(config.rolloff.max(0.1));

    // 2. Stereo Panning (-1.0 left to +1.0 right)
    let listener_quat = glam::Quat::from_xyzw(
        listener.rotation[0],
        listener.rotation[1],
        listener.rotation[2],
        listener.rotation[3],
    );

    // Head right vector (+X rotated by listener orientation)
    let ear_right = listener_quat * glam::Vec3::X;
    // Head forward vector (-Z rotated by listener orientation)
    let head_forward = listener_quat * glam::Vec3::NEG_Z;

    let (panning, muffling) = if distance > 0.001 {
        let dir = rel_vec / distance;
        let pan = dir.dot(ear_right).clamp(-1.0, 1.0);
        let behind = dir.dot(head_forward);
        let muffle = if behind < 0.0 {
            1.0 + behind * 0.15
        } else {
            1.0
        };
        (pan, muffle)
    } else {
        (0.0, 1.0)
    };

    let final_volume = (config.volume * dist_volume * muffling).clamp(0.0, 10.0);
    (final_volume, panning)
}
