import { describe, expect, it } from 'bun:test';
import type { GalfusEngine } from '@galfus/transport-types';
import type { SystemContext } from '../src/ecs/system';
import { mat4, type Mat4, vec3 } from '../src/math/index';
import { Realm3D } from '../src/realm3d/realm';

describe('@galfus/engine > Skeletal Skinning & Hierarchy', () => {
  it('solves bone deformations using standard HierarchyCoordinator and AnchorMatrixCache', () => {
    const realm = new Realm3D(1);

    // Mock engine driver to capture realm3dUpdateBones calls
    let updatedModelId = -1;
    let uploadedMatrices: Float32Array | null = null;

    const mockEngine = {
      realm3dCreate: () => {},
      realm3dDestroy: () => {},
      realm3dCreateGeometry: () => {},
      realm3dCreateMaterial: () => {},
      realm3dCreateModel: () => {},
      realm3dSetModelTransform: () => {},
      realm3dUpdateBones: (_realmId: number, modelId: number, data: Float32Array) => {
        updatedModelId = modelId;
        uploadedMatrices = new Float32Array(data);
      }
    } as unknown as GalfusEngine;

    realm.bindEngine(mockEngine);

    // 1. Create a Skinned Model placed at position [10, 0, 0]
    realm.createMaterial({});
    const { geometryId } = realm.createGeometry({
      positions: new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0]),
      indices: new Uint32Array([0, 1, 2])
    });

    const modelEntity = realm.createModel({ geometryId, materialId: 1 }, { position: [10, 0, 0] });

    // 2. Create Skeletal Hierarchy:
    // Root bone "Hips" at position [10, 1, 0]
    const hipsBone = realm.createSpatialNode({ position: [10, 1, 0] });
    realm.setEntityName(hipsBone, 'Hips');

    // Child bone "Spine" with local offset [0, 1.5, 0] attached to Hips via HierarchyCoordinator
    const spineBone = realm.createSpatialNode({ position: [0, 1.5, 0] });
    realm.setEntityName(spineBone, 'Spine');
    realm.hierarchy.attach(spineBone, hipsBone);

    // 3. Define Inverse Bind Matrices (Rest Pose)
    // Hips rest pose was at [0, 1, 0] relative to model -> invBind translates by [0, -1, 0]
    const hipsInvBind = mat4.create();
    mat4.fromTranslation(hipsInvBind, [0, -1, 0]);

    // Spine rest pose was at [0, 2.5, 0] relative to model -> invBind translates by [0, -2.5, 0]
    const spineInvBind = mat4.create();
    mat4.fromTranslation(spineInvBind, [0, -2.5, 0]);

    const inverseBindMatrices = new Float32Array(32);
    inverseBindMatrices.set(hipsInvBind, 0);
    inverseBindMatrices.set(spineInvBind, 16);

    // 4. Attach Skin3DComponent to the Model
    const { skinId } = realm.createSkin(modelEntity, [hipsBone, spineBone], inverseBindMatrices);
    expect(skinId).toBeGreaterThan(0);

    // 5. Run simulation step
    const context: SystemContext = {
      time: 0.016,
      dt: 0.016,
      frameId: 1,
      engine: mockEngine
    };

    realm.sync(context);

    // Verify AnchorSolveSystem resolved hierarchy:
    // Hips world position = [10, 1, 0]
    const hipsWorld = realm.solver.cache.getWorld3D(hipsBone);
    expect(hipsWorld).toBeDefined();
    const hipsPos = vec3.create();
    mat4.getTranslation(hipsPos, hipsWorld!);
    expect(hipsPos[0]).toBeCloseTo(10);
    expect(hipsPos[1]).toBeCloseTo(1);
    expect(hipsPos[2]).toBeCloseTo(0);

    // Spine world position = Hips [10, 1, 0] + Local [0, 1.5, 0] = [10, 2.5, 0]
    const spineWorld = realm.solver.cache.getWorld3D(spineBone);
    expect(spineWorld).toBeDefined();
    const spinePos = vec3.create();
    mat4.getTranslation(spinePos, spineWorld!);
    expect(spinePos[0]).toBeCloseTo(10);
    expect(spinePos[1]).toBeCloseTo(2.5);
    expect(spinePos[2]).toBeCloseTo(0);

    // Verify SkinningSolveSystem sent bone matrices to engine
    const modelComp = realm.world.getComponent(modelEntity, 'Model3D') as any;
    expect(updatedModelId).toBe(modelComp.modelId);
    expect(uploadedMatrices).not.toBeNull();
    expect(uploadedMatrices!.length).toBe(32);

    // In this rest-pose test:
    // SkinMatrix = inv(ModelWorld) * JointWorld * InvBind
    // Model is at [10, 0, 0] -> inv(ModelWorld) translates by [-10, 0, 0]
    // Hips is at [10, 1, 0]
    // inv(ModelWorld) * Hips = [0, 1, 0]
    // [0, 1, 0] * invBind([0, -1, 0]) = Identity [0, 0, 0]!
    const mHips = uploadedMatrices!.subarray(0, 16);
    const mHipsPos = vec3.create();
    mat4.getTranslation(mHipsPos, mHips as unknown as Mat4);
    expect(mHipsPos[0]).toBeCloseTo(0);
    expect(mHipsPos[1]).toBeCloseTo(0);
    expect(mHipsPos[2]).toBeCloseTo(0);

    // Spine is at [10, 2.5, 0]
    // inv(ModelWorld) * Spine = [0, 2.5, 0]
    // [0, 2.5, 0] * invBind([0, -2.5, 0]) = Identity [0, 0, 0]!
    const mSpine = uploadedMatrices!.subarray(16, 32);
    const mSpinePos = vec3.create();
    mat4.getTranslation(mSpinePos, mSpine as unknown as Mat4);
    expect(mSpinePos[0]).toBeCloseTo(0);
    expect(mSpinePos[1]).toBeCloseTo(0);
    expect(mSpinePos[2]).toBeCloseTo(0);
  });

  it('allows attaching socket accessories (like weapons) directly to bone entities', () => {
    const realm = new Realm3D(2);

    // Bone at [0, 5, 0]
    const handBone = realm.createSpatialNode({ position: [0, 5, 0] });
    realm.setEntityName(handBone, 'RightHand');

    // Sword accessory attached to hand bone with local offset [0, 0, 1]
    const sword = realm.createSpatialNode({ position: [0, 0, 1] });
    realm.setEntityName(sword, 'Excalibur');

    realm.hierarchy.attach(sword, handBone);

    // Solve frame
    realm.sync({
      time: 0,
      dt: 0.016,
      frameId: 1
    });

    // Sword world position should automatically resolve to Hand [0, 5, 0] + [0, 0, 1] = [0, 5, 1]
    const swordWorld = realm.solver.cache.getWorld3D(sword);
    expect(swordWorld).toBeDefined();
    const swordPos = vec3.create();
    mat4.getTranslation(swordPos, swordWorld!);

    expect(swordPos[0]).toBeCloseTo(0);
    expect(swordPos[1]).toBeCloseTo(5);
    expect(swordPos[2]).toBeCloseTo(1);
  });
});
