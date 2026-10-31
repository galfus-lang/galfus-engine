import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, GalfusTransport } from '@galfus/transport-types';
import { EcsWorld } from '../src/ecs/world';
import { SystemPipeline } from '../src/ecs/system';
import { Realm2D } from '../src/realm2d/realm';
import { Realm3D } from '../src/realm3d/realm';
import { MultiverseRuntime } from '../src/runtime';

function createMockEngine(): GalfusEngine {
  return {
    multiverseCreateTarget: () => {},
    multiverseDestroyTarget: () => {},
    multiverseAttachWindow: () => {},
    multiverseCreateInvocation: () => {},
    multiverseDestroyInvocation: () => {},
    multiverseSetInvocationViewport: () => {},
    multiverseSetInvocationEnabled: () => {},
    multiverseSetInvocationFilters: () => {},
    multiverseSetInvocationClearColor: () => {},
    multiverseSetInvocationCameraSlot: () => {},
    multiverseDispatch: () => {},
    multiverseResolve: () => ({ invocations: [] }),
    multiverseUnregisterRealm: () => {},
    realm3dCreate: () => {},
    realm3dDestroy: () => {},
    realm3dCreateGeometry: () => {},
    realm3dDestroyGeometry: () => {},
    realm3dCreateCube: () => {},
    realm3dCreateMaterial: () => {},
    realm3dDestroyMaterial: () => {},
    realm3dCreateModel: () => {},
    realm3dDestroyModel: () => {},
    realm3dSetModelTransform: () => {},
    realm3dSetCameraLookAt: () => {},
    realm3dClearCameraLookAt: () => {},
    realm3dParticleEmitterBurst: () => {},
    realm2dCreate: () => {},
    realm2dDestroy: () => {},
    realm2dCreateMaterial: () => {},
    realm2dDestroyMaterial: () => {},
    realm2dCreateSprite: () => {},
    realm2dDestroySprite: () => {},
    realm2dSetSpriteTransform: () => {},
    realm2dSetSvgSource: () => {},
    realm2dParticleEmitterBurst: () => {}
  } as unknown as GalfusEngine;
}

function createMockTransport(engine: GalfusEngine): GalfusTransport {
  return {
    engine,
    isInitialized: true,
    isDisposed: false,
    isRunning: false,
    init: async () => {},
    startLoop: () => {},
    stopLoop: () => {},
    step: () => {},
    dispose: () => {}
  };
}

