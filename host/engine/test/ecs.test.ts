import { describe, expect, it } from 'bun:test';
import {
  ComponentStore,
  EcsWorld,
  EntityManager,
  IntentStore,
  SystemPipeline,
  type Component,
  type SystemContext
} from '../src/ecs/index';
import { CORE_RESERVED_RANGE_START, GalfusPolicyError } from '@galfus/transport-types';

interface PositionComponent extends Component {
  type: 'Position';
  x: number;
  y: number;
}

interface VelocityComponent extends Component {
  type: 'Velocity';
  vx: number;
  vy: number;
}

describe('@galfus/engine-core > ECS', () => {
  describe('EntityManager & ID Policies', () => {
    it('allocates sequential EntityIds and recycles destroyed IDs', () => {
      const mgr = new EntityManager();
      const e1 = mgr.create();
      const e2 = mgr.create();
      expect(e1).toBe(1);
      expect(e2).toBe(2);
      expect(mgr.aliveCount()).toBe(2);

      expect(mgr.destroy(e1)).toBe(true);
      expect(mgr.isAlive(e1)).toBe(false);
      expect(mgr.aliveCount()).toBe(1);

      // Next allocation recycles e1
      const e3 = mgr.create();
      expect(e3).toBe(1);
      expect(mgr.isAlive(1)).toBe(true);
    });

    it('rejects allocation if ID counter enters core-reserved range', () => {
      const mgr = new EntityManager();
      // Fast-forward nextId near reserved range
      (mgr as unknown as { _nextId: number })._nextId = CORE_RESERVED_RANGE_START;
      expect(() => {
        mgr.create();
      }).toThrow(GalfusPolicyError);
    });
  });

  describe('ComponentStore', () => {
    it('sets, retrieves, queries and deletes components', () => {
      const store = new ComponentStore();
      const pos1: PositionComponent = { type: 'Position', x: 10, y: 20 };
      const vel1: VelocityComponent = { type: 'Velocity', vx: 1, vy: 2 };
      const pos2: PositionComponent = { type: 'Position', x: 30, y: 40 };

      store.set(1, pos1);
      store.set(1, vel1);
      store.set(2, pos2);

      expect(store.has(1, 'Position')).toBe(true);
      expect(store.has(1, 'Velocity')).toBe(true);
      expect(store.has(2, 'Velocity')).toBe(false);

      expect(store.get<PositionComponent>(1, 'Position')?.x).toBe(10);
      expect(store.getEntitiesWith('Position').size).toBe(2);
      expect(store.getEntitiesWith('Velocity').size).toBe(1);

      store.delete(1, 'Position');
      expect(store.has(1, 'Position')).toBe(false);
      expect(store.has(1, 'Velocity')).toBe(true);

      store.removeAllForEntity(1);
      expect(store.has(1, 'Velocity')).toBe(false);
    });
  });

  describe('IntentStore', () => {
    it('queues mutations and flushes in order', () => {
      const intents = new IntentStore();
      const actions: string[] = [];

      const mockFlusher = {
        attachComponent: (e: number, c: Component) => actions.push(`attach:${e}:${c.type}`),
        detachComponent: (e: number, t: string) => actions.push(`detach:${e}:${t}`),
        destroyEntity: (e: number) => actions.push(`destroy:${e}`)
      };

      intents.queueAttach(1, { type: 'Position' });
      intents.queueDetach(1, 'Velocity');
      intents.queueCustom(() => actions.push('custom'));
      intents.queueDestroy(2);

      expect(intents.pendingCount).toBe(4);
      intents.flush(mockFlusher);

      expect(actions).toEqual(['attach:1:Position', 'detach:1:Velocity', 'custom', 'destroy:2']);
      expect(intents.pendingCount).toBe(0);
    });
  });

  describe('SystemPipeline & EcsWorld', () => {
    it('executes systems in exact 4-phase sequence and flushes intents between stages', () => {
      const world = new EcsWorld();
      const order: string[] = [];

      world.addSystem('input', () => order.push('input'));
      world.addSystem('update', (w) => {
        order.push('update');
        // Queue an intent during update stage
        w.intents.queueCustom(() => order.push('intent:flushed-after-update'));
      });
      world.addSystem('preRender', () => order.push('preRender'));
      world.addSystem('postRender', () => order.push('postRender'));

      const ctx: SystemContext = { time: 1.0, dt: 0.016, frameId: 1 };
      world.step(ctx);

      expect(order).toEqual([
        'input',
        'update',
        'intent:flushed-after-update',
        'preRender',
        'postRender'
      ]);
    });

    it('queries entities matching multiple component types', () => {
      const world = new EcsWorld();
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      const e3 = world.createEntity();

      world.attachComponent(e1, { type: 'Position', x: 1, y: 1 } as PositionComponent);
      world.attachComponent(e1, { type: 'Velocity', vx: 1, vy: 1 } as VelocityComponent);

      world.attachComponent(e2, { type: 'Position', x: 2, y: 2 } as PositionComponent);

      world.attachComponent(e3, { type: 'Velocity', vx: 3, vy: 3 } as VelocityComponent);

      const movingEntities = world.query('Position', 'Velocity');
      expect(movingEntities).toEqual([e1]);

      const positionedEntities = world.query('Position');
      expect(positionedEntities.sort()).toEqual([e1, e2].sort());
    });
  });
});
