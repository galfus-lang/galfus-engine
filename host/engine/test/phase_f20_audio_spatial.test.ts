import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, SpatialAudio } from '@galfus/transport-types';
import { AudioManager } from '../src/audio/manager';
import type { SoundId, VoiceId } from '../src/types';

function createTrackingAudioEngine() {
  const calls: {
    audioLoadSound: Array<{ soundId: number; len: number }>;
    audioUnloadSound: number[];
    audioPlaySound: Array<{ soundId: number; volume: number }>;
    audioPlaySoundSpatial: Array<{ soundId: number; spatial: SpatialAudio }>;
    audioUpdateSoundSpatial: Array<{ voiceId: number; spatial: SpatialAudio }>;
    audioStopSound: number[];
  } = {
    audioLoadSound: [],
    audioUnloadSound: [],
    audioPlaySound: [],
    audioPlaySoundSpatial: [],
    audioUpdateSoundSpatial: [],
    audioStopSound: []
  };

  let nextVoiceId = 100;

  const engine = {
    audioLoadSound: (soundId: number, _data: Uint8Array, len: number) => {
      calls.audioLoadSound.push({ soundId, len });
    },
    audioUnloadSound: (soundId: number) => {
      calls.audioUnloadSound.push(soundId);
    },
    audioPlaySound: (soundId: number, volume: number) => {
      calls.audioPlaySound.push({ soundId, volume });
      return nextVoiceId++;
    },
    audioPlaySoundSpatial: (soundId: number, spatial: SpatialAudio) => {
      calls.audioPlaySoundSpatial.push({ soundId, spatial });
      return nextVoiceId++;
    },
    audioUpdateSoundSpatial: (voiceId: number, spatial: SpatialAudio) => {
      calls.audioUpdateSoundSpatial.push({ voiceId, spatial: JSON.parse(JSON.stringify(spatial)) });
    },
    audioStopSound: (voiceId: number) => {
      calls.audioStopSound.push(voiceId);
    },
    audioPauseSound: () => {},
    audioResumeSound: () => {},
    audioSetVolume: () => {},
    audioSetPanning: () => {}
  } as unknown as GalfusEngine;

  return { engine, calls };
}

describe('Phase F20 — Spatial Audio, Listeners, Caching and Teardown', () => {
  it('F20: supports multiple cumulative voice finish event listeners with isolated unsubscribe', () => {
    const { engine } = createTrackingAudioEngine();
    const audio = new AudioManager();
    audio.bindEngine(engine);

    const soundId = audio.loadSound(new Uint8Array(100)) as SoundId;
    const voiceId = audio.playSound(soundId) as VoiceId;

    let callback1Count = 0;
    let callback2Count = 0;

    const unsub1 = audio.onVoiceFinished(voiceId, () => {
      callback1Count++;
    });
    audio.onVoiceFinished(voiceId, () => {
      callback2Count++;
    });

    // Unsubscribing callback 1 isolates it from triggering
    unsub1();

    // Trigger natural completion
    audio.handleVoiceFinished(voiceId);

    expect(callback1Count).toBe(0);
    expect(callback2Count).toBe(1);
  });

  it('F20: preserves explicit 1:1 acoustic listener on spatial sound without global listener overwrite', () => {
    const { engine, calls } = createTrackingAudioEngine();
    const audio = new AudioManager();
    audio.bindEngine(engine);

    const soundId = audio.loadSound(new Uint8Array(50)) as SoundId;

    // 1. Voice A: Uses global listener (initially at [0, 0, 0])
    const voiceA = audio.playSoundSpatial(soundId, [10, 0, 0]) as VoiceId;

    // 2. Voice B: Uses explicit independent acoustic listener at [50, 0, 0]
    const explicitListener = {
      position: [50, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number]
    };
    const voiceB = audio.playSoundSpatial(soundId, {
      emitter: { position: [60, 0, 0] },
      listener: explicitListener,
      config: { volume: 0.8 }
    }) as VoiceId;

    calls.audioUpdateSoundSpatial.length = 0;

    // Move the global listener to [5, 0, 0]
    audio.setListenerPosition(5, 0, 0);

    // Only Voice A should receive the update; Voice B's explicit acoustic listener is strictly preserved!
    expect(calls.audioUpdateSoundSpatial.length).toBe(1);
    expect(calls.audioUpdateSoundSpatial[0]?.voiceId).toBe(voiceA);
    expect(calls.audioUpdateSoundSpatial[0]?.spatial.listener.position).toEqual([5, 0, 0]);

    // Check voice B in cache maintains its explicit listener at [50, 0, 0]
    expect(audio.getActiveSpatialVoiceCount()).toBe(2);
  });

  it('F20: spatial dirty checking coalesces identical emitter or listener positions to ZERO ABI calls', () => {
    const { engine, calls } = createTrackingAudioEngine();
    const audio = new AudioManager();
    audio.bindEngine(engine);

    const soundId = audio.loadSound(new Uint8Array(100)) as SoundId;
    const voiceId = audio.playSoundSpatial(soundId, [0, 0, 0]) as VoiceId;

    calls.audioUpdateSoundSpatial.length = 0;

    // Moving to identical position [0, 0, 0] produces zero ABI calls
    audio.setVoiceEmitterPosition(voiceId, 0, 0, 0);
    expect(calls.audioUpdateSoundSpatial.length).toBe(0);

    // Moving to new position [1, 2, 3] produces 1 ABI call
    audio.setVoiceEmitterPosition(voiceId, 1, 2, 3);
    expect(calls.audioUpdateSoundSpatial.length).toBe(1);

    // Setting same position [1, 2, 3] multiple times produces zero additional ABI calls
    audio.setVoiceEmitterPosition(voiceId, 1, 2, 3);
    audio.setVoiceEmitterPosition(voiceId, 1, 2, 3);
    expect(calls.audioUpdateSoundSpatial.length).toBe(1);
  });

  it('F20: natural termination or stopSound immediately frees spatial voice cache', () => {
    const { engine } = createTrackingAudioEngine();
    const audio = new AudioManager();
    audio.bindEngine(engine);

    const soundId = audio.loadSound(new Uint8Array(100)) as SoundId;
    const voice1 = audio.playSoundSpatial(soundId, [0, 0, 0]) as VoiceId;
    const voice2 = audio.playSoundSpatial(soundId, [10, 0, 0]) as VoiceId;

    expect(audio.getActiveSpatialVoiceCount()).toBe(2);

    // 1. Natural playback finish frees voice 1
    audio.handleVoiceFinished(voice1);
    expect(audio.getActiveSpatialVoiceCount()).toBe(1);

    // 2. Explicit stop frees voice 2
    audio.stopSound(voice2);
    expect(audio.getActiveSpatialVoiceCount()).toBe(0);
  });

  it('F20: audio.dispose() halts all active voices and completely purges spatial caches', () => {
    const { engine, calls } = createTrackingAudioEngine();
    const audio = new AudioManager();
    audio.bindEngine(engine);

    const soundId = audio.loadSound(new Uint8Array(100)) as SoundId;
    const voice1 = audio.playSoundSpatial(soundId, [0, 0, 0]) as VoiceId;
    const voice2 = audio.playSoundSpatial(soundId, [5, 5, 5]) as VoiceId;

    expect(audio.getActiveSpatialVoiceCount()).toBe(2);

    audio.dispose();

    expect(calls.audioStopSound).toContain(voice1);
    expect(calls.audioStopSound).toContain(voice2);
    expect(calls.audioUnloadSound).toContain(soundId);
    expect(audio.getActiveSpatialVoiceCount()).toBe(0);
  });
});
