use std::collections::HashMap;

use galfus_core::id::validate_host_logical_id;
#[cfg(not(target_arch = "wasm32"))]
use kira::{
    AudioManager, AudioManagerSettings, Decibels, DefaultBackend, Tween,
    sound::static_sound::{StaticSoundData, StaticSoundHandle, StaticSoundSettings},
};

use super::types::{PlaybackConfig, PlaybackState};
use crate::error::{PlatformError, PlatformResult};

/// Helper converting linear amplitude (0.0 ..= 1.0) into Decibels.
#[inline]
fn amplitude_to_decibels(amplitude: f32) -> Decibels {
    if amplitude <= 0.0001 {
        Decibels::SILENCE
    } else {
        Decibels(20.0 * amplitude.log10())
    }
}

/// Central audio coordinator managing sound resources and active playback voices.
pub struct AudioContext {
    #[cfg(not(target_arch = "wasm32"))]
    manager: Option<AudioManager>,
    #[cfg(not(target_arch = "wasm32"))]
    sounds: HashMap<u32, StaticSoundData>,
    #[cfg(not(target_arch = "wasm32"))]
    voices: HashMap<u32, StaticSoundHandle>,
}

impl AudioContext {
    /// Creates a new `AudioContext`.
    pub fn new() -> Self {
        #[cfg(not(target_arch = "wasm32"))]
        {
            let manager = AudioManager::<DefaultBackend>::new(AudioManagerSettings::default()).ok();
            Self {
                manager,
                sounds: HashMap::new(),
                voices: HashMap::new(),
            }
        }

        #[cfg(target_arch = "wasm32")]
        {
            Self {}
        }
    }

    /// Loads raw audio data bytes (WAV, MP3, OGG, FLAC) and registers it under a host logical ID.
    pub fn load_sound_bytes(&mut self, id: u32, bytes: &[u8]) -> PlatformResult<f32> {
        validate_host_logical_id(id)?;

        #[cfg(not(target_arch = "wasm32"))]
        {
            let cursor = std::io::Cursor::new(bytes.to_vec());
            let sound_data = StaticSoundData::from_cursor(cursor).map_err(|e| {
                PlatformError::AudioPlaybackFailed(format!("Failed to parse sound bytes: {e}"))
            })?;

            let duration = sound_data.duration().as_secs_f32();
            self.sounds.insert(id, sound_data);
            Ok(duration)
        }

        #[cfg(target_arch = "wasm32")]
        {
            let _ = (id, bytes);
            Ok(0.0)
        }
    }

    /// Plays a sound by its logical ID using the given configuration.
    /// Returns the voice instance ID.
    pub fn play_sound(&mut self, sound_id: u32, config: PlaybackConfig) -> PlatformResult<u32> {
        #[cfg(not(target_arch = "wasm32"))]
        {
            let sound_data = self
                .sounds
                .get(&sound_id)
                .ok_or(PlatformError::SoundNotFound(sound_id))?;

            if let Some(ref mut manager) = self.manager {
                let db = amplitude_to_decibels(config.volume);
                let mut settings = StaticSoundSettings::new()
                    .volume(db)
                    .panning(config.panning)
                    .playback_rate(config.speed as f64);

                if config.looping {
                    settings = settings.loop_region(..);
                }

                let handle = manager
                    .play(sound_data.with_settings(settings))
                    .map_err(|e| PlatformError::AudioPlaybackFailed(format!("Play failed: {e}")))?;

                let voice_id = sound_id;
                self.voices.insert(voice_id, handle);
                Ok(voice_id)
            } else {
                Err(PlatformError::AudioInitializationFailed(
                    "Audio manager not available".into(),
                ))
            }
        }

        #[cfg(target_arch = "wasm32")]
        {
            let _ = (sound_id, config);
            Ok(sound_id)
        }
    }

