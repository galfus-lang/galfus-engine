#[cfg(not(target_arch = "wasm32"))]
use std::collections::HashMap;

#[cfg(not(target_arch = "wasm32"))]
use galfus_core::Handle;
#[cfg(not(target_arch = "wasm32"))]
use galfus_core::handle::GenerationalPool;
use galfus_core::id::validate_host_logical_id;
#[cfg(not(target_arch = "wasm32"))]
use kira::{
    AudioManager, AudioManagerSettings, Decibels, DefaultBackend, Tween,
    sound::{
        PlaybackState as KiraPlaybackState,
        static_sound::{StaticSoundData, StaticSoundHandle, StaticSoundSettings},
    },
};

use super::types::{
    PlaybackConfig, PlaybackState, SpatialAudioConfig, SpatialTransform, calculate_spatial_playback,
};
#[cfg(not(target_arch = "wasm32"))]
use crate::error::PlatformError;
use crate::error::PlatformResult;

/// Namespace for audio playback voices in the generational pool.
pub const NAMESPACE_AUDIO_VOICE: u16 = 0x30;

/// Helper converting linear amplitude (0.0 ..= 1.0) into Decibels.
#[inline]
#[cfg(not(target_arch = "wasm32"))]
fn amplitude_to_decibels(amplitude: f32) -> Decibels {
    if amplitude <= 0.0001 {
        Decibels::SILENCE
    } else {
        Decibels(20.0 * amplitude.log10())
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn collect_reap_candidates<T>(
    pool: &GenerationalPool<T>,
    should_reap: impl Fn(&T) -> bool,
) -> Vec<Handle<T>> {
    pool.iter()
        .filter_map(|(handle, value)| should_reap(value).then_some(handle))
        .collect()
}

/// Central audio coordinator managing sound resources and active playback voices.
pub struct AudioContext {
    #[cfg(not(target_arch = "wasm32"))]
    manager: Option<AudioManager>,
    #[cfg(not(target_arch = "wasm32"))]
    sounds: HashMap<u32, StaticSoundData>,
    #[cfg(not(target_arch = "wasm32"))]
    voices: GenerationalPool<StaticSoundHandle>,
    #[cfg(not(target_arch = "wasm32"))]
    voice_ids: HashMap<u32, Handle<StaticSoundHandle>>,
    #[cfg(not(target_arch = "wasm32"))]
    handle_to_voice_id: HashMap<Handle<StaticSoundHandle>, u32>,
    #[cfg(not(target_arch = "wasm32"))]
    next_voice_id: u32,
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
                voices: GenerationalPool::new(NAMESPACE_AUDIO_VOICE),
                voice_ids: HashMap::new(),
                handle_to_voice_id: HashMap::new(),
                next_voice_id: 1,
            }
        }

        #[cfg(target_arch = "wasm32")]
        {
            Self {}
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn voice_handle(&self, voice_id: u32) -> PlatformResult<Handle<StaticSoundHandle>> {
        self.voice_ids
            .get(&voice_id)
            .copied()
            .ok_or(PlatformError::SoundNotFound(voice_id))
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn allocate_voice_id(&mut self) -> PlatformResult<u32> {
        let first_candidate = self.next_voice_id;
        loop {
            let voice_id = self.next_voice_id;
            self.next_voice_id = self.next_voice_id.checked_add(1).unwrap_or(1);
            if !self.voice_ids.contains_key(&voice_id) {
                return Ok(voice_id);
            }
            if self.next_voice_id == first_candidate {
                return Err(PlatformError::AudioPlaybackFailed(
                    "Voice ID space exhausted".into(),
                ));
            }
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
    /// Returns a versioned voice instance ID from the generational pool.
    pub fn play_sound(&mut self, sound_id: u32, config: PlaybackConfig) -> PlatformResult<u32> {
        self.reap_finished_voices();

        #[cfg(not(target_arch = "wasm32"))]
        {
            if !self.sounds.contains_key(&sound_id) {
                return Err(PlatformError::SoundNotFound(sound_id));
            }

            if self.manager.is_none() {
                return Err(PlatformError::AudioInitializationFailed(
                    "Audio manager not available".into(),
                ));
            }

            let db = amplitude_to_decibels(config.volume);
            let mut settings = StaticSoundSettings::new()
                .volume(db)
                .panning(config.panning)
                .playback_rate(config.speed as f64);

            if config.looping {
                settings = settings.loop_region(..);
            }

            let voice_id = self.allocate_voice_id()?;
            let sound_data = self
                .sounds
                .get(&sound_id)
                .ok_or(PlatformError::SoundNotFound(sound_id))?;
            let manager = self.manager.as_mut().ok_or_else(|| {
                PlatformError::AudioInitializationFailed("Audio manager not available".into())
            })?;
            let handle = manager
                .play(sound_data.with_settings(settings))
                .map_err(|e| PlatformError::AudioPlaybackFailed(format!("Play failed: {e}")))?;

            let voice_handle = self.voices.insert(handle).map_err(|e| {
                PlatformError::AudioPlaybackFailed(format!("Failed to register voice: {e}"))
            })?;
            self.voice_ids.insert(voice_id, voice_handle);
            self.handle_to_voice_id.insert(voice_handle, voice_id);
            Ok(voice_id)
        }

        #[cfg(target_arch = "wasm32")]
        {
            let _ = (sound_id, config);
            Ok(sound_id)
        }
    }

    /// Plays a sound using 3D/2D spatial positioning relative to an emitter and listener ear/microphone.
    pub fn play_sound_spatial(
        &mut self,
        sound_id: u32,
        emitter: SpatialTransform,
        listener: SpatialTransform,
        config: SpatialAudioConfig,
    ) -> PlatformResult<u32> {
        let (volume, panning) = calculate_spatial_playback(&emitter, &listener, &config);
        let playback_cfg = PlaybackConfig {
            volume,
            panning,
            speed: config.speed,
            looping: config.looping,
        };
        self.play_sound(sound_id, playback_cfg)
    }

    /// Dynamically updates the spatial positioning and volume of a currently playing voice.
    pub fn update_sound_spatial(
        &mut self,
        voice_id: u32,
        emitter: SpatialTransform,
        listener: SpatialTransform,
        config: SpatialAudioConfig,
    ) -> PlatformResult<()> {
        let (volume, panning) = calculate_spatial_playback(&emitter, &listener, &config);
        self.set_sound_volume(voice_id, volume)?;
        self.set_sound_panning(voice_id, panning)?;
        Ok(())
    }

    /// Pauses an active sound voice.
    pub fn pause_sound(&mut self, voice_id: u32) -> PlatformResult<()> {
        #[cfg(not(target_arch = "wasm32"))]
        {
            let handle = self.voice_handle(voice_id)?;
            let voice = self
                .voices
                .get_mut(handle)
                .map_err(|_| PlatformError::SoundNotFound(voice_id))?;
            voice.pause(Tween::default());
            Ok(())
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
            let handle = self.voice_handle(voice_id)?;
            let voice = self
                .voices
                .get_mut(handle)
                .map_err(|_| PlatformError::SoundNotFound(voice_id))?;
            voice.resume(Tween::default());
            Ok(())
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
            let handle = self.voice_handle(voice_id)?;
            let mut voice = self
                .voices
                .remove(handle)
                .map_err(|_| PlatformError::SoundNotFound(voice_id))?;
            self.voice_ids.remove(&voice_id);
            voice.stop(Tween::default());
            Ok(())
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
            let handle = self.voice_handle(voice_id)?;
            let voice = self
                .voices
                .get_mut(handle)
                .map_err(|_| PlatformError::SoundNotFound(voice_id))?;
            let db = amplitude_to_decibels(volume);
            voice.set_volume(db, Tween::default());
            Ok(())
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
            let handle = self.voice_handle(voice_id)?;
            let voice = self
                .voices
                .get_mut(handle)
                .map_err(|_| PlatformError::SoundNotFound(voice_id))?;
            voice.set_panning(panning, Tween::default());
            Ok(())
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
            if let Ok(handle) = self.voice_handle(voice_id)
                && let Ok(voice) = self.voices.get(handle)
            {
                return match voice.state() {
                    kira::sound::PlaybackState::Playing => PlaybackState::Playing,
                    kira::sound::PlaybackState::Paused => PlaybackState::Paused,
                    kira::sound::PlaybackState::Stopped => PlaybackState::Stopped,
                    _ => PlaybackState::Playing,
                };
            }
            PlaybackState::Stopped
        }

        #[cfg(target_arch = "wasm32")]
        {
            let _ = voice_id;
            PlaybackState::Stopped
        }
    }

    /// Releases one-shot voices whose native backend playback has completed.
    ///
    /// Returned IDs become stale after this operation and their pool slots are reusable.
    pub fn reap_finished_voices(&mut self) -> usize {
        #[cfg(not(target_arch = "wasm32"))]
        {
            let finished = collect_reap_candidates(&self.voices, |voice| {
                voice.state() == KiraPlaybackState::Stopped
            });
            let mut reaped = 0;
            for handle in finished {
                if self.voices.remove(handle).is_ok() {
                    if let Some(voice_id) = self.handle_to_voice_id.remove(&handle) {
                        self.voice_ids.remove(&voice_id);
                    }
                    reaped += 1;
                }
            }
            reaped
        }

        #[cfg(target_arch = "wasm32")]
        {
            0
        }
    }

    /// Unloads a sound resource by logical ID.
    pub fn unload_sound(&mut self, id: u32) -> PlatformResult<()> {
        #[cfg(not(target_arch = "wasm32"))]
        {
            if self.sounds.remove(&id).is_some() {
                Ok(())
            } else {
                Err(PlatformError::SoundNotFound(id))
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reserved_id_rejection_for_audio_assets() {
        let mut audio = AudioContext::new();
        // ID in reserved range must be rejected
        let res = audio.load_sound_bytes(galfus_core::id::RESERVED_RANGE_START, &[0u8; 10]);
        assert!(res.is_err());
    }

    #[test]
    fn test_calculate_spatial_playback_left_right() {
        let listener = SpatialTransform {
            position: [0.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0, 1.0],
        };
        // Emitter at right side
        let emitter_right = SpatialTransform {
            position: [10.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0, 1.0],
        };
        let config = SpatialAudioConfig {
            min_distance: 1.0,
            max_distance: 50.0,
            rolloff: 1.0,
            volume: 1.0,
            speed: 1.0,
            looping: false,
        };
        let (vol, pan) = calculate_spatial_playback(&emitter_right, &listener, &config);
        assert!(vol > 0.0 && vol <= 1.0);
        assert!(pan > 0.8, "Sound to right must pan right, got {pan}");

        // Emitter at left side
        let emitter_left = SpatialTransform {
            position: [-10.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0, 1.0],
        };
        let (_, pan_left) = calculate_spatial_playback(&emitter_left, &listener, &config);
        assert!(
            pan_left < -0.8,
            "Sound to left must pan left, got {pan_left}"
        );
    }

    #[test]
    fn voice_ids_skip_the_ffi_failure_sentinel_on_wraparound() {
        let mut audio = AudioContext::new();
        audio.next_voice_id = u32::MAX;

        assert_eq!(audio.allocate_voice_id().unwrap(), u32::MAX);
        assert_eq!(audio.allocate_voice_id().unwrap(), 1);
    }

    #[test]
    fn test_audio_voice_not_found_errors() {
        let mut audio = AudioContext::new();

        assert!(audio.pause_sound(999).is_err());
        assert!(audio.resume_sound(999).is_err());
        assert!(audio.stop_sound(999).is_err());
        assert!(audio.set_sound_volume(999, 0.5).is_err());
        assert!(audio.set_sound_panning(999, -0.2).is_err());
    }

    #[test]
    fn test_audio_sound_not_found_and_corrupt_bytes() {
        let mut audio = AudioContext::new();

        // 1. Play and unload on non-existent sound asset
        let config = PlaybackConfig {
            volume: 1.0,
            panning: 0.0,
            speed: 1.0,
            looping: false,
        };
        assert!(audio.play_sound(999, config).is_err());
        assert!(audio.unload_sound(999).is_err());

        // 2. Corrupted audio bytes rejection
        let corrupt_data = b"not a real audio file header or stream";
        let res = audio.load_sound_bytes(10, corrupt_data);
        assert!(
            res.is_err(),
            "Loading corrupt audio data must return AudioLoadFailed"
        );
    }

    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn reap_candidates_only_include_finished_entries_and_recycle_their_slots() {
        let mut pool = GenerationalPool::new(NAMESPACE_AUDIO_VOICE);
        let finished = pool.insert(true).unwrap();
        let playing = pool.insert(false).unwrap();

        let candidates = collect_reap_candidates(&pool, |is_finished| *is_finished);
        assert_eq!(candidates, vec![finished]);
        for handle in candidates {
            pool.remove(handle).unwrap();
        }

        assert!(!pool.contains(finished));
        assert!(pool.contains(playing));
        let reused = pool.insert(false).unwrap();
        assert_eq!(reused.slot(), finished.slot());
        assert_ne!(reused.generation(), finished.generation());
    }
}
