/**
 * AudioManager manages audio sound loading, voices, and 3D spatial playback.
 */
import type { GalfusEngine, SpatialAudio } from '@galfus/transport-types';
import { assertValidLogicalId } from '@galfus/transport-types';

export interface PlaySoundOptions {
  volume?: number;
  panning?: number;
  speed?: number;
  looping?: boolean;
}

export class AudioManager {
  private _engine: GalfusEngine | null = null;
  private _nextSoundId = 1;
  private readonly _sounds = new Set<number>();

  bindEngine(engine: GalfusEngine): void {
    this._engine = engine;
  }

  allocateSoundId(): number {
    const id = this._nextSoundId++;
    assertValidLogicalId(id, 'SoundId');
    return id;
  }

  /**
   * Loads raw audio bytes (WAV, MP3, OGG, FLAC) into core memory under a tracked logical sound ID.
   */
  loadSound(data: Uint8Array): number {
    const soundId = this.allocateSoundId();
    if (this._engine) {
      this._engine.audioLoadSound(soundId, data, data.byteLength);
    }
    this._sounds.add(soundId);
    return soundId;
  }

  /**
   * Unloads a sound from core memory.
   */
  unloadSound(soundId: number): void {
    if (!this._sounds.has(soundId)) return;
    if (this._engine) {
      this._engine.audioUnloadSound(soundId);
    }
    this._sounds.delete(soundId);
  }

  /**
   * Plays a loaded sound and returns its controllable voice ID.
   */
  playSound(soundId: number, options: PlaySoundOptions = {}): number {
    if (!this._engine) {
      throw new Error('Cannot play sound: AudioManager is not bound to an engine instance.');
    }
    return this._engine.audioPlaySound(
      soundId,
      options.volume ?? 1.0,
      options.panning ?? 0.0,
      options.speed ?? 1.0,
      options.looping ?? false
    );
  }

  /**
   * Plays a 3D spatial sound and returns its controllable voice ID.
   */
  playSoundSpatial(soundId: number, spatial: SpatialAudio): number {
    if (!this._engine) {
      throw new Error(
        'Cannot play spatial sound: AudioManager is not bound to an engine instance.'
      );
    }
    return this._engine.audioPlaySoundSpatial(soundId, spatial);
  }

  /**
   * Updates spatial positioning of an active sound voice relative to the listener.
   */
  updateSoundSpatial(voiceId: number, spatial: SpatialAudio): void {
    if (this._engine) {
      this._engine.audioUpdateSoundSpatial(voiceId, spatial);
    }
  }

  /**
   * Pauses an active sound voice.
   */
  pauseSound(voiceId: number): void {
    if (this._engine) {
      this._engine.audioPauseSound(voiceId);
    }
  }

  /**
   * Resumes a paused sound voice.
   */
  resumeSound(voiceId: number): void {
    if (this._engine) {
      this._engine.audioResumeSound(voiceId);
    }
  }

  /**
   * Stops an active sound voice.
   */
  stopSound(voiceId: number): void {
    if (this._engine) {
      this._engine.audioStopSound(voiceId);
    }
  }

  /**
   * Updates the volume of an active sound voice.
   */
  setVolume(voiceId: number, volume: number): void {
    if (this._engine) {
      this._engine.audioSetVolume(voiceId, volume);
    }
  }

  /**
   * Updates the stereo panning (-1.0 to 1.0) of an active sound voice.
   */
  setPanning(voiceId: number, panning: number): void {
    if (this._engine) {
      this._engine.audioSetPanning(voiceId, panning);
    }
  }

  /**
   * Unloads all tracked sounds.
   */
  dispose(): void {
    if (this._engine) {
      for (const soundId of this._sounds) {
        this._engine.audioUnloadSound(soundId);
      }
    }
    this._sounds.clear();
    this._engine = null;
  }
}
