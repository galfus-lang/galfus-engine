import { advanceFrame } from './controlled-transport';
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
  it('forwards ordered IME events to keyboard listeners', () => {
    const pending: PlatformEvent[] = [
      { kind: 'keyboard', type: 'imeEnabled', windowId: 1 },
      { kind: 'keyboard', type: 'imePreedit', windowId: 1, text: 'あ😀', selection: [1, 3] },
      { kind: 'keyboard', type: 'imeCommit', windowId: 1, text: '漢字' },
      { kind: 'keyboard', type: 'imeDisabled', windowId: 1 }
    ];
    const engine = {
      platformPumpEvents: () => pending.splice(0),
      multiverseResolve: () => {},
      multiverseDispatch: () => {}
    } as unknown as GalfusEngine;
    const transport = {
      engine,
      isInitialized: true,
      isDisposed: false,
      isRunning: false,
      startLoop: () => {},
      stopLoop: () => {},
      dispose: () => {}
    } as unknown as GalfusTransport;
    const runtime = new MultiverseRuntime(transport);
    runtime.platform.bindEngine(engine);
    const events: PlatformEvent[] = [];
    runtime.on('keyboard', (event) => events.push(event));
    advanceFrame(runtime, transport);
    expect(events.map((event) => event.type)).toEqual([
      'imeEnabled',
      'imePreedit',
      'imeCommit',
      'imeDisabled'
    ]);
    expect(events[1]).toEqual({
      kind: 'keyboard',
      type: 'imePreedit',
      windowId: 1,
      text: 'あ😀',
      selection: [1, 3]
    });
    runtime.dispose();
  });
  it('dispatches tick events and supports functional unsubscription', () => {
    const mockTransport: GalfusTransport = {
      engine: { multiverseDispatch: () => {} } as unknown as GalfusEngine,
      isInitialized: true,
      isDisposed: false,
      isRunning: false,
      init: async () => {},
      startLoop: () => {},
      stopLoop: () => {},
      dispose: () => {}
    };

    const runtime = new MultiverseRuntime(mockTransport);
    const tickFrames: number[] = [];

    // Register tick listener
    const off = runtime.on('tick', (timing: FrameTiming) => {
      tickFrames.push(timing.frameId);
    });

    advanceFrame(runtime, mockTransport, 0.016);
    advanceFrame(runtime, mockTransport, 0.016);
    expect(tickFrames).toEqual([1, 2]);

    // Unsubscribe via returned off function
    off();
    advanceFrame(runtime, mockTransport, 0.016);
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
    advanceFrame(runtime, mockTransport, 0.016);

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
    advanceFrame(runtime, mockTransport, 0.016);
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
      dispose: () => {}
    };

    const runtime = new MultiverseRuntime(mockTransport);
    runtime.platform.bindEngine(mockEngine);
    runtime.animation.bindEngine(mockEngine);

    // Wire up coordinator forwarding (done in runtime.init, or simulated here)
    runtime.animation.on('animation', (ev) => {
      animationEvents.push(ev);
    });

    advanceFrame(runtime, mockTransport, 0.016);
    expect(animationEvents.length).toBe(1);
    expect(animationEvents[0]?.eventType).toBe('completed');
  });

  it('supports clearListeners to flush all or specific event types', () => {
    const mockTransport: GalfusTransport = {
      engine: { multiverseDispatch: () => {} } as unknown as GalfusEngine,
      isInitialized: true,
      isDisposed: false,
      isRunning: false,
      init: async () => {},
      startLoop: () => {},
      stopLoop: () => {},
      dispose: () => {}
    };

    const runtime = new MultiverseRuntime(mockTransport);
    let tickCount = 0;

    runtime.on('tick', () => {
      tickCount++;
    });

    advanceFrame(runtime, mockTransport, 0.016);
    expect(tickCount).toBe(1);

    // Clear specific category
    runtime.clearListeners('tick');
    advanceFrame(runtime, mockTransport, 0.016);
    expect(tickCount).toBe(1);
  });
});
