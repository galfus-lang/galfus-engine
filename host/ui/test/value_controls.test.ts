import { describe, expect, it } from 'bun:test';
import type { KeyboardEvent, PointerEvent } from '@galfus/transport-types';
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime } from '@galfus/engine';
import { button, move, setup } from '../../engine/test/interactive-fixture';
import { advanceFrame } from '../../demos/test/test-helpers';
import { createUi, UiCheckbox, UiRadio, UiRadioGroup, UiSelect, UiSlider, UiSwitch } from '../src';

const key = (
  windowId: number,
  logicalKey: string,
  state: 'pressed' | 'released' = 'pressed'
): KeyboardEvent => ({
  kind: 'keyboard',
  type: 'input',
  windowId,
  physicalKey: logicalKey === ' ' ? 'Space' : logicalKey,
  logicalKey,
  state,
  repeat: false,
  modifiers: { shift: false, ctrl: false, alt: false, superKey: false }
});
const activate = (runtime: ReturnType<typeof setup>['runtime'], windowId: number) => {
  runtime.interaction.handleKeyboard(key(windowId, 'Enter'));
  runtime.interaction.handleKeyboard(key(windowId, 'Enter', 'released'));
};

describe('selection and value controls', () => {
  it('changes boolean values once per activation and honors read-only and disabled states', () => {
    const { runtime, transport, realm, windowId } = setup();
    try {
      const ui = createUi(runtime),
        root = ui.createComponentRoot(realm, { width: 300, height: 200 });
      const changes: boolean[] = [];
      const box = new UiCheckbox(root.root, {
        label: 'Choice',
        onChange: (value) => changes.push(value)
      });
      const toggle = new UiSwitch(root.root, { value: true });
      const radio = new UiRadio(root.root);
      root.flush();
      advanceFrame(runtime, transport);
      expect(box.requestFocus(windowId)).toBe(true);
      activate(runtime, windowId);
      expect(box.value).toBe(true);
      expect(changes).toEqual([true]);
      expect(root.nodeSnapshot(box.panel.id).style.activeStates).toContain('checked');
      box.setValue(true);
      expect(changes).toEqual([true]);
      box.setReadOnly(true);
      activate(runtime, windowId);
      expect(box.value).toBe(true);
      box.setValue(false);
      expect(changes).toEqual([true, false]);
      box.setDisabled(true);
      expect(box.requestFocus(windowId)).toBe(false);
      expect(toggle.requestFocus(windowId)).toBe(true);
      activate(runtime, windowId);
      expect(toggle.value).toBe(false);
      expect(radio.requestFocus(windowId)).toBe(true);
      activate(runtime, windowId);
      activate(runtime, windowId);
      expect(radio.checked).toBe(true);
      expect(() => box.setValue(1 as any)).toThrow('boolean');
      expect(() => new UiCheckbox(root.root, { value: null as any })).toThrow('boolean');
      box.remove();
      root.flush();
      expect(() => box.setValue(true)).toThrow('not attached');
    } finally {
      runtime.dispose();
    }
  });
  it('preserves radio exclusivity, skips disabled options and clears removed or disabled selection', () => {
    const { runtime, transport, realm, windowId } = setup();
    try {
      const ui = createUi(runtime),
        root = ui.createComponentRoot(realm, { width: 300, height: 200 });
      const changes: (string | null)[] = [];
      const group = new UiRadioGroup(root.root, {
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', disabled: true },
          { value: 'c', label: 'C' }
        ],
        value: 'a',
        onChange: (value) => changes.push(value)
      });
      const a = group.getRadio('a')!,
        c = group.getRadio('c')!;
      expect(a.checked).toBe(true);
      expect(c.checked).toBe(false);
      root.flush();
      advanceFrame(runtime, transport);
      expect(a.requestFocus(windowId)).toBe(true);
      const memberChanges: boolean[] = [];
      const stopMember = a.onChange((checked) => {
        memberChanges.push(checked);
        expect(group.value).toBe('c');
        expect(c.checked).toBe(true);
      });
      runtime.interaction.handleKeyboard(key(windowId, 'ArrowRight'));
      expect(group.value).toBe('c');
      expect(a.checked).toBe(false);
      expect(c.checked).toBe(true);
      expect(memberChanges).toEqual([false]);
      stopMember();
      expect(c.getInteractionState(windowId).focusVisible).toBe(true);
      group.setReadOnly(true);
      runtime.interaction.handleKeyboard(key(windowId, 'ArrowLeft'));
      expect(group.value).toBe('c');
      expect(a.getInteractionState(windowId).focus).toBe(true);
      group.setReadOnly(false);
      c.setDisabled(true);
      expect(group.value).toBeNull();
      group.setValue('a');
      group.removeRadio('a');
      expect(group.value).toBeNull();
      expect(changes).toEqual(['c', null, 'a', null]);
      expect(() => group.setValue('b')).toThrow('enabled');
      expect(() => group.getRadio('b')!.setChecked(true)).toThrow('Disabled');
      expect(() => group.addRadio({ value: 'c', label: 'Duplicate' })).toThrow('unique');
      root.flush();
      expect(group.options).toEqual(['b', 'c']);
    } finally {
      runtime.dispose();
    }
  });
  it('keeps a removed radio unselected after the staged removal is rolled back', () => {
    const { runtime, realm } = setup();
    try {
      const ui = createUi(runtime),
        root = ui.createComponentRoot(realm, { width: 200, height: 100 });
      const group = new UiRadioGroup(root.root, {
        options: [{ value: 'a', label: 'A' }],
        value: 'a'
      });
      root.flush();
      group.removeRadio('a');
      expect(group.value).toBeNull();
      root.discardChanges();
      expect(group.getRadio('a')?.checked).toBe(false);
      expect(group.value).toBeNull();
    } finally {
      runtime.dispose();
    }
  });
  it('keeps radio selection coherent when a change callback selects another option', () => {
    const { runtime, realm } = setup();
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 200, height: 120 });
      const events: (string | null)[] = [];
      const group = new UiRadioGroup(root.root, {
        value: 'a',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' }
        ],
        onChange: (value) => events.push(value)
      });
      group.getRadio('a')!.onChange((checked) => {
        if (!checked) group.getRadio('b')!.setChecked(true);
      });
      group.setValue('c');
      expect(group.value).toBe('b');
      expect(group.getRadio('b')!.checked).toBe(true);
      expect(group.getRadio('c')!.checked).toBe(false);
      expect(events).toEqual(['c', 'b']);
    } finally {
      runtime.dispose();
    }
  });
  it('clamps and quantizes sliders, routes keyboard input and validates bounds', () => {
    const { runtime, transport, realm, windowId } = setup();
    try {
      const ui = createUi(runtime),
        root = ui.createComponentRoot(realm, { width: 300, height: 200 });
      const changes: number[] = [];
      const slider = new UiSlider(root.root, {
        min: 0,
        max: 10,
        step: 0.25,
        value: 0.1,
        onChange: (value) => changes.push(value)
      });
      expect(slider.value).toBe(0);
      slider.setValue(0.63);
      expect(slider.value).toBe(0.75);
      slider.setValue(500);
      expect(slider.value).toBe(10);
      expect(() => slider.setValue(NaN)).toThrow('finite');
      expect(() => slider.setBounds(2, 1)).toThrow('bounds');
      expect(() => slider.setBounds(-1e308, 1e308)).toThrow('bounds');
      root.flush();
      advanceFrame(runtime, transport);
      expect(slider.requestFocus(windowId)).toBe(true);
      expect(slider.getInteractionState(windowId).focusVisible).toBe(false);
      runtime.interaction.handleKeyboard(key(windowId, 'ArrowLeft'));
      expect(slider.value).toBe(9.75);
      expect(slider.getInteractionState(windowId).focusVisible).toBe(true);
      slider.setReadOnly(true);
      runtime.interaction.handleKeyboard(key(windowId, 'Home'));
      expect(slider.value).toBe(9.75);
      slider.setReadOnly(false);
      runtime.interaction.handleKeyboard(key(windowId, 'Home'));
      expect(slider.value).toBe(0);
      expect(changes).toEqual([0.75, 10, 9.75, 0]);
      slider.setOrientation('vertical');
      slider.setSize(32, 180);
      root.flush();
      expect(slider.thumb.layout.positionOffset![1]).toBeGreaterThan(100);
      slider.setBounds(0, 10, 3);
      slider.setValue(10);
      runtime.interaction.handleKeyboard(key(windowId, 'ArrowLeft'));
      expect(slider.value).toBe(9);
    } finally {
      runtime.dispose();
    }
  });
  it('adjusts a slider once per wheel event and honors bounds and interaction states', () => {
    const f = setup();
    try {
      const ui = createUi(f.runtime);
      const root = ui.createComponentRoot(f.realm, {
        width: 200,
        height: 100,
        windowId: f.windowId
      });
      const values: number[] = [];
      const slider = new UiSlider(root.root, {
        min: 0,
        max: 10,
        step: 3,
        value: 3,
        onChange: (value) => values.push(value)
      });
      root.flush();
      advanceFrame(f.runtime, f.transport);
      const interaction = f.runtime.interaction as any;
      const wheel = (elementId: number, delta: [number, number]) => {
        const pointer: PointerEvent = {
          kind: 'pointer',
          type: 'scroll',
          windowId: f.windowId,
          pointerId: 0,
          pointerType: 'mouse',
          position: [40, 16],
          delta: { pixels: delta }
        };
        interaction.handle(pointer);
        interaction.pollNativeEvents({
          multiversePollInteractionEvents: () =>
            JSON.stringify([
              {
                interactionType: 'scroll',
                windowId: f.windowId,
                pointerId: 0,
                realmId: f.realm.realmId,
                modelId: root.uiId,
                elementId,
                colliderId: 1,
                localPos: [0, 0],
                uv: [0.2, 0.5],
                delta: [0, 0],
                scrollDelta: delta
              }
            ])
        });
      };
      wheel(slider.panel.id, [0, 80]);
      expect(slider.value).toBe(6);
      wheel(slider.track.id, [0, -1]);
      expect(slider.value).toBe(3);
      wheel(slider.thumb.id, [5, 0]);
      expect(slider.value).toBe(6);
      wheel(slider.thumb.id, [0, 5]);
      wheel(slider.thumb.id, [0, 5]);
      wheel(slider.thumb.id, [0, 5]);
      expect(slider.value).toBe(10);
      slider.setReadOnly(true);
      wheel(slider.track.id, [0, -1]);
      expect(slider.value).toBe(10);
      slider.setReadOnly(false);
      slider.setDisabled(true);
      wheel(slider.track.id, [0, -1]);
      expect(slider.value).toBe(10);
      expect(values).toEqual([6, 3, 6, 9, 10]);
    } finally {
      f.runtime.dispose();
    }
  });
  it('drags a slider from its visual track without duplicate callbacks', () => {
    const f = setup();
    try {
      const ui = createUi(f.runtime),
        root = ui.createComponentRoot(f.realm, { width: 200, height: 100 });
      const values: number[] = [];
      const slider = new UiSlider(root.root, {
        width: 100,
        height: 32,
        min: 0,
        max: 10,
        onChange: (value) => values.push(value)
      });
      f.transport.engine.realm2dGetUiLayout = (_realm, _model, id) =>
        JSON.stringify({ absoluteRect: id === root.root.id ? [0, 0, 200, 100] : [0, 0, 100, 32] });
      root.flush();
      advanceFrame(f.runtime, f.transport);
      const interaction = f.runtime.interaction as any;
      const emit = (type: string, pointer: PointerEvent, u: number) => {
        interaction.handle(pointer);
        interaction.pollNativeEvents({
          multiversePollInteractionEvents: () =>
            JSON.stringify([
              {
                interactionType: type,
                windowId: f.windowId,
                pointerId: 0,
                realmId: f.realm.realmId,
                modelId: root.uiId,
                elementId: slider.track.id,
                colliderId: 1,
                localPos: [0, 0],
                uv: [u, 0.84],
                delta: [0, 0]
              }
            ])
        });
      };
      emit('down', button(f.windowId, 8, 16, 'pressed') as PointerEvent, 0.04);
      emit('pressMove', move(f.windowId, 92, 16) as PointerEvent, 0.46);
      emit('pressMove', move(f.windowId, 92, 16) as PointerEvent, 0.46);
      emit('pressUp', button(f.windowId, 92, 16, 'released') as PointerEvent, 0.46);
      expect(slider.value).toBe(10);
      expect(values).toEqual([10]);
    } finally {
      f.runtime.dispose();
    }
  });
  it('selects paginated options by keyboard and restores focus after closing', () => {
    const f = setup();
    try {
      const ui = createUi(f.runtime),
        root = ui.createComponentRoot(f.realm, { width: 300, height: 200, windowId: f.windowId });
      const manager = ui.createOverlayManager(root, f.windowId);
      const other = ui.createComponentRoot(f.realm, {
        width: 100,
        height: 100,
        windowId: f.windowId
      });
      expect(() => new UiSelect(other.root, manager, { options: [] })).toThrow('overlay manager');
      const changes: (string | null)[] = [];
      const select = new UiSelect(root.root, manager, {
        pageSize: 2,
        options: [
          { value: 'a', label: 'A', disabled: true },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' },
          { value: 'd', label: 'D' }
        ],
        onChange: (value) => changes.push(value)
      });
      f.transport.engine.realm2dGetUiLayout = (_realm, model, id) =>
        JSON.stringify({
          absoluteRect:
            model === root.uiId && id === root.root.id ? [0, 0, 300, 200] : [10, 10, 100, 36]
        });
      root.flush();
      advanceFrame(f.runtime, f.transport);
      expect(select.requestFocus(f.windowId)).toBe(true);
      activate(f.runtime, f.windowId);
      expect(select.isOpen).toBe(true);
      advanceFrame(f.runtime, f.transport);
      advanceFrame(f.runtime, f.transport);
      f.runtime.interaction.handleKeyboard(key(f.windowId, 'ArrowDown'));
      activate(f.runtime, f.windowId);
      expect(select.value).toBe('c');
      expect(select.isOpen).toBe(false);
      expect(select.getInteractionState(f.windowId).focus).toBe(true);
      expect(changes).toEqual(['c']);
      select.setOptions([{ value: 'd', label: 'Updated' }]);
      expect(select.value).toBeNull();
      expect(changes).toEqual(['c', null]);
      expect(() => select.setValue('missing')).toThrow('enabled');
      expect(() =>
        select.setOptions([
          { value: 'x', label: 'A' },
          { value: 'x', label: 'B' }
        ])
      ).toThrow('unique');
      expect(() => select.setOptions([{ value: 'x', label: 'A', disabled: 'yes' as any }])).toThrow(
        'boolean'
      );
      select.setOptions([
        { value: 'p', label: 'P' },
        { value: 'q', label: 'Q' },
        { value: 'r', label: 'R' }
      ]);
      select.open();
      expect(select.popover.root!.root.children).toHaveLength(3);
      select.setValue('r');
      expect(select.value).toBe('r');
      select.close();
      select.setValue(null);
      select.setReadOnly(true);
      select.open();
      expect(select.isOpen).toBe(true);
      advanceFrame(f.runtime, f.transport);
      advanceFrame(f.runtime, f.transport);
      activate(f.runtime, f.windowId);
      expect(select.value).toBeNull();
      select.setDisabled(true);
      expect(select.isOpen).toBe(false);
      select.remove();
      root.flush();
      expect(select.popover.isDisposed).toBe(true);
    } finally {
      f.runtime.dispose();
    }
  });
  it('lays out the controls in the real core', () => {
    const transport = createBunTransport({ headless: true }),
      runtime = createRuntime(transport);
    try {
      const realm = runtime.createRealm2D(1);
      realm.createCamera({ orthoScale: 300 });
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 500, height: 300 }
      });
      runtime.multiverse.createInvocation({ realmId: 1, targetId: target });
      const ui = createUi(runtime),
        root = ui.createComponentRoot(realm, { width: 500, height: 300 });
      const box = new UiCheckbox(root.root, { label: 'Check' });
      const slider = new UiSlider(root.root, { value: 50 });
      root.flush();
      advanceFrame(runtime, transport);
      expect(realm.getUiLayout(root.handle, box.panel.id).absoluteRect[2]).toBeGreaterThan(0);
      expect(realm.getUiLayout(root.handle, slider.thumb.id).absoluteRect[2]).toBe(12);
    } finally {
      runtime.dispose();
    }
  });
});
