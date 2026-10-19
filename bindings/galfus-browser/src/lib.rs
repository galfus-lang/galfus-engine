//! Browser and WebAssembly bindings for Galfus Engine.
//!
//! Provides direct native JavaScript object integration for web applications via `wasm-bindgen`
//! and `serde-wasm-bindgen`.

use wasm_bindgen::prelude::*;

use galfus_platform::{PlatformContext, WindowConfig};

/// WebAssembly-exported coordinator for Galfus platform operations on the web.
#[wasm_bindgen]
pub struct GalfusBrowser {
    context: PlatformContext,
}

#[wasm_bindgen]
impl GalfusBrowser {
    /// Creates a new `GalfusBrowser` instance.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Result<GalfusBrowser, JsValue> {
        let context = PlatformContext::new()
            .map_err(|e| JsValue::from_str(&format!("Failed to initialize platform: {e}")))?;
        Ok(Self { context })
    }

    /// Creates a headless `GalfusBrowser` instance (useful in Web Workers or test runners).
    #[wasm_bindgen(js_name = "newHeadless")]
    pub fn new_headless() -> GalfusBrowser {
        Self {
            context: PlatformContext::new_headless(),
        }
    }

    /// Returns the environment capabilities as a direct JavaScript object.
    #[wasm_bindgen(js_name = "getCapabilities")]
    pub fn get_capabilities(&self) -> Result<JsValue, JsValue> {
        let caps = self.context.capabilities();
        serde_wasm_bindgen::to_value(&caps)
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {e}")))
    }

    /// Creates and binds a canvas surface using the provided JavaScript configuration object.
    #[wasm_bindgen(js_name = "createWindow")]
    pub fn create_window(&mut self, config_val: JsValue) -> Result<u32, JsValue> {
        let config: WindowConfig = serde_wasm_bindgen::from_value(config_val)
            .map_err(|e| JsValue::from_str(&format!("Invalid WindowConfig object: {e}")))?;

        self.context
            .create_window(config)
            .map_err(|e| JsValue::from_str(&format!("Window creation failed: {e}")))
    }

    /// Unbinds and destroys the surface associated with the logical ID.
    #[wasm_bindgen(js_name = "closeWindow")]
    pub fn close_window(&mut self, window_id: u32) -> Result<(), JsValue> {
        self.context
            .close_window(window_id)
            .map_err(|e| JsValue::from_str(&format!("Close window failed: {e}")))
    }

    /// Updates the title of the canvas or document.
    #[wasm_bindgen(js_name = "setWindowTitle")]
    pub fn set_window_title(&mut self, window_id: u32, title: String) -> Result<(), JsValue> {
        let win = self
            .context
            .get_window_mut(window_id)
            .map_err(|e| JsValue::from_str(&format!("Window not found: {e}")))?;
        win.set_title(&title);
        Ok(())
    }

    /// Drains and returns collected platform events as a direct JavaScript array of objects.
    #[wasm_bindgen(js_name = "pumpEvents")]
    pub fn pump_events(&mut self) -> Result<JsValue, JsValue> {
        let events = self
            .context
            .pump_events()
            .map_err(|e| JsValue::from_str(&format!("Pump events failed: {e}")))?;

        serde_wasm_bindgen::to_value(&events)
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {e}")))
    }

    /// Returns connected gamepads as a direct JavaScript array of objects.
    #[wasm_bindgen(js_name = "gamepadGetConnected")]
    pub fn gamepad_get_connected(&self) -> Result<JsValue, JsValue> {
        let gamepads = self.context.connected_gamepads();
        serde_wasm_bindgen::to_value(&gamepads)
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {e}")))
    }

    /// Triggers rumble vibration on a connected gamepad.
    #[wasm_bindgen(js_name = "gamepadSetRumble")]
    pub fn gamepad_set_rumble(
        &mut self,
        gamepad_id: u32,
        strong_magnitude: f64,
        weak_magnitude: f64,
        duration_ms: u32,
    ) -> Result<(), JsValue> {
        self.context
            .set_gamepad_rumble(
                gamepad_id,
                strong_magnitude as f32,
                weak_magnitude as f32,
                duration_ms,
            )
            .map_err(|e| JsValue::from_str(&format!("Gamepad rumble failed: {e}")))
    }

    /// Loads raw audio data bytes into memory under a host logical ID.
    #[wasm_bindgen(js_name = "audioLoadSound")]
    pub fn audio_load_sound(&mut self, sound_id: u32, bytes: &[u8]) -> Result<(), JsValue> {
        self.context
            .load_sound_bytes(sound_id, bytes)
            .map(|_| ())
            .map_err(|e| JsValue::from_str(&format!("Audio load failed: {e}")))
    }

    /// Plays a sound using the provided configuration.
    #[wasm_bindgen(js_name = "audioPlaySound")]
    pub fn audio_play_sound(
        &mut self,
        sound_id: u32,
        volume: f64,
        panning: f64,
        speed: f64,
        looping: bool,
    ) -> Result<u32, JsValue> {
        let config = galfus_platform::PlaybackConfig {
            volume: volume as f32,
            panning: panning as f32,
            speed: speed as f32,
            looping,
        };

        self.context
            .play_sound(sound_id, config)
            .map_err(|e| JsValue::from_str(&format!("Audio play failed: {e}")))
    }

    /// Plays a registered sound with 3D/2D spatial positioning relative to a listener ear.
    #[wasm_bindgen(js_name = "audioPlaySoundSpatial")]
    pub fn audio_play_sound_spatial(
        &mut self,
        sound_id: u32,
        emitter_json: &str,
        listener_json: &str,
        config_json: &str,
    ) -> Result<u32, JsValue> {
        let emitter: galfus_platform::SpatialTransform = serde_json::from_str(emitter_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid emitter SpatialTransform: {e}")))?;
        let listener: galfus_platform::SpatialTransform = serde_json::from_str(listener_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid listener SpatialTransform: {e}")))?;
        let config: galfus_platform::SpatialAudioConfig = serde_json::from_str(config_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid SpatialAudioConfig: {e}")))?;

        self.context
            .play_sound_spatial(sound_id, emitter, listener, config)
            .map_err(|e| JsValue::from_str(&format!("Audio spatial play failed: {e}")))
    }

    /// Updates spatial positioning of an active sound voice relative to a listener ear.
    #[wasm_bindgen(js_name = "audioUpdateSoundSpatial")]
    pub fn audio_update_sound_spatial(
        &mut self,
        voice_id: u32,
        emitter_json: &str,
        listener_json: &str,
        config_json: &str,
    ) -> Result<(), JsValue> {
        let emitter: galfus_platform::SpatialTransform = serde_json::from_str(emitter_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid emitter SpatialTransform: {e}")))?;
        let listener: galfus_platform::SpatialTransform = serde_json::from_str(listener_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid listener SpatialTransform: {e}")))?;
        let config: galfus_platform::SpatialAudioConfig = serde_json::from_str(config_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid SpatialAudioConfig: {e}")))?;

        self.context
            .update_sound_spatial(voice_id, emitter, listener, config)
            .map_err(|e| JsValue::from_str(&format!("Audio spatial update failed: {e}")))
    }

    /// Pauses a playing sound voice.
    #[wasm_bindgen(js_name = "audioPauseSound")]
    pub fn audio_pause_sound(&mut self, voice_id: u32) -> Result<(), JsValue> {
        self.context
            .pause_sound(voice_id)
            .map_err(|e| JsValue::from_str(&format!("Audio pause failed: {e}")))
    }

    /// Resumes a paused sound voice.
    #[wasm_bindgen(js_name = "audioResumeSound")]
    pub fn audio_resume_sound(&mut self, voice_id: u32) -> Result<(), JsValue> {
        self.context
            .resume_sound(voice_id)
            .map_err(|e| JsValue::from_str(&format!("Audio resume failed: {e}")))
    }

    /// Stops a playing sound voice.
    #[wasm_bindgen(js_name = "audioStopSound")]
    pub fn audio_stop_sound(&mut self, voice_id: u32) -> Result<(), JsValue> {
        self.context
            .stop_sound(voice_id)
            .map_err(|e| JsValue::from_str(&format!("Audio stop failed: {e}")))
    }

    /// Sets the volume of a sound voice.
    #[wasm_bindgen(js_name = "audioSetVolume")]
    pub fn audio_set_volume(&mut self, voice_id: u32, volume: f64) -> Result<(), JsValue> {
        self.context
            .set_sound_volume(voice_id, volume as f32)
            .map_err(|e| JsValue::from_str(&format!("Audio set volume failed: {e}")))
    }

    /// Sets the panning of a sound voice.
    #[wasm_bindgen(js_name = "audioSetPanning")]
    pub fn audio_set_panning(&mut self, voice_id: u32, panning: f64) -> Result<(), JsValue> {
        self.context
            .set_sound_panning(voice_id, panning as f32)
            .map_err(|e| JsValue::from_str(&format!("Audio set panning failed: {e}")))
    }

    /// Unloads a registered sound resource.
    #[wasm_bindgen(js_name = "audioUnloadSound")]
    pub fn audio_unload_sound(&mut self, sound_id: u32) -> Result<(), JsValue> {
        self.context
            .unload_sound(sound_id)
            .map_err(|e| JsValue::from_str(&format!("Audio unload failed: {e}")))
    }
}
