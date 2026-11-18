import type { GalfusEngine, GalfusTransport, PlatformEvent } from '@galfus/transport-types';
import { createRuntime } from '../src/runtime';
import { createMockInteractionEngine } from './mock-core-interaction';

export function setup() {
  const events: PlatformEvent[] = [];
  const tabCapture: Array<[number, number]> = [];
  const ime: Array<[number, number]> = [];
  let fail = false;
  let runtimeRef: any;
  const mockInteractions = createMockInteractionEngine((id) => runtimeRef?.multiverse.getRealm(id));
  const schedule = {
    targetBlocks: [
      {
        targetId: 1,
        invocations: [
          {
            invocationId: 1,
            realmId: 1,
            resolvedViewport: [0, 0, 100, 100],
            zIndex: 0,
            filters: []
          }
        ]
      }
    ]
  };
  const engine = new Proxy(
    {
      ...mockInteractions,
      platformPumpEvents: () => events.splice(0),
      windowSetTabCapture: (id: number, enabled: number) => tabCapture.push([id, enabled]),
      windowSetImeAllowed: (id: number, enabled: number) => ime.push([id, enabled]),
      multiverseResolve: () => schedule,
      multiverseDispatch: () => {
        if (fail) throw new Error('dispatch failed');
        mockInteractions.multiverseDispatch();
      }
    },
    { get: (target, key) => (key in target ? target[key as keyof typeof target] : () => {}) }
  ) as unknown as GalfusEngine;
  const transport = {
    engine,
    isInitialized: true,
    isDisposed: false,
    isRunning: false,
    startLoop: () => {},
    stopLoop: () => {},
    dispose: () => {}
  } as unknown as GalfusTransport;
  const runtime = createRuntime(transport);
  runtimeRef = runtime;
  const windowId = runtime.platform.window.create();
  const realm = runtime.createRealm2D(1);
  realm.createCamera({ orthoScale: 10 });
  const targetId = runtime.multiverse.createTarget({ kind: { type: 'window', windowId } });
  runtime.multiverse.createInvocation({ realmId: 1, targetId });
  return {
    runtime,
    transport,
    realm,
    events,
    windowId,
    schedule,
    tabCapture,
    ime,
    failDispatch: (value: boolean) => {
      fail = value;
    }
  };
}
export function move(windowId: number, x: number, y: number): PlatformEvent {
  return {
    kind: 'pointer',
    type: 'move',
    windowId,
    pointerId: 0,
    pointerType: 'mouse',
    position: [x, y],
    delta: [0, 0],
    pressure: 0
  };
}
export function button(
  windowId: number,
  x: number,
  y: number,
  state: 'pressed' | 'released'
): PlatformEvent {
  return {
    kind: 'pointer',
    type: 'button',
    windowId,
    pointerId: 0,
    pointerType: 'mouse',
    position: [x, y],
    button: 'primary',
    state,
    pressure: 0
  };
}

export function tab(windowId: number, shift = false): PlatformEvent {
  return {
    kind: 'keyboard',
    type: 'input',
    windowId,
    physicalKey: 'tab',
    logicalKey: 'Tab',
    state: 'pressed',
    repeat: false,
    modifiers: { shift, ctrl: false, alt: false, superKey: false }
  };
}
