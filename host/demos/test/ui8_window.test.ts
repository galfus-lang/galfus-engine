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
      const clickPanel = (id: number) => {
        const [x, y, width, height] = screenRect(id);
        const cx = x + width / 2,
          cy = y + height / 2;
        runtime.interaction.handle(move(windowId, cx, cy) as PointerEvent);
        runtime.interaction.handle(button(windowId, cx, cy, 'pressed') as PointerEvent);
        runtime.interaction.handle(button(windowId, cx, cy, 'released') as PointerEvent);
      };
      clickPanel(scene.controls.play.panel.id);
      expect(scene.controls.play.value).toBe(false);
      const model = scene.preview.realm.world.getComponent<
        import('@galfus/engine').Model3DComponent
      >(scene.preview.cube.entityId, 'Model3D')!;
      frame();
      const paused = Array.from(model.localMatrix);
      frame();
      expect(Array.from(model.localMatrix)).toEqual(paused);
      clickPanel(scene.controls.name.panel.id);
      runtime.interaction.handleKeyboard({
        kind: 'keyboard',
        type: 'textInput',
        windowId,
        text: 'é'
      });
      expect(scene.controls.name.value).toContain('é');
      const renamed = scene.controls.name.value;
      frame();
      clickPanel(scene.controls.objectButtons[1]!.panel.id);
      expect(scene.controls.name.value).toBe('Sphere');
      frame();
      clickPanel(scene.controls.objectButtons[0]!.panel.id);
      expect(scene.controls.name.value).toBe(renamed);
      frame();
      const [sx, sy, sw, sh] = screenRect(scene.controls.slider.panel.id);
      runtime.interaction.handle(move(windowId, sx + sw - 8, sy + sh / 2) as PointerEvent);
      runtime.interaction.handle(
        button(windowId, sx + sw - 8, sy + sh / 2, 'pressed') as PointerEvent
      );
      runtime.interaction.handle(
        button(windowId, sx + sw - 8, sy + sh / 2, 'released') as PointerEvent
      );
      expect(scene.controls.slider.value).toBeGreaterThan(100);
      expect(scene.controls.progress.value).toBe(scene.controls.slider.value);
      frame();
      clickPanel(scene.controls.checkbox.panel.id);
      expect(scene.controls.checkbox.value).toBe(true);
      expect(scene.controls.slider.getInteractionState(windowId).disabled).toBe(true);
      frame();
      clickPanel(scene.controls.fileButton.panel.id);
      expect(scene.controls.menu?.isOpen).toBe(true);
      frame();
      const menu = scene.controls.menu!;
      const menuRoot = menu.popover.root!;
      const menuRect = scene.realm.getUiLayout(
        menuRoot.handle,
        menu.itemPanel('save')!.id
      ).absoluteRect;
      const [mx, my, mw, mh] = uiTextRectToWindow(runtime, menuRoot, windowId, menuRect)!;
      runtime.interaction.handle(move(windowId, mx + mw / 2, my + mh / 2) as PointerEvent);
      runtime.interaction.handle(
        button(windowId, mx + mw / 2, my + mh / 2, 'pressed') as PointerEvent
      );
      runtime.interaction.handle(
        button(windowId, mx + mw / 2, my + mh / 2, 'released') as PointerEvent
      );
      expect(menu.isOpen).toBe(false);
      expect(scene.statusText.text).toContain('save');
      frame();
      clickPanel(scene.controls.dialogButton.panel.id);
      expect(scene.controls.dialog?.isOpen).toBe(true);
      scene.controls.dialog?.close();
      frame();
      clickPanel(scene.controls.select!.panel.id);
      expect(scene.controls.select!.popover.isOpen).toBe(true);
      frame();
      const selectRoot = scene.controls.select!.popover.root!;
      const option = selectRoot.root.children[1]!;
      const optionRect = scene.realm.getUiLayout(selectRoot.handle, option.id).absoluteRect;
      const [ox, oy, ow, oh] = uiTextRectToWindow(runtime, selectRoot, windowId, optionRect)!;
      runtime.interaction.handle(move(windowId, ox + ow / 2, oy + oh / 2) as PointerEvent);
      runtime.interaction.handle(
        button(windowId, ox + ow / 2, oy + oh / 2, 'pressed') as PointerEvent
      );
      runtime.interaction.handle(
        button(windowId, ox + ow / 2, oy + oh / 2, 'released') as PointerEvent
      );
      expect(scene.controls.select!.value).toBe('Sphere');
      expect(scene.controls.name.value).toBe('Sphere');
      scene.dispose();
    } finally {
      runtime.dispose();
    }
  });
});
