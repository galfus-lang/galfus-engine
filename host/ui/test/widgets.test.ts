import { describe, expect, it } from 'bun:test';
import type { KeyboardEvent, PointerEvent } from '@galfus/transport-types';
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime } from '@galfus/engine';
import { button, move, setup, tab } from '../../engine/test/interactive-fixture';
import { advanceFrame } from '../../demos/test/test-helpers';
import { createUi, UiButton, UiDialog, UiMenu, UiProgressBar } from '../src';

const key = (
  windowId: number,
  logicalKey: string,
  state: 'pressed' | 'released' = 'pressed'
): KeyboardEvent => ({
  kind: 'keyboard',
  type: 'input',
  windowId,
  logicalKey,
  physicalKey: logicalKey,
  state,
  repeat: false,
  modifiers: { shift: false, ctrl: false, alt: false, superKey: false }
});
const activate = (runtime: ReturnType<typeof setup>['runtime'], id: number) => {
  runtime.interaction.handleKeyboard(key(id, 'Enter'));
  runtime.interaction.handleKeyboard(key(id, 'Enter', 'released'));
};
function fixture() {
  const f = setup();
  const ui = createUi(f.runtime);
  const root = ui.createComponentRoot(f.realm, { width: 400, height: 300, windowId: f.windowId });
  const trigger = new UiButton(root.root, { label: 'Open' });
  const outside = new UiButton(root.root, { label: 'Outside' });
  f.transport.engine.realm2dGetUiLayout = (_realm, model, id) =>
    JSON.stringify({
      absoluteRect:
        model === root.uiId && id === root.root.id ? [0, 0, 400, 300] : [10, 10, 100, 36]
    });
  root.flush();
  advanceFrame(f.runtime, f.transport);
  const manager = ui.createOverlayManager(root, f.windowId);
  return { ...f, ui, root, trigger, outside, manager };
}

