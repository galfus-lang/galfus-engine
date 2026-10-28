/**
 * AudioManager manages audio sound loading, voices, and direct 3D spatial playback.
 */
import type {
  GalfusEngine,
  SpatialAudio,
  SpatialAudioConfig,
  SpatialTransform
} from '@galfus/transport-types';
import { IdAllocator, type SoundId, type VoiceId } from '../types';

export interface PlaySoundOptions {
  volume?: number;
  panning?: number;
  speed?: number;
  looping?: boolean;
}

export class AudioManager {
  private _engine: GalfusEngine | null = null;
  private readonly _idAllocator = new IdAllocator<SoundId>(1);
  private readonly _sounds = new Set<SoundId>();

  // Cached spatial transforms to enable zero-GC direct parameter updates
  private readonly _listener: SpatialTransform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1]
  };
  private readonly _voiceSpatialCache = new Map<VoiceId, SpatialAudio>();

  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
  }

  /**
   * Loads raw audio bytes (WAV, MP3, OGG, FLAC) into core memory under a tracked SoundId.
   */
  loadSound(data: Uint8Array): SoundId {
    const soundId = this._idAllocator.allocate('SoundId');
    if (this._engine) {
      this._engine.audioLoadSound(soundId, data, data.byteLength);
    }
    this._sounds.add(soundId);
    return soundId;
  }

  /**
   * Unloads a sound from core memory.
   */
  unloadSound(soundId: SoundId): void {
    if (!this._sounds.has(soundId)) return;
    if (this._engine) {
      this._engine.audioUnloadSound(soundId);
    }
    this._sounds.delete(soundId);
  }

  /**
   * Plays a loaded sound and returns its controllable VoiceId.
   */
  playSound(soundId: SoundId, options: PlaySoundOptions = {}): VoiceId {
    if (!this._engine) {
      throw new Error('Cannot play sound: AudioManager is not bound to an engine instance.');
    }
    const voiceId = this._engine.audioPlaySound(
      soundId,
      options.volume ?? 1.0,
      options.panning ?? 0.0,
      options.speed ?? 1.0,
      options.looping ?? false
    ) as VoiceId;
    return voiceId;
  }

  /**
   * Plays a 3D spatial sound and returns its controllable VoiceId.
   * Can be called with a full SpatialAudio descriptor or directly with emitter position.
   */
  playSoundSpatial(
    soundId: SoundId,
    spatialOrPosition: SpatialAudio | [number, number, number],
    config?: SpatialAudioConfig
  ): VoiceId {
    if (!this._engine) {
      throw new Error(
        'Cannot play spatial sound: AudioManager is not bound to an engine instance.'
      );
    }

    let spatial: SpatialAudio;
    if (Array.isArray(spatialOrPosition)) {
      spatial = {
        emitter: { position: spatialOrPosition },
        listener: this._listener,
        config: config ?? { volume: 1.0 }
      };
    } else {
      spatial = spatialOrPosition;
    }

    const voiceId = this._engine.audioPlaySoundSpatial(soundId, spatial) as VoiceId;
    this._voiceSpatialCache.set(voiceId, {
      emitter: {
        position: [...spatial.emitter.position],
        rotation: spatial.emitter.rotation ? [...spatial.emitter.rotation] : undefined
      },
      listener: this._listener,
      config: spatial.config
    });
    return voiceId;
  }

  /**
   * Updates listener world-space position directly without allocating JSON objects.
   */
  setListenerPosition(x: number, y: number, z: number): void {
    this._listener.position = [x, y, z];
    // Sync active spatial voices
    if (this._engine) {
      for (const [voiceId, state] of this._voiceSpatialCache) {
        state.listener = this._listener;
        this._engine.audioUpdateSoundSpatial(voiceId, state);
      }
    }
  }

  /**
   * Updates listener orientation quaternion directly.
   */
  setListenerRotation(x: number, y: number, z: number, w: number): void {
    this._listener.rotation = [x, y, z, w];
    if (this._engine) {
      for (const [voiceId, state] of this._voiceSpatialCache) {
        state.listener = this._listener;
        this._engine.audioUpdateSoundSpatial(voiceId, state);
      }
    }
  }

  /**
   * Updates emitter position of an active 3D voice directly with zero per-frame garbage.
   */
  setVoiceEmitterPosition(voiceId: VoiceId, x: number, y: number, z: number): void {
    let state = this._voiceSpatialCache.get(voiceId);
    if (!state) {
      state = {
        emitter: { position: [x, y, z] },
        listener: this._listener,
        config: { volume: 1.0 }
      };
      this._voiceSpatialCache.set(voiceId, state);
    } else {
      state.emitter.position = [x, y, z];
      state.listener = this._listener;
    }

    if (this._engine) {
      this._engine.audioUpdateSoundSpatial(voiceId, state);
    }
  }

  /**
   * Updates emitter rotation quaternion of an active 3D voice.
   */
  setVoiceEmitterRotation(voiceId: VoiceId, x: number, y: number, z: number, w: number): void {
    const state = this._voiceSpatialCache.get(voiceId);
    if (state) {
      state.emitter.rotation = [x, y, z, w];
      state.listener = this._listener;
      if (this._engine) {
        this._engine.audioUpdateSoundSpatial(voiceId, state);
      }
    }
  }

  /**
   * Updates spatial positioning of an active sound voice.
   */
  updateSoundSpatial(voiceId: VoiceId, spatial: SpatialAudio): void {
    this._voiceSpatialCache.set(voiceId, spatial);
    if (this._engine) {
      this._engine.audioUpdateSoundSpatial(voiceId, spatial);
    }
  }

  /**
   * Pauses an active sound voice.
   */
  pauseSound(voiceId: VoiceId): void {
    if (this._engine) {
      this._engine.audioPauseSound(voiceId);
    }
  }

  /**
   * Resumes a paused sound voice.
   */
  resumeSound(voiceId: VoiceId): void {
    if (this._engine) {
      this._engine.audioResumeSound(voiceId);
    }
  }

  /**
   * Stops an active sound voice.
   */
  stopSound(voiceId: VoiceId): void {
    if (this._engine) {
      this._engine.audioStopSound(voiceId);
    }
    this._voiceSpatialCache.delete(voiceId);
  }

  /**
   * Updates the volume of an active sound voice.
   */
  setVolume(voiceId: VoiceId, volume: number): void {
    if (this._engine) {
      this._engine.audioSetVolume(voiceId, volume);
    }
  }

  /**
   * Updates the panning of an active sound voice.
   */
  setPanning(voiceId: VoiceId, panning: number): void {
    if (this._engine) {
      this._engine.audioSetPanning(voiceId, panning);
    }
  }

  /**
   * Unloads all active sounds and resets spatial caches.
   */
  dispose(): void {
    if (this._engine) {
      for (const soundId of this._sounds) {
        this._engine.audioUnloadSound(soundId);
      }
    }
    this._sounds.clear();
    this._voiceSpatialCache.clear();
    this._engine = null;
  }
}
