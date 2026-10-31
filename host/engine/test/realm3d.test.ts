import { describe, expect, it } from 'bun:test';
import { Realm3D } from '../src/realm3d/index';
import { createAnchor } from '../src/anchors/index';
import type { GalfusEngine, Transform3D } from '@galfus/transport-types';

describe('@galfus/engine > Realm3D', () => {
  it('creates entities and synchronizes them to GalfusEngine with resolved anchors', () => {
    const realm = new Realm3D(20);
    const calls: string[] = [];
    const modelTransforms = new Map<number, Transform3D>();

    const mockEngine = {
      realm3dCreate: (id: number) => calls.push(`realm3dCreate:${id}`),
      realm3dDestroy: (id: number) => calls.push(`realm3dDestroy:${id}`),
      realm3dCreateCube: (r: number, g: number) => calls.push(`createCube:${r}:${g}`),
      realm3dCreateModel: (r: number, m: number, _desc: unknown, tf: Transform3D) => {
        calls.push(`createModel:${r}:${m}`);
        modelTransforms.set(m, tf);
      },
      realm3dSetModelTransform: (r: number, m: number, tf: Transform3D) => {
        calls.push(`setModelTransform:${r}:${m}`);
        modelTransforms.set(m, tf);
      },
      realm3dDestroyModel: (r: number, m: number) => calls.push(`destroyModel:${r}:${m}`),
      realm3dDestroyGeometry: (r: number, g: number) => calls.push(`destroyGeometry:${r}:${g}`),
      realm3dCreateCamera: (r: number, c: number) => calls.push(`createCamera:${r}:${c}`),
      realm3dSetCameraTransform: () => {},
      realm3dDestroyCamera: () => {},
      realm3dCreateLight: (r: number, l: number) => calls.push(`createLight:${r}:${l}`),
      realm3dSetLightTransform: () => {},
      realm3dDestroyLight: () => {},
      realm3dCreateMaterial: (r: number, m: number) => calls.push(`createMaterial:${r}:${m}`),
      realm3dDestroyMaterial: () => {}
    } as unknown as GalfusEngine;

    realm.bindEngine(mockEngine);
    expect(calls).toContain('realm3dCreate:20');

    // 1. Create a parent entity at [0, 50, 0]
    const parentEntity = realm.createSpatialNode({ position: [0, 50, 0] });

    // 2. Create material and a cube anchored to parent at [10, 5, 0]
    const { materialId } = realm.createMaterial({ baseColor: [1, 1, 1, 1] });
    const { entityId: cubeEntity, modelId } = realm.createCube(1.0, materialId, {
      position: [10, 5, 0]
    });
    realm.world.attachComponent(cubeEntity, createAnchor({ targetEntityId: parentEntity }));

    // 3. Create camera
    realm.createCamera({ fovY: 60, near: 0.1, far: 1000 }, { position: [0, 10, -50] });

    // 4. Step & Sync frame
    realm.sync({ time: 0, dt: 0.016, frameId: 1, engine: mockEngine });

    // Verify calls
    expect(calls).toContain('createMaterial:20:2');
    expect(calls).toContain('createCube:20:3');
    expect(calls).toContain(`createModel:20:${modelId}`);
    expect(calls).toContain('createCamera:20:5');

    // Verify anchored world transform: [0 + 10, 50 + 5, 0 + 0] = [10, 55, 0]
    const tf = modelTransforms.get(modelId);
    expect(tf).toBeDefined();
    if (tf) {
      const pos = tf.position;
      expect(pos[0]).toBeCloseTo(10);
      expect(pos[1]).toBeCloseTo(55);
      expect(pos[2]).toBeCloseTo(0);
    }

    // 5. Destroy cube entity and re-sync (Geometry survives entity destruction HOST-024)
    realm.world.destroyEntity(cubeEntity);
    realm.sync({ time: 0.016, dt: 0.016, frameId: 2, engine: mockEngine });

    expect(calls).toContain(`destroyModel:20:${modelId}`);
    expect(calls).not.toContain('destroyGeometry:20:3');

    // 6. Dispose realm
    realm.dispose();
    expect(calls).toContain('realm3dDestroy:20');
  });

  it('supports advanced primitives, particles, portals, instanced models, and debug gizmos', () => {
    const realm = new Realm3D(30);
    const calls: string[] = [];

    const mockEngine = {
      realm3dCreate: () => {},
      realm3dDestroy: () => {},
      realm3dCreateCylinder: (r: number, g: number) => calls.push(`createCylinder:${r}:${g}`),
      realm3dCreateCapsule: (r: number, g: number) => calls.push(`createCapsule:${r}:${g}`),
      realm3dCreatePyramid: (r: number, g: number) => calls.push(`createPyramid:${r}:${g}`),
      realm3dCreateTorus: (r: number, g: number) => calls.push(`createTorus:${r}:${g}`),
      realm3dCreateGeometry: (r: number, g: number) => calls.push(`createCustom:${r}:${g}`),
      realm3dCreateModel: () => {},
      realm3dSetModelTransform: () => {},
      realm3dDestroyModel: () => {},
      realm3dDestroyGeometry: () => {},
      realm3dCreateMaterial: () => {},
      realm3dDestroyMaterial: () => {},
      realm3dCreateParticleEmitter: (r: number, e: number) => calls.push(`createEmitter:${r}:${e}`),
      realm3dSetParticleEmitterTransform: () => {},
      realm3dDestroyParticleEmitter: () => {},
      realm3dParticleEmitterBurst: (r: number, e: number, c: number) =>
        calls.push(`burst:${r}:${e}:${c}`),
      realm3dCreatePortal: (r: number, p: number) => calls.push(`createPortal:${r}:${p}`),
      realm3dSetPortalActive: (r: number, p: number, a: boolean) =>
        calls.push(`portalActive:${r}:${p}:${a}`),
      realm3dDestroyPortal: () => {},
      realm3dCreateInstancedModel: (r: number, im: number) =>
        calls.push(`createInstanced:${r}:${im}`),
      realm3dDestroyInstancedModel: () => {},
      realm3dSetCameraLookAt: () => calls.push('setLookAt'),
      realm3dDrawLine: () => calls.push('drawLine'),
      realm3dDrawAabb: () => calls.push('drawAabb'),
      realm3dClearGizmos: () => calls.push('clearGizmos')
    } as unknown as GalfusEngine;

    realm.bindEngine(mockEngine);

    // 1. Test primitives
    realm.createCylinder(1, 2, 16, 1);
    realm.createCapsule(1, 2, 4, 16, 1);
    realm.createPyramid(2, 2, 3, 1);
    realm.createTorus(2, 0.5, 16, 16, 1);

    const vertexBytes = new Uint8Array([0, 1, 2, 3]);
    const indices = new Uint32Array([0, 1, 2]);
    realm.createCustomGeometry(0, vertexBytes, indices, 1);

    // 2. Test particle emitter & portal & instanced model
    const emitterEntity = realm.createParticleEmitter({
      maxParticles: 100,
      spawnRate: 10
    });
    realm.particleEmitterBurst(1, 25);

    const portalEntity = realm.createPortal({
      modelId: 1,
      active: true
    });
    realm.setPortalActive(1, true);

    realm.createInstancedModel({
      geometryId: 1,
      materialId: 1,
      capacity: 50
    });

    // 3. Test gizmos & lookAt
    realm.setCameraLookAt(1, { target: [0, 0, 0] });
    realm.drawLine(0, 0, 0, 1, 1, 1, 1, 1, 1, 1);
    realm.drawAabb(-1, -1, -1, 1, 1, 1, 1, 1, 1, 1);
    realm.clearGizmos();

    // 4. Sync
    realm.sync({ time: 0, dt: 0.016, frameId: 1, engine: mockEngine });

    expect(calls).toContain('createCylinder:30:1');
    expect(calls).toContain('createCapsule:30:3');
    expect(calls).toContain('createPyramid:30:5');
    expect(calls).toContain('createTorus:30:7');
    expect(calls).toContain('createCustom:30:9');
    expect(calls).toContain('createEmitter:30:11');
    expect(calls).toContain('burst:30:1:25');
    expect(calls).toContain('createPortal:30:12');
    expect(calls).toContain('portalActive:30:1:true');
    expect(calls).toContain('createInstanced:30:13');
    expect(calls).toContain('setLookAt');
    expect(calls).toContain('drawLine');
    expect(calls).toContain('drawAabb');
    expect(calls).toContain('clearGizmos');

    realm.dispose();
  });
});
