import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import { advanceFrame } from './test-helpers';
import { canExitUi5, createUi5Scene, runDemoUi5 } from '../src/ui/ui5-text-fields';
import { setup } from '../../engine/test/interactive-fixture';
import { createUi, UiInputText } from '@galfus/ui';
import type { KeyboardEvent } from '@galfus/transport-types';

describe('ui5 text fields', () => {
  it('runs headlessly', async () => {
    await runDemoUi5({ headless: true, maxFrames: 3 });
  });
  it('keeps Escape for IME composition, then blurs and exits on the next Escape', () => {
    const f = setup();
    try {
      const ui = createUi(f.runtime);
      const root = ui.createComponentRoot(f.realm, {
        width: 200,
        height: 100,
        windowId: f.windowId
      });
      const input = new UiInputText(ui, root.root, { value: 'Olá 😀' });
      root.flush();
      advanceFrame(f.runtime, f.transport);
      expect(input.requestFocus(f.windowId)).toBe(true);
      const key: KeyboardEvent = {
        kind: 'keyboard',
        type: 'input',
        windowId: f.windowId,
        logicalKey: 'Escape',
        physicalKey: 'Escape',
        state: 'pressed',
        repeat: false,
        modifiers: { ctrl: false, shift: false, alt: false, superKey: false }
      };
      f.runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'imePreedit',
        windowId: f.windowId,
        text: 'あ'
      });
      expect(canExitUi5([input], f.windowId, key)).toBe(false);
      expect(input.getInteractionState(f.windowId).focus).toBe(true);
      f.runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'imePreedit',
        windowId: f.windowId,
        text: ''
      });
      expect(canExitUi5([input], f.windowId, key)).toBe(false);
      expect(input.getInteractionState(f.windowId).focus).toBe(false);
      expect(canExitUi5([input], f.windowId, key)).toBe(true);
    } finally {
      f.runtime.dispose();
    }
  });
  it('lays out both controls and exposes their values', () => {
    const transport = createBunTransport({ headless: true });
    const runtime = createRuntime(transport);
    try {
      const target = runtime.multiverse.createTarget({
        kind: { type: 'texture', width: 900, height: 560 }
      });
      const scene = createUi5Scene(runtime, target);
      for (let i = 0; i < 5; i++) advanceFrame(runtime, transport);
      const a = scene.realm.getUiLayout(scene.root.handle, scene.input.panel.id).absoluteRect;
      const b = scene.realm.getUiLayout(scene.root.handle, scene.area.panel.id).absoluteRect;
      expect(a[2]).toBe(420);
      expect(b[2]).toBe(520);
      expect(b[1]).toBeGreaterThan(a[1] + a[3]);
      expect(scene.input.value).toBe('office café');
      expect(scene.area.value).toContain('\n');
      expect(scene.readOnly.readOnly).toBe(true);
      const scrollThumb = scene.area.panel.children[4];
      expect(scrollThumb?.visible).toBe(true);
      const beforeOffsetY = scene.area.textNode.layout.positionOffset?.[1] ?? 8;
      const interaction = runtime.interaction as any;
      interaction.pollNativeEvents({
        multiversePollInteractionEvents: () =>
          JSON.stringify([
            {
              interactionType: 'scroll',
              windowId: 1,
              pointerId: 0,
              realmId: scene.realm.realmId,
              modelId: scene.root.uiId,
              elementId: scene.area.panel.id,
              colliderId: 1,
              localPos: [0, 0],
              uv: [0.5, 0.5],
              delta: [0, 0],
              scrollDelta: [0, -1]
            }
          ])
      });
      const afterOffsetY = scene.area.textNode.layout.positionOffset?.[1] ?? 8;
      expect(afterOffsetY).toBeLessThan(beforeOffsetY);
      scene.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
