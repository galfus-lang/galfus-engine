import { describe, expect, it } from 'bun:test';
import type { GalfusEngine } from '@galfus/transport-types';
import {
  AnchorSolveSystem,
  EcsWorld,
  Realm2D,
  RESERVED_PRIORITY_ANCHOR_RESOLVE,
  SpringAnchorStrategy2D,
  SpringAnchorStrategy3D,
  SystemPipeline
} from '../src';
import {
  AngularSpringAnchorStrategy2D,
  AngularSpringAnchorStrategy3D
} from '../src/anchors/strategies-rotational';
import { mat2d, mat4 } from '../src/math';

describe('Fase 3 Audit Fixes', () => {
  describe('A02: Intent flushing before internal anchor solve in preRender', () => {
    it('executes onPreInternal hook before internal systems in SystemPipeline', () => {
      const pipeline = new SystemPipeline<string>();
      const executionOrder: string[] = [];

      pipeline.add(
        'preRender',
        () => {
          executionOrder.push('userSystem-1');
        },
        { priority: 10 }
      );

      pipeline.add(
        'preRender',
        () => {
          executionOrder.push('userSystem-2');
        },
        { priority: -500 }
      );

      pipeline.add(
        'preRender',
        () => {
          executionOrder.push('internalAnchorSystem');
        },
        { kind: 'anchor' }
      );

      pipeline.add(
        'preRender',
        () => {
          executionOrder.push('internalSyncSystem');
        },
        { kind: 'sync' }
      );

      pipeline.runStep('preRender', 'world', { time: 0, dt: 1 / 60, frameId: 1 }, () => {
        executionOrder.push('onPreInternal');
      });

      expect(executionOrder).toEqual([
        'userSystem-1',
        'userSystem-2',
        'onPreInternal',
        'internalAnchorSystem',
        'internalSyncSystem'
      ]);
    });

    it('flushes intents queued during preRender user systems before AnchorSolveSystem', () => {
      const world = new EcsWorld();
      const solver = new AnchorSolveSystem();
      world.addSystem('preRender', solver.createSystem(), { kind: 'anchor' });

      let intentsFlushedBeforeAnchor = false;

      // User system in preRender queues an intent
      world.addSystem(
        'preRender',
        (w) => {
          w.intents.queueCustom(() => {
            intentsFlushedBeforeAnchor = true;
          });
        },
        { priority: 0 }
      );

      // Internal anchor system runs at RESERVED_PRIORITY_ANCHOR_RESOLVE (-1_000_000)
      let checkedDuringAnchor = false;
      world.addSystem(
        'preRender',
        () => {
          checkedDuringAnchor = intentsFlushedBeforeAnchor;
        },
        { priority: RESERVED_PRIORITY_ANCHOR_RESOLVE, kind: 'anchor' }
      );

      world.stepPreRender({ time: 0, dt: 1 / 60, frameId: 1 });

      expect(checkedDuringAnchor).toBe(true);
      expect(intentsFlushedBeforeAnchor).toBe(true);
    });
  });

  describe('N04: Complete UI and Collider deallocation & reactive ComponentRoot disposal', () => {
    it('destroys collider and UI in native engine driver and detaches entity on destroyUi', () => {
      const realm = new Realm2D(10);
      const destroyedColliders: number[] = [];
      const destroyedUis: number[] = [];
      const createdColliders: number[] = [];
      const createdUis: number[] = [];

      const mockEngine = {
        realm2dCreate: () => {},
        realm2dDestroy: () => {},
        realm2dCreateUi: (_r: number, id: number) => createdUis.push(id),
        realm2dSetUiTransform: () => {},
        realm2dSetUiContent: () => {},
        realm2dApplyUiCommands: () => {},
        realm2dDestroyUi: (_r: number, id: number) => destroyedUis.push(id),
        realm2dCreateCollider: (_r: number, id: number) => createdColliders.push(id),
        realm2dDestroyCollider: (_r: number, id: number) => destroyedColliders.push(id)
      } as unknown as GalfusEngine;

      realm.bindEngine(mockEngine);

      const uiHandle = realm.createUi({});
      const colliderId = realm.addCollider(uiHandle.entityId, {
        type: 'rectangle',
        halfExtents: [50, 50]
      });

      // Synchronize to engine
      realm.sync({ time: 0, dt: 1 / 60, frameId: 1, engine: mockEngine });

      expect(createdUis).toContain(uiHandle.uiId);
      expect(createdColliders).toContain(colliderId);

      // Now destroy UI
      realm.destroyUi(uiHandle);

      expect(destroyedUis).toContain(uiHandle.uiId);
      expect(destroyedColliders).toContain(colliderId);
      expect(realm.world.isAlive(uiHandle.entityId)).toBe(false);

      realm.dispose();
    });

    it('rejects reserved logical IDs on destroyUi', () => {
      const realm = new Realm2D(11);
      const invalidHandle = { entityId: 1, uiId: 4294901761 };
      expect(() => realm.destroyUi(invalidHandle)).toThrow();
      realm.dispose();
    });

    it('notifies onDestroyEntity listeners immediately when entity is destroyed in EcsWorld', () => {
      const world = new EcsWorld();
      const entityId = world.createEntity();
      const destroyed: number[] = [];

      const unsub = world.onDestroyEntity((id) => destroyed.push(id));

      expect(destroyed).toEqual([]);
      world.destroyEntity(entityId);
      expect(destroyed).toEqual([entityId]);

      unsub();
      const entityId2 = world.createEntity();
      world.destroyEntity(entityId2);
      expect(destroyed).toEqual([entityId]);
    });
  });

  describe('N07: Zero temporal drift for dt === 0 in anchor strategies', () => {
    it('SpringAnchorStrategy2D does not advance physics when dt === 0', () => {
      const local = mat2d.create();
      const outWorld = mat2d.create();
      const targetWorld = mat2d.fromTranslation(mat2d.create(), [100, 100]);

      // Step 1: advance spring for 0.1s
      SpringAnchorStrategy2D.apply(targetWorld, local, outWorld, undefined, {
        time: 0.1,
        dt: 0.1,
        params: { stiffness: 100, damping: 10 }
      });

      const posX1 = outWorld[4];
      const posY1 = outWorld[5];
      expect(posX1).toBeGreaterThan(0);
      expect(posY1).toBeGreaterThan(0);

      // Step 2: call apply multiple times with dt === 0 (e.g. repeated raycast / queryPoint)
      for (let i = 0; i < 5; i++) {
        SpringAnchorStrategy2D.apply(targetWorld, local, outWorld, undefined, {
          time: 0.1,
          dt: 0,
          params: { stiffness: 100, damping: 10 }
        });
        expect(outWorld[4]).toBe(posX1);
        expect(outWorld[5]).toBe(posY1);
      }
    });

    it('SpringAnchorStrategy3D does not advance physics when dt === 0', () => {
      const local = mat4.create();
      const outWorld = mat4.create();
      const targetWorld = mat4.fromTranslation(mat4.create(), [100, 100, 100]);

      // Step 1: advance spring for 0.1s
      SpringAnchorStrategy3D.apply(targetWorld, local, outWorld, undefined, {
        time: 0.1,
        dt: 0.1,
        params: { stiffness: 100, damping: 10 }
      });

      const posX1 = outWorld[12];
      const posY1 = outWorld[13];
      const posZ1 = outWorld[14];
      expect(posX1).toBeGreaterThan(0);

      // Step 2: call apply with dt === 0
      for (let i = 0; i < 5; i++) {
        SpringAnchorStrategy3D.apply(targetWorld, local, outWorld, undefined, {
          time: 0.1,
          dt: 0,
          params: { stiffness: 100, damping: 10 }
        });
        expect(outWorld[12]).toBe(posX1);
        expect(outWorld[13]).toBe(posY1);
        expect(outWorld[14]).toBe(posZ1);
      }
    });

    it('AngularSpringAnchorStrategy2D does not advance angle when dt === 0', () => {
      const local = mat2d.create();
      const outWorld = mat2d.create();
      const targetWorld = mat2d.create();

      // Step 1: advance angular spring
      AngularSpringAnchorStrategy2D.apply(targetWorld, local, outWorld, undefined, {
        time: 0.1,
        dt: 0.1,
        params: { targetAngle: Math.PI / 2, stiffness: 80, damping: 8 }
      });

      const rot0 = outWorld[0];
      const rot1 = outWorld[1];

      // Step 2: multiple queries with dt === 0
      for (let i = 0; i < 5; i++) {
        AngularSpringAnchorStrategy2D.apply(targetWorld, local, outWorld, undefined, {
          time: 0.1,
          dt: 0,
          params: { targetAngle: Math.PI / 2, stiffness: 80, damping: 8 }
        });
        expect(outWorld[0]).toBe(rot0);
        expect(outWorld[1]).toBe(rot1);
      }
    });

    it('AngularSpringAnchorStrategy3D does not advance angle when dt === 0', () => {
      const local = mat4.create();
      const outWorld = mat4.create();
      const targetWorld = mat4.create();

      // Step 1: advance angular spring
      AngularSpringAnchorStrategy3D.apply(targetWorld, local, outWorld, undefined, {
        time: 0.1,
        dt: 0.1,
        params: { targetAngle: Math.PI / 2, stiffness: 80, damping: 8 }
      });

      const m0 = outWorld[0];
      const m1 = outWorld[1];

      // Step 2: multiple queries with dt === 0
      for (let i = 0; i < 5; i++) {
        AngularSpringAnchorStrategy3D.apply(targetWorld, local, outWorld, undefined, {
          time: 0.1,
          dt: 0,
          params: { targetAngle: Math.PI / 2, stiffness: 80, damping: 8 }
        });
        expect(outWorld[0]).toBe(m0);
        expect(outWorld[1]).toBe(m1);
      }
    });
  });
});
