import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, Transform2DDesc } from '@galfus/transport-types';
import { createAnchor } from '../src/anchors/index';
import { Realm2D } from '../src/realm2d/index';

describe('@galfus/engine > Realm2D', () => {
  it('creates entities and synchronizes them to GalfusEngine with resolved anchors', () => {
    const realm = new Realm2D(10);
    const calls: string[] = [];
    const spriteTransforms = new Map<number, Transform2DDesc>();

    const mockEngine = {
      realm2dCreate: (id: number) => calls.push(`realm2dCreate:${id}`),
      realm2dDestroy: (id: number) => calls.push(`realm2dDestroy:${id}`),
      realm2dCreateSprite: (r: number, s: number, _desc: unknown, tf: Transform2DDesc) => {
        calls.push(`createSprite:${r}:${s}`);
        spriteTransforms.set(s, tf);
      },
      realm2dSetSpriteTransform: (r: number, s: number, tf: Transform2DDesc) => {
        calls.push(`setSpriteTransform:${r}:${s}`);
        spriteTransforms.set(s, tf);
      },
      realm2dDestroySprite: (r: number, s: number) => calls.push(`destroySprite:${r}:${s}`),
      realm2dCreateCamera: (r: number, c: number) => calls.push(`createCamera:${r}:${c}`),
      realm2dSetCameraTransform: () => {},
      realm2dDestroyCamera: () => {},
      realm2dCreateLight: (r: number, l: number) => calls.push(`createLight:${r}:${l}`),
      realm2dSetLightTransform: () => {},
      realm2dDestroyLight: () => {},
      realm2dCreateShape: () => {},
      realm2dSetShapeTransform: () => {},
      realm2dDestroyShape: () => {}
    } as unknown as GalfusEngine;

    realm.bindEngine(mockEngine);
    expect(calls).toContain('realm2dCreate:10');

    // 1. Create a parent entity
    const parentEntity = realm.createSpatialNode({ position: [100, 200] });

    // 2. Create child sprite anchored to parent
    const childEntity = realm.createSprite({ dimensions: [32, 32] }, { position: [10, 20] });
    realm.world.attachComponent(childEntity, createAnchor({ targetEntityId: parentEntity }));

    // 3. Create camera
    realm.createCamera({ orthoScale: 1.0 }, { position: [0, 0] });

    // 4. Sync frame
    realm.sync({ time: 0, dt: 0.016, frameId: 1, engine: mockEngine });

    // Verify calls
    expect(calls).toContain('createSprite:10:2');
    expect(calls).toContain('createCamera:10:3');

    // Verify resolved anchored transform
    const tf = spriteTransforms.get(2);
    expect(tf).toBeDefined();
    // 100 + 10 = 110, 200 + 20 = 220
    expect(tf!.position[0]).toBeCloseTo(110);
    expect(tf!.position[1]).toBeCloseTo(220);

    // 5. Destroy sprite entity and re-sync
    realm.world.destroyEntity(childEntity);
    realm.sync({ time: 0.016, dt: 0.016, frameId: 2, engine: mockEngine });

    expect(calls).toContain('destroySprite:10:2');

    realm.dispose();
    expect(calls).toContain('realm2dDestroy:10');
  });

  it('supports 2D particles, UI models, polar shadows, and materials', () => {
    const realm = new Realm2D(15);
    const calls: string[] = [];

    const mockEngine = {
      realm2dCreate: () => {},
      realm2dDestroy: () => {},
      realm2dCreateSprite: () => {},
      realm2dSetSpriteTransform: () => {},
      realm2dDestroySprite: () => {},
      realm2dCreateParticleEmitter: (r: number, e: number) => calls.push(`createEmitter:${r}:${e}`),
      realm2dSetParticleEmitterTransform: () => {},
      realm2dDestroyParticleEmitter: () => {},
      realm2dParticleEmitterBurst: (r: number, e: number, c: number) =>
        calls.push(`burst:${r}:${e}:${c}`),
      realm2dCreateUi: (r: number, u: number) => calls.push(`createUi:${r}:${u}`),
      realm2dSetUiContent: (r: number, u: number) => calls.push(`setUiContent:${r}:${u}`),
      realm2dSetUiTransform: () => {},
      realm2dApplyUiCommands: (r: number, u: number) => calls.push(`applyUiCommands:${r}:${u}`),
      realm2dDestroyUi: (r: number, u: number) => calls.push(`destroyUi:${r}:${u}`),
      realm2dSetShadowConfig: () => calls.push('setShadowConfig'),
      realm2dLoadFontData: () => 'Roboto',
      realm2dCreateMaterial: (r: number, m: number) => calls.push(`createMat:${r}:${m}`),
      realm2dDestroyMaterial: () => {}
    } as unknown as GalfusEngine;

    realm.bindEngine(mockEngine);

    // 1. Particle emitter
    realm.createParticleEmitter({ maxParticles: 50, spawnRate: 5 });
    realm.particleEmitterBurst(1, 15);

    // 2. UI model
    const uiHandle = realm.createUi({
      quads: [{ rect: [0, 0, 100, 100] }]
    });
    realm.applyUiCommands(uiHandle, [
      { type: 'setLayout', id: 1, layout: { width: { type: 'exact', value: 200 } } }
    ]);

    // 3. Shadow config, font loading, materials
    realm.setShadowConfig({ ambient: 0.2, lightRadius: 10 });
    const fontName = realm.loadFontData(new Uint8Array([1, 2, 3]));
    expect(fontName).toBe('Roboto');

    const matId = realm.createMaterial({ shaderEffect: 'glow' });
    expect(matId).toBe(3);

    // 4. Sync
    realm.sync({ time: 0, dt: 0.016, frameId: 1, engine: mockEngine });

    expect(calls).toContain('createEmitter:15:1');
    expect(calls).toContain('burst:15:1:15');
    expect(calls).toContain('createUi:15:2');
    expect(calls).toContain('applyUiCommands:15:2');
    expect(calls).toContain('setShadowConfig');
    expect(calls).toContain('createMat:15:3');

    realm.dispose();
  });
});
