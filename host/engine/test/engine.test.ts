import { describe, expect, it } from 'bun:test';
import type {
  FrameCallback,
  FrameTiming,
  GalfusEngine,
  GalfusTransport,
  LoopOptions,
  Transform2DDesc,
  Transform3DDesc
} from '@galfus/transport-types';
import { createAnchor, createRuntime, createTransform2D, createTransform3D } from '../src/index';

function createMockTransport() {
  const calls: string[] = [];
  let loopCallback: FrameCallback | null = null;
  let isInitialized = false;

  const mockEngine = {
    multiverseCreateTarget: (id: number) => calls.push(`createTarget:${id}`),
    multiverseDestroyTarget: (id: number) => calls.push(`destroyTarget:${id}`),
    multiverseCreateInvocation: (id: number) => calls.push(`createInvocation:${id}`),
    multiverseDestroyInvocation: (id: number) => calls.push(`destroyInvocation:${id}`),
    multiverseUnregisterRealm: (id: number) => calls.push(`unregisterRealm:${id}`),
    multiverseResolve: () => {
      calls.push('multiverseResolve');
      return { invocations: [] };
    },
    multiverseDispatch: (frameId: number, dt: number) =>
      calls.push(`multiverseDispatch:${frameId}:${dt.toFixed(3)}`),

    // 2D
    realm2dCreate: (id: number) => calls.push(`realm2dCreate:${id}`),
    realm2dDestroy: (id: number) => calls.push(`realm2dDestroy:${id}`),
    realm2dCreateSprite: (r: number, s: number, _desc: unknown, _tf: Transform2DDesc) =>
      calls.push(`createSprite:${r}:${s}`),
    realm2dSetSpriteTransform: () => {},
    realm2dDestroySprite: (r: number, s: number) => calls.push(`destroySprite:${r}:${s}`),
    realm2dCreateShape: () => {},
    realm2dSetShapeTransform: () => {},
    realm2dDestroyShape: () => {},
    realm2dCreateLight: () => {},
    realm2dSetLightTransform: () => {},
    realm2dDestroyLight: () => {},
    realm2dCreateCamera: () => {},
    realm2dSetCameraTransform: () => {},
    realm2dDestroyCamera: () => {},

    // 3D
    realm3dCreate: (id: number) => calls.push(`realm3dCreate:${id}`),
    realm3dDestroy: (id: number) => calls.push(`realm3dDestroy:${id}`),
    realm3dCreateCube: (r: number, g: number) => calls.push(`createCube:${r}:${g}`),
    realm3dCreateModel: (r: number, m: number, _desc: unknown, _tf: Transform3DDesc) =>
      calls.push(`createModel:${r}:${m}`),
    realm3dSetModelTransform: () => {},
    realm3dDestroyModel: (r: number, m: number) => calls.push(`destroyModel:${r}:${m}`),
    realm3dDestroyGeometry: (r: number, g: number) => calls.push(`destroyGeometry:${r}:${g}`),
    realm3dCreateCamera: () => {},
    realm3dSetCameraTransform: () => {},
    realm3dDestroyCamera: () => {},
    realm3dCreateLight: () => {},
    realm3dSetLightTransform: () => {},
    realm3dDestroyLight: () => {},
    realm3dCreateMaterial: (r: number, m: number) => calls.push(`createMaterial:${r}:${m}`),
    realm3dDestroyMaterial: () => {},

    // Animation
    animationStep: () => {},
    animationPumpEvents: () => []
  } as unknown as GalfusEngine;

  const transport: GalfusTransport = {
    engine: mockEngine,
    get isInitialized() {
      return isInitialized;
    },
    get isRunning() {
      return loopCallback !== null;
    },
    init: async () => {
      isInitialized = true;
      calls.push('transport:init');
    },
    startLoop: (callback: FrameCallback, _options?: LoopOptions) => {
      loopCallback = callback;
      calls.push('transport:startLoop');
    },
    stopLoop: () => {
      loopCallback = null;
      calls.push('transport:stopLoop');
    },
    step: () => {
      calls.push('transport:step');
    },
    tick: (dt?: number) => {
      calls.push(`transport:tick:${dt?.toFixed(3)}`);
    },
    dispose: () => {
      isInitialized = false;
      calls.push('transport:dispose');
    }
  };

  return { transport, calls, getLoopCallback: () => loopCallback };
}

