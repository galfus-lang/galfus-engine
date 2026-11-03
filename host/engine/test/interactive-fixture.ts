import type { GalfusEngine, GalfusTransport, PlatformEvent } from '@galfus/transport-types';
import { createRuntime } from '../src/runtime';

export function setup() {
  const events: PlatformEvent[] = [];
  const tabCapture: Array<[number, number]> = [];
  const ime: Array<[number, number]> = [];
  const svgText: string[] = [];
  let fail = false;
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
      platformPumpEvents: () => events.splice(0),
      windowSetTabCapture: (id: number, enabled: number) => tabCapture.push([id, enabled]),
      windowSetImeAllowed: (id: number, enabled: number) => ime.push([id, enabled]),
      realm2dSetSvgText: (_realm: number, _svg: number, _element: string, value: string) =>
        svgText.push(value),
      multiverseResolve: () => schedule,
      multiverseDispatch: () => {
        if (fail) throw new Error('dispatch failed');
      },
      realm2dGetSvgElementRect: () => ({
        rect: { x: 25, y: 25, width: 50, height: 50, viewportWidth: 100, viewportHeight: 100 }
      })
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
    svgText,
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
