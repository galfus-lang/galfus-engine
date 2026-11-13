import { describe, expect, test } from 'bun:test';
import { setup } from '../../engine/test/interactive-fixture';
import { createUi } from '../src/index';

describe('core-owned UI facade', () => {
  test('binds core transitions and releases subtree subscriptions and animations', () => {
    const { runtime, transport, realm } = setup();
    const calls: unknown[][] = [];
    try {
      transport.engine.animationCreateTransition = (...args) => calls.push(['create', ...args]);
      transport.engine.animationBindTarget = (...args) => calls.push(['bind', ...args]);
      transport.engine.animationTransitionTo = (...args) => calls.push(['to', ...args]);
      transport.engine.animationDestroyTransition = (...args) => calls.push(['destroy', ...args]);
      const ui = createUi(runtime);
      const model = ui.createNativeRoot(realm, { width: 20, height: 20 });
      const panel = model.root.addPanel();
      const child = panel.addPanel();
      child.on('click', () => {});
      child.transition(
        'opacity',
        { type: 'scalar', value: 1 },
        { type: 'scalar', value: 0 },
        { duration: 1 }
      );
      expect(calls.find((call) => call[0] === 'bind')?.[2]).toEqual({
        kind: 'uiElementOpacity',
        realmId: realm.realmId,
        uiId: model.uiId,
        elementId: child.id
      });
      panel.remove();
      expect(calls.filter((call) => call[0] === 'destroy')).toHaveLength(1);
      expect(() =>
        child.transition(
          'opacity',
          { type: 'scalar', value: 1 },
          { type: 'scalar', value: 0 },
          { duration: 1 }
        )
      ).toThrow();
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });

  test('queues core nodes without host geometry and routes events only to panels', () => {
    const { runtime, transport, realm, windowId } = setup();
    const calls: unknown[][] = [];
    try {
      transport.engine.realm2dCreateUi = (_realm, ui, desc) => {
        calls.push(['create', ui, desc]);
      };
      transport.engine.realm2dApplyUiCommands = (_realm, ui, commands) => {
        calls.push(['commands', ui, commands]);
      };
      const ui = createUi(runtime);
      const model = ui.createNativeRoot(realm, { width: 300, height: 200 });
      const panel = model.root.addPanel({ backgroundColor: [1, 0, 0, 1] }, { flexGrow: 1 });
      const text = panel.addText('hello', 12);
      expect('on' in text).toBe(false);
      expect(realm.world.getComponent(model.handle.entityId, 'Collider2D')).toBeUndefined();
      const clicked: number[] = [];
      panel.on('click', () => clicked.push(panel.id));
      realm.flush();
      expect(calls[0]).toEqual(['create', model.uiId, {}]);
      const batches = calls.slice(1).flatMap((call) => call[2] as any[]);
      expect(batches.map((command) => command.type)).toEqual([
        'create',
        'create',
        'insert',
        'create',
        'insert'
      ]);
      expect(batches[1].kind.type).toBe('panel');
      expect(batches[3].kind).toMatchObject({ type: 'text', text: 'hello', fontSize: 12 });
      (runtime.interaction as any).pollNativeEvents({
        multiversePollInteractionEvents: () =>
          JSON.stringify([
            {
              interactionType: 'click',
              windowId,
              pointerId: 0,
              realmId: 1,
              modelId: model.uiId,
              colliderId: 1,
              elementId: panel.id,
              localPos: [0, 0],
              uv: [0, 0],
              delta: [0, 0]
            }
          ])
      });
      expect(clicked).toEqual([panel.id]);
      ui.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
