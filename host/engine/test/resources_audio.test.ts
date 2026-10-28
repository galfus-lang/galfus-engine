import { describe, expect, it } from 'bun:test';
import type { GalfusEngine } from '@galfus/transport-types';
import { ResourceManager } from '../src/resources/manager';
import { AudioManager } from '../src/audio/manager';

describe('@galfus/engine > ResourceManager & AudioManager', () => {
  it('manages GPU texture and buffer creation, updates, and disposal with ID tracking', () => {
    const resources = new ResourceManager();
    const calls: string[] = [];

    const mockEngine = {
      resourceCreateTexture: (id: number) => calls.push(`createTex:${id}`),
      resourceUpdateTexture: (id: number) => calls.push(`updateTex:${id}`),
      resourceDisposeTexture: (id: number) => calls.push(`disposeTex:${id}`),
      resourceCreateBuffer: (id: number) => calls.push(`createBuf:${id}`),
      resourceUpdateBuffer: (id: number) => calls.push(`updateBuf:${id}`),
      resourceDisposeBuffer: (id: number) => calls.push(`disposeBuf:${id}`)
    } as unknown as GalfusEngine;

    resources.bindEngine(mockEngine);

    // 1. Textures
    const texData = new Uint8Array([255, 0, 0, 255]);
    const texId = resources.createTexture({ width: 1, height: 1, format: 'rgba8Unorm' }, texData);
    expect(calls).toContain(`createTex:${texId}`);

    resources.updateTexture(texId, { x: 0, y: 0, width: 1, height: 1 }, texData);
    expect(calls).toContain(`updateTex:${texId}`);

    // 2. Buffers
    const bufData = new Uint8Array([1, 2, 3, 4]);
    const bufId = resources.createBuffer({ usages: { copyDst: true } }, bufData);
    expect(calls).toContain(`createBuf:${bufId}`);

    resources.updateBuffer(bufId, 0, bufData);
    expect(calls).toContain(`updateBuf:${bufId}`);

    // 3. Dispose
    resources.dispose();
    expect(calls).toContain(`disposeTex:${texId}`);
    expect(calls).toContain(`disposeBuf:${bufId}`);
  });

  it('manages sound loading, spatial playback, and voice controls', () => {
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

    const soundBytes = new Uint8Array([0, 1, 2, 3]);
    const soundId = audio.loadSound(soundBytes);
    expect(calls).toContain(`loadSound:${soundId}`);

    const voice1 = audio.playSound(soundId, { volume: 0.8 });
    expect(voice1).toBe(101);
    expect(calls).toContain(`playSound:${soundId}:vol=0.8`);

    audio.setVolume(voice1, 0.5);
    audio.setPanning(voice1, -0.5);
    audio.pauseSound(voice1);
    audio.resumeSound(voice1);
    audio.stopSound(voice1);

    expect(calls).toContain(`setVolume:${voice1}:0.5`);
    expect(calls).toContain(`setPanning:${voice1}:-0.5`);
    expect(calls).toContain(`pauseSound:${voice1}`);
    expect(calls).toContain(`resumeSound:${voice1}`);
    expect(calls).toContain(`stopSound:${voice1}`);

    const voice2 = audio.playSoundSpatial(soundId, {
      emitter: { position: [0, 1, 0] },
      listener: { position: [0, 0, 0] },
      config: { volume: 1.0, maxDistance: 100.0 }
    });
    expect(voice2).toBe(102);
    expect(calls).toContain(`playSoundSpatial:${soundId}`);

    audio.updateSoundSpatial(voice2, {
      emitter: { position: [2, 1, 0] },
      listener: { position: [0, 0, 0] },
      config: { volume: 1.0, maxDistance: 100.0 }
    });
    expect(calls).toContain(`updateSpatial:${voice2}`);

    audio.dispose();
    expect(calls).toContain(`unloadSound:${soundId}`);
  });
});
