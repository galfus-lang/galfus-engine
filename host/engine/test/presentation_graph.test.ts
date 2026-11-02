import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, GalfusTransport, MultiverseSchedule } from '@galfus/transport-types';
import { MultiverseCoordinator, type RealmConnector } from '../src/multiverse';
import { createRuntime } from '../src/runtime';

function realm(id: number): RealmConnector {
  return { realmId: id, realmKind: '2d', bindEngine: () => {}, sync: () => {}, dispose: () => {} };
}
function schedule(groups: Array<[number, Array<[number, number, number?]>]>): MultiverseSchedule {
  return {
    targetBlocks: groups.map(([targetId, entries]) => ({
      targetId,
      invocations: entries.map(([invocationId, realmId, zIndex]) => ({
        invocationId,
        realmId,
        zIndex: zIndex ?? 0,
        resolvedViewport: [0, 0, 100, 100],
        filters: []
      }))
    }))
  };
}
function setup() {
  const m = new MultiverseCoordinator();
  m.windowOpened(100);
  m.windowOpened(200);
  m.registerRealm(realm(1));
  m.registerRealm(realm(2));
  m.registerRealm(realm(3));
  m.createTarget(10, { kind: { type: 'window', windowId: 100 } });
  m.createTarget(20, { kind: { type: 'window', windowId: 200 } });
  m.createTarget(30, { kind: { type: 'texture', width: 100, height: 100 } });
  m.createTarget(40, { kind: { type: 'texture', width: 100, height: 100 } });
  m.createInvocation(11, { realmId: 1, targetId: 10 });
  m.createInvocation(21, { realmId: 3, targetId: 20 });
  m.createInvocation(31, { realmId: 2, targetId: 30 });
  m.createInvocation(41, { realmId: 2, targetId: 40 });
  return m;
}
function attach(m: MultiverseCoordinator) {
  let current: MultiverseSchedule | undefined = schedule([
    [10, [[11, 1]]],
    [20, [[21, 3]]],
    [30, [[31, 2]]],
    [40, [[41, 2]]]
  ]);
  let fail = false;
  const engine = {
    multiverseAttachWindow: () => {},
    multiverseCreateTarget: () => {},
    multiverseDestroyTarget: () => {},
    multiverseCreateInvocation: () => {},
    multiverseDestroyInvocation: () => {},
    multiverseBindTargetTexture: () => {},
    multiverseUnbindTargetTexture: () => {},
    multiverseSetInvocationEnabled: () => {},
    multiverseSetInvocationViewport: () => {},
    multiverseSetInvocationZIndex: () => {},
    multiverseResolve: () => current,
    multiverseDispatch: () => {
      if (fail) throw new Error('dispatch failed');
    }
  } as unknown as GalfusEngine;
  m.bindEngine(engine);
  return {
    engine,
    setSchedule: (value: MultiverseSchedule | undefined) => {
      current = value;
    },
    failDispatch: (value: boolean) => {
      fail = value;
    }
  };
}

