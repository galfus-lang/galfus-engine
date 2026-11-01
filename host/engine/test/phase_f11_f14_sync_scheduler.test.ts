import { describe, expect, test } from 'bun:test';
import type { GalfusEngine } from '@galfus/transport-types';
import {
  EcsWorld,
  RESERVED_PRIORITY_INTERNAL_RESOLVERS,
  RESERVED_PRIORITY_REALM_SYNC
} from '../src/ecs/index';
import { Realm2D } from '../src/realm2d/realm';
import { Realm3D } from '../src/realm3d/realm';
import type { Light2DComponent } from '../src/realm2d/components';
import type { Light3DComponent } from '../src/realm3d/components';
import { MultiverseRuntime } from '../src/runtime';
import { DirtyRegistry } from '../src/spatial/dirty_registry';

function createMockEngine(calls: string[]): GalfusEngine {
  return {
    platformInit: () => calls.push('platformInit'),
    platformInitHeadless: () => calls.push('platformInitHeadless'),
    platformShutdown: () => calls.push('platformShutdown'),
    getLastError: () => '',
    platformGetCapabilities: () => ({}) as any,
    windowCreate: () => 1,
    windowClose: () => {},
    windowSetTitle: () => {},
    windowSetCursorGrab: () => {},
    windowSetCursorIcon: () => {},
    windowSetIcon: () => {},
    platformPumpEvents: () => [],
    platformReleaseEventBatch: () => {},
    gamepadGetConnected: () => [],
    gamepadSetRumble: () => {},
    audioLoadSound: () => {},
    audioPlaySound: () => 1,
    audioPlaySoundSpatial: () => 1,
    audioUpdateSoundSpatial: () => {},
    audioPauseSound: () => {},
    audioResumeSound: () => {},
    audioStopSound: () => {},
    audioSetVolume: () => {},
    audioSetPanning: () => {},
    audioUnloadSound: () => {},
    platformGetWindowSizeRaw: () => {},
    multiverseAttachWindow: () => {},
    multiverseCreateTarget: (t: number) => calls.push(`createTarget:${t}`),
    multiverseDestroyTarget: (t: number) => calls.push(`destroyTarget:${t}`),
    multiverseRegisterColorRealm: () => {},
    multiverseUnregisterRealm: () => {},
    multiverseRegisterShader: () => {},
    multiverseCreateInvocation: (i: number) => calls.push(`createInvocation:${i}`),
    multiverseDestroyInvocation: () => {},
    multiverseSetInvocationEnabled: () => {},
    multiverseSetInvocationViewport: () => {},
    multiverseSetInvocationFilters: () => {},
    multiverseSetInvocationClearColor: () => {},
    multiverseSetInvocationCameraSlot: () => {},
    multiverseBindTargetTexture: () => {},
    multiverseUnbindTargetTexture: () => {},
    multiverseUpdateWindowSize: () => {},
    multiverseResolve: () => ({ invocations: [] }) as any,
    multiverseDispatch: (f: number) => calls.push(`dispatch:${f}`),
    realmClear: () => {},
    realmDestroy: () => {},
    multiverseGetTargetSizeRaw: () => {},
    multiverseSetAntiAliasing: () => {},
    multiverseGetAntiAliasing: () => 'none',
    resourceCreateTexture: () => {},
    resourceUpdateTexture: () => {},
    resourceDisposeTexture: () => {},
    resourceCreateBuffer: () => {},
    resourceUpdateBuffer: () => {},
    resourceDisposeBuffer: () => {},
    realm3dCreate: (r: number) => calls.push(`realm3dCreate:${r}`),
    realm3dDestroy: (r: number) => calls.push(`realm3dDestroy:${r}`),
    realm3dCreateCamera: (r: number, c: number) => calls.push(`3dCreateCamera:${r}:${c}`),
    realm3dSetCameraTransform: (r: number, c: number) =>
      calls.push(`3dSetCameraTransform:${r}:${c}`),
    realm3dSetCameraLookAt: () => {},
    realm3dGetCameraLookAt: () => ({}) as any,
    realm3dClearCameraLookAt: () => {},
    realm3dCreateGeometry: () => {},
    realm3dSetGeometryMorphTargets: () => {},
    realm3dCreateCube: () => {},
    realm3dCreatePlane: () => {},
    realm3dCreateQuad: () => {},
    realm3dCreateSphere: () => {},
    realm3dCreateCylinder: () => {},
    realm3dCreateCapsule: () => {},
    realm3dCreatePyramid: () => {},
    realm3dCreateTorus: () => {},
    realm3dCreateMaterial: () => {},
    realm3dCreateModel: (r: number, m: number) => calls.push(`3dCreateModel:${r}:${m}`),
    realm3dSetModelTransform: (r: number, m: number) => calls.push(`3dSetModelTransform:${r}:${m}`),
    realm3dCreateInstancedModel: () => {},
    realm3dSetInstancedModelData: () => {},
    realm3dSetModelMorphWeights: () => {},
    realm3dSetInstancedModelMorphWeights: () => {},
    realm3dCreateLight: (r: number, l: number) => calls.push(`3dCreateLight:${r}:${l}`),
    realm3dSetLightTransform: (r: number, l: number) => calls.push(`3dSetLightTransform:${r}:${l}`),
    realm3dSetEnvironment: () => {},
    realm3dUpdateBones: () => {},
    realm3dDrawLine: () => {},
    realm3dDrawAabb: () => {},
    realm3dClearGizmos: () => {},
    realm3dCreateParticleEmitter: () => {},
    realm3dSetParticleEmitterTransform: () => {},
    realm3dParticleEmitterBurst: () => {},
    realm3dDestroyParticleEmitter: () => {},
    realm3dCreatePortal: () => {},
    realm3dSetPortalActive: () => {},
    realm3dDestroyPortal: () => {},
    realm3dDestroyCamera: (r: number, c: number) => calls.push(`3dDestroyCamera:${r}:${c}`),
    realm3dDestroyMaterial: () => {},
    realm3dDestroyGeometry: () => {},
    realm3dDestroyModel: (r: number, m: number) => calls.push(`3dDestroyModel:${r}:${m}`),
    realm3dDestroyInstancedModel: () => {},
    realm3dDestroyLight: (r: number, l: number) => calls.push(`3dDestroyLight:${r}:${l}`),
    realm3dGetModelTransform: () => ({ position: [0, 0, 0] }),
    realm3dGetCameraTransform: () => ({ position: [0, 0, 0] }),
    realm3dGetModelAabbRaw: () => {},
    realm2dCreate: (r: number) => calls.push(`realm2dCreate:${r}`),
    realm2dDestroy: (r: number) => calls.push(`realm2dDestroy:${r}`),
    realm2dCreateCamera: (r: number, c: number) => calls.push(`2dCreateCamera:${r}:${c}`),
    realm2dSetCameraTransform: (r: number, c: number) =>
      calls.push(`2dSetCameraTransform:${r}:${c}`),
    realm2dCreateMaterial: () => {},
    realm2dCreateSprite: (r: number, s: number) => calls.push(`2dCreateSprite:${r}:${s}`),
    realm2dSetSpriteTransform: (r: number, s: number) =>
      calls.push(`2dSetSpriteTransform:${r}:${s}`),
    realm2dCreateShape: (r: number, s: number) => calls.push(`2dCreateShape:${r}:${s}`),
    realm2dSetShapeTransform: (r: number, s: number) => calls.push(`2dSetShapeTransform:${r}:${s}`),
    realm2dCreateLight: (r: number, l: number) => calls.push(`2dCreateLight:${r}:${l}`),
    realm2dSetLightTransform: (r: number, l: number) => calls.push(`2dSetLightTransform:${r}:${l}`),
    realm2dSetShadowConfig: () => {},
    realm2dCreateParticleEmitter: () => {},
    realm2dSetParticleEmitterTransform: () => {},
    realm2dParticleEmitterBurst: () => {},
    realm2dDestroyParticleEmitter: () => {},
    realm2dDestroyCamera: (r: number, c: number) => calls.push(`2dDestroyCamera:${r}:${c}`),
    realm2dDestroyMaterial: () => {},
    realm2dDestroySprite: (r: number, s: number) => calls.push(`2dDestroySprite:${r}:${s}`),
    realm2dDestroyShape: () => {},
    realm2dDestroyLight: (r: number, l: number) => calls.push(`2dDestroyLight:${r}:${l}`),
    realm2dGetSpriteTransform: () => ({ position: [0, 0] }),
    realm2dGetCameraTransform: () => ({ position: [0, 0] }),
    realm2dCreateSvg: () => {},
    realm2dSetSvgSource: () => {},
    realm2dSetSvgAttribute: () => {},
    realm2dRemoveSvgAttribute: () => {},
    realm2dSetSvgText: () => {},
    realm2dSetSvgTransform: () => {},
    realm2dDestroySvg: () => {},
    realm2dLoadFontData: () => ''
  } as any as GalfusEngine;
}