    /// Pauses an active sound voice.
    pub fn pause_sound(&mut self, voice_id: u32) -> PlatformResult<()> {
        #[cfg(not(target_arch = "wasm32"))]
        {
            if let Some(voice) = self.voices.get_mut(&voice_id) {
                voice.pause(Tween::default());
                Ok(())
            } else {
                Err(PlatformError::SoundNotFound(voice_id))
            }
        }

        #[cfg(target_arch = "wasm32")]
        {
            let _ = voice_id;
            Ok(())
        }
    }

    /// Resumes a paused sound voice.
    pub fn resume_sound(&mut self, voice_id: u32) -> PlatformResult<()> {
        #[cfg(not(target_arch = "wasm32"))]
        {
            if let Some(voice) = self.voices.get_mut(&voice_id) {
                voice.resume(Tween::default());
                Ok(())
            } else {
                Err(PlatformError::SoundNotFound(voice_id))
            }
        }

        #[cfg(target_arch = "wasm32")]
        {
            let _ = voice_id;
            Ok(())
        }
    }

    /// Stops a playing sound voice.
    pub fn stop_sound(&mut self, voice_id: u32) -> PlatformResult<()> {
        #[cfg(not(target_arch = "wasm32"))]
        {
            if let Some(mut voice) = self.voices.remove(&voice_id) {
                voice.stop(Tween::default());
                Ok(())
            } else {
                Err(PlatformError::SoundNotFound(voice_id))
            }
        }

        #[cfg(target_arch = "wasm32")]
        {
            let _ = voice_id;
            Ok(())
        }
    }

    /// Updates the volume of a sound voice.
    pub fn set_sound_volume(&mut self, voice_id: u32, volume: f32) -> PlatformResult<()> {
        #[cfg(not(target_arch = "wasm32"))]
        {
            if let Some(voice) = self.voices.get_mut(&voice_id) {
                let db = amplitude_to_decibels(volume);
                voice.set_volume(db, Tween::default());
                Ok(())
            } else {
                Err(PlatformError::SoundNotFound(voice_id))
            }
        }

        #[cfg(target_arch = "wasm32")]
        {
            let _ = (voice_id, volume);
            Ok(())
        }
    }

    /// Updates the panning of a sound voice.
    pub fn set_sound_panning(&mut self, voice_id: u32, panning: f32) -> PlatformResult<()> {
        #[cfg(not(target_arch = "wasm32"))]
        {
            if let Some(voice) = self.voices.get_mut(&voice_id) {
                voice.set_panning(panning, Tween::default());
                Ok(())
            } else {
                Err(PlatformError::SoundNotFound(voice_id))
            }
        }

        #[cfg(target_arch = "wasm32")]
        {
            let _ = (voice_id, panning);
            Ok(())
        }
    }

    /// Returns the playback state of a voice.
    pub fn get_sound_state(&self, voice_id: u32) -> PlaybackState {
        #[cfg(not(target_arch = "wasm32"))]
        {
            if let Some(voice) = self.voices.get(&voice_id) {
                match voice.state() {
                    kira::sound::PlaybackState::Playing => PlaybackState::Playing,
                    kira::sound::PlaybackState::Paused => PlaybackState::Paused,
                    kira::sound::PlaybackState::Stopped => PlaybackState::Stopped,
                    _ => PlaybackState::Playing,
                }
            } else {
                PlaybackState::Stopped
            }
        }

        #[cfg(target_arch = "wasm32")]
        {
            let _ = voice_id;
            PlaybackState::Stopped
        }
    }

    /// Unloads a sound resource by logical ID.
    pub fn unload_sound(&mut self, id: u32) -> PlatformResult<()> {
        #[cfg(not(target_arch = "wasm32"))]
        {
            let _ = self.stop_sound(id);
            self.sounds.remove(&id);
            Ok(())
        }

        #[cfg(target_arch = "wasm32")]
        {
            let _ = id;
            Ok(())
        }
    }
}

impl Default for AudioContext {
    fn default() -> Self {
        Self::new()
    }
}
