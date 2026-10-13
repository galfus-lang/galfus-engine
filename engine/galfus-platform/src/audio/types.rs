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
