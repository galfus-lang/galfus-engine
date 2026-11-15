import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { advanceFrame } from './test-helpers';
import { canExitUi8, createUi8Scene, runDemoUi8 } from '../src/ui/ui8-integrated';
import { setup } from '../../engine/test/interactive-fixture';
import { createUi, UiButton, UiInputText } from '@galfus/ui';
import type { KeyboardEvent } from '@galfus/transport-types';

describe('integrated UI demo', () => {
  it('lets overlays and text composition handle Escape before exiting', () => {
    const f = setup();
    try {
      const ui = createUi(f.runtime);
      const root = ui.createComponentRoot(f.realm, {
        width: 200,
        height: 100,
        windowId: f.windowId
      });
      const input = new UiInputText(ui, root.root, { value: 'Olá' });
      const button = new UiButton(root.root, { label: 'Open' });
      f.transport.engine.realm2dGetUiLayout = () =>
        JSON.stringify({ absoluteRect: [0, 0, 100, 100] });
      root.flush();
      advanceFrame(f.runtime, f.transport);
      const manager = ui.createOverlayManager(root, f.windowId);
      const popover = manager.createPopover({
        anchor: button.panel,
        width: 40,
        height: 30,
        build: () => {}
      });
      const escape: KeyboardEvent = {
        kind: 'keyboard',
        type: 'input',
        windowId: f.windowId,
        logicalKey: 'Escape',
        physicalKey: 'Escape',
        state: 'pressed',
        repeat: false,
        modifiers: { ctrl: false, shift: false, alt: false, superKey: false }
      };
      const canExit = () => {
        f.runtime.interaction.handleKeyboard(escape);
        return canExitUi8([input], f.windowId, escape, manager);
      };
      popover.open();
      expect(canExit()).toBe(false);
      expect(popover.isOpen).toBe(false);
      expect(input.requestFocus(f.windowId)).toBe(true);
      f.runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'imePreedit',
        windowId: f.windowId,
        text: 'あ'
      });
      expect(canExit()).toBe(false);
      expect(input.getInteractionState(f.windowId).focus).toBe(true);
      f.runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'imePreedit',
        windowId: f.windowId,
        text: ''
      });
      expect(canExit()).toBe(false);
      expect(input.getInteractionState(f.windowId).focus).toBe(false);
      expect(canExit()).toBe(true);
    } finally {
      f.runtime.dispose();
    }
  });
  it('runs headlessly', async () => {
    await runDemoUi8({ headless: true, maxFrames: 3 });
  });
  it('combines inherited styles, text editing and controls in the presented layout', () => {
    const transport = createBunTransport({ headless: true }),
      runtime = createRuntime(transport);
    try {
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 960, height: 720 }
      });
      const scene = createUi8Scene(runtime, target);
      for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
      expect(scene.title.resolvedStyle.kind.fontWeight).toBe(700);
      expect(scene.menuButton.panel.resolvedStyle.kind.backgroundColor).toEqual([
        0.12, 0.42, 0.63, 1
      ]);
      expect(scene.input.value).toBe('Ada França');
      scene.input.setValue('Changed 😀');
      scene.slider.setValue(75);
      expect(scene.progress.value).toBe(75);
      for (const component of [
        scene.input,
        scene.area,
        scene.checkbox,
        scene.slider,
        scene.progress
      ]) {
        const rect = scene.realm.getUiLayout(scene.root.handle, component.panel.id).absoluteRect;
        expect(rect[2]).toBeGreaterThan(0);
        expect(rect[3]).toBeGreaterThan(0);
        expect(rect[1] + rect[3]).toBeLessThan(720);
      }
      scene.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