describe('schedule-backed presentation graph', () => {
  it('publishes only after successful dispatch and reuses unchanged views', () => {
    const m = setup();
    const h = attach(m);
    expect(m.presentationGraph.getWindow(100)).toBeUndefined();
    m.resolve();
    expect(m.presentationGraph.getWindow(100)).toBeUndefined();
    m.dispatch(1, 0.016);
    const previous = m.presentationGraph.getWindow(100)!;
    expect(previous.targetIds).toEqual([10]);
    expect(previous.getInvocations(10)).toEqual([11]);
    expect(previous.getInvocation(11)?.resolvedViewport).toEqual([0, 0, 100, 100]);
    expect(Object.isFrozen(previous)).toBe(true);
    expect(Object.isFrozen(previous.getInvocation(11)?.resolvedViewport)).toBe(true);
    m.dispatch(2, 0.016);
    expect(m.presentationGraph.getWindow(100)).toBe(previous);
    h.setSchedule(
      schedule([
        [
          10,
          [
            [11, 1],
            [13, 1, 2]
          ]
        ]
      ])
    );
    h.failDispatch(true);
    expect(() => m.dispatch(3, 0.016)).toThrow('dispatch failed');
    expect(m.presentationGraph.getWindow(100)).toBe(previous);
    h.failDispatch(false);
    m.dispatch(4, 0.016);
    expect(m.presentationGraph.getWindow(100)?.getInvocations(10)).toEqual([11, 13]);
    h.setSchedule(undefined);
    m.dispatch(5, 0.016);
    expect(m.presentationGraph.getWindow(100)).toBeUndefined();
  });
  it('uses renderer order, viewport and only scheduled invocations', () => {
    const m = setup();
    const h = attach(m);
    const state = schedule([
      [
        10,
        [
          [13, 1, -1],
          [11, 1, 7]
        ]
      ]
    ]);
    state.targetBlocks[0]!.invocations[0]!.resolvedViewport = [5, 6, 20, 30];
    h.setSchedule(state);
    m.dispatch(1, 0.016);
    const view = m.presentationGraph.getWindow(100)!;
    expect(view.getInvocations(10)).toEqual([13, 11]);
    expect(view.getInvocation(13)?.resolvedViewport).toEqual([5, 6, 20, 30]);
    expect(view.getInvocation(13)?.zIndex).toBe(-1);
    expect(m.presentationGraph.getWindow(200)).toBeUndefined();
  });
  it('uses host links for confirmed surfaces without changing the published frame early', () => {
    const m = setup();
    const h = attach(m);
    m.bindTargetTexture({ realmId: 1, slot: 'screen', sourceTargetId: 30 });
    m.dispatch(1, 0.016);
    const first = m.presentationGraph.getWindow(100)!;
    expect(first.targetIds).toEqual([10]);
    expect(first.getCandidates(1)).toEqual([{ realmId: 1, slot: 'screen', sourceTargetId: 30 }]);
    m.connectPresentationSurface({ realmId: 1, slot: 'screen', entityId: 7 });
    expect(m.presentationGraph.getWindow(100)).toBe(first);
    m.dispatch(2, 0.016);
    expect(m.presentationGraph.getWindow(100)!.targetIds).toEqual([10, 30]);
    m.bindTargetTexture({ realmId: 2, slot: 'back', sourceTargetId: 30 });
    m.connectPresentationSurface({ realmId: 2, slot: 'back', entityId: 9 });
    m.dispatch(3, 0.016);
    expect(m.presentationGraph.getWindow(100)!.targetIds).toEqual([10, 30]);
    h.setSchedule(
      schedule([
        [10, [[11, 1]]],
        [20, [[21, 3]]]
      ])
    );
    m.dispatch(4, 0.016);
    expect(m.presentationGraph.getWindow(100)!.connections).toEqual([]);
    expect(m.presentationGraph.getWindow(100)!.candidateBindings).toHaveLength(1);
  });
  it('preserves the renderer cycle cuts as immutable snapshot data', () => {
    const m = setup();
    const h = attach(m);
    m.bindTargetTexture({ realmId: 1, slot: 'screen', sourceTargetId: 30 });
    m.connectPresentationSurface({ realmId: 1, slot: 'screen', entityId: 7 });
    const state = schedule([
      [10, [[11, 1]]],
      [30, [[31, 2]]]
    ]);
    state.softCutEdges = [[30, 10]];
    h.setSchedule(state);
    m.dispatch(1, 0.016);
    const view = m.presentationGraph.getWindow(100)!;
    expect(view.softCutEdges).toEqual([[30, 10]]);
    expect(Object.isFrozen(view.softCutEdges[0])).toBe(true);
    state.softCutEdges[0]![0] = 99;
    expect(view.softCutEdges).toEqual([[30, 10]]);
  });
  it('keeps shared paths independent and removes closed windows immediately', () => {
    const m = setup();
    attach(m);
    m.bindTargetTexture({ realmId: 1, slot: 'screen', sourceTargetId: 30 });
    m.bindTargetTexture({ realmId: 3, slot: 'screen', sourceTargetId: 30 });
    m.connectPresentationSurface({ realmId: 1, slot: 'screen', entityId: 7 });
    m.connectPresentationSurface({ realmId: 3, slot: 'screen', entityId: 8 });
    m.dispatch(1, 0.016);
    expect(m.presentationGraph.getWindow(100)!.targetIds).toEqual([10, 30]);
    const other = m.presentationGraph.getWindow(200)!;
    m.windowClosed(100);
    expect(m.presentationGraph.getWindow(100)).toBeUndefined();
    expect(m.presentationGraph.getWindow(200)).toBe(other);
    m.windowOpened(100);
    expect(m.presentationGraph.getWindow(100)).toBeUndefined();
    m.dispatch(2, 0.016);
    expect(m.presentationGraph.getWindow(100)!.targetIds).toEqual([10, 30]);
  });
  it('keeps the last frame until a successful dispatch after target destruction', () => {
    const m = setup();
    const h = attach(m);
    m.dispatch(1, 0.016);
    const previous = m.presentationGraph.getWindow(100)!;
    m.destroyTarget(10);
    expect(m.getInvocation(11)).toBeUndefined();
    expect(m.presentationGraph.getWindow(100)).toBe(previous);
    h.setSchedule(schedule([[20, [[21, 3]]]]));
    m.dispatch(2, 0.016);
    expect(m.presentationGraph.getWindow(100)).toBeUndefined();
    m.reset();
    expect(m.presentationGraph.getWindowIds()).toEqual([]);
  });
  it('replays pre-bound resources in dependency order and retries without duplicates', () => {
    const m = setup();
    m.bindTargetTexture({ realmId: 1, slot: 'screen', sourceTargetId: 30 });
    let fail = true;
    const calls: string[] = [];
    const engine = {
      multiverseAttachWindow: () => {},
      multiverseCreateTarget: (id: number) => calls.push(`target:${id}`),
      multiverseCreateInvocation: (id: number) => {
        if (id === 21 && fail) {
          fail = false;
          throw new Error('failure');
        }
        calls.push(`inv:${id}`);
      },
      multiverseBindTargetTexture: () => calls.push('bind')
    } as unknown as GalfusEngine;
    expect(() => m.bindEngine(engine)).toThrow('failure');
    m.bindEngine(engine);
    expect(calls.filter((x) => x === 'target:10')).toHaveLength(1);
    expect(calls.filter((x) => x === 'inv:11')).toHaveLength(1);
    expect(calls.at(-1)).toBe('bind');
  });
  it('forwards z-index updates and protects owned descriptors', () => {
    const m = setup();
    const calls: Array<[number, number]> = [];
    const engine = {
      multiverseAttachWindow: () => {},
      multiverseCreateTarget: () => {},
      multiverseCreateInvocation: () => {},
      multiverseSetInvocationZIndex: (id: number, z: number) => calls.push([id, z])
    } as unknown as GalfusEngine;
    m.bindEngine(engine);
    m.updateInvocation(11, { zIndex: 3 });
    m.updateInvocation(11, { zIndex: -2 });
    m.flushUpdates();
    expect(calls).toEqual([[11, -2]]);
    const copy = m.getInvocation(11)!;
    copy.zIndex = 99;
    expect(m.getInvocation(11)?.zIndex).toBe(-2);
    expect(() => m.updateInvocation(11, { zIndex: 1.5 })).toThrow();
  });
  it('removes a window immediately when the platform actually closes it', () => {
    const engine = {
      windowCreate: () => {},
      windowClose: () => {},
      multiverseCreateTarget: () => {},
      multiverseAttachWindow: () => {},
      multiverseCreateInvocation: () => {},
      multiverseDestroyInvocation: () => {},
      multiverseDestroyTarget: () => {},
      multiverseResolve: () => schedule([[10, [[11, 1]]]]),
      multiverseDispatch: () => {}
    } as unknown as GalfusEngine;
    const transport = {
      engine,
      isInitialized: true,
      isDisposed: false,
      isRunning: false,
      init: () => {},
      startLoop: () => {},
      stopLoop: () => {},
      dispose: () => {}
    } as unknown as GalfusTransport;
    const runtime = createRuntime(transport);
    const window = runtime.platform.window.create();
    runtime.multiverse.registerRealm(realm(1));
    runtime.multiverse.createTarget(10, { kind: { type: 'window', windowId: window } });
    runtime.multiverse.createInvocation(11, { realmId: 1, targetId: 10 });
    runtime.multiverse.dispatch(1, 0.016);
    expect(runtime.multiverse.presentationGraph.getWindow(window)?.invocationIds).toEqual([11]);
    runtime.platform.window.close(window);
    expect(runtime.multiverse.presentationGraph.getWindow(window)).toBeUndefined();
    runtime.dispose();
  });
});
