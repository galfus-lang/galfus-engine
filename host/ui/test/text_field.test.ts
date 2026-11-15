import { uiWindowPointToLocal } from '../src/text/coordinates';
import { describe, expect, it } from 'bun:test';
import type { KeyboardEvent } from '@galfus/transport-types';
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime, type Model2DComponent } from '@galfus/engine';
import { setup, tab } from '../../engine/test/interactive-fixture';
import { advanceFrame } from '../../demos/test/test-helpers';
import { createUi, UiInputText, UiTextArea, uiTextRectToWindow } from '../src';

const key = (windowId: number, logicalKey: string, ctrl = false, shift = false): KeyboardEvent => ({
  kind: 'keyboard',
  type: 'input',
  windowId,
  physicalKey: logicalKey,
  logicalKey,
  state: 'pressed',
  repeat: false,
  modifiers: { ctrl, shift, alt: false, superKey: false }
});

describe('component text fields', () => {
  it('keeps the field border visible beneath the transparent selection layer', () => {
    const { runtime, realm } = setup();
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, {
        width: 400,
        height: 200,
        theme: { components: { panel: { base: { backgroundColor: [1, 0, 0, 1] } } } }
      });
      for (const field of [new UiInputText(ui, root.root), new UiTextArea(ui, root.root)]) {
        expect(field.panel.resolvedStyle.kind.borderWidth).toEqual([2, 2, 2, 2]);
        expect(field.panel.resolvedStyle.kind.borderColor).toEqual([0.55, 0.68, 0.8, 1]);
        expect(field.panel.children[0]!.resolvedStyle.kind.backgroundColor).toEqual([0, 0, 0, 0]);
      }
    } finally {
      runtime.dispose();
    }
  });
  it('edits UTF-16 selections, words, composition and read-only values without duplicate commits', () => {
    const { runtime, transport, realm, windowId } = setup();
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 400, height: 200, windowId });
      const changes: string[] = [];
      const input = new UiInputText(ui, root.root, {
        value: 'a😀b',
        onChange: (value) => changes.push(value)
      });
      root.flush();
      advanceFrame(runtime, transport);
      expect(input.requestFocus(windowId)).toBe(true);
      input.setSelection(1, 3);
      runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'imePreedit',
        windowId,
        text: 'かな',
        selection: [1, 2]
      });
      expect(input.value).toBe('a😀b');
      expect(input.displayValue).toBe('aかなb');
      expect(input.composition?.selection).toEqual([1, 2]);
      runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'imeCommit',
        windowId,
        text: '漢'
      });
      runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'textInput',
        windowId,
        text: '漢'
      });
      expect(input.value).toBe('a漢b');
      expect(changes).toEqual(['a漢b']);
      input.setValue('one two');
      runtime.interaction.handleKeyboard(key(windowId, 'Backspace', true));
      expect(input.value).toBe('one ');
      input.setReadOnly(true);
      runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'textInput',
        windowId,
        text: 'x'
      });
      runtime.interaction.handleKeyboard(key(windowId, 'Backspace'));
      expect(input.value).toBe('one ');
      input.setReadOnly(false);
      runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'textInput',
        windowId,
        text: '\nx\r\ny'
      });
      expect(input.value).toBe('one xy');
      input.setDisabled(true);
      expect(input.requestFocus(windowId)).toBe(false);
    } finally {
      runtime.dispose();
    }
  });
  it('handles multiline entry and independent validation states', () => {
    const { runtime, transport, realm, windowId } = setup();
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 400, height: 300 });
      const area = new UiTextArea(ui, root.root, {
        value: 'first',
        validate: (value) => value.length >= 8,
        validationMode: 'change'
      });
      root.flush();
      advanceFrame(runtime, transport);
      runtime.interaction.handleKeyboard(tab(windowId) as KeyboardEvent);
      expect(area.getInteractionState(windowId).focusVisible).toBe(true);
      runtime.interaction.handleKeyboard(key(windowId, 'Enter'));
      runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'textInput',
        windowId,
        text: '\n'
      });
      runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'textInput',
        windowId,
        text: 'ab'
      });
      expect(area.value).toBe('first\nab');
      expect(area.getInteractionState(windowId).invalid).toBe(false);
      area.setValue('x');
      expect(area.getInteractionState(windowId).invalid).toBe(true);
      area.setReadOnly(true);
      runtime.interaction.handleKeyboard(key(windowId, 'Enter'));
      expect(area.value).toBe('x');
      area.dispose();
      root.flush();
      advanceFrame(runtime, transport);
      expect(ui.getFocused(windowId)).toBeUndefined();
    } finally {
      runtime.dispose();
    }
  });
  it('releases a focused composing field when its root is disposed or removed', () => {
    const { runtime, transport, realm, windowId } = setup();
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 400, height: 200 });
      const field = new UiInputText(ui, root.root, {
        value: 'a',
        validationMode: 'blur',
        validate: () => false
      });
      root.flush();
      advanceFrame(runtime, transport);
      expect(field.requestFocus(windowId)).toBe(true);
      runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'imePreedit',
        windowId,
        text: 'かな'
      });
      expect(() => field.remove()).not.toThrow();
      expect(field.composition).toBeUndefined();
      root.discardChanges();
      expect(field.textNode.text).toBe(field.value);
      expect(field.requestFocus(windowId)).toBe(true);
      runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'imePreedit',
        windowId,
        text: 'かな'
      });
      expect(() => root.dispose()).not.toThrow();
      expect(ui.getFocused(windowId)).toBeUndefined();
    } finally {
      runtime.dispose();
    }
  });
  it('renders text and geometry against the real headless core', () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport);
    try {
      const realm = runtime.createRealm2D(1);
      realm.createCamera({ orthoScale: 200 });
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 400, height: 200 }
      });
      runtime.multiverse.createInvocation({ realmId: 1, targetId: target });
      const ui = createUi(runtime),
        root = ui.createComponentRoot(realm, { width: 400, height: 200 });
      const input = new UiInputText(ui, root.root, { value: 'office 😀' });
      const area = new UiTextArea(ui, root.root, { value: 'abc\nאבג' });
      root.flush();
      advanceFrame(runtime, transport);
      advanceFrame(runtime, transport);
      advanceFrame(runtime, transport);
      advanceFrame(runtime, transport);
      expect(input.lastGeometryError).toBeUndefined();
      expect(area.lastGeometryError).toBeUndefined();
      const geometry = realm.getUiTextGeometry(root.handle, input.textNode.id);
      expect(geometry.lines.length).toBeGreaterThan(0);
      expect(geometry.clusters.length).toBeGreaterThan(0);
      expect(realm.getUiTextGeometry(root.handle, area.textNode.id).lines.length).toBeGreaterThan(
        1
      );
    } finally {
      runtime.dispose();
    }
  });
  it('navigates multiline caret geometry and preserves selection direction', () => {
    const { runtime, transport, realm, windowId } = setup();
    try {
      const ui = createUi(runtime);
      const root = ui.createComponentRoot(realm, { width: 100, height: 100 });
      const area = new UiTextArea(ui, root.root, { value: 'ab\ncd', width: 90, height: 70 });
      transport.engine.realm2dGetUiLayout = () =>
        JSON.stringify({ absoluteRect: [0, 0, 100, 100] });
      transport.engine.realm2dGetUiTextGeometry = () =>
        JSON.stringify({
          lines: [
            { start: 0, end: 2, rect: [8, 8, 20, 10] },
            { start: 3, end: 5, rect: [8, 18, 20, 10] }
          ],
          clusters: [
            { start: 0, end: 1, rect: [8, 8, 10, 10], rightToLeft: false },
            { start: 1, end: 2, rect: [18, 8, 10, 10], rightToLeft: false },
            { start: 3, end: 4, rect: [8, 18, 10, 10], rightToLeft: false },
            { start: 4, end: 5, rect: [18, 18, 10, 10], rightToLeft: false }
          ]
        });
      root.flush();
      advanceFrame(runtime, transport);
      advanceFrame(runtime, transport);
      expect(area.requestFocus(windowId)).toBe(true);
      area.setSelection(4);
      runtime.interaction.handleKeyboard(key(windowId, 'ArrowUp', false, true));
      expect(area.selection).toEqual({ anchor: 4, focus: 1 });
      runtime.interaction.handleKeyboard(key(windowId, 'End'));
      expect(area.selection.focus).toBe(2);
      runtime.interaction.handleKeyboard(key(windowId, 'End', true));
      expect(area.selection.focus).toBe(5);
    } finally {
      runtime.dispose();
    }
  });
  it('maps candidate geometry through the presented viewport and camera', () => {
    const { runtime, transport, realm, windowId, schedule } = setup();
    try {
      const ui = createUi(runtime),
        root = ui.createComponentRoot(realm, { width: 100, height: 100 });
      transport.engine.realm2dGetUiLayout = () =>
        JSON.stringify({ absoluteRect: [0, 0, 100, 100] });
      root.flush();
      advanceFrame(runtime, transport);
      expect(uiTextRectToWindow(runtime, root, windowId, [50, 50, 0, 10])).toEqual([
        50, 50, 1, 100
      ]);
      expect(uiTextRectToWindow(runtime, root, windowId + 1, [50, 50, 0, 10])).toBeUndefined();
      const model = realm.world.getComponent<Model2DComponent>(root.entityId, 'Model2D')!;
      model.setTRS([10, 0], Math.PI / 2, [2, 1]);
      schedule.targetBlocks[0]!.invocations[0]!.resolvedViewport = [10, 20, 200, 100];
      advanceFrame(runtime, transport);
      const transformed = uiTextRectToWindow(runtime, root, windowId, [50, 50, 0, 10])!;
      expect(transformed[0]).toBeCloseTo(210, 0);
      expect(transformed[1]).toBeCloseTo(70, 0);
      expect(transformed[2]).toBeCloseTo(100, 0);
      const projected = uiTextRectToWindow(runtime, root, windowId, [30, 40, 0, 0])!;
      const original = uiWindowPointToLocal(runtime, root, windowId, [projected[0], projected[1]])!;
      expect(original[0]).toBeCloseTo(30, 0);
      expect(original[1]).toBeCloseTo(40, 0);
      const outside = uiWindowPointToLocal(runtime, root, windowId, [-1000, -1000])!;
      expect(outside[0] < 0 || outside[0] > 100 || outside[1] < 0 || outside[1] > 100).toBe(true);
    } finally {
      runtime.dispose();
    }
  });
});