describe('Phases F11 to F14 — Scheduler, DirtyRegistry & Incremental Sync', () => {
  describe('F11: System Scheduler & Priority Isolation', () => {
    test('enforces strict priority order and clamps user priorities away from reserved slots', () => {
      const world = new EcsWorld();
      const order: string[] = [];

      // User system with extreme low priority (-10,000,000) -> clamped to MIN_USER_PRIORITY (-999,999)
      world.addSystem('preRender', () => order.push('user_low'), { priority: -10_000_000 });
      // User system with normal priority 0
      world.addSystem('preRender', () => order.push('user_mid'), { priority: 0 });
      // User system with extreme high priority (+10,000,000) -> clamped to MAX_USER_PRIORITY (999,999)
      world.addSystem('preRender', () => order.push('user_high'), { priority: 10_000_000 });

      // Internal systems with reserved priorities
      world.addSystem('preRender', () => order.push('anchor_solver'), { kind: 'anchor' });
      world.addSystem('preRender', () => order.push('skinning_solver'), {
        kind: 'sync',
        priority: RESERVED_PRIORITY_INTERNAL_RESOLVERS
      });
      world.addSystem('preRender', () => order.push('realm_sync'), {
        kind: 'sync',
        priority: RESERVED_PRIORITY_REALM_SYNC
      });

      world.stepPreRender({ time: 0, dt: 0.016, frameId: 1 });

      // Order must be: user_high (999,999) -> user_mid (0) -> user_low (-999,999) -> anchor_solver (-1,000,000) -> skinning_solver (-2,000,000) -> realm_sync (-3,000,000)
      expect(order).toEqual([
        'user_high',
        'user_mid',
        'user_low',
        'anchor_solver',
        'skinning_solver',
        'realm_sync'
      ]);
    });

    test('executes postRender systems strictly after Multiverse dispatch', () => {
      const calls: string[] = [];
      const engine = createMockEngine(calls);

      const fakeTransport: any = {
        isDisposed: false,
        isInitialized: true,
        engine,
        init: async () => {},
        startLoop: () => {},
        stopLoop: () => {},
        dispose: () => {}
      };

      const runtime = new MultiverseRuntime(fakeTransport);
      const realm = runtime.createRealm3D(10);

      realm.world.addSystem('postRender', () => {
        calls.push('postRender_system_executed');
      });

      runtime.tick(0.016);

      const dispatchIdx = calls.findIndex((c) => c.startsWith('dispatch:'));
      const postRenderIdx = calls.indexOf('postRender_system_executed');

      expect(dispatchIdx).toBeGreaterThanOrEqual(0);
      expect(postRenderIdx).toBeGreaterThan(dispatchIdx);
    });
  });

  describe('F12: DirtyRegistry Coalescence & Lifecycle', () => {
    test('coalesces multiple mutations in the same frame and increments revision', () => {
      const registry = new DirtyRegistry<string>();

      registry.recordCreate(1, 100, 'Initial');
      registry.recordMutation(1, 100, 'Mutated 1');
      registry.recordMutation(1, 100, 'Mutated 2');

      expect(registry.pendingCount).toBe(1);
      const pending = registry.getPendingDirty();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.op).toBe('create');
      expect(pending[0]!.currentRevision).toBe(3);
      expect(pending[0]!.payload).toBe('Mutated 2');

      registry.confirmSync(1, 100);
      expect(registry.pendingCount).toBe(0);

      // Now that it is confirmed, subsequent mutations change op to 'update'
      registry.recordMutation(1, 100, 'Mutated 3');
      expect(registry.pendingCount).toBe(1);
      expect(registry.getPendingDirty()[0]!.op).toBe('update');
    });

    test('coalesces create + destroy within uncommitted frame to zero ABI calls', () => {
      const registry = new DirtyRegistry<string>();

      registry.recordCreate(1, 500, 'Ephemeral');
      expect(registry.pendingCount).toBe(1);

      // Destroy before first sync
      const needsDestroy = registry.recordDestroy(1, 500);
      expect(needsDestroy).toBe(false);
      expect(registry.pendingCount).toBe(0);
      expect(registry.has(1, 500)).toBe(false);
      expect(registry.getPendingDirty()).toHaveLength(0);
    });

    test('records destroy for previously synced objects and cleans up upon confirmation', () => {
      const registry = new DirtyRegistry<string>();

      registry.recordCreate(1, 600, 'Persistent');
      registry.confirmSync(1, 600);

      const needsDestroy = registry.recordDestroy(1, 600);
      expect(needsDestroy).toBe(true);
      expect(registry.pendingCount).toBe(1);
      expect(registry.getPendingDirty()[0]!.op).toBe('destroy');

      registry.confirmSync(1, 600);
      expect(registry.has(1, 600)).toBe(false);
      expect(registry.pendingCount).toBe(0);
    });
  });

  describe('F13: Incremental Sync for Realm3D (HOST-025 / HOST-030)', () => {
    test('produces ZERO setModelTransform ABI calls for static 3D models', () => {
      const calls: string[] = [];
      const engine = createMockEngine(calls);
      const realm = new Realm3D(10);
      realm.bindEngine(engine);

      // Spawn 50 static 3D models
      for (let i = 1; i <= 50; i++) {
        realm.createSpatialNode({ position: [i, 0, 0] });
      }

      // Frame 1: Initial upload creates all 50 models
      realm.sync({ time: 0, dt: 0.016, frameId: 1, engine });
      const createCalls = calls.filter((c) => c.startsWith('3dCreateModel:'));
      expect(createCalls).toHaveLength(50);

      calls.length = 0; // Clear recorded calls

      // Frame 2: Static scene (no transform modifications)
      realm.sync({ time: 0.016, dt: 0.016, frameId: 2, engine });
      const transformCallsF2 = calls.filter((c) => c.startsWith('3dSetModelTransform:'));
      expect(transformCallsF2).toHaveLength(0); // ZERO calls!

      // Frame 3: Mutate only 1 model
      const firstEntity = realm.world.query('Model3D')[0];
      const model = realm.world.getComponent<any>(firstEntity!, 'Model3D');
      model.setPosition([99, 99, 99]);

      realm.sync({ time: 0.032, dt: 0.016, frameId: 3, engine });
      const transformCallsF3 = calls.filter((c) => c.startsWith('3dSetModelTransform:'));
      expect(transformCallsF3).toHaveLength(1); // Exactly 1 ABI call!
    });

    test('cleans up 3D camera and light upon entity destruction', () => {
      const calls: string[] = [];
      const engine = createMockEngine(calls);
      const realm = new Realm3D(10);
      realm.bindEngine(engine);

      const cam = realm.createCamera({ fovY: 60, near: 0.1, far: 1000 });
      const lightEntity = realm.createLight({ kind: 'point', color: [1, 1, 1], intensity: 10 });
      const lightComp = realm.world.getComponent<any>(lightEntity, 'Light3D');

      realm.sync({ time: 0, dt: 0.016, frameId: 1, engine });
      expect(calls).toContain(`3dCreateCamera:10:${cam.cameraId}`);
      expect(calls).toContain(`3dCreateLight:10:${lightComp.lightId}`);

      realm.world.destroyEntity(cam.entityId);
      realm.world.destroyEntity(lightEntity);

      realm.sync({ time: 0.016, dt: 0.016, frameId: 2, engine });
      expect(calls).toContain(`3dDestroyCamera:10:${cam.cameraId}`);
      expect(calls).toContain(`3dDestroyLight:10:${lightComp.lightId}`);
    });

    test('synchronizes transforms for compound entities (Mesh3D + Light3D) without premature dirty clearance', () => {
      const calls: string[] = [];
      const engine = createMockEngine(calls);
      const realm = new Realm3D(10);
      realm.bindEngine(engine);

      // Create an entity with both Mesh3D and Light3D
      const entityId = realm.createSpatialNode({ position: [0, 1, 0] });
      realm.createMesh(entityId, { geometryId: 1, materialId: 2 });
      const lightComp: Light3DComponent = {
        type: 'Light3D',
        lightId: 101,
        desc: { kind: 'point', color: [1, 1, 0], intensity: 10 },
        isDirty: false
      };
      realm.world.attachComponent(entityId, lightComp);
      const model = realm.world.getComponent<any>(entityId, 'Model3D');

      // Frame 1: Creation
      realm.sync({ time: 0, dt: 0.016, frameId: 1, engine });
      expect(calls).toContain(`3dCreateModel:10:${model.modelId}`);
      expect(calls).toContain('3dCreateLight:10:101');

      calls.length = 0;

      // Frame 2: Static
      realm.sync({ time: 0.016, dt: 0.016, frameId: 2, engine });
      expect(calls.filter((c) => c.startsWith('3dSetModelTransform:'))).toHaveLength(0);
      expect(calls.filter((c) => c.startsWith('3dSetLightTransform:'))).toHaveLength(0);

      // Frame 3: Move the compound entity
      model.setPosition([10, 20, 30]);
      realm.sync({ time: 0.032, dt: 0.016, frameId: 3, engine });

      // BOTH model and light MUST receive the updated transform!
      const modelTfCalls = calls.filter((c) => c.startsWith('3dSetModelTransform:'));
      const lightTfCalls = calls.filter((c) => c.startsWith('3dSetLightTransform:'));
      expect(modelTfCalls).toHaveLength(1);
      expect(lightTfCalls).toHaveLength(1);
    });
  });

  describe('F14: Incremental Sync for Realm2D', () => {
    test('produces ZERO setSpriteTransform ABI calls for static 2D sprites', () => {
      const calls: string[] = [];
      const engine = createMockEngine(calls);
      const realm = new Realm2D(20);
      realm.bindEngine(engine);

      const spriteEntity = realm.createSprite({ dimensions: [32, 32] }, { position: [10, 20] });
      const spriteComp = realm.world.getComponent<any>(spriteEntity, 'Sprite2D');
      const modelComp = realm.world.getComponent<any>(spriteEntity, 'Model2D');

      // Frame 1: Creation upload
      realm.sync({ time: 0, dt: 0.016, frameId: 1, engine });
      expect(calls).toContain(`2dCreateSprite:20:${spriteComp.spriteId}`);

      calls.length = 0;

      // Frame 2: Static scene
      realm.sync({ time: 0.016, dt: 0.016, frameId: 2, engine });
      const transformCallsF2 = calls.filter((c) => c.startsWith('2dSetSpriteTransform:'));
      expect(transformCallsF2).toHaveLength(0); // ZERO calls!

      // Frame 3: Move sprite
      modelComp.setPosition([50, 50]);
      realm.sync({ time: 0.032, dt: 0.016, frameId: 3, engine });
      const transformCallsF3 = calls.filter((c) => c.startsWith('2dSetSpriteTransform:'));
      expect(transformCallsF3).toHaveLength(1);
    });

    test('cleans up 2D camera and light upon entity destruction', () => {
      const calls: string[] = [];
      const engine = createMockEngine(calls);
      const realm = new Realm2D(20);
      realm.bindEngine(engine);

      const cam = realm.createCamera({ orthoScale: 1.0 });
      const lightEntity = realm.createLight({
        color: [1, 1, 1],
        intensity: 5,
        range: 100
      });
      const lightComp = realm.world.getComponent<any>(lightEntity, 'Light2D');

      realm.sync({ time: 0, dt: 0.016, frameId: 1, engine });
      expect(calls).toContain(`2dCreateCamera:20:${cam.cameraId}`);
      expect(calls).toContain(`2dCreateLight:20:${lightComp.lightId}`);

      realm.world.destroyEntity(cam.entityId);
      realm.world.destroyEntity(lightEntity);

      realm.sync({ time: 0.016, dt: 0.016, frameId: 2, engine });
      expect(calls).toContain(`2dDestroyCamera:20:${cam.cameraId}`);
      expect(calls).toContain(`2dDestroyLight:20:${lightComp.lightId}`);
    });

    test('synchronizes transforms for compound entities (Sprite2D + Light2D) without premature dirty clearance', () => {
      const calls: string[] = [];
      const engine = createMockEngine(calls);
      const realm = new Realm2D(20);
      realm.bindEngine(engine);

      // Create an entity with both Sprite2D and Light2D
      const spriteEntity = realm.createSprite({ dimensions: [32, 32] }, { position: [5, 15] });
      const spriteComp = realm.world.getComponent<any>(spriteEntity, 'Sprite2D');
      const modelComp = realm.world.getComponent<any>(spriteEntity, 'Model2D');

      const lightComp: Light2DComponent = {
        type: 'Light2D',
        lightId: 202,
        desc: { color: [1, 0, 0], intensity: 2, range: 50 },
        isDirty: false
      };
      realm.world.attachComponent(spriteEntity, lightComp);

      // Frame 1: Creation
      realm.sync({ time: 0, dt: 0.016, frameId: 1, engine });
      expect(calls).toContain(`2dCreateSprite:20:${spriteComp.spriteId}`);
      expect(calls).toContain('2dCreateLight:20:202');

      calls.length = 0;

      // Frame 2: Static
      realm.sync({ time: 0.016, dt: 0.016, frameId: 2, engine });
      expect(calls.filter((c) => c.startsWith('2dSetSpriteTransform:'))).toHaveLength(0);
      expect(calls.filter((c) => c.startsWith('2dSetLightTransform:'))).toHaveLength(0);

      // Frame 3: Move the compound entity
      modelComp.setPosition([100, 200]);
      realm.sync({ time: 0.032, dt: 0.016, frameId: 3, engine });

      // BOTH sprite and light MUST receive the updated transform!
      const spriteTfCalls = calls.filter((c) => c.startsWith('2dSetSpriteTransform:'));
      const lightTfCalls = calls.filter((c) => c.startsWith('2dSetLightTransform:'));
      expect(spriteTfCalls).toHaveLength(1);
      expect(lightTfCalls).toHaveLength(1);
    });
  });
});
