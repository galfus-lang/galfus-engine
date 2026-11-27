//! Audio forwarding helpers for `PlatformContext`.

use crate::audio::{PlaybackConfig, SpatialAudioConfig, SpatialTransform};
use crate::context::PlatformContext;
use crate::error::PlatformResult;

impl PlatformContext {
    /// Loads raw audio data bytes and registers it under a host logical ID.
    pub fn load_sound_bytes(&mut self, id: u32, bytes: &[u8]) -> PlatformResult<f32> {
        self.audio.load_sound_bytes(id, bytes)
    }

    /// Plays a registered sound resource using the given playback configuration.
    pub fn play_sound(&mut self, sound_id: u32, config: PlaybackConfig) -> PlatformResult<u32> {
        self.audio.play_sound(sound_id, config)
    }

    /// Plays a sound positioned in 3D/2D relative to an emitter and a listener ear/microphone.
    pub fn play_sound_spatial(
        &mut self,
        sound_id: u32,
        emitter: SpatialTransform,
        listener: SpatialTransform,
        config: SpatialAudioConfig,
    ) -> PlatformResult<u32> {
        self.audio
            .play_sound_spatial(sound_id, emitter, listener, config)
    }

    /// Updates the spatial positioning of a playing sound voice.
    pub fn update_sound_spatial(
        &mut self,
        voice_id: u32,
        emitter: SpatialTransform,
        listener: SpatialTransform,
        config: SpatialAudioConfig,
    ) -> PlatformResult<()> {
        self.audio
            .update_sound_spatial(voice_id, emitter, listener, config)
    }

    /// Pauses an active sound playback voice.
    pub fn pause_sound(&mut self, voice_id: u32) -> PlatformResult<()> {
        self.audio.pause_sound(voice_id)
    }

    /// Resumes a paused sound playback voice.
    pub fn resume_sound(&mut self, voice_id: u32) -> PlatformResult<()> {
        self.audio.resume_sound(voice_id)
    }

    /// Stops a playing sound voice.
    pub fn stop_sound(&mut self, voice_id: u32) -> PlatformResult<()> {
        self.audio.stop_sound(voice_id)
    }

    /// Updates the volume of a sound voice.
    pub fn set_sound_volume(&mut self, voice_id: u32, volume: f32) -> PlatformResult<()> {
        self.audio.set_sound_volume(voice_id, volume)
    }

    /// Updates the panning position of a sound voice.
    pub fn set_sound_panning(&mut self, voice_id: u32, panning: f32) -> PlatformResult<()> {
        self.audio.set_sound_panning(voice_id, panning)
    }

    /// Unloads a registered sound resource.
    pub fn unload_sound(&mut self, sound_id: u32) -> PlatformResult<()> {
        self.audio.unload_sound(sound_id)
    }

    /// Releases completed native audio voices and returns the number of recycled voice slots.
    pub fn reap_finished_audio_voices(&mut self) -> usize {
        self.audio.reap_finished_voices()
    }
}
