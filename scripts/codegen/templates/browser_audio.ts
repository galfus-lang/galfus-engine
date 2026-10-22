/**
 * Copied to `sdk/browser/audio.ts` by the SDK generator.
 *
 * Web Audio cannot live in the Rust WASM module because decoding and playback are asynchronous
 * browser APIs. It is therefore the browser SDK's platform adapter.
 */
interface SpatialAudioState {
  emitter: { position: [number, number, number] };
  listener: { position: [number, number, number] };
  config: {
    volume?: number;
    minDistance?: number;
    maxDistance?: number;
    rolloff?: number;
    speed?: number;
    looping?: boolean;
  };
}

interface Voice {
  readonly soundId: number;
  readonly gain: GainNode;
  readonly panner?: StereoPannerNode;
  readonly speed: number;
  readonly looping: boolean;
  source?: AudioBufferSourceNode;
  startedAt?: number;
  offset: number;
  paused: boolean;
}

/** Web Audio implementation used by the generated Browser/WASM SDK. */
export class WasmAudio {
  private context?: AudioContext;
  private readonly sounds = new Map<number, Promise<AudioBuffer>>();
  private readonly voices = new Map<number, Voice>();
  private readonly pendingVoiceIds = new Set<number>();
  private nextVoiceId = 1;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => void this.enable();
      window.addEventListener('pointerdown', unlock, { once: true, passive: true });
      window.addEventListener('keydown', unlock, { once: true });
      window.addEventListener('touchstart', unlock, { once: true, passive: true });
    }
  }

  /** Resumes audio from a user gesture, then starts queued voices. */
  async enable(): Promise<void> {
    const context = this.getContext();
    if (context.state !== 'running') await context.resume();
    for (const voiceId of this.pendingVoiceIds) {
      const voice = this.voices.get(voiceId);
      if (voice && !voice.paused) void this.startVoice(voiceId, voice);
    }
    this.pendingVoiceIds.clear();
  }

  load(soundId: number, data: unknown): void {
    const bytes = this.toBytes(data);
    const decoded = this.getContext().decodeAudioData(Uint8Array.from(bytes).buffer);
    this.sounds.set(soundId, decoded);
    void decoded.catch((error: unknown) => {
      this.sounds.delete(soundId);
      console.warn(`[Galfus Audio] Unable to decode sound ${soundId}:`, error);
    });
  }

  play(soundId: number, volume: number, panning: number, speed: number, looping: boolean): void {
    const context = this.getContext();
    const gain = context.createGain();
    gain.gain.value = Math.max(0, volume);
    const panner = context.createStereoPanner?.();
    if (panner) panner.pan.value = Math.max(-1, Math.min(1, panning));
    gain.connect(panner ?? context.destination);
    if (panner) panner.connect(context.destination);

    const voiceId = this.nextVoiceId++;
    this.voices.set(voiceId, {
      soundId,
      gain,
      panner,
      speed: Math.max(0.01, speed),
      looping,
      offset: 0,
      paused: false
    });
    void this.startVoice(voiceId, this.voices.get(voiceId)!);
  }

  playSpatial(soundId: number, spatial: SpatialAudioState): void {
    const { volume, panning } = this.spatialValues(spatial);
    this.play(soundId, volume, panning, spatial.config.speed ?? 1, spatial.config.looping ?? false);
  }

  updateSpatial(voiceId: number, spatial: SpatialAudioState): void {
    const voice = this.voices.get(voiceId);
    if (!voice) return;
    const { volume, panning } = this.spatialValues(spatial);
    voice.gain.gain.value = volume;
    if (voice.panner) voice.panner.pan.value = panning;
  }

  pause(voiceId: number): void {
    const voice = this.voices.get(voiceId);
    if (!voice?.source || !this.context || voice.paused) return;
    voice.offset +=
      (this.context.currentTime - (voice.startedAt ?? this.context.currentTime)) * voice.speed;
    voice.paused = true;
    voice.source.stop();
    voice.source = undefined;
  }

  resume(voiceId: number): void {
    const voice = this.voices.get(voiceId);
    if (!voice || !voice.paused) return;
    voice.paused = false;
    void this.startVoice(voiceId, voice);
  }

  stop(voiceId: number): void {
    const voice = this.voices.get(voiceId);
    if (!voice) return;
    voice.source?.stop();
    voice.gain.disconnect();
    this.pendingVoiceIds.delete(voiceId);
    this.voices.delete(voiceId);
  }

  setVolume(voiceId: number, volume: number): void {
    const voice = this.voices.get(voiceId);
    if (voice) voice.gain.gain.value = Math.max(0, volume);
  }

  setPanning(voiceId: number, panning: number): void {
    const voice = this.voices.get(voiceId);
    if (voice?.panner) voice.panner.pan.value = Math.max(-1, Math.min(1, panning));
  }

  unload(soundId: number): void {
    this.sounds.delete(soundId);
    for (const [voiceId, voice] of this.voices) if (voice.soundId === soundId) this.stop(voiceId);
  }

  private getContext(): AudioContext {
    if (!this.context) this.context = new AudioContext();
    return this.context;
  }

  private async startVoice(voiceId: number, voice: Voice): Promise<void> {
    const context = this.getContext();
    if (context.state !== 'running') {
      this.pendingVoiceIds.add(voiceId);
      return;
    }
    const sound = this.sounds.get(voice.soundId);
    if (!sound) return console.warn(`[Galfus Audio] Sound ${voice.soundId} is not loaded.`);
    const buffer = await sound;
    if (voice.paused || !this.voices.has(voiceId)) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = voice.looping;
    source.playbackRate.value = voice.speed;
    source.connect(voice.gain);
    source.onended = () => {
      if (!voice.paused && voice.source === source) this.stop(voiceId);
    };
    voice.source = source;
    voice.startedAt = context.currentTime;
    source.start(0, voice.offset);
  }

  private spatialValues(spatial: SpatialAudioState): { volume: number; panning: number } {
    const [ex, ey, ez] = spatial.emitter.position;
    const [lx, ly, lz] = spatial.listener.position;
    const distance = Math.hypot(ex - lx, ey - ly, ez - lz);
    const min = spatial.config.minDistance ?? 1;
    const max = Math.max(spatial.config.maxDistance ?? 50, min + 0.001);
    const normalized = Math.min(1, Math.max(0, (distance - min) / (max - min)));
    const volume =
      (spatial.config.volume ?? 1) * (1 - normalized) ** Math.max(spatial.config.rolloff ?? 1, 0.1);
    return {
      volume,
      panning: distance > 0.001 ? Math.max(-1, Math.min(1, (ex - lx) / distance)) : 0
    };
  }

  private toBytes(data: unknown): Uint8Array {
    if (data instanceof Uint8Array) return data;
    if (ArrayBuffer.isView(data))
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    throw new TypeError('Browser audio requires an ArrayBuffer or Uint8Array payload.');
  }
}