describe('menu, dialog and progress widgets', () => {
  it('navigates and selects menu items while skipping disabled entries', () => {
    const f = fixture();
    try {
      const selected: string[] = [],
        closed: string[] = [];
      const menu = new UiMenu(f.manager, {
        anchor: f.trigger.panel,
        pageSize: 2,
        items: [
          { id: 'a', label: 'A', disabled: true },
          { id: 'b', label: 'B' },
          { id: 'c', label: 'C' }
        ],
        onSelect: (event) => selected.push(event.path.join('/')),
        onClose: (reason) => closed.push(reason)
      });
      expect(f.trigger.requestFocus(f.windowId)).toBe(true);
      menu.open();
      advanceFrame(f.runtime, f.transport);
      advanceFrame(f.runtime, f.transport);
      expect(f.ui.getFocused(f.windowId)?.target).toMatchObject({
        uiId: menu.popover.root!.uiId,
        elementId: menu.itemPanel('b')!.id
      });
      f.runtime.interaction.handleKeyboard(key(f.windowId, 'ArrowDown'));
      activate(f.runtime, f.windowId);
      expect(selected).toEqual(['c']);
      expect(closed).toEqual(['selection']);
      expect(menu.isOpen).toBe(false);
      expect(f.trigger.getInteractionState(f.windowId).focus).toBe(true);
      expect(() =>
        menu.setItems([
          { id: 'x', label: 'X' },
          { id: 'x', label: 'Y' }
        ])
      ).toThrow('unique');
      menu.dispose();
    } finally {
      f.runtime.dispose();
    }
  });
  it('owns submenus and emits the selected path exactly once', () => {
    const f = fixture();
    try {
      const selected: string[] = [];
      const menu = new UiMenu(f.manager, {
        anchor: f.trigger.panel,
        items: [{ id: 'file', label: 'File', children: [{ id: 'save', label: 'Save' }] }],
        onSelect: (event) => selected.push(event.path.join('/'))
      });
      f.trigger.requestFocus(f.windowId);
      menu.open();
      advanceFrame(f.runtime, f.transport);
      advanceFrame(f.runtime, f.transport);
      f.runtime.interaction.handleKeyboard(key(f.windowId, 'ArrowRight'));
      advanceFrame(f.runtime, f.transport);
      advanceFrame(f.runtime, f.transport);
      expect(f.ui.getFocused(f.windowId)?.target.type).toBe('ui');
      activate(f.runtime, f.windowId);
      expect(selected).toEqual(['file/save']);
      expect(menu.isOpen).toBe(false);
      expect(f.trigger.getInteractionState(f.windowId).focus).toBe(true);
    } finally {
      f.runtime.dispose();
    }
  });
  it('traps focus in a dialog and restores it on Escape', () => {
    const f = fixture();
    try {
      let first!: UiButton, second!: UiButton;
      const reasons: string[] = [];
      const dialog = new UiDialog(f.manager, {
        anchor: f.trigger.panel,
        width: 200,
        height: 120,
        build: (content) => {
          first = new UiButton(content, { label: 'First' });
          second = new UiButton(content, { label: 'Second' });
          return first.panel;
        },
        onClose: (reason) => reasons.push(reason)
      });
      f.trigger.requestFocus(f.windowId);
      dialog.open();
      expect(f.outside.requestFocus(f.windowId)).toBe(false);
      f.runtime.interaction.handleKeyboard(tab(f.windowId) as KeyboardEvent);
      expect(f.ui.getFocused(f.windowId)).toBeUndefined();
      for (let i = 0; i < 3; i++) advanceFrame(f.runtime, f.transport);
      expect(first.getInteractionState(f.windowId).focus).toBe(true);
      f.runtime.interaction.handleKeyboard(tab(f.windowId) as KeyboardEvent);
      expect(second.getInteractionState(f.windowId).focus).toBe(true);
      f.runtime.interaction.handleKeyboard(tab(f.windowId) as KeyboardEvent);
      expect(first.getInteractionState(f.windowId).focus).toBe(true);
      f.runtime.interaction.handleKeyboard(key(f.windowId, 'Escape'));
      expect(dialog.isOpen).toBe(false);
      expect(reasons).toEqual(['escape']);
      expect(f.trigger.getInteractionState(f.windowId).focus).toBe(true);
    } finally {
      f.runtime.dispose();
    }
  });
  it('supports nested dialogs and keeps the outer scope when the inner closes', () => {
    const f = fixture();
    try {
      let outerButton!: UiButton, innerButton!: UiButton;
      const outer = new UiDialog(f.manager, {
        anchor: f.trigger.panel,
        width: 200,
        height: 120,
        build: (content) => {
          outerButton = new UiButton(content, { label: 'Nested' });
          return outerButton.panel;
        }
      });
      f.trigger.requestFocus(f.windowId);
      outer.open();
      for (let i = 0; i < 3; i++) advanceFrame(f.runtime, f.transport);
      const inner = new UiDialog(f.manager, {
        anchor: outerButton.panel,
        width: 100,
        height: 80,
        build: (content) => {
          innerButton = new UiButton(content, { label: 'Close' });
          return innerButton.panel;
        }
      });
      inner.open();
      for (let i = 0; i < 3; i++) advanceFrame(f.runtime, f.transport);
      expect(innerButton.getInteractionState(f.windowId).focus).toBe(true);
      expect(outerButton.requestFocus(f.windowId)).toBe(false);
      inner.close();
      expect(outerButton.getInteractionState(f.windowId).focus).toBe(true);
      expect(f.outside.requestFocus(f.windowId)).toBe(false);
      outer.close();
      expect(f.trigger.getInteractionState(f.windowId).focus).toBe(true);
      inner.dispose();
      outer.dispose();
    } finally {
      f.runtime.dispose();
    }
  });
  it('allows a menu owned by a dialog and respects Escape policy', () => {
    const f = fixture();
    try {
      let trigger!: UiButton;
      const dialog = new UiDialog(f.manager, {
        anchor: f.trigger.panel,
        width: 200,
        height: 120,
        closeOnEscape: false,
        build: (content) => {
          trigger = new UiButton(content, { label: 'Actions' });
          return trigger.panel;
        }
      });
      dialog.open();
      for (let i = 0; i < 3; i++) advanceFrame(f.runtime, f.transport);
      const menu = new UiMenu(f.manager, {
        anchor: trigger.panel,
        items: [{ id: 'a', label: 'Action' }]
      });
      menu.open();
      for (let i = 0; i < 3; i++) advanceFrame(f.runtime, f.transport);
      expect(f.ui.getFocused(f.windowId)?.target).toMatchObject({ uiId: menu.popover.root!.uiId });
      f.runtime.interaction.handleKeyboard(key(f.windowId, 'Escape'));
      expect(menu.isOpen).toBe(false);
      expect(dialog.isOpen).toBe(true);
      expect(trigger.getInteractionState(f.windowId).focus).toBe(true);
      f.runtime.interaction.handleKeyboard(key(f.windowId, 'Escape'));
      expect(dialog.isOpen).toBe(true);
      dialog.close();
    } finally {
      f.runtime.dispose();
    }
  });
  it('releases a newly created scope if blur closes the dialog synchronously', () => {
    const f = fixture();
    try {
      const dialog = new UiDialog(f.manager, {
        anchor: f.trigger.panel,
        width: 160,
        height: 100,
        build: () => {}
      });
      expect(f.trigger.requestFocus(f.windowId)).toBe(true);
      const focusable = f.ui.getFocused(f.windowId)!;
      focusable.on('blur', () => dialog.close());
      dialog.open();
      expect(dialog.isOpen).toBe(false);
      expect(f.outside.requestFocus(f.windowId)).toBe(true);
    } finally {
      f.runtime.dispose();
    }
  });
  it('closes a backdrop only when outside dismissal is enabled', () => {
    const f = fixture();
    try {
      const reasons: string[] = [];
      const dialog = new UiDialog(f.manager, {
        anchor: f.trigger.panel,
        width: 160,
        height: 100,
        closeOnOutside: false,
        build: (content) => {
          new UiButton(content, { label: 'OK' });
        },
        onClose: (reason) => reasons.push(reason)
      });
      f.trigger.requestFocus(f.windowId);
      dialog.open();
      advanceFrame(f.runtime, f.transport);
      const interaction = f.runtime.interaction as any;
      const deliver = () => {
        interaction.handle(button(f.windowId, 2, 2, 'released') as PointerEvent);
        interaction.pollNativeEvents({
          multiversePollInteractionEvents: () =>
            JSON.stringify([
              {
                interactionType: 'click',
                windowId: f.windowId,
                pointerId: 0,
                realmId: f.realm.realmId,
                modelId: dialog.popover.root!.uiId,
                elementId: dialog.popover.root!.root.id,
                colliderId: 1,
                localPos: [0, 0],
                uv: [0, 0],
                delta: [0, 0]
              }
            ])
        });
      };
      deliver();
      expect(dialog.isOpen).toBe(true);
      dialog.close();
      expect(reasons).toEqual(['programmatic']);
      const outsideDialog = new UiDialog(f.manager, {
        anchor: f.trigger.panel,
        width: 160,
        height: 100,
        build: () => {},
        onClose: (reason) => reasons.push(reason)
      });
      outsideDialog.open();
      advanceFrame(f.runtime, f.transport);
      interaction.handle(move(f.windowId, 2, 2) as PointerEvent);
      interaction.handle(button(f.windowId, 2, 2, 'released') as PointerEvent);
      interaction.pollNativeEvents({
        multiversePollInteractionEvents: () =>
          JSON.stringify([
            {
              interactionType: 'click',
              windowId: f.windowId,
              pointerId: 0,
              realmId: f.realm.realmId,
              modelId: outsideDialog.popover.root!.uiId,
              elementId: outsideDialog.popover.root!.root.id,
              colliderId: 1,
              localPos: [0, 0],
              uv: [0, 0],
              delta: [0, 0]
            }
          ])
      });
      expect(outsideDialog.isOpen).toBe(false);
      expect(reasons.at(-1)).toBe('outside');
    } finally {
      f.runtime.dispose();
    }
  });
  it('blocks pointer events behind a dialog immediately, even before presentation', () => {
    const f = fixture();
    try {
      let activated = 0;
      f.outside.onActivate(() => activated++);
      const dialog = new UiDialog(f.manager, {
        anchor: f.trigger.panel,
        width: 160,
        height: 100,
        build: () => {}
      });
      const interaction = f.runtime.interaction as any;
      const deliver = () => {
        interaction.handle(button(f.windowId, 2, 2, 'released') as PointerEvent);
        interaction.pollNativeEvents({
          multiversePollInteractionEvents: () =>
            JSON.stringify([
              {
                interactionType: 'click',
                windowId: f.windowId,
                pointerId: 0,
                realmId: f.realm.realmId,
                modelId: f.root.uiId,
                elementId: f.outside.panel.id,
                colliderId: 1,
                localPos: [0, 0],
                uv: [0, 0],
                delta: [0, 0]
              }
            ])
        });
      };
      dialog.open();
      deliver();
      expect(activated).toBe(0);
      dialog.close();
      deliver();
      expect(activated).toBe(1);
    } finally {
      f.runtime.dispose();
    }
  });
  it('restores focus when a dialog owner is removed', () => {
    const f = fixture();
    try {
      const other = f.ui.createComponentRoot(f.realm, {
        width: 100,
        height: 100,
        windowId: f.windowId
      });
      const previous = new UiButton(other.root, { label: 'Previous' });
      other.flush();
      advanceFrame(f.runtime, f.transport);
      expect(previous.requestFocus(f.windowId)).toBe(true);
      const dialog = new UiDialog(f.manager, {
        anchor: f.trigger.panel,
        width: 160,
        height: 100,
        build: () => {}
      });
      dialog.open();
      advanceFrame(f.runtime, f.transport);
      f.root.dispose();
      expect(dialog.isOpen).toBe(false);
      expect(previous.getInteractionState(f.windowId).focus).toBe(true);
    } finally {
      f.runtime.dispose();
    }
  });
  it('applies progress theme variants and a custom fill style', () => {
    const f = fixture();
    try {
      f.root.setTheme({
        components: {
          progressBar: { variants: { accent: { backgroundColor: [0.2, 0.3, 0.4, 1] } } }
        }
      });
      const progress = new UiProgressBar(f.ui, f.root.root, {
        variant: 'accent',
        fillStyle: { backgroundColor: [1, 0, 0, 1] }
      });
      expect(progress.panel.resolvedStyle.kind.backgroundColor).toEqual([0.2, 0.3, 0.4, 1]);
      expect(progress.fill.resolvedStyle.kind.backgroundColor).toEqual([1, 0, 0, 1]);
    } finally {
      f.runtime.dispose();
    }
  });
  it('renders bounded and indeterminate progress without accepting invalid numbers', () => {
    const transport = createBunTransport({ headless: true }),
      runtime = createRuntime(transport);
    try {
      const realm = runtime.createRealm2D(1);
      realm.createCamera({ orthoScale: 200 });
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 400, height: 200 }
      });
      runtime.multiverse.createInvocation({ realmId: 1, targetId: target });
      const ui = createUi(runtime),
        root = ui.createComponentRoot(realm, { width: 400, height: 200 });
      const changes: (number | null)[] = [];
      const progress = new UiProgressBar(ui, root.root, {
        width: 104,
        value: 0,
        onChange: (value) => changes.push(value)
      });
      expect(progress.fill.visible).toBe(false);
      progress.setValue(50);
      expect(progress.fill.layout.width).toEqual({ type: 'exact', value: 50 });
      progress.setValue(200);
      expect(progress.value).toBe(100);
      expect(progress.fill.layout.width).toEqual({ type: 'exact', value: 100 });
      expect(() => progress.setValue(NaN)).toThrow('finite');
      expect(() => progress.setBounds(3, 3)).toThrow('bounds');
      progress.setValue(null);
      root.flush();
      const before = progress.fill.layout.positionOffset![0];
      advanceFrame(runtime, transport);
      advanceFrame(runtime, transport);
      expect(progress.fill.layout.positionOffset![0]).not.toBe(before);
      expect(progress.indeterminate).toBe(true);
      expect(changes).toEqual([50, 100, null]);
      expect(realm.getUiLayout(root.handle, progress.panel.id).absoluteRect[2]).toBe(104);
      progress.remove();
      root.flush();
      expect(() => progress.setValue(1)).toThrow('not attached');
    } finally {
      runtime.dispose();
    }
  });
});
