use crate::ffi::set_last_error;
use crate::state::with_context_mut;

pub(crate) fn finish_audio_play(result: Result<u32, String>) -> u32 {
    match result {
        Ok(voice_id) => voice_id,
        Err(error) => {
            set_last_error(&error);
            0
        }
    }
}

/// Loads raw audio data bytes (WAV, MP3, OGG, FLAC) from memory under a host logical ID. Returns 0 on success, -1 on failure.
///
/// # Safety
/// `data_ptr` must be valid for reads of `data_len` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_audio_load_sound(
    sound_id: u32,
    data_ptr: *const u8,
    data_len: usize,
) -> i32 {
    if data_ptr.is_null() || data_len == 0 {
        set_last_error("Null or empty audio buffer");
        return -1;
    }
    let slice = unsafe { std::slice::from_raw_parts(data_ptr, data_len) };
    let result = with_context_mut(|ctx| {
        ctx.load_sound_bytes(sound_id, slice)
            .map(|_| ())
            .map_err(|e| e.to_string())
    });
    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Plays a registered sound with playback parameters.
///
/// Returns a non-zero voice instance ID on success, or 0 on failure. Use
/// `galfus_get_last_error` to retrieve the failure detail.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_play_sound(
    sound_id: u32,
    volume: f32,
    panning: f32,
    speed: f32,
    looping: bool,
) -> u32 {
    let config = galfus_platform::PlaybackConfig {
        volume,
        panning,
        speed,
        looping,
    };

    let result =
        with_context_mut(|ctx| ctx.play_sound(sound_id, config).map_err(|e| e.to_string()));

    finish_audio_play(result)
}

/// Plays a registered sound with 3D/2D spatial positioning relative to a listener ear.
/// Returns a non-zero voice instance ID on success, or 0 on failure. Use
/// `galfus_get_last_error` to retrieve the failure detail.
///
/// # Safety
/// `spatial` must be a valid pointer to initialized `GalfusSpatialAudio` storage.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_audio_play_sound_spatial(
    sound_id: u32,
    spatial: *const crate::ffi_native_structs::GalfusSpatialAudio,
) -> u32 {
    if spatial.is_null() {
        set_last_error("Null pointer passed to play_sound_spatial");
        return 0;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let (emitter, listener, config) = unsafe { (*spatial).into_parts() };

    let result = with_context_mut(|ctx| {
        ctx.play_sound_spatial(sound_id, emitter, listener, config)
            .map_err(|e| e.to_string())
    });

    finish_audio_play(result)
}

/// Updates spatial positioning of an active sound voice relative to a listener ear.
/// Returns 0 on success, -1 on failure.
///
/// # Safety
/// `spatial` must be a valid pointer to initialized `GalfusSpatialAudio` storage.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn galfus_audio_update_sound_spatial(
    voice_id: u32,
    spatial: *const crate::ffi_native_structs::GalfusSpatialAudio,
) -> i32 {
    if spatial.is_null() {
        set_last_error("Null pointer passed to update_sound_spatial");
        return -1;
    }
    // SAFETY: The pointer was checked above and copied before this function returns.
    let (emitter, listener, config) = unsafe { (*spatial).into_parts() };

    let result = with_context_mut(|ctx| {
        ctx.update_sound_spatial(voice_id, emitter, listener, config)
            .map_err(|e| e.to_string())
    });

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Pauses a sound voice. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_pause_sound(voice_id: u32) -> i32 {
    let result = with_context_mut(|ctx| ctx.pause_sound(voice_id).map_err(|e| e.to_string()));

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Resumes a paused sound voice. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_resume_sound(voice_id: u32) -> i32 {
    let result = with_context_mut(|ctx| ctx.resume_sound(voice_id).map_err(|e| e.to_string()));

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Stops a sound voice. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_stop_sound(voice_id: u32) -> i32 {
    let result = with_context_mut(|ctx| ctx.stop_sound(voice_id).map_err(|e| e.to_string()));

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Sets the volume of a sound voice. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_set_volume(voice_id: u32, volume: f32) -> i32 {
    let result = with_context_mut(|ctx| {
        ctx.set_sound_volume(voice_id, volume)
            .map_err(|e| e.to_string())
    });

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Sets the panning of a sound voice. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_set_panning(voice_id: u32, panning: f32) -> i32 {
    let result = with_context_mut(|ctx| {
        ctx.set_sound_panning(voice_id, panning)
            .map_err(|e| e.to_string())
    });

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}

/// Unloads a sound resource. Returns 0 on success, -1 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn galfus_audio_unload_sound(sound_id: u32) -> i32 {
    let result = with_context_mut(|ctx| ctx.unload_sound(sound_id).map_err(|e| e.to_string()));

    match result {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(&e);
            -1
        }
    }
}
