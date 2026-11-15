import { describe, expect, it } from 'bun:test';
import type { KeyboardEvent, PointerEvent } from '@galfus/transport-types';
import { createUi } from '../src';
import { button, move, setup, tab } from '../../engine/test/interactive-fixture';
import { advanceFrame } from '../../engine/test/controlled-transport';

const key = (
  windowId: number,
  logicalKey: string,
  state: 'pressed' | 'released'
): KeyboardEvent => ({
  kind: 'keyboard',
  type: 'input',
  windowId,
  logicalKey,
  physicalKey: logicalKey === ' ' ? 'Space' : logicalKey,
  state,
  repeat: false,
  modifiers: { shift: false, ctrl: false, alt: false, superKey: false }
});

describe('component interactions', () => {
  it('routes panel pointer state, focus modality, activation and cancellation', () => {
    const { runtime, transport, realm, windowId } = setup();
    try {
      const ui = createUi(runtime);
      realm.world.createEntity();
      realm.world.createEntity();
      const root = ui.createComponentRoot(realm, { width: 100, height: 100 });
      const panel = root.root.addPanel();
      expect(root.entityId).not.toBe(root.uiId);
      panel.setFocusable().setReadOnly(true).setInvalid(true);
      panel.setStateStyle('focusVisible', { opacity: 0.5 });
      const activations: string[] = [];
      panel.onActivate(({ source }) => activations.push(source));
      root.flush();
      advanceFrame(runtime, transport);
      const interaction = runtime.interaction as any;
      interaction.pollNativeEvents({
        multiversePollInteractionEvents: () =>
          JSON.stringify([
            {
              interactionType: 'hover',
              windowId,
              pointerId: 0,
              realmId: realm.realmId,
              modelId: root.entityId,
              colliderId: 1,
              elementId: panel.id,
              localPos: [0, 0],
              uv: [0, 0],
              delta: [0, 0]
            }
          ])
      });
      expect(panel.getInteractionState(windowId).hover).toBe(false);
      const emit = (type: string, pointer: PointerEvent) => {
        interaction.handle(pointer);
        interaction.pollNativeEvents({
          multiversePollInteractionEvents: () =>
            JSON.stringify([
              {
                interactionType: type,
                windowId,
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
      };
      emit('hover', move(windowId, 50, 50) as PointerEvent);
      emit('down', button(windowId, 50, 50, 'pressed') as PointerEvent);
      expect(panel.getInteractionState(windowId)).toMatchObject({
        hover: true,
        active: true,
        focus: true,
        focusVisible: false,
        readOnly: true,
        invalid: true
      });
      emit('cancel', button(windowId, 50, 50, 'released') as PointerEvent);
      expect(panel.getInteractionState(windowId).active).toBe(false);
      expect(activations).toEqual([]);
      runtime.interaction.handleKeyboard(key(windowId, 'Enter', 'pressed'));
      expect(panel.getInteractionState(windowId)).toMatchObject({
        active: true,
        focusVisible: true
      });
      expect(panel.resolvedStyle.kind.opacity).toBe(0.5);
      runtime.interaction.handleKeyboard(key(windowId, 'Enter', 'released'));
      expect(activations).toEqual(['keyboard']);
      runtime.interaction.handleKeyboard(key(windowId, 'Enter', 'pressed'));
      runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'imePreedit',
        windowId,
        text: 'あ'
      });
      expect(panel.getInteractionState(windowId).active).toBe(false);
      runtime.interaction.handleKeyboard({ kind: 'keyboard', type: 'imeDisabled', windowId });
      runtime.interaction.handleKeyboard(key(windowId, 'Enter', 'released'));
      expect(activations).toEqual(['keyboard']);
      emit('down', button(windowId, 50, 50, 'pressed') as PointerEvent);
      expect(panel.getInteractionState(windowId).focusVisible).toBe(false);
      emit('pressup', button(windowId, 50, 50, 'released') as PointerEvent);
      emit('click', button(windowId, 50, 50, 'released') as PointerEvent);
      expect(activations).toEqual(['keyboard', 'pointer']);
      panel.setDisabled(true);
      expect(panel.getInteractionState(windowId)).toMatchObject({
        disabled: true,
        focus: false,
        active: false,
        invalid: true,
        readOnly: true
      });
      emit('click', button(windowId, 50, 50, 'released') as PointerEvent);
      expect(activations).toEqual(['keyboard', 'pointer']);
      expect(panel.requestFocus(windowId)).toBe(false);
    } finally {
      runtime.dispose();
    }
  });

  it('orders keyboard focus, handles staged visibility and restores current interaction after rollback', () => {
    const { runtime, transport, realm, windowId } = setup();
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 100, height: 100 });
      const parent = root.root.addPanel();
      const first = parent.addPanel().setFocusable();
      const second = root.root.addPanel().setFocusable(2);
      root.flush();
      expect(first.requestFocus(windowId)).toBe(false);
      advanceFrame(runtime, transport);
      runtime.interaction.handleKeyboard(tab(windowId) as KeyboardEvent);
      expect(second.getInteractionState(windowId)).toMatchObject({
        focus: true,
        focusVisible: true
      });
      runtime.interaction.handleKeyboard(tab(windowId) as KeyboardEvent);
      expect(first.getInteractionState(windowId).focusVisible).toBe(true);
      parent.setDisabled(true);
      expect(first.getInteractionState(windowId)).toMatchObject({ disabled: true, focus: false });
      expect(first.requestFocus(windowId)).toBe(false);
      parent.setDisabled(false);
      expect(first.getInteractionState(windowId).disabled).toBe(false);
      expect(first.requestFocus(windowId)).toBe(true);
      parent.setVisible(false);
      expect(first.getInteractionState(windowId).focus).toBe(false);
      root.discardChanges();
      expect(first.requestFocus(windowId)).toBe(true);
      expect(first.getInteractionState(windowId)).toMatchObject({
        focus: true,
        focusVisible: false
      });
      runtime.interaction.handleKeyboard(tab(windowId, true) as KeyboardEvent);
      expect(second.getInteractionState(windowId).focusVisible).toBe(true);
      second.remove();
      expect(second.getInteractionState).toBeDefined();
      expect(ui.getFocused(windowId)).toBeUndefined();
      root.discardChanges();
      expect(second.requestFocus(windowId)).toBe(true);
      const late = root.root.addPanel().setFocusable(-1);
      root.flush();
      expect(late.requestFocus(windowId)).toBe(false);
      advanceFrame(runtime, transport);
      expect(late.requestFocus(windowId)).toBe(true);
    } finally {
      runtime.dispose();
    }
  });

  it('keeps focus and activation independent across windows and honors a window-scoped root', () => {
    const { runtime, transport, realm, windowId, schedule } = setup();
    try {
      const other = runtime.platform.window.create();
      const targetId = runtime.multiverse.createTarget({
        kind: { type: 'window', windowId: other }
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
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 100, height: 100 });
      const panel = root.root.addPanel().setFocusable();
      const scoped = ui.createComponentRoot(realm, { width: 50, height: 50, windowId });
      const scopedPanel = scoped.root.addPanel().setFocusable(-1);
      root.flush();
      scoped.flush();
      advanceFrame(runtime, transport);
      expect(panel.requestFocus()).toBe(false);
      expect(panel.requestFocus(windowId)).toBe(true);
      runtime.interaction.handleKeyboard(tab(other) as KeyboardEvent);
      expect(panel.getInteractionState(windowId)).toMatchObject({
        focus: true,
        focusVisible: false
      });
      expect(panel.getInteractionState(other)).toMatchObject({ focus: true, focusVisible: true });
      expect(scopedPanel.requestFocus(other)).toBe(false);
      runtime.interaction.handleKeyboard(key(other, ' ', 'pressed'));
      expect(panel.getInteractionState(other).active).toBe(true);
      runtime.platform.window.close(other);
      expect(panel.getInteractionState(other)).toMatchObject({ focus: false, active: false });
      expect(panel.getInteractionState(windowId).focus).toBe(true);
      expect(scopedPanel.requestFocus(windowId)).toBe(true);
      expect(panel.getInteractionState(windowId).focus).toBe(false);
    } finally {
      runtime.dispose();
    }
  });
});