describe('@galfus/engine > Unified MultiverseRuntime', () => {
  it('manages full lifecycle: transport init, realms, anchors, frame stepping, and disposal', async () => {
    const { transport, calls } = createMockTransport();
    const runtime = createRuntime(transport);

    // 1. Initialize
    await runtime.init();
    expect(calls).toContain('transport:init');

    // 2. Create Target and Realms
    runtime.multiverse.createTarget(1, { kind: { type: 'window', windowId: 1 } });
    expect(calls).toContain('createTarget:1');

    const realm2D = runtime.createRealm2D(10);
    const realm3D = runtime.createRealm3D(20);

    expect(calls).toContain('realm2dCreate:10');
    expect(calls).toContain('realm3dCreate:20');

    // 3. Create Invocations
    runtime.multiverse.createInvocation(100, {
      realmId: 10,
      targetId: 1,
      viewport: { width: { px: 800 }, height: { px: 600 } }
    });
    runtime.multiverse.createInvocation(200, {
      realmId: 20,
      targetId: 1,
      viewport: { width: { px: 800 }, height: { px: 600 } }
    });
    expect(calls).toContain('createInvocation:100');
    expect(calls).toContain('createInvocation:200');

    // 4. Add 2D Anchored Entities
    const parent2D = realm2D.world.createEntity();
    realm2D.world.attachComponent(parent2D, createTransform2D({ position: [50, 50] }));
    const childSprite = realm2D.createSprite({ dimensions: [16, 16] }, { position: [10, 10] });
    realm2D.world.attachComponent(childSprite, createAnchor({ targetEntityId: parent2D }));

    // 5. Add 3D Anchored Entities
    const parent3D = realm3D.world.createEntity();
    realm3D.world.attachComponent(parent3D, createTransform3D({ position: [0, 100, 0] }));
    const { materialId } = realm3D.createMaterial({ baseColor: [1, 0, 0, 1] });
    const { entityId: cubeEntity } = realm3D.createCube(2.0, materialId, { position: [0, 5, 0] });
    realm3D.world.attachComponent(cubeEntity, createAnchor({ targetEntityId: parent3D }));

    // 6. Listen to onTick
    let tickCount = 0;
    let lastTiming: FrameTiming | null = null;
    const unsub = runtime.onTick((timing) => {
      tickCount++;
      lastTiming = timing;
    });

    // 7. Step single frame
    runtime.tick(0.016);

    expect(tickCount).toBe(1);
    expect(lastTiming).not.toBeNull();
    expect(lastTiming!.frameId).toBe(1);

    expect(calls).toContain('createSprite:10:1');
    expect(calls).toContain('createCube:20:2');
    expect(calls).toContain('multiverseResolve');
    expect(calls).toContain('multiverseDispatch:1:0.016');

    // 8. Step second frame
    runtime.tick(0.016);
    expect(tickCount).toBe(2);
    expect(lastTiming!.frameId).toBe(2);

    unsub();
    runtime.tick(0.016);
    expect(tickCount).toBe(2); // unsubscribed

    // 9. Dispose
    runtime.dispose();

    expect(calls).toContain('destroyInvocation:100');
    expect(calls).toContain('destroyInvocation:200');
    expect(calls).toContain('realm2dDestroy:10');
    expect(calls).toContain('realm3dDestroy:20');
    expect(calls).toContain('destroyTarget:1');
    expect(calls).toContain('transport:dispose');
  });
});