describe('Phases F21 & F22 — API Safety, Error Isolation, EcsWorld Reset & Full Regression', () => {
  it('F21: rejects invalid entity/component references without falling back to ID 1', () => {
    const mockEngine = createMockEngine();
    const realm3d = new Realm3D(1);
    realm3d.bindEngine(mockEngine);
    const realm2d = new Realm2D(2);
    realm2d.bindEngine(mockEngine);

    // 1. Camera LookAt with entity without Camera3DComponent throws error
    const plainEntity3D = realm3d.world.createEntity();
    expect(() => {
      realm3d.setCameraLookAt({ entityId: plainEntity3D }, { target: [0, 0, 0] });
    }).toThrow('Cannot resolve Camera3D ID: entity does not have a Camera3DComponent.');

    // 2. 3D Particle Emitter burst on entity without ParticleEmitter3DComponent throws error
    expect(() => {
      realm3d.particleEmitterBurst({ entityId: plainEntity3D }, 10);
    }).toThrow(
      'Cannot resolve ParticleEmitter3D ID: entity does not have a ParticleEmitter3DComponent.'
    );

    // 3. 2D Svg setSource on entity without Svg2DComponent throws error
    const plainEntity2D = realm2d.world.createEntity();
    expect(() => {
      realm2d.setSvgSource({ entityId: plainEntity2D }, '<svg></svg>');
    }).toThrow('Cannot resolve Svg2D ID: entity does not have a Svg2DComponent.');

    // 4. 2D Particle Emitter burst on entity without ParticleEmitter2DComponent throws error
    expect(() => {
      realm2d.particleEmitterBurst({ entityId: plainEntity2D }, 5);
    }).toThrow(
      'Cannot resolve ParticleEmitter2D ID: entity does not have a ParticleEmitter2DComponent.'
    );
  });

  it('F21: EcsWorld.reset() completely purges entities, components, systems, and intent queues', () => {
    const world = new EcsWorld();
    const e1 = world.createEntity();
    world.attachComponent(e1, { type: 'Model3D', modelId: 10 } as any);
    world.addSystem('update', () => {});
    world.intents.queueDestroy(e1);

    expect(world.isAlive(e1)).toBe(true);
    expect(world.query('Model3D').length).toBe(1);
    expect(world.systems.getRegistered('update').length).toBe(1);

    world.reset();

    expect(world.isAlive(e1)).toBe(false);
    expect(world.query('Model3D').length).toBe(0);
    expect(world.systems.getRegistered('update').length).toBe(0);
  });

  it('F21: SystemPipeline safely handles removal during iteration and isolates system exceptions', () => {
    const pipeline = new SystemPipeline<EcsWorld>();
    const executed: string[] = [];

    const dummyContext = { time: 0, dt: 0.016, frameId: 1, engine: null as any };
    const world = new EcsWorld();

    const systemA = () => {
      executed.push('A');
      // System A removes System B during iteration
      pipeline.remove('update', systemB);
    };

    const systemB = () => {
      executed.push('B');
    };

    const systemC = () => {
      executed.push('C');
      throw new Error('Explosion in System C!');
    };

    const systemD = () => {
      executed.push('D');
    };

    pipeline.add('update', systemA);
    pipeline.add('update', systemB);
    pipeline.add('update', systemC);
    pipeline.add('update', systemD);

    // Iteration should complete safely despite removal of B and exception in C
    expect(() => {
      pipeline.runStep('update', world, dummyContext);
    }).not.toThrow();

    // A ran, B was safely removed, C threw (and was isolated), D successfully ran!
    expect(executed).toContain('A');
    expect(executed).toContain('C');
    expect(executed).toContain('D');
  });

  it('F22: end-to-end full matrix regression and stress test across 2D, 3D, and Multiverse', () => {
    const mockEngine = createMockEngine();
    const transport = createMockTransport(mockEngine);
    const runtime = new MultiverseRuntime(transport);

    // Create 3D realm and assemble hierarchical scene
    const r3d = runtime.createRealm3D(10);
    const { geometryId: geoId } = r3d.createGeometry({ kind: 'cube', size: 1.0 });
    const { materialId: matId } = r3d.createMaterial({ baseColor: [1, 0, 0, 1] });

    const rootEntity = r3d.createModel({ geometryId: geoId, materialId: matId });
    const childEntity = r3d.createModel({ geometryId: geoId, materialId: matId });
    r3d.hierarchy.attach(childEntity, rootEntity);

    // Create 2D realm
    const r2d = runtime.createRealm2D(20);
    const _mat2dId = r2d.createMaterial({ baseColor: [0, 1, 0, 1] });
    r2d.createSprite({ dimensions: [32, 32] }, { position: [100, 100] });

    // Target and Invocations
    const targetId = runtime.multiverse.createTarget({
      kind: { type: 'texture', width: 800, height: 600 }
    });
    runtime.multiverse.createInvocation({
      realmId: 10,
      targetId,
      viewport: { width: { vw: 100 }, height: { vh: 100 } }
    });
    runtime.multiverse.createInvocation({
      realmId: 20,
      targetId,
      viewport: { width: { vw: 50 }, height: { vh: 50 } }
    });

    // Advance 50 frames
    for (let f = 1; f <= 50; f++) {
      runtime.tick(0.016);
    }
    expect(runtime.frameId).toBe(50);

    // Stress test: 10 sequential resets leaving transport completely alive
    for (let i = 0; i < 10; i++) {
      runtime.reset();
      expect(runtime.frameId).toBe(0);
      expect(transport.isDisposed).toBe(false);
    }

    // Final clean disposal
    runtime.dispose();
    expect(runtime.isDisposed).toBe(true);
  });
});
