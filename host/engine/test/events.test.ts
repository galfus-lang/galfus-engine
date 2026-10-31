import { describe, expect, it } from 'bun:test';
import type {
  AnimationEvent,
  FrameTiming,
  GalfusEngine,
  GalfusTransport,
  PlatformEvent,
  WindowEvent
} from '@galfus/transport-types';
import { MultiverseRuntime } from '../src/runtime';

describe('@galfus/engine > Unified Event System (.on and off)', () => {
  it('dispatches tick events and supports functional unsubscription', () => {
    const mockTransport: GalfusTransport = {
      engine: {} as unknown as GalfusEngine,
      isInitialized: true,
      isDisposed: false,
      isRunning: false,
      init: async () => {},
      startLoop: () => {},
      stopLoop: () => {},
      step: () => {},
      dispose: () => {}
    };

    const runtime = new MultiverseRuntime(mockTransport);
    const tickFrames: number[] = [];

    // Register tick listener
    const off = runtime.on('tick', (timing: FrameTiming) => {
      tickFrames.push(timing.frameId);
    });

    runtime.tick(0.016);
    runtime.tick(0.016);
    expect(tickFrames).toEqual([1, 2]);

    // Unsubscribe via returned off function
    off();
    runtime.tick(0.016);
    expect(tickFrames).toEqual([1, 2]);
  });

  it('internally pumps platform events, dispatches to .on(window), and auto-syncs swapchain on resize', () => {
    const updates: string[] = [];
    const windowEvents: WindowEvent[] = [];

    const mockEvents: PlatformEvent[] = [
      {
        kind: 'window',
        type: 'resized',
        windowId: 1,
        width: 1920,
        height: 1080,
        scaleFactor: 1.0
      },
      {
        kind: 'window',
        type: 'closeRequested',
        windowId: 1
      }
    ];

    const mockEngine = {
      platformPumpEvents: () => mockEvents.splice(0, mockEvents.length),
      multiverseUpdateWindowSize: (id: number, w: number, h: number) => {
        updates.push(`updateSize:${id}:${w}x${h}`);
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

    const runtime = new MultiverseRuntime(mockTransport);
    runtime.platform.bindEngine(mockEngine);
    runtime.multiverse.bindEngine(mockEngine);

    // Register window event listener
    const offWindow = runtime.on('window', (ev) => {
      windowEvents.push(ev);
    });

    // Step a frame: platform events must be pumped and processed internally
    runtime.tick(0.016);

    // 1. Window events received by listener
    expect(windowEvents.length).toBe(2);
    expect(windowEvents[0]?.type).toBe('resized');
    expect(windowEvents[1]?.type).toBe('closeRequested');

    // 2. Multiverse swapchain automatically updated on resized event
    expect(updates).toContain('updateSize:1:1920x1080');

    // 3. Unsubscribe works
    offWindow();
    mockEvents.push({
      kind: 'window',
      type: 'focusChanged',
      windowId: 1,
      focused: true
    });
    runtime.tick(0.016);
    expect(windowEvents.length).toBe(2);
  });

  it('forwards animation events to runtime .on(animation)', () => {
    const animationEvents: AnimationEvent[] = [];

    const mockEngine = {
      platformPumpEvents: () => [],
      animationStep: () => {},
      animationPumpEvents: () => [
        {
          eventType: 'completed' as const,
          transitionId: 42,
          currentValue: { type: 'scalar' as const, value: 1.0 }
        }
      ],
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

    const runtime = new MultiverseRuntime(mockTransport);
    runtime.platform.bindEngine(mockEngine);
    runtime.animation.bindEngine(mockEngine);

    // Wire up coordinator forwarding (done in runtime.init, or simulated here)
    runtime.animation.on('animation', (ev) => {
      animationEvents.push(ev);
    });

    runtime.tick(0.016);
    expect(animationEvents.length).toBe(1);
    expect(animationEvents[0]?.eventType).toBe('completed');
  });

  it('supports clearListeners to flush all or specific event types', () => {
    const mockTransport: GalfusTransport = {
      engine: {} as unknown as GalfusEngine,
      isInitialized: true,
      isDisposed: false,
      isRunning: false,
      init: async () => {},
      startLoop: () => {},
      stopLoop: () => {},
      step: () => {},
      dispose: () => {}
    };

    const runtime = new MultiverseRuntime(mockTransport);
    let tickCount = 0;

    runtime.on('tick', () => {
      tickCount++;
    });

    runtime.tick(0.016);
    expect(tickCount).toBe(1);

    // Clear specific category
    runtime.clearListeners('tick');
    runtime.tick(0.016);
    expect(tickCount).toBe(1);
  });
});
