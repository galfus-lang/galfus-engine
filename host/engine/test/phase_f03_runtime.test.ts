import { advanceFrame } from './controlled-transport';
import { describe, expect, it } from 'bun:test';
import { createBunTransport } from '@galfus/transport-bun';
import { type GalfusEngine, GalfusLoopError, type GalfusTransport } from '@galfus/transport-types';
import { EcsWorld } from '../src/ecs/world';
import { createRuntime } from '../src/runtime';

describe('Phase F03 — Runtime Pronto e Scheduler Preparatório', () => {
  describe('Ready Transport & Idempotent Binding', () => {
    it('createRuntime with initialized transport binds subsystems immediately into ready state', () => {
      const transport = createBunTransport({ headless: true });
      const runtime = createRuntime(transport);

      expect(runtime.state).toBe('ready');

      runtime.dispose();
      expect(runtime.state).toBe('disposed');
    });

    it('createRuntime binds subsystems once and never duplicates event listeners', () => {
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
        dispose: () => {}
      };

      const runtime = createRuntime(mockTransport);

      expect(runtime.state).toBe('ready');

      let animationEventCount = 0;
      runtime.on('animation', () => {
        animationEventCount++;
      });

      // Tick single frame to pump animation events
      advanceFrame(runtime, mockTransport, 0.016);

      // Must be received exactly once
      expect(animationEventCount).toBe(1);

      runtime.dispose();
    });
  });

  describe('Runtime State Machine (HOST-002 / HOST-027)', () => {
    it('pauses and resumes frames using the transport clock', () => {
      let callback: ((timing: import('@galfus/transport-types').FrameTiming) => void) | undefined;
      let stops = 0;
      const engine = {
        platformPumpEvents: () => [],
        animationStep: () => {},
        animationPumpEvents: () => [],
        multiverseResolve: () => {},
        multiverseDispatch: () => {}
      } as unknown as GalfusEngine;
      const transport: GalfusTransport = {
        engine,
        isInitialized: true,
        isDisposed: false,
        isRunning: false,
        init: () => {},
        startLoop: (fn) => {
          callback = fn;
        },
        stopLoop: () => {
          callback = undefined;
          stops++;
        },
        dispose: () => {}
      };
      const runtime = createRuntime(transport);
      runtime.start();
      callback!({ timeMs: 100, deltaMs: 16, dt: 0.016, frameId: 1, fps: 62.5 });
      runtime.pause();
      expect(runtime.state).toBe('paused');
      expect(runtime.isRunning).toBe(false);
      expect(callback).toBeUndefined();
      expect(runtime.elapsedSeconds).toBeCloseTo(0.016);
      runtime.start();
      callback!({ timeMs: 5000, deltaMs: 20, dt: 0.02, frameId: 2, fps: 50 });
      expect(runtime.frameId).toBe(2);
      expect(runtime.elapsedSeconds).toBeCloseTo(0.036);
      runtime.stop();
      expect(runtime.state).toBe('ready');
      expect(stops).toBe(2);
      runtime.dispose();
    });

    it('keeps frame IDs increasing across a real transport pause', async () => {
      const runtime = createRuntime(createBunTransport({ headless: true }));
      const frames: number[] = [];
      runtime.on('tick', ({ frameId }) => frames.push(frameId));
      runtime.start();
      await Bun.sleep(20);
      runtime.pause();
      const beforePause = runtime.elapsedSeconds;
      const countAtPause = frames.length;
      await Bun.sleep(20);
      expect(frames.length).toBe(countAtPause);
      expect(runtime.elapsedSeconds).toBe(beforePause);
      runtime.start();
      await Bun.sleep(20);
      runtime.stop();
      expect(frames.length).toBeGreaterThan(countAtPause);
      for (let i = 1; i < frames.length; i++) expect(frames[i]!).toBeGreaterThan(frames[i - 1]!);
      runtime.dispose();
    });

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

    it('rejects starting a disposed runtime', () => {
      const transport = createBunTransport({ headless: true });
      const runtime = createRuntime(transport);
      runtime.dispose();

      expect(() => runtime.start()).toThrow(GalfusLoopError);
    });
  });

  describe('Coherent Time & Frame Accounting', () => {
    it('transport frames advance frameId and elapsedSeconds exactly once', () => {
      const transport = createBunTransport({ headless: true });
      const runtime = createRuntime(transport);

      expect(runtime.frameId).toBe(0);
      expect(runtime.elapsedSeconds).toBe(0);

      advanceFrame(runtime, transport, 0.016);
      expect(runtime.frameId).toBe(1);
      expect(runtime.elapsedSeconds).toBeCloseTo(0.016, 4);

      advanceFrame(runtime, transport, 0.034);
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
      advanceFrame(runtime, mockTransport, 0.016);

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
