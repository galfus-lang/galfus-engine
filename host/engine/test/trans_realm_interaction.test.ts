import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, GalfusTransport, PlatformEvent } from '@galfus/transport-types';
import { createRuntime } from '../src/runtime';
import { advanceFrame } from './controlled-transport';
import { button, move } from './interactive-fixture';

function setupMultiRealm() {
  const events: PlatformEvent[] = [];
  const tabCapture: Array<[number, number]> = [];
  const schedule = {
    targetBlocks: [
      {
        targetId: 10,
        invocations: [
          {
            invocationId: 1,
            realmId: 1,
            resolvedViewport: [0, 0, 100, 100],
            zIndex: 0,
            filters: []
          }
        ]
      },
      {
        targetId: 20,
        invocations: [
          {
            invocationId: 2,
            realmId: 2,
            resolvedViewport: [0, 0, 100, 100],
            zIndex: 0,
            filters: []
          }
        ]
      },
      {
        targetId: 30,
        invocations: [
          {
            invocationId: 3,
            realmId: 3,
            resolvedViewport: [0, 0, 100, 100],
            zIndex: 0,
            filters: []
          }
        ]
      }
    ],
    softCutEdges: [] as Array<[number, number]>
  };

  const engine = new Proxy(
    {
      platformPumpEvents: () => events.splice(0),
      windowSetTabCapture: (id: number, enabled: number) => tabCapture.push([id, enabled]),
      windowSetImeAllowed: () => {},
      multiverseResolve: () => schedule,
      multiverseDispatch: () => {}
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

  // Realm 1 (Window Target 10)
  const realm1 = runtime.createRealm2D(1);
  realm1.createCamera({ orthoScale: 10 });
  const rootTargetId = runtime.multiverse.createTarget(10, { kind: { type: 'window', windowId } });
  runtime.multiverse.createInvocation(1, { realmId: 1, targetId: rootTargetId });

  // Realm 2 (Texture Target 20)
  const realm2 = runtime.createRealm2D(2);
  realm2.createCamera({ orthoScale: 10 });
  const target2 = runtime.multiverse.createTarget(20, {
    kind: { type: 'texture', width: 100, height: 100 }
  });
  runtime.multiverse.createInvocation(2, { realmId: 2, targetId: target2 });

  // Realm 3 (Texture Target 30)
  const realm3 = runtime.createRealm2D(3);
  realm3.createCamera({ orthoScale: 10 });
  const target3 = runtime.multiverse.createTarget(30, {
    kind: { type: 'texture', width: 100, height: 100 }
  });
  runtime.multiverse.createInvocation(3, { realmId: 3, targetId: target3 });

  return { runtime, transport, realm1, realm2, realm3, events, windowId, schedule, tabCapture };
}

describe('trans-realm event traversal and depth limit', () => {
  it('traverses pointer events through presentation connections up to 3 realms deep', () => {
    const { runtime, transport, realm1, realm2, realm3, events, windowId } = setupMultiRealm();

    // In Realm 1: Entity 101 is an interactive surface connected to Texture 20 (Realm 2)
    const entity101 = realm1.createSpatialNode({ position: [0, 0] });
    realm1.addCollider(entity101, { type: 'rectangle', halfExtents: [5, 5] });
    runtime.interactive(1, { type: 'collider', entityId: entity101 });
    runtime.multiverse.bindTargetTexture({ realmId: 1, slot: 'screen', sourceTargetId: 20 });
    runtime.multiverse.connectPresentationSurface({
      realmId: 1,
      slot: 'screen',
      entityId: entity101
    });

    // In Realm 2: Entity 201 is an interactive surface connected to Texture 30 (Realm 3)
    const entity201 = realm2.createSpatialNode({ position: [0, 0] });
    realm2.addCollider(entity201, { type: 'rectangle', halfExtents: [5, 5] });
    runtime.interactive(2, { type: 'collider', entityId: entity201 });
    runtime.multiverse.bindTargetTexture({ realmId: 2, slot: 'portal', sourceTargetId: 30 });
    runtime.multiverse.connectPresentationSurface({
      realmId: 2,
      slot: 'portal',
      entityId: entity201
    });

    // In Realm 3 (Level 3): Entity 301 is an interactive button
    const entity301 = realm3.createSpatialNode({ position: [0, 0] });
    realm3.addCollider(entity301, { type: 'rectangle', halfExtents: [4, 4] });
    const listener301 = runtime.interactive(3, { type: 'collider', entityId: entity301 });
    const clicks: any[] = [];
    listener301.on('click', (e) => clicks.push(e));

    // Submit frame to publish presentation graph
    advanceFrame(runtime, transport);

    // Click at center of window (50, 50 in 100x100 window)
    events.push(
      move(windowId, 50, 50),
      button(windowId, 50, 50, 'pressed'),
      button(windowId, 50, 50, 'released')
    );
    advanceFrame(runtime, transport);

    expect(clicks).toHaveLength(1);
    expect(clicks[0].realmId).toBe(3);
    expect(clicks[0].pointer.position).toEqual([50, 50]);
  });

  it('halts traversal and safely breaks cyclic connections at depth 3', () => {
    const { runtime, transport, realm1, realm2, realm3, events, windowId, schedule } =
      setupMultiRealm();

    // Cyclic connection: Realm 1 -> Realm 2 -> Realm 3 -> Realm 2
    const entity1 = realm1.createSpatialNode({ position: [0, 0] });
    realm1.addCollider(entity1, { type: 'rectangle', halfExtents: [5, 5] });
    runtime.interactive(1, { type: 'collider', entityId: entity1 });
    runtime.multiverse.bindTargetTexture({ realmId: 1, slot: 'tex2', sourceTargetId: 20 });
    runtime.multiverse.connectPresentationSurface({ realmId: 1, slot: 'tex2', entityId: entity1 });

    const entity2 = realm2.createSpatialNode({ position: [0, 0] });
    realm2.addCollider(entity2, { type: 'rectangle', halfExtents: [5, 5] });
    runtime.interactive(2, { type: 'collider', entityId: entity2 });
    runtime.multiverse.bindTargetTexture({ realmId: 2, slot: 'tex3', sourceTargetId: 30 });
    runtime.multiverse.connectPresentationSurface({ realmId: 2, slot: 'tex3', entityId: entity2 });

    const entity3 = realm3.createSpatialNode({ position: [0, 0] });
    realm3.addCollider(entity3, { type: 'rectangle', halfExtents: [5, 5] });
    const listener3 = runtime.interactive(3, { type: 'collider', entityId: entity3 });
    runtime.multiverse.bindTargetTexture({ realmId: 3, slot: 'tex2_cycle', sourceTargetId: 20 });
    runtime.multiverse.connectPresentationSurface({
      realmId: 3,
      slot: 'tex2_cycle',
      entityId: entity3
    });
    schedule.softCutEdges = [[20, 30]];

    const clicks: any[] = [];
    listener3.on('click', (e) => clicks.push(e));

    advanceFrame(runtime, transport);

    // Pointer click should reach depth 3 (Realm 3) and stop without looping infinitely
    events.push(
      move(windowId, 50, 50),
      button(windowId, 50, 50, 'pressed'),
      button(windowId, 50, 50, 'released')
    );
    advanceFrame(runtime, transport);

    expect(clicks).toHaveLength(1);
    expect(clicks[0].realmId).toBe(3);
  });
});
