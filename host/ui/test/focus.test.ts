import { describe, expect, it } from 'bun:test';
import type { GalfusEngine, GalfusTransport, PlatformEvent } from '@galfus/transport-types';
import { createRuntime } from '@galfus/engine';
import { createUi } from '../src/index';
import { advanceFrame } from '../../engine/test/controlled-transport';
import { button, move, setup, tab } from '../../engine/test/interactive-fixture';
import { createMockInteractionEngine } from '../../engine/test/mock-core-interaction';

describe('UI focus management and Tab navigation', () => {
  it('moves focus by Tab and Shift+Tab using priority and submitted visibility', () => {
    const { runtime, transport, realm, events, windowId, schedule, failDispatch, tabCapture } =
      setup();
    const ui = createUi(runtime);
    try {
      const a = realm.createSpatialNode();
      const b = realm.createSpatialNode();
      const c = realm.createSpatialNode();
      for (const entity of [a, b, c]) realm.addCollider(entity, { type: 'circle', radius: 1 });
      const first = ui.focusable(1, { type: 'collider', entityId: a });
      const second = ui.focusable(1, { type: 'collider', entityId: b }, { tabIndex: 2 });
      const third = ui.focusable(1, { type: 'collider', entityId: c }, { tabIndex: -1 });
      const seen: string[] = [];
      first.on('focus', () => seen.push('first focus'));
      first.on('blur', () => seen.push('first blur'));
      second.on('focus', () => seen.push('second focus'));
      expect(first.requestFocus(windowId)).toBe(false);
      advanceFrame(runtime, transport);
      expect(tabCapture).toEqual([[windowId, 1]]);
      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(second);
      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(first);
      events.push(tab(windowId, true));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(second);
      expect(third.requestFocus(windowId)).toBe(true);
      expect(ui.getFocused(windowId)).toBe(third);
      expect(seen).toEqual(['second focus', 'first focus', 'first blur', 'second focus']);
      schedule.targetBlocks[0]!.invocations.length = 0;
      failDispatch(true);
      expect(() => advanceFrame(runtime, transport)).toThrow('dispatch failed');
      expect(ui.getFocused(windowId)).toBe(third);
      failDispatch(false);
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBeUndefined();
      expect(tabCapture).toEqual([
        [windowId, 1],
        [windowId, 0]
      ]);
    } finally {
      runtime.dispose();
    }
  });

  it('focuses pointer targets and releases focus safely on disable and destruction', () => {
    const { runtime, transport, realm, events, windowId } = setup();
    const ui = createUi(runtime);
    try {
      const entityId = realm.createSpatialNode();
      realm.addCollider(entityId, { type: 'circle', radius: 1 });
      const target = ui.focusable(1, { type: 'collider', entityId });
      let blurs = 0;
      target.on('blur', () => {
        blurs++;
        target.dispose();
      });
      advanceFrame(runtime, transport);
      events.push(move(windowId, 50, 50), button(windowId, 50, 50, 'pressed'));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(target);
      target.dispose();
      expect(blurs).toBe(1);
      expect(ui.getFocused(windowId)).toBeUndefined();
      expect(target.isDisposed).toBe(true);
    } finally {
      runtime.dispose();
    }
  });

  it('does not navigate focus while an IME composition is active', () => {
    const { runtime, transport, realm, events, windowId } = setup();
    const ui = createUi(runtime);
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const target = ui.focusable(1, { type: 'collider', entityId: entity });
      advanceFrame(runtime, transport);
      events.push({ kind: 'keyboard', type: 'imePreedit', windowId, text: 'かな' }, tab(windowId));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBeUndefined();
      events.push({ kind: 'keyboard', type: 'imeDisabled', windowId }, tab(windowId));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(target);
    } finally {
      runtime.dispose();
    }
  });

  it('clears focus on window blur and rejects focus until the window is focused again', () => {
    const { runtime, transport, realm, events, windowId } = setup();
    const ui = createUi(runtime);
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const target = ui.focusable(1, { type: 'collider', entityId: entity });
      advanceFrame(runtime, transport);
      expect(target.requestFocus(windowId)).toBe(true);
      let refocus: boolean | undefined;
      target.on('blur', () => {
        refocus = target.requestFocus(windowId);
      });
      events.push({ kind: 'window', type: 'focusChanged', windowId, focused: false });
      advanceFrame(runtime, transport);
      expect(refocus).toBe(false);
      expect(ui.getFocused(windowId)).toBeUndefined();
      events.push({ kind: 'window', type: 'focusChanged', windowId, focused: true });
      advanceFrame(runtime, transport);
      expect(target.requestFocus(windowId)).toBe(true);
    } finally {
      runtime.dispose();
    }
  });

  it('clears focus when the user clicks outside focusable targets', () => {
    const { runtime, transport, realm, events, windowId } = setup();
    const ui = createUi(runtime);
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const target = ui.focusable(1, { type: 'collider', entityId: entity });
      advanceFrame(runtime, transport);
      expect(target.requestFocus(windowId)).toBe(true);
      events.push(move(windowId, 95, 95), button(windowId, 95, 95, 'pressed'));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBeUndefined();
    } finally {
      runtime.dispose();
    }
  });

  it('does not override a focus change made by a blur callback', () => {
    const { runtime, transport, realm, windowId } = setup();
    const ui = createUi(runtime);
    try {
      const a = realm.createSpatialNode();
      const b = realm.createSpatialNode();
      const c = realm.createSpatialNode();
      for (const entity of [a, b, c]) realm.addCollider(entity, { type: 'circle', radius: 1 });
      const first = ui.focusable(1, { type: 'collider', entityId: a });
      const second = ui.focusable(1, { type: 'collider', entityId: b });
      const redirected = ui.focusable(1, { type: 'collider', entityId: c });
      advanceFrame(runtime, transport);
      expect(first.requestFocus(windowId)).toBe(true);
      first.on('blur', () => redirected.requestFocus(windowId));
      expect(second.requestFocus(windowId)).toBe(false);
      expect(ui.getFocused(windowId)).toBe(redirected);
    } finally {
      runtime.dispose();
    }
  });

  it('captures Tab while a programmatically focused negative tabIndex target is active', () => {
    const { runtime, transport, realm, events, windowId, tabCapture } = setup();
    const ui = createUi(runtime);
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const target = ui.focusable(1, { type: 'collider', entityId: entity }, { tabIndex: -1 });
      advanceFrame(runtime, transport);
      expect(tabCapture).toEqual([]);
      expect(target.requestFocus(windowId)).toBe(true);
      expect(tabCapture).toEqual([[windowId, 1]]);
      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(target);
      target.blur(windowId);
      expect(tabCapture).toEqual([
        [windowId, 1],
        [windowId, 0]
      ]);
    } finally {
      runtime.dispose();
    }
  });

  it('releases Tab capture when an open window is no longer in the presented schedule', () => {
    const { runtime, transport, realm, windowId, tabCapture, schedule } = setup();
    const ui = createUi(runtime);
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const target = ui.focusable(1, { type: 'collider', entityId: entity });
      advanceFrame(runtime, transport);
      expect(target.requestFocus(windowId)).toBe(true);
      schedule.targetBlocks.length = 0;
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBeUndefined();
      expect(tabCapture).toEqual([
        [windowId, 1],
        [windowId, 0]
      ]);
    } finally {
      runtime.dispose();
    }
  });

  it('tracks focus independently per window and rejects ambiguous requests', () => {
    const { runtime, transport, realm, windowId, schedule } = setup();
    const ui = createUi(runtime);
    try {
      const otherWindow = runtime.platform.window.create();
      const targetId = runtime.multiverse.createTarget({
        kind: { type: 'window', windowId: otherWindow }
      });
      runtime.multiverse.createInvocation({ realmId: 1, targetId });
      schedule.targetBlocks.push({
        targetId,
        invocations: [
          {
            invocationId: 2,
            realmId: 1,
            resolvedViewport: [0, 0, 100, 100],
            zIndex: 0,
            filters: []
          }
        ]
      });
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const target = ui.focusable(1, { type: 'collider', entityId: entity });
      advanceFrame(runtime, transport);
      expect(target.requestFocus()).toBe(false);
      expect(target.requestFocus(windowId)).toBe(true);
      expect(target.requestFocus(otherWindow)).toBe(true);
      expect(ui.getFocused(windowId)).toBe(target);
      expect(ui.getFocused(otherWindow)).toBe(target);
      runtime.platform.window.close(otherWindow);
      expect(ui.getFocused(otherWindow)).toBeUndefined();
      expect(ui.getFocused(windowId)).toBe(target);
    } finally {
      runtime.dispose();
    }
  });

  it('releases a focused target after its entity is destroyed and a frame is submitted', () => {
    const { runtime, transport, realm, windowId } = setup();
    const ui = createUi(runtime);
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const target = ui.focusable(1, { type: 'collider', entityId: entity });
      const events: string[] = [];
      target.on('blur', () => events.push('blur'));
      advanceFrame(runtime, transport);
      expect(target.requestFocus(windowId)).toBe(true);
      realm.destroyEntity(entity);
      advanceFrame(runtime, transport);
      expect(events).toEqual(['blur']);
      expect(target.isDisposed).toBe(true);
      expect(ui.getFocused(windowId)).toBeUndefined();
    } finally {
      runtime.dispose();
    }
  });

  it('confines Tab navigation to the active realm and switches realms only via click or requestFocus', () => {
    const events: PlatformEvent[] = [];
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
        }
      ],
      softCutEdges: [] as Array<[number, number]>
    };
    let runtimeRef: any;
    const mockInteractions = createMockInteractionEngine((id) =>
      runtimeRef?.multiverse.getRealm(id)
    );
    const engine = new Proxy(
      {
        ...mockInteractions,
        platformPumpEvents: () => events.splice(0),
        windowSetTabCapture: () => {},
        windowSetImeAllowed: () => {},
        multiverseResolve: () => schedule,
        multiverseDispatch: () => {
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
    const ui = createUi(runtime);
    try {
      const windowId = runtime.platform.window.create();
      const realm1 = runtime.createRealm2D(1);
      realm1.createCamera({ orthoScale: 10 });
      const rootTargetId = runtime.multiverse.createTarget(10, {
        kind: { type: 'window', windowId }
      });
      runtime.multiverse.createInvocation(1, { realmId: 1, targetId: rootTargetId });

      const realm2 = runtime.createRealm2D(2);
      realm2.createCamera({ orthoScale: 10 });
      const target2 = runtime.multiverse.createTarget(20, {
        kind: { type: 'texture', width: 100, height: 100 }
      });
      runtime.multiverse.createInvocation(2, { realmId: 2, targetId: target2 });

      const e1A = realm1.createSpatialNode({ position: [-4, 0] });
      realm1.addCollider(e1A, { type: 'rectangle', halfExtents: [0.5, 0.5] });
      const e1B = realm1.createSpatialNode({ position: [4, 0] });
      realm1.addCollider(e1B, { type: 'rectangle', halfExtents: [0.5, 0.5] });
      const f1A = ui.focusable(1, { type: 'collider', entityId: e1A }, { tabIndex: 1 });
      const f1B = ui.focusable(1, { type: 'collider', entityId: e1B }, { tabIndex: 2 });

      const screen = realm1.createSpatialNode({ position: [0, 0] });
      realm1.addCollider(screen, { type: 'rectangle', halfExtents: [3, 3] });
      runtime.interactive(1, { type: 'collider', entityId: screen });
      runtime.multiverse.bindTargetTexture({ realmId: 1, slot: 'sub', sourceTargetId: 20 });
      runtime.multiverse.connectPresentationSurface({ realmId: 1, slot: 'sub', entityId: screen });

      const e2A = realm2.createSpatialNode({ position: [-1.5, 0] });
      realm2.addCollider(e2A, { type: 'rectangle', halfExtents: [1, 1] });
      const e2B = realm2.createSpatialNode({ position: [1.5, 0] });
      realm2.addCollider(e2B, { type: 'rectangle', halfExtents: [1, 1] });
      const f2A = ui.focusable(2, { type: 'collider', entityId: e2A }, { tabIndex: 1 });
      const f2B = ui.focusable(2, { type: 'collider', entityId: e2B }, { tabIndex: 2 });

      advanceFrame(runtime, transport);

      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(f1A);

      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(f1B);

      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(f1A);

      events.push(move(windowId, 40, 50), button(windowId, 40, 50, 'pressed'));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(f2A);

      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(f2B);

      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBe(f2A);

      f1B.requestFocus(windowId);
      expect(ui.getFocused(windowId)).toBe(f1B);
    } finally {
      runtime.dispose();
    }
  });
});
