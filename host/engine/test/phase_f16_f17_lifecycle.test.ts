import { describe, expect, it } from 'bun:test';
import type {
  GalfusEngine,
  InvocationDesc,
  Model3DDesc,
  TargetDesc,
  ViewportRect
} from '@galfus/transport-types';
import { MultiverseCoordinator } from '../src/multiverse/coordinator';
import { Realm2D } from '../src/realm2d/realm';
import { Realm3D } from '../src/realm3d/realm';
import { MultiverseRuntime } from '../src/runtime';

function createMockEngine(): GalfusEngine & {
  calls: Record<string, number>;
  activeRealms3D: Set<number>;
  activeRealms2D: Set<number>;
  activeModels3D: Set<string>;
  activeTargets: Set<number>;
  activeInvocations: Set<number>;
  activeTextures: Set<number>;
} {
  const calls: Record<string, number> = {};
  const count = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1;
  };

  const activeRealms3D = new Set<number>();
  const activeRealms2D = new Set<number>();
  const activeModels3D = new Set<string>();
  const activeTargets = new Set<number>();
  const activeInvocations = new Set<number>();
  const activeTextures = new Set<number>();

  const engine = {
    calls,
    activeRealms3D,
    activeRealms2D,
    activeModels3D,
    activeTargets,
    activeInvocations,
    activeTextures,

    // Multiverse
    multiverseCreateTarget(targetId: number, _desc: TargetDesc) {
      count('multiverseCreateTarget');
      activeTargets.add(targetId);
    },
    multiverseDestroyTarget(targetId: number) {
      count('multiverseDestroyTarget');
      activeTargets.delete(targetId);
    },
    multiverseCreateInvocation(invocationId: number, _desc: InvocationDesc) {
      count('multiverseCreateInvocation');
      activeInvocations.add(invocationId);
    },
    multiverseDestroyInvocation(invocationId: number) {
      count('multiverseDestroyInvocation');
      activeInvocations.delete(invocationId);
    },
    multiverseUnregisterRealm(_realmId: number) {
      count('multiverseUnregisterRealm');
    },
    multiverseDispatch(_frameId?: number, _dt?: number) {
      count('multiverseDispatch');
    },

    // Realm 3D
    realm3dCreate(realmId: number) {
      count('realm3dCreate');
      activeRealms3D.add(realmId);
    },
    realm3dDestroy(realmId: number) {
      count('realm3dDestroy');
      activeRealms3D.delete(realmId);
    },
    realm3dCreateModel(realmId: number, modelId: number, _desc: Model3DDesc, _tf: any) {
      count('realm3dCreateModel');
      activeModels3D.add(`${realmId}:${modelId}`);
    },
    realm3dDestroyModel(realmId: number, modelId: number) {
      count('realm3dDestroyModel');
      activeModels3D.delete(`${realmId}:${modelId}`);
    },
    realm3dCreateGeometry(_realmId: number, _geometryId: number, _data: any) {
      count('realm3dCreateGeometry');
    },
    realm3dDestroyGeometry(_realmId: number, _geometryId: number) {
      count('realm3dDestroyGeometry');
    },
    realm3dCreateMaterial(_realmId: number, _materialId: number, _desc: any) {
      count('realm3dCreateMaterial');
    },
    realm3dDestroyMaterial(_realmId: number, _materialId: number) {
      count('realm3dDestroyMaterial');
    },

    // Realm 2D
    realm2dCreate(realmId: number) {
      count('realm2dCreate');
      activeRealms2D.add(realmId);
    },
    realm2dDestroy(realmId: number) {
      count('realm2dDestroy');
      activeRealms2D.delete(realmId);
    },
    realm2dCreateModel(_realmId: number, _modelId: number, _desc: any, _tf: any) {
      count('realm2dCreateModel');
    },
    realm2dDestroyModel(_realmId: number, _modelId: number) {
      count('realm2dDestroyModel');
    },

    // Resources & Audio & Windows
    resourceCreateTexture(textureId: number, _desc: any) {
      count('resourceCreateTexture');
      activeTextures.add(textureId);
    },
    resourceDisposeTexture(textureId: number) {
      count('resourceDisposeTexture');
      activeTextures.delete(textureId);
    },
    audioUnloadSound(_soundId: number) {
      count('audioUnloadSound');
    },
    windowClose(_windowId: number) {
      count('windowClose');
    }
  } as unknown as GalfusEngine & {
    calls: Record<string, number>;
    activeRealms3D: Set<number>;
    activeRealms2D: Set<number>;
    activeModels3D: Set<string>;
    activeTargets: Set<number>;
    activeInvocations: Set<number>;
    activeTextures: Set<number>;
  };

  return engine;
}

