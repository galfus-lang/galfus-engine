import { describe, expect, it } from 'bun:test';
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime } from '../src/runtime';
import { EcsWorld } from '../src/ecs/world';
import { createModel3D } from '../src/realm3d/components';
import { AnchorMatrixCache } from '../src/anchors/cache';
import { Realm3DSyncSystem } from '../src/realm3d/sync';
import { createCollider3D } from '../src/collision/components';
import { raycast3D } from '../src/collision/query3d';
import { advanceFrame } from './controlled-transport';

describe('Foundation Optimizations & Physics Pre-requisites', () => {
  describe('Phase 1: Memory Leak & Orphan Purge', () => {
    it('automatically purges dead entity presentation surfaces on resolve', () => {
      const transport = createBunTransport({ headless: true });
      const runtime = createRuntime(transport);
      try {
        const r1 = runtime.createRealm3D(1);
        const entity = r1.world.createEntity();
        r1.world.attachComponent(entity, createModel3D(entity));

        runtime.multiverse.createTarget(10, {
          kind: { type: 'texture', width: 512, height: 512, format: 'rgba8unorm' }
        });
        runtime.multiverse.bindTargetTexture({
          realmId: 1,
          slot: 'screen',
          sourceTargetId: 10
        });
        runtime.multiverse.connectPresentationSurface({
          realmId: 1,
          slot: 'screen',
          entityId: entity
        });

        // Verify connected before destruction
        const schedule = runtime.multiverse.resolve();
        expect(schedule).toBeDefined();

        // Destroy entity in ECS
        r1.world.destroyEntity(entity);
        expect(r1.world.isAlive(entity)).toBe(false);

        // Next resolve must automatically clean the orphan surface
        runtime.multiverse.resolve();
      } finally {
        runtime.dispose();
      }
    });
  });

  describe('Phase 2: Zero-Allocation Sync Transform', () => {
    it('reuses persistent Transform3D instance per entity in Realm3DSyncSystem', () => {
      const cache = new AnchorMatrixCache();
      const sync = new Realm3DSyncSystem(1, cache);
      const world = new EcsWorld();
      const entity = world.createEntity();
      const model = createModel3D(entity);
      model.worldMatrix[12] = 10;
      model.worldMatrix[13] = 20;
      model.worldMatrix[14] = 30;
      world.attachComponent(entity, model);

      const tf1 = sync.getResolvedTransform(world, entity);
      expect(tf1.position).toEqual([10, 20, 30]);

      // Move entity
      model.worldMatrix[12] = 40;
      const tf2 = sync.getResolvedTransform(world, entity);

      // Must be the exact same object reference (zero allocation)
      expect(tf2).toBe(tf1);
      expect(tf2.position).toEqual([40, 20, 30]);
    });
  });

  describe('Phase 3: Fast Raycast Broadphase Bounding Sphere', () => {
    it('accurately hits colliders while rejecting distant rays without false negatives', () => {
      const world = new EcsWorld();
      const entity = world.createEntity();
      const model = createModel3D(entity);
      // Place sphere at (0, 0, -10) with radius 2
      model.worldMatrix[14] = -10;
      world.attachComponent(entity, model);

      const collider = createCollider3D();
      collider.add(1, { type: 'sphere', radius: 2 });
      world.attachComponent(entity, collider);

      // Ray 1: Directly hits sphere
      const hits = raycast3D(world, [0, 0, 0], [0, 0, -1], 50);
      expect(hits.length).toBe(1);
      expect(hits[0]!.entityId).toBe(entity);
      expect(hits[0]!.distance).toBeCloseTo(8, 2); // 10 - 2 = 8

      // Ray 2: Points completely away (opposite direction)
      const missAway = raycast3D(world, [0, 0, 0], [0, 0, 1], 50);
      expect(missAway.length).toBe(0);

      // Ray 3: Points sideways far from sphere bounding radius
      const missSide = raycast3D(world, [0, 0, 0], [1, 0, 0], 50);
      expect(missSide.length).toBe(0);
    });
  });

  describe('Phase 4: Fixed Timestep Accumulator', () => {
    it('dispatches deterministic fixedTick sub-steps with accumulator', () => {
      const transport = createBunTransport({ headless: true });
      const runtime = createRuntime(transport, { fixedDt: 0.02 }); // 50 Hz
      try {
        const fixedSteps: Array<{ time: number; subStep: number; fixedDt: number }> = [];
        runtime.on('fixedTick', (timing) => {
          fixedSteps.push({ time: timing.time, subStep: timing.subStep, fixedDt: timing.fixedDt });
        });

        // Advance 0.05s -> should fire 2 steps (0.02 and 0.04)
        advanceFrame(runtime, transport, 0.05);

        expect(fixedSteps.length).toBe(2);
        expect(fixedSteps[0]!.subStep).toBe(0);
        expect(fixedSteps[0]!.fixedDt).toBe(0.02);
        expect(fixedSteps[1]!.subStep).toBe(1);

        // Advance another 0.015s (total remaining was 0.01s + 0.015s = 0.025s -> fires 1 step)
        advanceFrame(runtime, transport, 0.015);
        expect(fixedSteps.length).toBe(3);
        expect(fixedSteps[2]!.subStep).toBe(0);
      } finally {
        runtime.dispose();
      }
    });
  });
});
