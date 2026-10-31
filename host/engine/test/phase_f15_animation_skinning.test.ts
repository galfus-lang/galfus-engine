import { describe, expect, it } from 'bun:test';
import type { AnimValue, GalfusEngine, TransitionConfig } from '@galfus/transport-types';
import { AnimationCoordinator } from '../src/animation/coordinator';
import { EcsWorld } from '../src/ecs/world';
import { MultiverseCoordinator } from '../src/multiverse/coordinator';
import { createModel2D } from '../src/realm2d/components';
import {
  createMesh3D,
  createModel3D,
  createSkin3D,
  type Model3DComponent
} from '../src/realm3d/components';
import { Realm3D } from '../src/realm3d/realm';

function createMockEngine(): GalfusEngine & {
  calls: Record<string, number>;
  boneUpdates: Array<{ realmId: number; modelId: number; length: number }>;
  transforms3D: Array<{ realmId: number; modelId: number; pos: [number, number, number] }>;
  transitions: Map<number, { current: AnimValue; target: AnimValue }>;
} {
  const calls: Record<string, number> = {};
  const count = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1;
  };

  const boneUpdates: Array<{ realmId: number; modelId: number; length: number }> = [];
  const transforms3D: Array<{ realmId: number; modelId: number; pos: [number, number, number] }> =
    [];
  const transitions = new Map<number, { current: AnimValue; target: AnimValue }>();

  const engine = {
    calls,
    boneUpdates,
    transforms3D,
    transitions,

    // Animation Mock
    animationCreateTransition(id: number, initialValue: AnimValue, _config: TransitionConfig) {
      count('animationCreateTransition');
      transitions.set(id, { current: initialValue, target: initialValue });
    },
    animationTransitionTo(id: number, targetValue: AnimValue, _config: TransitionConfig) {
      count('animationTransitionTo');
      const tr = transitions.get(id);
      if (tr) {
        tr.target = targetValue;
      }
    },
    animationGetValue(id: number): AnimValue | undefined {
      count('animationGetValue');
      return transitions.get(id)?.current;
    },
    animationDestroyTransition(id: number) {
      count('animationDestroyTransition');
      transitions.delete(id);
    },
    animationStep(_dt: number) {
      count('animationStep');
      // For mock purposes: progress current towards target
      for (const tr of transitions.values()) {
        tr.current = tr.target;
      }
    },
    animationPumpEvents() {
      return [];
    },

    // Realm 3D Mock
    realm3dCreate(_realmId: number) {
      count('realm3dCreate');
    },
    realm3dCreateModel(realmId: number, modelId: number, _desc: any, tf: any) {
      count('realm3dCreateModel');
      transforms3D.push({ realmId, modelId, pos: tf.position });
    },
    realm3dSetModelTransform(realmId: number, modelId: number, tf: any) {
      count('realm3dSetModelTransform');
      transforms3D.push({ realmId, modelId, pos: tf.position });
    },
    realm3dDestroyModel(_realmId: number, _modelId: number) {
      count('realm3dDestroyModel');
    },
    realm3dUpdateBones(
      realmId: number,
      modelId: number,
      _jointMatrices: Float32Array,
      length: number
    ) {
      count('realm3dUpdateBones');
      boneUpdates.push({ realmId, modelId, length });
    },

    // Realm 2D Mock
    realm2dCreate(_realmId: number) {
      count('realm2dCreate');
    },
    realm2dCreateModel(_realmId: number, _modelId: number, _desc: any, _tf: any) {
      count('realm2dCreateModel');
    },
    realm2dSetModelTransform(_realmId: number, _modelId: number, _tf: any) {
      count('realm2dSetModelTransform');
    },
    realm2dDestroyModel(_realmId: number, _modelId: number) {
      count('realm2dDestroyModel');
    }
  } as unknown as GalfusEngine & {
    calls: Record<string, number>;
    boneUpdates: Array<{ realmId: number; modelId: number; length: number }>;
    transforms3D: Array<{ realmId: number; modelId: number; pos: [number, number, number] }>;
    transitions: Map<number, { current: AnimValue; target: AnimValue }>;
  };

  return engine;
}

