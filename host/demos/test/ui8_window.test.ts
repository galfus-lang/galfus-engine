import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import { createBunTransport } from '@galfus/transport-bun';
import type { PointerEvent } from '@galfus/transport-types';
import { uiTextRectToWindow } from '@galfus/ui';
import { button, move } from '../../engine/test/interactive-fixture';
import { createUi8Scene } from '../src/ui/ui8-integrated';
import { advanceFrame } from './test-helpers';

describe('ui8 editor window', () => {
  const windowTest = process.env.GALFUS_UI_WINDOW_TEST === '1' ? it : it.skip;
  windowTest('drags a split and selects a 3D object through the resized viewport', () => {
    const transport = createBunTransport({ headless: false });
    const runtime = createRuntime(transport);
    try {
      const windowId = runtime.platform.window.create({
        title: 'UI8 split test',
        size: [960, 720]
      });
      const size = runtime.platform.window.getSize(windowId);
      const target = runtime.multiverse.createTarget({ kind: { type: 'window', windowId } });
      const scene = createUi8Scene(runtime, target, windowId, size);
      const frame = () => {
        for (let i = 0; i < 4; i++) advanceFrame(runtime, transport);
      };
      const screenRect = (id: number) =>
        uiTextRectToWindow(
          runtime,
          scene.root,
          windowId,
          scene.realm.getUiLayout(scene.root.handle, id).absoluteRect
        )!;
      const clickViewport = () => {
        const [x, y, width, height] = screenRect(scene.viewport.id);
        const px = x + width / 2,
          py = y + height / 2;
        runtime.interaction.handle(move(windowId, px, py) as PointerEvent);
        runtime.interaction.handle(button(windowId, px, py, 'pressed') as PointerEvent);
        runtime.interaction.handle(button(windowId, px, py, 'released') as PointerEvent);
      };
      frame();
      const [x, y, width, height] = screenRect(scene.splits.sashes[0]!.id);
      const px = x + width / 2,
        py = y + height / 2;
      const before = scene.splits.horizontal.panels[0]!.rect.width;
      runtime.interaction.handle(move(windowId, px, py) as PointerEvent);
      runtime.interaction.handle(button(windowId, px, py, 'pressed') as PointerEvent);
      for (const dx of [10, 20, 30]) {
        runtime.interaction.handle(move(windowId, px + dx, py) as PointerEvent);
        frame();
        expect(scene.splits.horizontal.panels[0]!.rect.width).toBeCloseTo(before + dx, 1);
      }
      runtime.interaction.handle(button(windowId, px + 30, py, 'released') as PointerEvent);
      const [vx, vy, vw, vh] = screenRect(scene.splits.sashes[2]!.id);
      const vpx = vx + vw / 2,
        vpy = vy + vh / 2;
      const beforeHeight = scene.splits.vertical.panels[0]!.rect.height;
      runtime.interaction.handle(move(windowId, vpx, vpy) as PointerEvent);
      runtime.interaction.handle(button(windowId, vpx, vpy, 'pressed') as PointerEvent);
      for (const dy of [10, 20, 30]) {
        runtime.interaction.handle(move(windowId, vpx, vpy + dy) as PointerEvent);
        frame();
        expect(scene.splits.vertical.panels[0]!.rect.height).toBeCloseTo(beforeHeight + dy, 1);
      }
      runtime.interaction.handle(button(windowId, vpx, vpy + 30, 'released') as PointerEvent);
      frame();
      clickViewport();
      expect(scene.statusText.text).toBe('Selected   •   Cube');
      scene.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
