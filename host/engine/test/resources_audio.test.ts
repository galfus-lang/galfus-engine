import { describe, expect, it } from 'bun:test';
import type { GalfusEngine } from '@galfus/transport-types';
import { ResourceManager } from '../src/resources/manager';
import { AudioManager } from '../src/audio/manager';

describe('@galfus/engine > ResourceManager & AudioManager', () => {
  it('manages GPU texture creation, updates, and disposal with typed TextureId tracking', () => {
    const resources = new ResourceManager();
    const calls: string[] = [];

    const mockEngine = {
      resourceCreateTexture: (id: number) => calls.push(`createTex:${id}`),
      resourceUpdateTexture: (id: number) => calls.push(`updateTex:${id}`),
      resourceDisposeTexture: (id: number) => calls.push(`disposeTex:${id}`)
    } as unknown as GalfusEngine;

    resources.bindEngine(mockEngine);

    // 1. Textures
    const texData = new Uint8Array([255, 0, 0, 255]);
    const texId = resources.createTexture({ width: 1, height: 1, format: 'rgba8Unorm' }, texData);
    expect(calls).toContain(`createTex:${texId}`);

    resources.updateTexture(texId, { x: 0, y: 0, width: 1, height: 1 }, texData);
    expect(calls).toContain(`updateTex:${texId}`);

    // 2. Dispose
    resources.dispose();
    expect(calls).toContain(`disposeTex:${texId}`);
  });

  it('manages sound loading, direct 3D spatial positioning, and voice controls', () => {
    const audio = new AudioManager();
    const calls: string[] = [];

    const mockEngine = {
      audioLoadSound: (id: number) => calls.push(`loadSound:${id}`),
      audioUnloadSound: (id: number) => calls.push(`unloadSound:${id}`),
      audioPlaySound: (id: number, vol: number) => {
        calls.push(`playSound:${id}:vol=${vol}`);
        return 101; // Voice ID
      },
      audioPlaySoundSpatial: (id: number) => {
        calls.push(`playSoundSpatial:${id}`);
        return 102;
      },
      audioUpdateSoundSpatial: (v: number) => calls.push(`updateSpatial:${v}`),
      audioPauseSound: (v: number) => calls.push(`pauseSound:${v}`),
      audioResumeSound: (v: number) => calls.push(`resumeSound:${v}`),
      audioStopSound: (v: number) => calls.push(`stopSound:${v}`),
      audioSetVolume: (v: number, vol: number) => calls.push(`setVolume:${v}:${vol}`),
      audioSetPanning: (v: number, pan: number) => calls.push(`setPanning:${v}:${pan}`)
    } as unknown as GalfusEngine;

    audio.bindEngine(mockEngine);

    // 1. Load Sound
    const soundData = new Uint8Array([0, 1, 2, 3]);
    const soundId = audio.loadSound(soundData);
    expect(calls).toContain(`loadSound:${soundId}`);

    // 2. Play Stereo Sound
    const voiceId = audio.playSound(soundId, { volume: 0.8, looping: true });
    expect(calls).toContain(`playSound:${soundId}:vol=0.8`);
    expect(voiceId).toBe(101 as any);

    // 3. Play Spatial Sound with direct position
    const spatialVoice = audio.playSoundSpatial(soundId, [5, 0, -2], { volume: 1.0 });
    expect(calls).toContain(`playSoundSpatial:${soundId}`);
    expect(spatialVoice).toBe(102 as any);

    // 4. Update Listener and Voice position with zero-JSON methods
    audio.setListenerPosition(0, 2, 0);
    expect(calls).toContain(`updateSpatial:${spatialVoice}`);

    audio.setVoiceEmitterPosition(spatialVoice, 10, 0, -5);
    expect(calls).toContain(`updateSpatial:${spatialVoice}`);

    // 5. Controls
    audio.pauseSound(voiceId);
    expect(calls).toContain(`pauseSound:${voiceId}`);

    audio.resumeSound(voiceId);
    expect(calls).toContain(`resumeSound:${voiceId}`);

    audio.setVolume(voiceId, 0.5);
    expect(calls).toContain(`setVolume:${voiceId}:0.5`);

    audio.setPanning(voiceId, -0.5);
    expect(calls).toContain(`setPanning:${voiceId}:-0.5`);

    audio.stopSound(voiceId);
    expect(calls).toContain(`stopSound:${voiceId}`);

    // 6. Dispose
    audio.dispose();
    expect(calls).toContain(`unloadSound:${soundId}`);
  });
});
