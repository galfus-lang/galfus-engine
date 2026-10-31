import { describe, expect, it } from 'bun:test';
import type {
  GalfusEngine,
  GalfusTransport,
  InvocationDesc,
  TargetDesc,
  ViewportRect
} from '@galfus/transport-types';
import { MultiverseCoordinator } from '../src/multiverse/coordinator';

import { Realm3D } from '../src/realm3d/realm';
import { MultiverseRuntime } from '../src/runtime';

function createTrackingEngine() {
  const calls: {
    multiverseCreateTarget: Array<{ id: number; desc: TargetDesc }>;
    multiverseCreateInvocation: Array<{ id: number; desc: InvocationDesc }>;
    multiverseDestroyInvocation: number[];
    multiverseSetInvocationViewport: Array<{ id: number; viewport: ViewportRect }>;
    multiverseSetInvocationEnabled: Array<{ id: number; enabled: boolean }>;
    multiverseDispatch: number;
    realm3dCreate: number[];
    realm3dDestroy: number[];
    realm2dCreate: number[];
    realm2dDestroy: number[];
  } = {
    multiverseCreateTarget: [],
    multiverseCreateInvocation: [],
    multiverseDestroyInvocation: [],
    multiverseSetInvocationViewport: [],
    multiverseSetInvocationEnabled: [],
    multiverseDispatch: 0,
    realm3dCreate: [],
    realm3dDestroy: [],
    realm2dCreate: [],
    realm2dDestroy: []
  };

  const engine = {
    multiverseCreateTarget: (id: number, desc: TargetDesc) => {
      calls.multiverseCreateTarget.push({ id, desc });
    },
    multiverseDestroyTarget: (_id: number) => {},
    multiverseAttachWindow: (_id: number) => {},
    multiverseCreateInvocation: (id: number, desc: InvocationDesc) => {
      calls.multiverseCreateInvocation.push({ id, desc });
    },
    multiverseDestroyInvocation: (id: number) => {
      calls.multiverseDestroyInvocation.push(id);
    },
    multiverseSetInvocationViewport: (id: number, viewport: ViewportRect) => {
      calls.multiverseSetInvocationViewport.push({ id, viewport });
    },
    multiverseSetInvocationEnabled: (id: number, enabled: boolean) => {
      calls.multiverseSetInvocationEnabled.push({ id, enabled });
    },
    multiverseSetInvocationFilters: () => {},
    multiverseSetInvocationClearColor: () => {},
    multiverseSetInvocationCameraSlot: () => {},
    multiverseDispatch: () => {
      calls.multiverseDispatch++;
    },
    realm3dCreate: (id: number) => calls.realm3dCreate.push(id),
    realm3dDestroy: (id: number) => calls.realm3dDestroy.push(id),
    realm2dCreate: (id: number) => calls.realm2dCreate.push(id),
    realm2dDestroy: (id: number) => calls.realm2dDestroy.push(id)
  } as unknown as GalfusEngine;

  return { engine, calls };
}

function createMockTransport(engine: GalfusEngine): GalfusTransport {
  return {
    engine,
    isInitialized: true,
    isDisposed: false,
    isRunning: false,
    init: async () => {},
    startLoop: () => {},
    stopLoop: () => {},
    step: () => {},
    dispose: () => {}
  };
}

