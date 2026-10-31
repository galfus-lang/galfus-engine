import { describe, expect, it } from 'bun:test';
import { createBunTransport } from '@galfus/transport-bun';
import {
  GalfusLoopError,
  GalfusTransportError,
  type FrameTiming,
  type GalfusEngine,
  type GalfusTransport
} from '@galfus/transport-types';
import { MultiverseRuntime, createRuntime, type RuntimeState } from '../src/runtime';
import { EcsWorld } from '../src/ecs/world';

describe('Phase F03 — Runtime Pronto e Scheduler Preparatório', () => {
  describe('Ready Transport & Idempotent Binding', () => {
    it('createRuntime with initialized transport binds subsystems immediately into ready state', () => {
      const transport = createBunTransport({ headless: true });
      const runtime = createRuntime(transport);

      expect(runtime.state).toBe('ready');
      expect(runtime.transport).toBe(transport);

      runtime.dispose();
      expect(runtime.state).toBe('disposed');
    });

    it('runtime.init() called multiple times is idempotent and never duplicates event listeners', async () => {
      let pumpCount = 0;
      const mockEngine = {
        platformPumpEvents: () => [],
        animationStep: () => {},
        animationPumpEvents: () => {
          if (++pumpCount === 1) {
            return [
              {
                eventType: 'completed' as const,
                transitionId: 10,
                currentValue: { type: 'scalar' as const, value: 1.0 }
              }
            ];
          }
          return [];
        },
        multiverseResolve: () => {},
        multiverseDispatch: () => {}
      } as unknown as GalfusEngine;

      const mockTransport: GalfusTransport = {
        engine: mockEngine,
        isInitialized: true,
        isDisposed: false,
        isRunning: false,
        init: async () => {},
        startLoop: () => {},
        stopLoop: () => {},
        step: () => {},
        dispose: () => {}
      };

      const runtime = createRuntime(mockTransport);

      // Call init multiple times
      await runtime.init();
      await runtime.init();
      await runtime.init();

      expect(runtime.state).toBe('ready');

      let animationEventCount = 0;
      runtime.on('animation', () => {
        animationEventCount++;
      });

      // Tick single frame to pump animation events
      runtime.tick(0.016);

      // Must be received exactly once
      expect(animationEventCount).toBe(1);

      runtime.dispose();
    });
  });

  describe('Runtime State Machine (HOST-002 / HOST-027)', () => {
    it('transitions through ready -> running -> ready -> disposed', () => {
      const transport = createBunTransport({ headless: true });
      const runtime = createRuntime(transport);
      expect(runtime.state).toBe('ready');

      runtime.start();
      expect(runtime.state).toBe('running');
      expect(runtime.isRunning).toBe(true);

      runtime.stop();
      expect(runtime.state).toBe('ready');
      expect(runtime.isRunning).toBe(false);

      runtime.dispose();
      expect(runtime.state).toBe('disposed');

      // Subsequent dispose calls are safe and idempotent
      expect(() => runtime.dispose()).not.toThrow();
      expect(runtime.state).toBe('disposed');
    });

    it('rejects start() and tick() when disposed', () => {
      const transport = createBunTransport({ headless: true });
      const runtime = createRuntime(transport);
      runtime.dispose();

      expect(() => runtime.start()).toThrow(GalfusLoopError);
      expect(() => runtime.tick()).toThrow(GalfusLoopError);
      expect(() => runtime.init()).toThrow(GalfusTransportError);
    });
  });

  describe('Coherent Time & Frame Accounting', () => {
    it('manual tick() advances frameId and elapsedSeconds exactly once', () => {
      const transport = createBunTransport({ headless: true });
      const runtime = createRuntime(transport);

      expect(runtime.frameId).toBe(0);
      expect(runtime.elapsedSeconds).toBe(0);

      runtime.tick(0.016);
      expect(runtime.frameId).toBe(1);
      expect(runtime.elapsedSeconds).toBeCloseTo(0.016, 4);

      runtime.tick(0.034);
      expect(runtime.frameId).toBe(2);
      expect(runtime.elapsedSeconds).toBeCloseTo(0.05, 4);

      runtime.dispose();
    });

    it('automatic loop ticks advance frameId and elapsedSeconds accurately', async () => {
      const transport = createBunTransport({ headless: true, targetFps: 120 });
      const runtime = createRuntime(transport);

      runtime.start();
      await new Promise((resolve) => setTimeout(resolve, 35));
      runtime.stop();

      expect(runtime.frameId).toBeGreaterThanOrEqual(1);
      expect(runtime.elapsedSeconds).toBeGreaterThan(0);

      runtime.dispose();
    });
  });

  describe('System Scheduler: Priorities & Stable Insertion Order', () => {
    it('executes systems by priority descending, breaking ties with stable insertion order', () => {
      const world = new EcsWorld();
      const executionOrder: string[] = [];

      // Add ordinary system (priority 0)
      world.addSystem('update', () => executionOrder.push('sys_default_1'));

      // Add high priority system (priority 100)
      world.addSystem({
        step: 'update',
        priority: 100,
        kind: 'anchor',
        fn: () => executionOrder.push('sys_high')
      });

      // Add another default priority system (priority 0, after sys_default_1)
      world.addSystem('update', () => executionOrder.push('sys_default_2'));

      // Add low priority system (priority -50)
      world.addSystem({
        step: 'update',
        priority: -50,
        kind: 'cleanup',
        fn: () => executionOrder.push('sys_low')
      });

      // Step world
      world.step({
        time: 1.0,
        dt: 0.016,
        frameId: 1
      });

      expect(executionOrder).toEqual(['sys_high', 'sys_default_1', 'sys_default_2', 'sys_low']);
    });
  });

  describe('Stage Separation: postRender runs strictly after GPU dispatch', () => {
    it('executes pipeline stages in order: preRender -> sync -> dispatch -> postRender', () => {
      const callTrace: string[] = [];

      const mockEngine = {
        multiverseResolve: () => {
          callTrace.push('engine:multiverseResolve');
        },
        multiverseDispatch: () => {
          callTrace.push('engine:multiverseDispatch');
        },
        platformPumpEvents: () => [],
        animationPumpEvents: () => [],
        animationStep: () => {}
      } as unknown as GalfusEngine;

      const mockTransport: GalfusTransport = {
        engine: mockEngine,
        isInitialized: true,
        isDisposed: false,
        isRunning: false,
        init: async () => {},
        startLoop: () => {},
        stopLoop: () => {},
        step: () => {},
        dispose: () => {}
      };

      const runtime = createRuntime(mockTransport);

      // Create a mock realm with preRender, sync, and postRender
      const mockRealm = {
        realmId: 1 as any,
        realmKind: 'custom' as any,
        bindEngine: () => {},
        preRender: () => {
          callTrace.push('realm:preRender');
        },
        sync: () => {
          callTrace.push('realm:sync');
        },
        postRender: () => {
          callTrace.push('realm:postRender');
        },
        dispose: () => {}
      };

      runtime.multiverse.registerRealm(mockRealm);

      // Tick single frame
      runtime.tick(0.016);

      // Verify strict phase ordering: preRender -> sync -> resolve -> dispatch -> postRender
      expect(callTrace).toEqual([
        'realm:preRender',
        'realm:sync',
        'engine:multiverseResolve',
        'engine:multiverseDispatch',
        'realm:postRender'
      ]);

      runtime.dispose();
    });
  });
});