describe('Phase 15: Animation ECS, Skinning and Temporal Ownership', () => {
  it('animates 3D model through ECS single source of truth and anchor propagation', () => {
    const mockEngine = createMockEngine();
    const anim = new AnimationCoordinator();
    anim.bindEngine(mockEngine);

    const multiverse = new MultiverseCoordinator();
    multiverse.bindEngine(mockEngine);
    const realm3d = new Realm3D(1);
    multiverse.registerRealm(realm3d);

    // Parent animated model
    const parentEntity = realm3d.createModel(
      { geometryId: 1, materialId: 1 },
      { position: [0, 0, 0] }
    );

    // Child model anchored to parent with offset [0, 5, 0]
    const childEntity = realm3d.createModel(
      { geometryId: 1, materialId: 1 },
      { position: [0, 0, 0] }
    );
    realm3d.hierarchy.attach(childEntity, parentEntity);
    const childModel = realm3d.world.getComponent<Model3DComponent>(childEntity, 'Model3D')!;
    childModel.setPosition(0, 5, 0);

    // Initial frame sync
    const context = { time: 0, dt: 0.016, frameId: 1, engine: mockEngine };
    multiverse.stepRealmsPreRender(context);
    multiverse.syncRealms(context);

    // Initial positions registered in engine
    expect(mockEngine.calls.realm3dCreateModel).toBe(2);

    // Start animating parent to position [10, 0, 0]
    const transId = realm3d.animateModel(
      parentEntity,
      {
        type: 'transform3D',
        value: [10, 0, 0, 0, 0, 0, 1, 1, 1, 1]
      },
      { duration: 1.0, easing: 'linear' },
      anim
    );
    expect(transId).toBeDefined();

    // Step animation (Step 4 of pipeline)
    anim.step(0.5);

    // Verify ECS state updated immediately in host before anchor solver
    const parentModel = realm3d.world.getComponent<Model3DComponent>(parentEntity, 'Model3D')!;
    expect(parentModel.localMatrix[12]).toBe(10);

    // Step PreRender (Step 6 of pipeline: Anchor solver)
    multiverse.stepRealmsPreRender(context);

    // Verify child world position follows parent immediately
    expect(childModel.worldMatrix[12]).toBe(10);
    expect(childModel.worldMatrix[13]).toBe(5);

    // Step Sync (Step 7 of pipeline)
    multiverse.syncRealms(context);

    // Verify engine received updated transforms
    expect(mockEngine.calls.realm3dSetModelTransform).toBeGreaterThanOrEqual(2);
  });

  it('replaces active transition deterministically on same entity property', () => {
    const mockEngine = createMockEngine();
    const anim = new AnimationCoordinator();
    anim.bindEngine(mockEngine);

    const world = new EcsWorld();
    const entity = world.createEntity();
    world.attachComponent(entity, createModel2D(100));

    // First transition
    const trans1 = anim.animateEcsProperty(world, entity, 'position', [50, 50], {
      duration: 1.0,
      easing: 'linear'
    });
    expect(trans1).toBeDefined();
    expect(mockEngine.transitions.has(trans1!)).toBe(true);

    // Second transition on same entity property replaces trans1
    const trans2 = anim.animateEcsProperty(world, entity, 'position', [100, 100], {
      duration: 1.0,
      easing: 'linear'
    });
    expect(trans2).toBeDefined();
    expect(trans2).not.toBe(trans1);

    // trans1 was destroyed deterministically
    expect(mockEngine.transitions.has(trans1!)).toBe(false);
    expect(mockEngine.transitions.has(trans2!)).toBe(true);
    expect(anim.getEcsBinding(trans1!)).toBeUndefined();
    expect(anim.getEcsBinding(trans2!)?.transitionId).toBe(trans2);
  });

  it('cleans up transitions when entity is destroyed', () => {
    const mockEngine = createMockEngine();
    const anim = new AnimationCoordinator();
    anim.bindEngine(mockEngine);

    const world = new EcsWorld();
    const entity = world.createEntity();
    world.attachComponent(entity, createModel3D(200));

    const transId = anim.animateEcsProperty(world, entity, 'position', [1, 2, 3], {
      duration: 1.0,
      easing: 'linear'
    });
    expect(transId).toBeDefined();

    // Destroy entity in ECS
    world.destroyEntity(entity);

    // Stepping animation automatically cleans up dead entity transition
    anim.step(0.016);

    expect(anim.getEcsBinding(transId!)).toBeUndefined();
    expect(mockEngine.transitions.has(transId!)).toBe(false);
  });

  it('optimizes skinning with 0 bone uploads in static frames', () => {
    const mockEngine = createMockEngine();
    const realm3d = new Realm3D(1);
    realm3d.bindEngine(mockEngine);

    // Skinned mesh model
    const modelEntity = realm3d.world.createEntity();
    realm3d.world.attachComponent(modelEntity, createModel3D(500));
    realm3d.world.attachComponent(
      modelEntity,
      createMesh3D(1, 500, { geometryId: 1, materialId: 1 })
    );

    // Two bone joint entities
    const joint1 = realm3d.world.createEntity();
    realm3d.world.attachComponent(joint1, createModel3D(501));
    const joint2 = realm3d.world.createEntity();
    realm3d.world.attachComponent(joint2, createModel3D(502));

    // Inverse bind matrices (identity)
    const invBind = new Float32Array(32);
    invBind[0] = 1;
    invBind[5] = 1;
    invBind[10] = 1;
    invBind[15] = 1;
    invBind[16] = 1;
    invBind[21] = 1;
    invBind[26] = 1;
    invBind[31] = 1;

    // Skin component
    const skinEntity = realm3d.world.createEntity();
    realm3d.world.attachComponent(
      skinEntity,
      createSkin3D(1, modelEntity, [joint1, joint2], invBind)
    );

    const context = { time: 0, dt: 0.016, frameId: 1, engine: mockEngine };

    // Frame 1: Initial dirty skinning solve
    realm3d.preRender(context);
    realm3d.sync(context);

    expect(mockEngine.calls.realm3dUpdateBones).toBe(1);

    // Frame 2 & 3: Static frames without any movement -> exactly 0 additional uploads!
    realm3d.preRender(context);
    realm3d.sync(context);
    realm3d.preRender(context);
    realm3d.sync(context);

    expect(mockEngine.calls.realm3dUpdateBones).toBe(1);

    // Frame 4: Move joint1 -> triggers exactly 1 bone update
    const joint1Model = realm3d.world.getComponent<Model3DComponent>(joint1, 'Model3D')!;
    joint1Model.setPosition(0, 1, 0);

    realm3d.preRender(context);
    realm3d.sync(context);

    expect(mockEngine.calls.realm3dUpdateBones).toBe(2);

    // Frame 5: Static again -> no additional uploads
    realm3d.preRender(context);
    realm3d.sync(context);

    expect(mockEngine.calls.realm3dUpdateBones).toBe(2);
  });

  it('automatically cleans up orphan skin when model is destroyed', () => {
    const mockEngine = createMockEngine();
    const realm3d = new Realm3D(1);
    realm3d.bindEngine(mockEngine);

    const modelEntity = realm3d.world.createEntity();
    realm3d.world.attachComponent(modelEntity, createModel3D(600));

    const joint = realm3d.world.createEntity();
    realm3d.world.attachComponent(joint, createModel3D(601));

    const invBind = new Float32Array(16);
    invBind[0] = 1;
    invBind[5] = 1;
    invBind[10] = 1;
    invBind[15] = 1;

    const skinEntity = realm3d.world.createEntity();
    realm3d.world.attachComponent(skinEntity, createSkin3D(2, modelEntity, [joint], invBind));

    const context = { time: 0, dt: 0.016, frameId: 1, engine: mockEngine };
    realm3d.preRender(context);

    expect(realm3d.world.isAlive(skinEntity)).toBe(true);

    // Destroy model entity
    realm3d.world.destroyEntity(modelEntity);

    // Next preRender solver detects orphan skin and destroys it
    realm3d.preRender(context);

    expect(realm3d.world.isAlive(skinEntity)).toBe(false);
  });
});
