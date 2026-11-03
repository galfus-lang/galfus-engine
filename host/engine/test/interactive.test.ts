import { describe, expect, it } from 'bun:test';
import type { PlatformEvent } from '@galfus/transport-types';
import type { Collider2DComponent } from '../src/collision';
import { advanceFrame } from './controlled-transport';
import { button, move, setup, tab } from './interactive-fixture';

describe('pointer interaction in direct realms', () => {
  it('moves focus by Tab and Shift+Tab using priority and submitted visibility', () => {
    const { runtime, transport, realm, events, windowId, schedule, failDispatch, tabCapture } =
      setup();
    try {
      const a = realm.createSpatialNode();
      const b = realm.createSpatialNode();
      const c = realm.createSpatialNode();
      for (const entity of [a, b, c]) realm.addCollider(entity, { type: 'circle', radius: 1 });
      const first = runtime.focusable(1, { type: 'collider', entityId: a });
      const second = runtime.focusable(1, { type: 'collider', entityId: b }, { tabIndex: 2 });
      const third = runtime.focusable(1, { type: 'collider', entityId: c }, { tabIndex: -1 });
      const seen: string[] = [];
      first.on('focus', () => seen.push('first focus'));
      first.on('blur', () => seen.push('first blur'));
      second.on('focus', () => seen.push('second focus'));
      expect(first.requestFocus(windowId)).toBe(false);
      advanceFrame(runtime, transport);
      expect(tabCapture).toEqual([[windowId, 1]]);
      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)).toBe(second);
      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)).toBe(first);
      events.push(tab(windowId, true));
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)).toBe(second);
      expect(third.requestFocus(windowId)).toBe(true);
      expect(runtime.getFocused(windowId)).toBe(third);
      expect(seen).toEqual(['second focus', 'first focus', 'first blur', 'second focus']);
      schedule.targetBlocks[0]!.invocations.length = 0;
      failDispatch(true);
      expect(() => advanceFrame(runtime, transport)).toThrow('dispatch failed');
      expect(runtime.getFocused(windowId)).toBe(third);
      failDispatch(false);
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)).toBeUndefined();
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
    try {
      const entityId = realm.createSpatialNode();
      realm.addCollider(entityId, { type: 'circle', radius: 1 });
      const target = runtime.focusable(1, { type: 'collider', entityId });
      let blurs = 0;
      target.on('blur', () => {
        blurs++;
        target.dispose();
      });
      advanceFrame(runtime, transport);
      events.push(move(windowId, 50, 50), button(windowId, 50, 50, 'pressed'));
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)).toBe(target);
      target.dispose();
      expect(blurs).toBe(1);
      expect(runtime.getFocused(windowId)).toBeUndefined();
      expect(target.isDisposed).toBe(true);
    } finally {
      runtime.dispose();
    }
  });

  it('does not navigate focus while an IME composition is active', () => {
    const { runtime, transport, realm, events, windowId } = setup();
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const target = runtime.focusable(1, { type: 'collider', entityId: entity });
      advanceFrame(runtime, transport);
      events.push({ kind: 'keyboard', type: 'imePreedit', windowId, text: 'かな' }, tab(windowId));
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)).toBeUndefined();
      events.push({ kind: 'keyboard', type: 'imeDisabled', windowId }, tab(windowId));
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)).toBe(target);
    } finally {
      runtime.dispose();
    }
  });

  it('clears focus on window blur and rejects focus until the window is focused again', () => {
    const { runtime, transport, realm, events, windowId } = setup();
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const target = runtime.focusable(1, { type: 'collider', entityId: entity });
      advanceFrame(runtime, transport);
      expect(target.requestFocus(windowId)).toBe(true);
      let refocus: boolean | undefined;
      target.on('blur', () => {
        refocus = target.requestFocus(windowId);
      });
      events.push({ kind: 'window', type: 'focusChanged', windowId, focused: false });
      advanceFrame(runtime, transport);
      expect(refocus).toBe(false);
      expect(runtime.getFocused(windowId)).toBeUndefined();
      events.push({ kind: 'window', type: 'focusChanged', windowId, focused: true });
      advanceFrame(runtime, transport);
      expect(target.requestFocus(windowId)).toBe(true);
    } finally {
      runtime.dispose();
    }
  });

  it('clears focus when the user clicks outside focusable targets', () => {
    const { runtime, transport, realm, events, windowId } = setup();
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const target = runtime.focusable(1, { type: 'collider', entityId: entity });
      advanceFrame(runtime, transport);
      expect(target.requestFocus(windowId)).toBe(true);
      events.push(move(windowId, 95, 95), button(windowId, 95, 95, 'pressed'));
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)).toBeUndefined();
    } finally {
      runtime.dispose();
    }
  });

  it('does not override a focus change made by a blur callback', () => {
    const { runtime, transport, realm, windowId } = setup();
    try {
      const a = realm.createSpatialNode();
      const b = realm.createSpatialNode();
      const c = realm.createSpatialNode();
      for (const entity of [a, b, c]) realm.addCollider(entity, { type: 'circle', radius: 1 });
      const first = runtime.focusable(1, { type: 'collider', entityId: a });
      const second = runtime.focusable(1, { type: 'collider', entityId: b });
      const redirected = runtime.focusable(1, { type: 'collider', entityId: c });
      advanceFrame(runtime, transport);
      expect(first.requestFocus(windowId)).toBe(true);
      first.on('blur', () => redirected.requestFocus(windowId));
      expect(second.requestFocus(windowId)).toBe(false);
      expect(runtime.getFocused(windowId)).toBe(redirected);
    } finally {
      runtime.dispose();
    }
  });

  it('captures Tab while a programmatically focused negative tabIndex target is active', () => {
    const { runtime, transport, realm, events, windowId, tabCapture } = setup();
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const target = runtime.focusable(1, { type: 'collider', entityId: entity }, { tabIndex: -1 });
      advanceFrame(runtime, transport);
      expect(tabCapture).toEqual([]);
      expect(target.requestFocus(windowId)).toBe(true);
      expect(tabCapture).toEqual([[windowId, 1]]);
      events.push(tab(windowId));
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)).toBe(target);
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
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const target = runtime.focusable(1, { type: 'collider', entityId: entity });
      advanceFrame(runtime, transport);
      expect(target.requestFocus(windowId)).toBe(true);
      schedule.targetBlocks.length = 0;
      advanceFrame(runtime, transport);
      expect(runtime.getFocused(windowId)).toBeUndefined();
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
      const target = runtime.focusable(1, { type: 'collider', entityId: entity });
      advanceFrame(runtime, transport);
      expect(target.requestFocus()).toBe(false);
      expect(target.requestFocus(windowId)).toBe(true);
      expect(target.requestFocus(otherWindow)).toBe(true);
      expect(runtime.getFocused(windowId)).toBe(target);
      expect(runtime.getFocused(otherWindow)).toBe(target);
      runtime.platform.window.close(otherWindow);
      expect(runtime.getFocused(otherWindow)).toBeUndefined();
      expect(runtime.getFocused(windowId)).toBe(target);
    } finally {
      runtime.dispose();
    }
  });

  it('releases a focused target after its entity is destroyed and a frame is submitted', () => {
    const { runtime, transport, realm, windowId } = setup();
    try {
      const entity = realm.createSpatialNode();
      realm.addCollider(entity, { type: 'circle', radius: 1 });
      const target = runtime.focusable(1, { type: 'collider', entityId: entity });
      const events: string[] = [];
      target.on('blur', () => events.push('blur'));
      advanceFrame(runtime, transport);
      expect(target.requestFocus(windowId)).toBe(true);
      realm.destroyEntity(entity);
      advanceFrame(runtime, transport);
      expect(events).toEqual(['blur']);
      expect(target.isDisposed).toBe(true);
      expect(runtime.getFocused(windowId)).toBeUndefined();
    } finally {
      runtime.dispose();
    }
  });
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

  it('cancels and releases listeners when their collider is removed', () => {
    const { runtime, transport, realm, events, windowId, failDispatch } = setup();
    try {
      const entityId = realm.createSpatialNode();
      const colliderId = realm.addCollider(entityId, { type: 'circle', radius: 1 });
      const listener = runtime.interactive(1, { type: 'collider', entityId, colliderId });
      const received: string[] = [];
      listener.on('hover', () => received.push('hover'));
      listener.on('cancel', () => received.push('cancel'));
      listener.on('leave', () => received.push('leave'));
      advanceFrame(runtime, transport);
      events.push(move(windowId, 50, 50), button(windowId, 50, 50, 'pressed'));
      advanceFrame(runtime, transport);
      realm.world.getComponent<Collider2DComponent>(entityId, 'Collider2D')!.remove(colliderId);
      failDispatch(true);
      expect(() => advanceFrame(runtime, transport)).toThrow('dispatch failed');
      expect(received).toEqual(['hover']);
      failDispatch(false);
      advanceFrame(runtime, transport);
      expect(received).toEqual(['hover', 'cancel', 'leave']);
      expect(() => listener.on('click', () => {})).toThrow('disposed');
    } finally {
      runtime.dispose();
    }
  });

  it('retains listeners while their collider is inactive', () => {
    const { runtime, transport, realm, events, windowId } = setup();
    try {
      const entityId = realm.createSpatialNode();
      const shape = { type: 'circle' as const, radius: 1 };
      const colliderId = realm.addCollider(entityId, shape);
      const collider = realm.world.getComponent<Collider2DComponent>(entityId, 'Collider2D')!;
      const listener = runtime.interactive(1, { type: 'collider', entityId, colliderId });
      const received: string[] = [];
      listener.on('hover', () => received.push('hover'));
      listener.on('leave', () => received.push('leave'));
      advanceFrame(runtime, transport);
      events.push(move(windowId, 50, 50));
      advanceFrame(runtime, transport);
      collider.set(colliderId, shape, { active: false });
      advanceFrame(runtime, transport);
      collider.set(colliderId, shape);
      advanceFrame(runtime, transport);
      expect(received).toEqual(['hover', 'leave', 'hover']);
    } finally {
      runtime.dispose();
    }
  });
});
