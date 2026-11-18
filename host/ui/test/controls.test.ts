import { describe, expect, it } from 'bun:test';
import type { KeyboardEvent, PointerEvent } from '@galfus/transport-types';
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime } from '@galfus/engine';
import { button, move, setup, tab } from '../../engine/test/interactive-fixture';
import { advanceFrame } from '../../demos/test/test-helpers';
import { createUi, UiAppBar, UiButton, UiButtonGroup, UiToolbar } from '../src';

const key = (
  windowId: number,
  logicalKey: string,
  state: 'pressed' | 'released'
): Extract<KeyboardEvent, { type: 'input' }> => ({
  kind: 'keyboard',
  type: 'input',
  windowId,
  logicalKey,
  physicalKey: logicalKey,
  state,
  repeat: false,
  modifiers: { shift: false, ctrl: false, alt: false, superKey: false }
});

describe('button and structural controls', () => {
  it('mounts, updates, reorders and restores nested owned controls', () => {
    const { runtime, realm } = setup();
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 500, height: 300 });
      const app = new UiAppBar(root.root, {
        orientation: 'vertical',
        spacing: 4,
        style: { color: [0.2, 0.4, 0.6, 1] }
      });
      const toolbar = app.addToolbar({ spacing: 2 });
      const group = toolbar.addButtonGroup({ orientation: 'vertical', spacing: 7 });
      const a = group.addButton({ label: 'A' });
      const nested = group.addButtonGroup();
      const b = nested.addButton({ label: 'B' });
      const c = group.addButton({ label: 'C' });
      expect(a.labelNode.resolvedStyle.kind.color).toEqual([0.2, 0.4, 0.6, 1]);
      expect(group.orientation).toBe('vertical');
      expect(group.panel.layout.gap).toEqual([7, 7]);
      expect(group.children).toEqual([a.panel, nested.panel, c.panel]);
      group.moveChild(c, 0).setOrientation('horizontal').setSpacing(12);
      expect(group.children).toEqual([c.panel, a.panel, nested.panel]);
      expect(group.panel.layout).toMatchObject({ direction: 'row', gap: [12, 12] });
      expect(() => group.setSpacing(-1)).toThrow();
      expect(() => group.moveChild(b, 0)).toThrow();
      a.setLabel('Updated');
      root.flush();
      expect(a.label).toBe('Updated');
      group.remove();
      expect(a.isAttached).toBe(false);
      expect(b.isAttached).toBe(false);
      root.discardChanges();
      expect(a.isAttached).toBe(true);
      expect(b.isAttached).toBe(true);
      group.dispose();
      root.flush();
      group.dispose();
      expect(toolbar.children).toEqual([]);
      expect(b.isAttached).toBe(false);
      app.remove();
      root.flush();
      expect(root.root.children).toEqual([]);
    } finally {
      runtime.dispose();
    }
  });

  it('applies component themes, variants and combined interaction states independently', () => {
    const { runtime, realm } = setup();
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, {
        width: 300,
        height: 200,
        theme: {
          components: {
            button: {
              variants: { brand: { backgroundColor: [1, 0, 0, 1] } },
              states: { hover: { opacity: 0.6 } }
            },
            toolbar: { base: { color: [0, 1, 0, 1] } }
          }
        }
      });
      const toolbar = new UiToolbar(root.root);
      const control = toolbar.addButton({
        label: 'Save',
        variant: 'brand',
        states: { active: { opacity: 0.4 } }
      });
      const panel = root.root.addPanel();
      expect(control.panel.resolvedStyle.kind.backgroundColor).toEqual([1, 0, 0, 1]);
      expect(control.labelNode.resolvedStyle.kind.color).toEqual([0, 1, 0, 1]);
      expect(panel.resolvedStyle.kind.backgroundColor).toBeUndefined();
      control.panel.setStyleState('hover', true);
      control.panel.setStyleState('active', true);
      expect(control.panel.resolvedStyle.kind.opacity).toBe(0.4);
      control.panel.setStyleState('active', false);
      expect(control.panel.resolvedStyle.kind.opacity).toBe(0.6);
      control.panel.setStyleState('hover', false);
      root.patchTheme({
        components: { button: { variants: { brand: { backgroundColor: [0, 0, 1, 1] } } } }
      });
      expect(control.panel.resolvedStyle.kind.backgroundColor).toEqual([0, 0, 1, 1]);
      expect(() => new UiButton(root.root, { label: 'Invalid', variant: 'missing' })).toThrow(
        'Unknown'
      );
      expect(root.root.children).toEqual([toolbar.panel, panel]);
      root.flush();
    } finally {
      runtime.dispose();
    }
  });

  it('fires once for pointer and keyboard activation and blocks disabled descendants', () => {
    const { runtime, realm, transport, windowId } = setup();
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 300, height: 200 });
      const group = new UiButtonGroup(root.root);
      const activations: string[] = [];
      const control = group.addButton({
        label: 'Activate',
        onActivate: ({ source }) => activations.push(source)
      });
      let extraCalls = 0;
      const unsubscribe = control.onActivate(() => extraCalls++);
      root.flush();
      advanceFrame(runtime, transport);
      runtime.interaction.handleKeyboard(tab(windowId) as KeyboardEvent);
      expect(control.getInteractionState(windowId).focusVisible).toBe(true);
      runtime.interaction.handleKeyboard(key(windowId, 'Enter', 'pressed'));
      runtime.interaction.handleKeyboard({ ...key(windowId, 'Enter', 'pressed'), repeat: true });
      runtime.interaction.handleKeyboard(key(windowId, 'Enter', 'released'));
      expect(activations).toEqual(['keyboard']);
      expect(extraCalls).toBe(1);
      unsubscribe();
      const interaction = runtime.interaction as any;
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
                elementId: control.panel.id,
                localPos: [0, 0],
                uv: [0, 0],
                delta: [0, 0]
              }
            ])
        });
      };
      emit('hover', move(windowId, 50, 50) as PointerEvent);
      emit('down', button(windowId, 50, 50, 'pressed') as PointerEvent);
      emit('pressup', button(windowId, 50, 50, 'released') as PointerEvent);
      emit('click', button(windowId, 50, 50, 'released') as PointerEvent);
      expect(activations).toEqual(['keyboard', 'pointer']);
      expect(extraCalls).toBe(1);
      group.setDisabled(true);
      expect(control.getInteractionState(windowId)).toMatchObject({ disabled: true, focus: false });
      emit('click', button(windowId, 50, 50, 'released') as PointerEvent);
      runtime.interaction.handleKeyboard(key(windowId, 'Enter', 'pressed'));
      runtime.interaction.handleKeyboard(key(windowId, 'Enter', 'released'));
      expect(activations).toEqual(['keyboard', 'pointer']);
      expect(control.requestFocus(windowId)).toBe(false);
      group.setDisabled(false);
      expect(control.requestFocus(windowId)).toBe(true);
      control.setDisabled(true);
      group.setDisabled(true);
      group.setDisabled(false);
      expect(control.getInteractionState(windowId).disabled).toBe(true);
      expect(control.requestFocus(windowId)).toBe(false);
      control.remove();
      expect(ui.getFocused(windowId)).toBeUndefined();
      root.flush();
      emit('click', button(windowId, 50, 50, 'released') as PointerEvent);
      expect(activations).toEqual(['keyboard', 'pointer']);
    } finally {
      runtime.dispose();
    }
  });

  it('lays out nested controls in the real core and updates ordering', () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport);
    try {
      const realm = runtime.createRealm2D(1);
      realm.createCamera({ orthoScale: 200 });
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 400, height: 200 }
      });
      runtime.multiverse.createInvocation({ realmId: 1, targetId: target });
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 400, height: 200 });
      const group = new UiButtonGroup(root.root, { spacing: 10 });
      const a = group.addButton({ label: 'A', layout: { width: { type: 'exact', value: 50 } } });
      const b = group.addButton({ label: 'B', layout: { width: { type: 'exact', value: 50 } } });
      root.flush();
      advanceFrame(runtime, transport);
      const rect = (id: number) => realm.getUiLayout(root.handle, id).absoluteRect;
      expect(rect(a.panel.id)[2]).toBe(50);
      expect(rect(b.panel.id)[0] - rect(a.panel.id)[0]).toBe(60);
      expect(rect(a.panel.id)[3]).toBeGreaterThan(0);
      group.moveChild(b, 0).setOrientation('vertical').setSpacing(5);
      root.flush();
      advanceFrame(runtime, transport);
      expect(rect(a.panel.id)[1]).toBeGreaterThan(rect(b.panel.id)[1]);
      expect(rect(a.panel.id)[1] - rect(b.panel.id)[1]).toBeCloseTo(rect(b.panel.id)[3] + 5);
    } finally {
      runtime.dispose();
    }
  });
});
