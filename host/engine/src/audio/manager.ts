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

interface VoiceSpatialEntry {
  spatial: SpatialAudio;
  explicitListener: boolean;
}

function vec3Equals(
  a: [number, number, number],
  x: number,
  y: number,
  z: number,
  eps = 1e-5
): boolean {
  return Math.abs(a[0] - x) < eps && Math.abs(a[1] - y) < eps && Math.abs(a[2] - z) < eps;
}

function quatEquals(
  a?: [number, number, number, number],
  x?: number,
  y?: number,
  z?: number,
  w?: number,
  eps = 1e-5
): boolean {
  if (!a) return false;
  return (
    Math.abs(a[0] - (x ?? 0)) < eps &&
    Math.abs(a[1] - (y ?? 0)) < eps &&
    Math.abs(a[2] - (z ?? 0)) < eps &&
    Math.abs(a[3] - (w ?? 1)) < eps
  );
}

export class AudioManager {
  private _engine: GalfusEngine | null = null;
  private readonly _idAllocator = new IdAllocator<SoundId>(1);
  private readonly _sounds = new Set<SoundId>();
  private readonly _activeVoices = new Set<VoiceId>();

  // Global listener for voices without an explicit spatial listener
  private readonly _listener: SpatialTransform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1]
  };
  private readonly _voiceSpatialCache = new Map<VoiceId, VoiceSpatialEntry>();
  private readonly _voiceFinishListeners = new Map<VoiceId, Set<() => void>>();

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
    this._activeVoices.add(voiceId);
    return voiceId;
  }

  /**
   * Plays a 3D spatial sound and returns its controllable VoiceId.
   * Can be called with a full SpatialAudio descriptor or directly with emitter position.
   * Preserves explicit 1:1 acoustic listeners without overwriting them with the global listener.
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

    const hasExplicitListener = !Array.isArray(spatialOrPosition) && !!spatialOrPosition.listener;
    const listenerToUse = hasExplicitListener
      ? {
          position: [...(spatialOrPosition as SpatialAudio).listener.position] as [
            number,
            number,
            number
          ],
          rotation: (spatialOrPosition as SpatialAudio).listener.rotation
            ? ([...(spatialOrPosition as SpatialAudio).listener.rotation!] as [
                number,
                number,
                number,
                number
              ])
            : undefined
        }
      : this._listener;

    const spatial: SpatialAudio = Array.isArray(spatialOrPosition)
      ? {
          emitter: { position: spatialOrPosition },
          listener: listenerToUse,
          config: config ?? { volume: 1.0 }
        }
      : { ...spatialOrPosition, listener: listenerToUse };

    const voiceId = this._engine.audioPlaySoundSpatial(soundId, spatial) as VoiceId;
    this._activeVoices.add(voiceId);
    this._voiceSpatialCache.set(voiceId, {
      spatial: {
        emitter: {
          position: [...spatial.emitter.position],
          rotation: spatial.emitter.rotation ? [...spatial.emitter.rotation] : undefined
        },
        listener: listenerToUse,
        config: spatial.config
      },
      explicitListener: hasExplicitListener
    });
    return voiceId;
  }

  /**
   * Updates listener world-space position directly without allocating JSON objects.
   * Only propagates to voices bound to the global listener.
   */
  setListenerPosition(x: number, y: number, z: number): void {
    if (vec3Equals(this._listener.position, x, y, z)) return;
    this._listener.position = [x, y, z];
    if (this._engine) {
      for (const [voiceId, entry] of this._voiceSpatialCache) {
        if (!entry.explicitListener) {
          entry.spatial.listener = this._listener;
          this._engine.audioUpdateSoundSpatial(voiceId, entry.spatial);
        }
      }
    }
  }

  /**
   * Updates listener orientation quaternion directly.
   * Only propagates to voices bound to the global listener.
   */
  setListenerRotation(x: number, y: number, z: number, w: number): void {
    if (quatEquals(this._listener.rotation, x, y, z, w)) return;
    this._listener.rotation = [x, y, z, w];
    if (this._engine) {
      for (const [voiceId, entry] of this._voiceSpatialCache) {
        if (!entry.explicitListener) {
          entry.spatial.listener = this._listener;
          this._engine.audioUpdateSoundSpatial(voiceId, entry.spatial);
        }
      }
    }
  }

  /**
   * Updates emitter position of an active 3D voice directly with coalescing dirty check.
   */
  setVoiceEmitterPosition(voiceId: VoiceId, x: number, y: number, z: number): void {
    const entry = this._voiceSpatialCache.get(voiceId);
    if (!entry) {
      const spatial: SpatialAudio = {
        emitter: { position: [x, y, z] },
        listener: this._listener,
        config: { volume: 1.0 }
      };
      this._voiceSpatialCache.set(voiceId, { spatial, explicitListener: false });
      if (this._engine) {
        this._engine.audioUpdateSoundSpatial(voiceId, spatial);
      }
      return;
    }

    if (vec3Equals(entry.spatial.emitter.position, x, y, z)) {
      return; // Identical coordinates: zero ABI calls issued
    }

    entry.spatial.emitter.position = [x, y, z];
    if (this._engine) {
      this._engine.audioUpdateSoundSpatial(voiceId, entry.spatial);
    }
  }

  /**
   * Updates emitter rotation quaternion of an active 3D voice with coalescing dirty check.
   */
  setVoiceEmitterRotation(voiceId: VoiceId, x: number, y: number, z: number, w: number): void {
    const entry = this._voiceSpatialCache.get(voiceId);
    if (!entry) return;

    if (quatEquals(entry.spatial.emitter.rotation, x, y, z, w)) {
      return; // Identical orientation: zero ABI calls issued
    }

    entry.spatial.emitter.rotation = [x, y, z, w];
    if (this._engine) {
      this._engine.audioUpdateSoundSpatial(voiceId, entry.spatial);
    }
  }

  /**
   * Updates spatial positioning of an active sound voice.
   */
  updateSoundSpatial(voiceId: VoiceId, spatial: SpatialAudio): void {
    this._voiceSpatialCache.set(voiceId, {
      spatial,
      explicitListener: !!spatial.listener
    });
    if (this._engine) {
      this._engine.audioUpdateSoundSpatial(voiceId, spatial);
    }
  }

  /**
   * Registers a natural termination completion listener for a voice.
   * Multiple independent listeners are supported with cumulative execution and isolated unsubscribes.
   */
  onVoiceFinished(voiceId: VoiceId, callback: () => void): () => void {
    let set = this._voiceFinishListeners.get(voiceId);
    if (!set) {
      set = new Set();
      this._voiceFinishListeners.set(voiceId, set);
    }
    set.add(callback);
    return () => {
      set?.delete(callback);
      if (set && set.size === 0) {
        this._voiceFinishListeners.delete(voiceId);
      }
    };
  }

  /**
   * Handles voice completion (via engine callback or natural playback termination).
   */
  handleVoiceFinished(voiceId: VoiceId): void {
    this._activeVoices.delete(voiceId);
    this._voiceSpatialCache.delete(voiceId);
    const listeners = this._voiceFinishListeners.get(voiceId);
    if (listeners) {
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (err) {
          console.error(`[AudioManager] Error in voice finish listener for voice ${voiceId}:`, err);
        }
      }
      this._voiceFinishListeners.delete(voiceId);
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
   * Stops an active sound voice, unregistering spatial caches and firing finish handlers.
   */
  stopSound(voiceId: VoiceId): void {
    if (this._engine) {
      this._engine.audioStopSound(voiceId);
    }
    this.handleVoiceFinished(voiceId);
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
   * Returns the count of active cached spatial voices.
   */
  getActiveSpatialVoiceCount(): number {
    return this._voiceSpatialCache.size;
  }

  /**
   * Unloads all active sounds and resets all voices and spatial caches.
   */
  dispose(): void {
    if (this._engine) {
      for (const voiceId of this._activeVoices) {
        this._engine.audioStopSound(voiceId);
      }
      for (const soundId of this._sounds) {
        this._engine.audioUnloadSound(soundId);
      }
    }
    this._sounds.clear();
    this._activeVoices.clear();
    this._voiceSpatialCache.clear();
    this._voiceFinishListeners.clear();
    this._engine = null;
  }
}
