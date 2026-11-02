import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, GalfusTransport, PlatformEvent } from '@galfus/transport-types';
import { createRuntime } from '../src/runtime';
import { advanceFrame } from './controlled-transport';

function setup() {
  const events: PlatformEvent[] = [];
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
    failDispatch: (value: boolean) => {
      fail = value;
    }
  };
}
function move(windowId: number, x: number, y: number): PlatformEvent {
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
function button(
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

describe('pointer interaction in direct realms', () => {
  it('uses the submitted frame and emits hover, move, down, up, click and leave', () => {
    const { runtime, transport, realm, events, windowId } = setup();
    try {
      const entityId = realm.createSpatialNode();
      realm.addCollider(entityId, { type: 'rectangle', halfExtents: [1, 1] });
      const listener = runtime.interactive(realm.realmId, { type: 'collider', entityId });
      const received: string[] = [];
      for (const type of ['hover', 'move', 'down', 'up', 'click', 'leave'] as const)
        listener.on(type, (event) => received.push(event.type));
      advanceFrame(runtime, transport);
      events.push(
        move(windowId, 50, 50),
        button(windowId, 50, 50, 'pressed'),
        button(windowId, 50, 50, 'released')
      );
      advanceFrame(runtime, transport);
      expect(received).toEqual(['hover', 'move', 'down', 'up', 'click']);
      realm.world.getComponent<any>(entityId, 'Model2D').setPosition(3, 0);
      events.push(move(windowId, 50, 50));
      advanceFrame(runtime, transport);
      expect(received.slice(-2)).toEqual(['move', 'leave']);
      listener.dispose();
      events.push(move(windowId, 80, 50));
      advanceFrame(runtime, transport);
      expect(received.at(-1)).toBe('leave');
    } finally {
      runtime.dispose();
    }
  });

  it('hits SVG bounds, picks the top layer, and cancels on window close', () => {
    const { runtime, transport, realm, events, windowId } = setup();
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'rectangle', halfExtents: [3, 3] });
      const back = runtime.interactive(1, { type: 'collider', entityId: entity });
      const svg = realm.createSvg({ source: '<svg/>', dimensions: [4, 4] }, { zLayer: 2 });
      const front = runtime.interactive(1, { type: 'svg', svgId: svg.svgId, elementId: 'button' });
      const received: string[] = [];
      back.on('hover', () => received.push('back'));
      front.on('hover', () => received.push('front'));
      front.on('cancel', () => received.push('cancel'));
      front.on('leave', () => received.push('leave'));
      advanceFrame(runtime, transport);
      events.push(move(windowId, 50, 50), button(windowId, 50, 50, 'pressed'));
      advanceFrame(runtime, transport);
      runtime.platform.window.close(windowId);
      expect(received).toEqual(['front', 'cancel', 'leave']);
    } finally {
      runtime.dispose();
    }
  });

  it('casts a perspective ray and selects the nearest 3D collider within camera clipping planes', () => {
    const { runtime, transport, events, windowId, schedule } = setup();
    try {
      const realm = runtime.createRealm3D(2);
      realm.createCamera({ kind: 'perspective', fovY: 60, near: 0.1, far: 10 });
      const near = realm.createSpatialNode({ position: [0, 0, -3] });
      const far = realm.createSpatialNode({ position: [0, 0, -6] });
      const beyond = realm.createSpatialNode({ position: [0, 0, -12] });
      realm.addCollider(near, { type: 'sphere', radius: 0.5 });
      realm.addCollider(far, { type: 'sphere', radius: 0.5 });
      realm.addCollider(beyond, { type: 'sphere', radius: 0.5 });
      const hits: string[] = [];
      runtime
        .interactive(2, { type: 'collider', entityId: near })
        .on('hover', () => hits.push('near'));
      runtime
        .interactive(2, { type: 'collider', entityId: far })
        .on('hover', () => hits.push('far'));
      runtime
        .interactive(2, { type: 'collider', entityId: beyond })
        .on('hover', () => hits.push('beyond'));
      schedule.targetBlocks[0]!.invocations[0]!.realmId = 2;
      advanceFrame(runtime, transport);
      events.push(move(windowId, 50, 50));
      advanceFrame(runtime, transport);
      expect(hits).toEqual(['near']);
      realm.destroyEntity(near);
      advanceFrame(runtime, transport);
      expect(hits).toEqual(['near', 'far']);
      realm.destroyEntity(far);
      advanceFrame(runtime, transport);
      expect(hits).toEqual(['near', 'far']);
    } finally {
      runtime.dispose();
    }
  });

  it('follows 3D look-at camera changes in the next submitted frame', () => {
    const { runtime, transport, events, windowId, schedule } = setup();
    try {
      const realm = runtime.createRealm3D(2);
      const camera = realm.createCamera({
        kind: 'orthographic',
        orthoScale: 10,
        near: 0.1,
        far: 10
      });
      const entity = realm.createSpatialNode({ position: [4, 0, 0] });
      realm.addCollider(entity, { type: 'box', halfExtents: [0.5, 0.5, 0.5] });
      const listener = runtime.interactive(2, { type: 'collider', entityId: entity });
      const hits: string[] = [];
      listener.on('hover', () => hits.push('hover'));
      listener.on('leave', () => hits.push('leave'));
      schedule.targetBlocks[0]!.invocations[0]!.realmId = 2;
      advanceFrame(runtime, transport);
      events.push(move(windowId, 50, 50));
      advanceFrame(runtime, transport);
      expect(hits).toEqual([]);
      realm.setCameraLookAt(camera, { target: [4, 0, 0], up: [0, 1, 0] });
      advanceFrame(runtime, transport);
      expect(hits).toEqual(['hover']);
      realm.clearCameraLookAt(camera.cameraId);
      advanceFrame(runtime, transport);
      expect(hits).toEqual(['hover', 'leave']);
    } finally {
      runtime.dispose();
    }
  });

  it('does not click after release outside, supports unsubscribe, and keeps pointers independent', () => {
    const { runtime, transport, realm, events, windowId } = setup();
    try {
      const entityId = realm.createSpatialNode();
      realm.addCollider(entityId, { type: 'circle', radius: 1 });
      const listener = runtime.interactive(1, { type: 'collider', entityId });
      const received: string[] = [];
      const off = listener.on('hover', (event) =>
        received.push(`hover:${event.pointer.pointerId}`)
      );
      listener.on('click', () => received.push('click'));
      advanceFrame(runtime, transport);
      events.push(move(windowId, 50, 50));
      events.push({ ...move(windowId, 50, 50), pointerId: 9 } as PlatformEvent);
      events.push(button(windowId, 50, 50, 'pressed'));
      events.push(move(windowId, 95, 95));
      events.push(button(windowId, 95, 95, 'released'));
      advanceFrame(runtime, transport);
      expect(received).toEqual(['hover:0', 'hover:9']);
      off();
      events.push(move(windowId, 50, 50));
      advanceFrame(runtime, transport);
      expect(received).toEqual(['hover:0', 'hover:9']);
    } finally {
      runtime.dispose();
    }
  });

  it('keeps the last submitted spatial state after a failed dispatch', () => {
    const { runtime, transport, realm, events, windowId, failDispatch } = setup();
    try {
      const entityId = realm.createSpatialNode();
      realm.addCollider(entityId, { type: 'circle', radius: 1 });
      const listener = runtime.interactive(1, { type: 'collider', entityId });
      const received: string[] = [];
      listener.on('hover', () => received.push('hover'));
      listener.on('leave', () => received.push('leave'));
      advanceFrame(runtime, transport);
      realm.world.getComponent<any>(entityId, 'Model2D').setPosition(3, 0);
      failDispatch(true);
      expect(() => advanceFrame(runtime, transport)).toThrow('dispatch failed');
      events.push(move(windowId, 50, 50));
      expect(() => advanceFrame(runtime, transport)).toThrow('dispatch failed');
      expect(received).toEqual(['hover']);
      failDispatch(false);
      advanceFrame(runtime, transport);
      expect(received).toEqual(['hover', 'leave']);
    } finally {
      runtime.dispose();
    }
  });
});
