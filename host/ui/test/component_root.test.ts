import { describe, expect, it } from 'bun:test';
import type { UiCommandDesc } from '@galfus/transport-types';
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime, createSprite2D } from '@galfus/engine';
import { setup } from '../../engine/test/interactive-fixture';
import { advanceFrame } from '../../demos/test/test-helpers';
import { mountComponentExample } from '../examples/component-root';
import { createUi } from '../src/index';

describe('core-backed component roots', () => {
  it('commits a tree as atomic batches, reorders, and rolls back failed changes', () => {
    const { runtime, transport, realm } = setup();
    const batches: UiCommandDesc[][] = [];
    let fail = false;
    transport.engine.realm2dApplyUiCommands = (_realm, _ui, commands) => {
      if (fail) throw new Error('invalid batch');
      batches.push(structuredClone(commands as UiCommandDesc[]));
    };
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 200, height: 100 });
      const a = root.root.addPanel();
      const b = root.root.addPanel();
      const text = a.addText('initial', 14);
      expect('on' in text).toBe(false);
      root.root.moveChild(b, 0);
      expect(root.root.children).toEqual([b, a]);
      expect(text.parent).toBe(a);
      text.setText('updated');
      a.setVisible(false);
      expect(root.syncState).toBe('pending');
      root.flush();
      expect(root.syncState).toBe('synced');
      expect(a.visible).toBe(false);
      expect(text.text).toBe('updated');
      expect(batches).toHaveLength(1);
      expect(batches[0]!.map((command) => command.type)).toEqual([
        'create',
        'create',
        'insert',
        'create',
        'insert',
        'create',
        'insert',
        'reorder',
        'setKind',
        'setVisible'
      ]);
      const changes: string[] = [];
      const unsubscribe = root.onSyncState((state) => changes.push(state));
      text.setText('pending');
      a.remove();
      expect(text.isAttached).toBe(false);
      fail = true;
      expect(() => root.flush()).toThrow('invalid batch');
      expect(root.syncState).toBe('failed');
      expect(root.lastError).toBeInstanceOf(Error);
      expect(batches).toHaveLength(1);
      root.discardChanges();
      expect(root.syncState).toBe('synced');
      expect(text.isAttached).toBe(true);
      expect(text.text).toBe('updated');
      expect(a.visible).toBe(false);
      expect(root.root.children).toEqual([b, a]);
      expect(a.children).toEqual([text]);
      expect(changes).toEqual(['pending', 'failed', 'synced']);
      unsubscribe();
      fail = false;
      text.setText('accepted');
      root.flush();
      expect(batches[1]).toMatchObject([
        { type: 'setKind', id: text.id, kind: { type: 'text', text: 'accepted', fontSize: 14 } }
      ]);
      text.setText('retry');
      fail = true;
      expect(() => root.flush()).toThrow('invalid batch');
      fail = false;
      root.flush();
      expect(root.syncState).toBe('synced');
      expect(text.text).toBe('retry');
      expect(batches).toHaveLength(3);
      root.dispose();
      root.dispose();
      expect(text.isAttached).toBe(false);
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });

  it('rejects cross-root children and disposes with the window and realm', () => {
    const { runtime, realm, windowId } = setup();
    try {
      const ui = createUi(runtime);
      expect(() =>
        ui.createComponentRoot(realm, { width: 10, height: 10, windowId: 99999 })
      ).toThrow('open window');
      const first = ui.createComponentRoot(realm, { width: 10, height: 10, windowId });
      const second = ui.createComponentRoot(realm, { width: 10, height: 10 });
      first.root.addPanel();
      const foreign = second.root.addPanel();
      expect(() => first.root.moveChild(foreign, 0)).toThrow('invalid');
      runtime.platform.window.close(windowId);
      expect(first.syncState).toBe('disposed');
      expect(second.syncState).toBe('pending');
      realm.dispose();
      expect(second.syncState).toBe('disposed');
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });

  it('finishes realm cleanup if another disposal observer fails', () => {
    const { runtime, realm } = setup();
    try {
      const ui = createUi(runtime);
      realm.onDispose(() => {
        throw new Error('observer failed');
      });
      const root = ui.createComponentRoot(realm, { width: 10, height: 10 });
      expect(() => realm.dispose()).toThrow('Realm disposal listeners failed');
      expect(root.syncState).toBe('disposed');
      expect(realm.world.isAlive(root.entityId)).toBe(false);
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });

  it('unsubscribes panel events and cleans listeners after removal', () => {
    const { runtime, realm, windowId } = setup();
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 50, height: 50, windowId });
      const panel = root.root.addPanel();
      root.flush();
      let calls = 0;
      const unsubscribe = panel.on('click', () => calls++);
      const deliver = (eventWindowId: number = windowId) =>
        (runtime.interaction as any).pollNativeEvents({
          multiversePollInteractionEvents: () =>
            JSON.stringify([
              {
                interactionType: 'click',
                windowId: eventWindowId,
                pointerId: 0,
                realmId: realm.realmId,
                modelId: root.uiId,
                colliderId: 1,
                elementId: panel.id,
                localPos: [0, 0],
                uv: [0, 0],
                delta: [0, 0]
              }
            ])
        });
      deliver();
      expect(calls).toBe(1);
      deliver(windowId + 1);
      expect(calls).toBe(1);
      unsubscribe();
      deliver();
      expect(calls).toBe(1);
      panel.on('click', () => calls++);
      panel.remove();
      deliver();
      expect(calls).toBe(1);
      root.discardChanges();
      deliver();
      expect(calls).toBe(2);
      panel.remove();
      root.flush();
      deliver();
      expect(calls).toBe(2);
      root.dispose();
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });

  it('uses the real core and recovers from a rejected atomic batch', () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport);
    try {
      const realm = runtime.createRealm2D(1);
      realm.createCamera({ orthoScale: 100 });
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 200, height: 100 }
      });
      runtime.multiverse.createInvocation({ realmId: 1, targetId: target });
      const ui = createUi(runtime);
      const sample = mountComponentExample(ui, realm);
      advanceFrame(runtime, transport);
      sample.update('World');
      advanceFrame(runtime, transport);
      const panel = sample.context.root.addPanel(
        { backgroundColor: [1, 0, 0, 1] },
        { width: { type: 'exact', value: 40 }, height: { type: 'exact', value: 20 } }
      );
      sample.context.flush();
      advanceFrame(runtime, transport);
      expect(realm.getUiLayout(sample.context.handle, panel.id).absoluteRect[2]).toBeGreaterThan(0);
      const next = sample.context.root.addPanel(
        {},
        {
          width: { type: 'exact', value: 40 },
          height: { type: 'exact', value: 20 }
        }
      );
      sample.context.flush();
      advanceFrame(runtime, transport);
      const firstY = realm.getUiLayout(sample.context.handle, panel.id).absoluteRect[1];
      const nextY = realm.getUiLayout(sample.context.handle, next.id).absoluteRect[1];
      expect(firstY).toBeLessThan(nextY);
      sample.context.root.moveChild(next, 0);
      sample.context.flush();
      advanceFrame(runtime, transport);
      expect(realm.getUiLayout(sample.context.handle, next.id).absoluteRect[1]).toBeLessThan(
        realm.getUiLayout(sample.context.handle, panel.id).absoluteRect[1]
      );
      panel.setProperties({
        backgroundColor: [1, 0, 0] as unknown as [number, number, number, number]
      });
      expect(() => sample.context.flush()).toThrow();
      expect(sample.context.syncState).toBe('failed');
      sample.context.discardChanges();
      panel.setVisible(false);
      sample.context.flush();
      expect(sample.context.syncState).toBe('synced');
      sample.remove();
      sample.dispose();
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });

  it('disposes immediately when its entity is destroyed via world.destroyEntity', () => {
    const { runtime, realm } = setup();
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 200, height: 100 });
      expect(root.syncState).toBe('pending');
      root.flush();
      expect(root.syncState).toBe('synced');

      realm.world.destroyEntity(root.handle.entityId);
      expect(root.syncState).toBe('disposed');
      expect(() => root.root.addPanel()).toThrow('UI component root is disposed.');
    } finally {
      runtime.dispose();
    }
  });

  it('detects recycled entity and does not destroy the new component on dispose', () => {
    const { runtime, realm } = setup();
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 200, height: 100 });
      const entityId = root.handle.entityId;

      // Simulate external detachment/replacement of UI component
      realm.world.detachComponent(entityId, 'Model2DUI');
      realm.world.attachComponent(
        entityId,
        createSprite2D(realm.allocateResourceId(), { dimensions: [32, 32] })
      );

      // Disposing the root should NOT destroy the new entity / sprite
      root.dispose();
      expect(realm.world.isAlive(entityId)).toBe(true);
      expect(realm.world.hasComponent(entityId, 'Sprite2D')).toBe(true);
    } finally {
      runtime.dispose();
    }
  });
});