describe('Phases F18 & F19 — Viewports, Dynamic Composition & Transitions', () => {
  it('F18: separates logical viewport from clipped visible region without premature clamping', () => {
    const { engine } = createTrackingEngine();
    const multiverse = new MultiverseCoordinator();
    multiverse.bindEngine(engine);

    const realm = new Realm3D(1);
    multiverse.registerRealm(realm);

    const targetId = multiverse.createTarget({
      kind: { type: 'texture', width: 800, height: 600 }
    });

    // Logical viewport sliding into screen from right: starts at offsetX = 800px (100vw)
    const initialVp: ViewportRect = {
      offsetX: { vw: 100 },
      offsetY: { px: 0 },
      width: { vw: 100 },
      height: { vh: 100 }
    };

    const invId = multiverse.createInvocation({
      realmId: 1,
      targetId,
      viewport: initialVp
    });

    const stored = multiverse.getInvocation(invId);
    expect(stored).toBeDefined();
    expect(stored?.viewport?.offsetX).toEqual({ vw: 100 });
    expect(stored?.realmId).toBe(1);
    expect(stored?.targetId).toBe(targetId);
  });

  it('F19: updateInvocation updates presentation state while preserving realmId and targetId as strictly immutable', () => {
    const { engine } = createTrackingEngine();
    const multiverse = new MultiverseCoordinator();
    multiverse.bindEngine(engine);

    const realm = new Realm3D(1);
    multiverse.registerRealm(realm);
    const targetId = multiverse.createTarget({
      kind: { type: 'texture', width: 800, height: 600 }
    });

    const invId = multiverse.createInvocation({
      realmId: 1,
      targetId,
      viewport: { width: { vw: 100 }, height: { vh: 100 } }
    });

    // 1. Updating presentation properties succeeds
    multiverse.updateInvocation(invId, {
      zIndex: 10,
      viewport: {
        offsetX: { px: -50 },
        width: { vw: 50 },
        height: { vh: 50 }
      }
    });

    const updated = multiverse.getInvocation(invId);
    expect(updated?.zIndex).toBe(10);
    expect(updated?.viewport?.offsetX).toEqual({ px: -50 });
    expect(updated?.viewport?.width).toEqual({ vw: 50 });

    // 2. Attempting to mutate realmId or targetId is strictly prohibited
    expect(() => {
      multiverse.updateInvocation(invId, { realmId: 99 } as any);
    }).toThrow('Cannot mutate realmId or targetId of an existing invocation.');

    expect(() => {
      multiverse.updateInvocation(invId, { targetId: 99 } as any);
    }).toThrow('Cannot mutate realmId or targetId of an existing invocation.');

    // 3. Updating non-existent invocation throws error
    expect(() => {
      multiverse.updateInvocation(999, { zIndex: 1 });
    }).toThrow('Cannot update non-existent invocation 999.');
  });

  it('F19: coalesces multiple viewport mutations within the same frame to exactly one ABI call on dispatch', () => {
    const { engine, calls } = createTrackingEngine();
    const multiverse = new MultiverseCoordinator();
    multiverse.bindEngine(engine);

    const realm = new Realm3D(1);
    multiverse.registerRealm(realm);
    const targetId = multiverse.createTarget({
      kind: { type: 'texture', width: 800, height: 600 }
    });

    const invId = multiverse.createInvocation({
      realmId: 1,
      targetId,
      viewport: { width: { vw: 100 }, height: { vh: 100 } }
    });

    expect(calls.multiverseSetInvocationViewport.length).toBe(0);

    // Simulate 5 rapid updates in the same frame (e.g. from script, mouse move, or animation ticks)
    for (let i = 1; i <= 5; i++) {
      multiverse.updateInvocation(invId, {
        viewport: {
          offsetX: { px: i * 20 },
          offsetY: { px: 0 },
          width: { vw: 100 },
          height: { vh: 100 }
        }
      });
    }

    // Prior to dispatch/resolve, zero ABI calls were issued
    expect(calls.multiverseSetInvocationViewport.length).toBe(0);

    // Dispatch executes frame boundary flush
    multiverse.dispatch(1, 0.016);

    // Exactly ONE ABI call issued with the final coalesced value (offsetX = 100px)
    expect(calls.multiverseSetInvocationViewport.length).toBe(1);
    expect(calls.multiverseSetInvocationViewport[0]?.viewport.offsetX).toEqual({ px: 100 });

    // Subsequent dispatch with no modifications generates zero ABI calls
    multiverse.dispatch(2, 0.016);
    expect(calls.multiverseSetInvocationViewport.length).toBe(1);
  });

  it('F19: seamless transition from Realm Menu to Realm Gameplay over the same Target without rebinding', () => {
    const { engine, calls } = createTrackingEngine();
    const transport = createMockTransport(engine);
    const runtime = new MultiverseRuntime(transport);

    // 1. Create two independent realms (2D Menu HUD and 3D Scene Gameplay)
    const realmMenu = runtime.createRealm2D(10);
    const realmGameplay = runtime.createRealm3D(20);

    const targetId = runtime.multiverse.createTarget({
      kind: { type: 'texture', width: 1280, height: 720 }
    });

    // 2. Both invocations target the exact same display surface
    const invMenu = runtime.multiverse.createInvocation({
      realmId: realmMenu.realmId,
      targetId,
      viewport: { offsetX: { vw: 0 }, width: { vw: 100 }, height: { vh: 100 } },
      zIndex: 1
    });

    const invGameplay = runtime.multiverse.createInvocation({
      realmId: realmGameplay.realmId,
      targetId,
      viewport: { offsetX: { vw: 100 }, width: { vw: 100 }, height: { vh: 100 } },
      zIndex: 0
    });

    expect(runtime.multiverse.getInvocation(invMenu)?.realmId).toBe(10);
    expect(runtime.multiverse.getInvocation(invGameplay)?.realmId).toBe(20);

    // Frame 1: Menu centered (0vw), Gameplay offscreen right (100vw)
    runtime.tick();
    expect(calls.multiverseDispatch).toBe(1);

    // Frame 2: Mid-transition slide (Menu at -50vw, Gameplay at 50vw)
    runtime.multiverse.updateInvocation(invMenu, {
      viewport: { offsetX: { vw: -50 }, width: { vw: 100 }, height: { vh: 100 } }
    });
    runtime.multiverse.updateInvocation(invGameplay, {
      viewport: { offsetX: { vw: 50 }, width: { vw: 100 }, height: { vh: 100 } }
    });

    runtime.tick();
    expect(calls.multiverseDispatch).toBe(2);

    // Frame 3: Completed transition (Menu fully offscreen at -100vw, Gameplay centered at 0vw)
    runtime.multiverse.updateInvocation(invMenu, {
      viewport: { offsetX: { vw: -100 }, width: { vw: 100 }, height: { vh: 100 } }
    });
    runtime.multiverse.updateInvocation(invGameplay, {
      viewport: { offsetX: { vw: 0 }, width: { vw: 100 }, height: { vh: 100 } }
    });

    runtime.tick();
    expect(calls.multiverseDispatch).toBe(3);

    // Both realms remain alive and intact without rebinding
    expect(realmMenu.isDisposed).toBe(false);
    expect(realmGameplay.isDisposed).toBe(false);

    // Unregistering the old Menu realm cleanly destroys its invocation without touching Gameplay
    runtime.multiverse.unregisterRealm(realmMenu.realmId);
    expect(realmMenu.isDisposed).toBe(true);
    expect(runtime.multiverse.getInvocation(invMenu)).toBeUndefined();
    expect(runtime.multiverse.getInvocation(invGameplay)).toBeDefined();
    expect(realmGameplay.isDisposed).toBe(false);
  });

  it('F19: legacy setters forward directly to updateInvocation with coalescing support', () => {
    const { engine, calls } = createTrackingEngine();
    const multiverse = new MultiverseCoordinator();
    multiverse.bindEngine(engine);

    const realm = new Realm3D(1);
    multiverse.registerRealm(realm);
    const targetId = multiverse.createTarget({
      kind: { type: 'texture', width: 800, height: 600 }
    });

    const invId = multiverse.createInvocation({
      realmId: 1,
      targetId,
      viewport: { width: { vw: 100 }, height: { vh: 100 } }
    });

    // Calling legacy setters
    multiverse.setInvocationViewport(invId, {
      offsetX: { px: 42 },
      width: { vw: 80 },
      height: { vh: 80 }
    });
    multiverse.setInvocationEnabled(invId, false);

    expect(calls.multiverseSetInvocationViewport.length).toBe(0);
    expect(calls.multiverseSetInvocationEnabled.length).toBe(0);

    // Flush on resolve/dispatch
    multiverse.resolve();

    expect(calls.multiverseSetInvocationViewport.length).toBe(1);
    expect(calls.multiverseSetInvocationViewport[0]?.viewport.offsetX).toEqual({ px: 42 });
    expect(calls.multiverseSetInvocationEnabled.length).toBe(1);
    expect(calls.multiverseSetInvocationEnabled[0]?.enabled).toBe(false);
  });
});