function createMockTransport(engine: GalfusEngine) {
  return {
    engine,
    name: 'mock',
    isHeadless: true,
    fps: 60,
    dispose: () => {}
  } as any;
}

describe('Phases F16 & F17: Lifecycle, Teardown, Reset and Disposal', () => {
  it('F16: destroyEntity detaches hierarchies and does not dispose independent assets', () => {
    const mockEngine = createMockEngine();
    const realm3d = new Realm3D(1);
    realm3d.bindEngine(mockEngine);

    // Register independent geometry and material
    const { geometryId: geoId } = realm3d.createGeometry({ kind: 'cube', size: 2.0 });
    const { materialId: matId } = realm3d.createMaterial({ baseColor: [1, 0, 0, 1] });

    // Create parent and child models
    const parentEntity = realm3d.createModel({ geometryId: geoId, materialId: matId });
    const childEntity = realm3d.createModel({ geometryId: geoId, materialId: matId });
    realm3d.hierarchy.attach(childEntity, parentEntity);

    expect(realm3d.hierarchy.isAttached(childEntity)).toBe(true);
    expect(realm3d.hierarchy.getDependents(parentEntity).length).toBe(1);

    // Destroy parent entity
    const destroyed = realm3d.destroyEntity(parentEntity);
    expect(destroyed).toBe(true);

    // Child is cleanly detached
    expect(realm3d.hierarchy.isAttached(childEntity)).toBe(false);

    // Assets survive entity destruction
    const geometries = [...realm3d.getGeometries()];
    const materials = [...realm3d.getMaterials()];
    expect(geometries.length).toBe(1);
    expect(materials.length).toBe(1);
    expect(geometries[0]?.geometryId).toBe(geoId);
    expect(materials[0]?.materialId).toBe(matId);
  });

  it('F16: realm.dispose() is idempotent, terminal, and unregisters associated multiverse invocations', () => {
    const mockEngine = createMockEngine();
    const multiverse = new MultiverseCoordinator();
    multiverse.bindEngine(mockEngine);

    const realm3d = new Realm3D(10);
    multiverse.registerRealm(realm3d);

    const targetId = multiverse.createTarget({
      kind: { type: 'texture', width: 800, height: 600 }
    });

    const viewport: ViewportRect = { width: { px: 800 }, height: { px: 600 } };
    const invId = multiverse.createInvocation({
      realmId: 10,
      targetId,
      viewport,
      cameraSlot: 0
    });

    expect(mockEngine.activeInvocations.has(invId)).toBe(true);
    expect(mockEngine.activeRealms3D.has(10)).toBe(true);

    // Unregister realm from multiverse automatically destroys its invocations
    multiverse.unregisterRealm(10);

    expect(mockEngine.activeInvocations.has(invId)).toBe(false);
    expect(realm3d.isDisposed).toBe(true);
    expect(mockEngine.activeRealms3D.has(10)).toBe(false);

    // Idempotent: calling dispose again is completely safe
    expect(() => realm3d.dispose()).not.toThrow();
    expect(mockEngine.calls.realm3dDestroy).toBe(1);

    // Operations after disposal are rejected
    expect(() => realm3d.reset()).toThrow('Cannot reset a disposed Realm3D.');
  });

  it('F17: realm.reset() clears entities and local state, re-installs internal systems, and preserves realm object', () => {
    const mockEngine = createMockEngine();
    const realm3d = new Realm3D(1);
    realm3d.bindEngine(mockEngine);

    // Add entities and resources
    const { geometryId: geoId } = realm3d.createGeometry({ kind: 'cube', size: 1.0 });
    const { materialId: matId } = realm3d.createMaterial({ baseColor: [0, 1, 0, 1] });
    realm3d.createModel({ geometryId: geoId, materialId: matId });

    expect(realm3d.world.query('Model3D').length).toBe(1);

    // Reset realm
    realm3d.reset();

    // ECS and resources are cleared
    expect(realm3d.world.query('Model3D').length).toBe(0);
    expect([...realm3d.getGeometries()].length).toBe(0);
    expect([...realm3d.getMaterials()].length).toBe(0);

    // Internal systems (anchor solver & skinning) are cleanly re-installed
    const { geometryId: newGeo } = realm3d.createGeometry({ kind: 'cube', size: 2.0 });
    const { materialId: newMat } = realm3d.createMaterial({ baseColor: [0, 0, 1, 1] });
    const newEntity = realm3d.createModel({ geometryId: newGeo, materialId: newMat });

    expect(realm3d.world.query('Model3D').length).toBe(1);
    expect(realm3d.world.isAlive(newEntity)).toBe(true);
  });

  it('F17: runtime.reset() cleanly clears world and caches, leaving transport and runtime ready', () => {
    const mockEngine = createMockEngine();
    const transport = createMockTransport(mockEngine);
    const runtime = new MultiverseRuntime(transport);

    const realm3d = new Realm3D(1);
    runtime.multiverse.registerRealm(realm3d);

    const targetId = runtime.multiverse.createTarget({
      kind: { type: 'texture', width: 400, height: 300 }
    });

    runtime.multiverse.createInvocation({
      realmId: 1,
      targetId,
      viewport: { width: { px: 400 }, height: { px: 300 } },
      cameraSlot: 0
    });

    // Advance frame
    runtime.tick();
    expect(runtime.frameId).toBeGreaterThan(0);

    // Reset runtime
    runtime.reset();

    expect(runtime.state).toBe('ready');
    expect(runtime.frameId).toBe(0);
    expect(runtime.elapsedSeconds).toBe(0);
    expect(mockEngine.activeInvocations.size).toBe(0);
    expect(mockEngine.activeTargets.size).toBe(0);

    // Rebuilding a new scene works immediately
    const realm2d = new Realm2D(2);
    runtime.multiverse.registerRealm(realm2d);
    expect(runtime.multiverse.getRealm(2)).toBeDefined();
  });

  it('F17: 100 consecutive runtime resets execute without leaks or state corruption', () => {
    const mockEngine = createMockEngine();
    const transport = createMockTransport(mockEngine);
    const runtime = new MultiverseRuntime(transport);

    for (let i = 0; i < 100; i++) {
      const realm3d = new Realm3D(1);
      runtime.multiverse.registerRealm(realm3d);
      realm3d.createSpatialNode({ position: [i, 0, 0] });
      runtime.reset();
    }

    expect(runtime.state).toBe('ready');
    expect(runtime.frameId).toBe(0);
    expect(mockEngine.activeRealms3D.size).toBe(0);
  });

  it('F17: runtime.dispose() terminates resources and prohibits further resets', () => {
    const mockEngine = createMockEngine();
    const transport = createMockTransport(mockEngine);
    const runtime = new MultiverseRuntime(transport);

    const realm3d = new Realm3D(1);
    runtime.multiverse.registerRealm(realm3d);

    runtime.dispose();
    expect(runtime.state).toBe('disposed');

    // Idempotent dispose
    expect(() => runtime.dispose()).not.toThrow();

    // Reset after dispose must fail
    expect(() => runtime.reset()).toThrow('Cannot reset a disposed MultiverseRuntime.');
  });
});
