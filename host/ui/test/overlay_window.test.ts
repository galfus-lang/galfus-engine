import { describe, expect, it } from 'bun:test';
import type { PointerEvent } from '@galfus/transport-types';
import { createBunTransport } from '@galfus/transport-bun';
import { createRuntime } from '@galfus/engine';
import { button, move } from '../../engine/test/interactive-fixture';
import { advanceFrame } from '../../demos/test/test-helpers';
import { createUi, UiButton, UiInputText, UiTextArea, uiTextRectToWindow } from '../src';
import { createUi4Scene } from '../../demos/src/ui/ui4-overlays';
import { createUi6Scene } from '../../demos/src/ui/ui6-selection-controls';
import { createUi7Scene } from '../../demos/src/ui/ui7-menu-dialog-progress';
import { createUi8Scene } from '../../demos/src/ui/ui8-integrated';

describe('native UI pointer integration', () => {
  const windowTest = process.env.GALFUS_UI_WINDOW_TEST === '1' ? it : it.skip;
  windowTest(
    'picks component and overlay panels through real core colliders and closes outside',
    async () => {
      const transport = createBunTransport({ headless: false });
      const runtime = createRuntime(transport);
      try {
        const windowId = runtime.platform.window.create({
          title: 'Galfus UI integration test',
          size: [600, 400]
        });
        const [width, height] = runtime.platform.window.getSize(windowId);
        const realm = runtime.createRealm2D();
        realm.createCamera({ orthoScale: height });
        const target = runtime.multiverse.createTarget({ kind: { type: 'window', windowId } });
        runtime.multiverse.createInvocation({ realmId: realm.realmId, targetId: target });
        const ui = createUi(runtime);
        const root = ui.createComponentRoot(realm, { width, height, windowId });
        let triggerCount = 0;
        const trigger = new UiButton(root.root, {
          label: 'Open',
          layout: { width: { type: 'exact', value: 80 }, height: { type: 'exact', value: 40 } },
          onActivate: () => triggerCount++
        });
        root.flush();
        advanceFrame(runtime, transport);
        advanceFrame(runtime, transport);
        const click = (x: number, y: number) => {
          runtime.interaction.handle(move(windowId, x, y) as PointerEvent);
          runtime.interaction.handle(button(windowId, x, y, 'pressed') as PointerEvent);
          runtime.interaction.handle(button(windowId, x, y, 'released') as PointerEvent);
        };
        click(30, 20);
        expect(triggerCount).toBe(1);
        const manager = ui.createOverlayManager(root, windowId);
        let insideCount = 0;
        const overlay = manager.createPopover({
          anchor: trigger.panel,
          width: 80,
          height: 40,
          build: (content) => {
            new UiButton(content.root, {
              label: 'Inside',
              layout: { width: { type: 'exact', value: 60 }, height: { type: 'exact', value: 24 } },
              onActivate: () => insideCount++
            });
          }
        });
        overlay.open();
        advanceFrame(runtime, transport);
        advanceFrame(runtime, transport);
        click(20, 60);
        expect(insideCount).toBe(1);
        expect(overlay.isOpen).toBe(true);
        click(160, 100);
        expect(overlay.isOpen).toBe(false);
        expect(triggerCount).toBe(1);
        root.root.setLayout({
          width: { type: 'exact', value: 200 },
          height: { type: 'exact', value: 100 }
        });
        root.flush();
        advanceFrame(runtime, transport);
        advanceFrame(runtime, transport);
        click(width / 2 - 100 + 30, height / 2 - 50 + 20);
        expect(triggerCount).toBe(2);
        root.root.setVisible(false);
        root.flush();
        advanceFrame(runtime, transport);
        click(width / 2 - 100 + 30, height / 2 - 50 + 20);
        expect(triggerCount).toBe(2);
        root.root.setVisible(true);
        root.flush();
        advanceFrame(runtime, transport);
        click(width / 2 - 100 + 30, height / 2 - 50 + 20);
        expect(triggerCount).toBe(3);
        ui.dispose();
        const scene = createUi4Scene(runtime, target, windowId, [width, height]);
        advanceFrame(runtime, transport);
        advanceFrame(runtime, transport);
        const rect = scene.realm.getUiLayout(
          scene.root.handle,
          scene.trigger.panel.id
        ).absoluteRect;
        click(rect[0] + rect[2] / 2, rect[1] + rect[3] / 2);
        expect(scene.popover?.isOpen).toBe(true);
        advanceFrame(runtime, transport);
        advanceFrame(runtime, transport);
        expect(scene.popover?.root?.root.children.length).toBeGreaterThan(0);
        scene.popover?.close();
        expect(scene.tipTrigger.requestFocus(windowId)).toBe(true);
        advanceFrame(runtime, transport);
        await Bun.sleep(450);
        expect(scene.tooltip?.isOpen).toBe(true);
        scene.dispose();
        const editRealm = runtime.createRealm2D();
        editRealm.createCamera({ orthoScale: height });
        runtime.multiverse.createInvocation({ realmId: editRealm.realmId, targetId: target });
        const editUi = createUi(runtime);
        const editRoot = editUi.createComponentRoot(editRealm, { width, height, windowId });
        const candidateAreas: number[][] = [];
        const setCandidate = runtime.platform.window.setImeCursorArea.bind(runtime.platform.window);
        runtime.platform.window.setImeCursorArea = (id, x, y, w, h) => {
          candidateAreas.push([id, x, y, w, h]);
          setCandidate(id, x, y, w, h);
        };
        const field = new UiInputText(editUi, editRoot.root, { value: 'office' });
        editRoot.flush();
        for (let i = 0; i < 4; i++) advanceFrame(runtime, transport);
        click(12, 16);
        expect(field.getInteractionState(windowId).focus).toBe(true);
        expect(field.selection.focus).toBeLessThan(field.value.length);
        const position = field.selection.focus;
        runtime.interaction.handleKeyboard({
          kind: 'keyboard',
          type: 'textInput',
          windowId,
          text: 'X'
        });
        expect(field.value).toBe(`office`.slice(0, position) + 'X' + `office`.slice(position));
        for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
        expect(field.lastGeometryError).toBeUndefined();
        expect(candidateAreas.length).toBeGreaterThan(0);
        expect(candidateAreas.at(-1)![4]).toBeGreaterThan(0);
        field.setValue('abc😀e\u0301');
        for (let i = 0; i < 4; i++) advanceFrame(runtime, transport);
        const textGeometry = editRealm.getUiTextGeometry(editRoot.handle, field.textNode.id);
        const first = textGeometry.clusters[0]!.rect;
        const last = textGeometry.clusters.at(-1)!.rect;
        const startX = first[0] + 0.1,
          endX = last[0] + last[2] - 0.1,
          textY = first[1] + first[3] / 2;
        runtime.interaction.handle(move(windowId, startX, textY) as PointerEvent);
        runtime.interaction.handle(button(windowId, startX, textY, 'pressed') as PointerEvent);
        runtime.interaction.handle(move(windowId, endX, textY) as PointerEvent);
        runtime.interaction.handle(button(windowId, endX, textY, 'released') as PointerEvent);
        expect(field.selection.focus).toBeGreaterThan(field.selection.anchor);
        field.setValue('x'.repeat(120));
        for (let i = 0; i < 5; i++) advanceFrame(runtime, transport);
        expect(field.textNode.layout.positionOffset![0]).toBeLessThan(0);
        expect(field.lastGeometryError).toBeUndefined();
        field.selectAll();
        for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
        expect(
          (field.panel.children[0] as import('../src').UiPanelComponent).children.length
        ).toBeLessThan(6);
        expect(
          (field.panel.children[0] as import('../src').UiPanelComponent).children.length
        ).toBeGreaterThan(0);
        expect(field.lastGeometryError).toBeUndefined();
        const area = new UiTextArea(editUi, editRoot.root, {
          value: 'ab\ncd',
          width: 240,
          height: 100,
          mapToWindow: () => [12, 34, 2, 18]
        });
        editRoot.flush();
        for (let i = 0; i < 5; i++) advanceFrame(runtime, transport);
        expect(area.requestFocus(windowId)).toBe(true);
        for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
        expect(candidateAreas.at(-1)).toEqual([windowId, 12, 34, 2, 18]);
        area.setSelection(4);
        runtime.interaction.handleKeyboard({
          kind: 'keyboard',
          type: 'input',
          windowId,
          physicalKey: 'ArrowUp',
          logicalKey: 'ArrowUp',
          state: 'pressed',
          repeat: false,
          modifiers: { ctrl: false, shift: false, alt: false, superKey: false }
        });
        expect(area.selection.focus).toBe(1);
        editUi.dispose();
        const values = createUi6Scene(runtime, target, windowId, [width, height]);
        for (let i = 0; i < 4; i++) advanceFrame(runtime, transport);
        const checkboxRect = values.realm.getUiLayout(
          values.root.handle,
          values.checkbox.panel.id
        ).absoluteRect;
        click(checkboxRect[0] + checkboxRect[2] / 2, checkboxRect[1] + checkboxRect[3] / 2);
        expect(values.checkbox.value).toBe(true);
        const toggleRect = values.realm.getUiLayout(
          values.root.handle,
          values.toggle.panel.id
        ).absoluteRect;
        click(toggleRect[0] + toggleRect[2] / 2, toggleRect[1] + toggleRect[3] / 2);
        expect(values.toggle.value).toBe(false);
        const radio = values.radios.getRadio('high')!;
        const radioRect = values.realm.getUiLayout(values.root.handle, radio.panel.id).absoluteRect;
        click(radioRect[0] + radioRect[2] / 2, radioRect[1] + radioRect[3] / 2);
        expect(values.radios.value).toBe('high');
        const sliderRect = values.realm.getUiLayout(
          values.root.handle,
          values.slider.panel.id
        ).absoluteRect;
        click(sliderRect[0] + sliderRect[2] - 8, sliderRect[1] + sliderRect[3] / 2);
        expect(values.slider.value).toBe(100);
        const sy = sliderRect[1] + sliderRect[3] / 2;
        const right = sliderRect[0] + sliderRect[2] - 8;
        const left = sliderRect[0] + 8;
        runtime.interaction.handle(move(windowId, right, sy) as PointerEvent);
        runtime.interaction.handle(button(windowId, right, sy, 'pressed') as PointerEvent);
        runtime.interaction.handle(move(windowId, left, sy) as PointerEvent);
        runtime.interaction.handle(button(windowId, left, sy, 'released') as PointerEvent);
        expect(values.slider.value).toBe(0);
        for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
        runtime.interaction.handle(move(windowId, left + 2, sy) as PointerEvent);
        runtime.interaction.handle(button(windowId, left + 2, sy, 'pressed') as PointerEvent);
        runtime.interaction.handle(
          move(windowId, left + (right - left) * 0.25, sy) as PointerEvent
        );
        expect(values.slider.value).toBeGreaterThanOrEqual(20);
        expect(values.slider.value).toBeLessThanOrEqual(30);
        advanceFrame(runtime, transport);
        runtime.interaction.handle(
          move(windowId, left + (right - left) * 0.75, sy) as PointerEvent
        );
        expect(values.slider.value).toBeGreaterThanOrEqual(70);
        expect(values.slider.value).toBeLessThanOrEqual(80);
        advanceFrame(runtime, transport);
        runtime.interaction.handle(move(windowId, right + 30, sy) as PointerEvent);
        expect(values.slider.value).toBe(100);
        runtime.interaction.handle(move(windowId, left - 20, sy) as PointerEvent);
        expect(values.slider.value).toBe(0);
        runtime.interaction.handle(move(windowId, left + (right - left) * 0.5, sy) as PointerEvent);
        expect(values.slider.value).toBeGreaterThanOrEqual(45);
        expect(values.slider.value).toBeLessThanOrEqual(55);
        runtime.interaction.handle(
          button(windowId, left + (right - left) * 0.5, sy, 'released') as PointerEvent
        );
        for (let i = 0; i < 2; i++) advanceFrame(runtime, transport);
        const wheel = (delta: number) =>
          runtime.interaction.handle({
            kind: 'pointer',
            type: 'scroll',
            windowId,
            pointerId: 0,
            pointerType: 'mouse',
            position: [left + (right - left) * 0.5, sy],
            delta: { lines: [0, delta] }
          });
        wheel(1);
        expect(values.slider.value).toBe(55);
        wheel(-1);
        expect(values.slider.value).toBe(50);
        const select = values.select!;
        const selectRect = values.realm.getUiLayout(
          values.root.handle,
          select.panel.id
        ).absoluteRect;
        click(selectRect[0] + selectRect[2] / 2, selectRect[1] + selectRect[3] / 2);
        expect(select.isOpen).toBe(true);
        for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
        const popup = select.popover.root!;
        const option = popup.root.children[2]!;
        const optionRect = values.realm.getUiLayout(popup.handle, option.id).absoluteRect;
        const screen = uiTextRectToWindow(runtime, popup, windowId, optionRect)!;
        click(screen[0] + screen[2] / 2, screen[1] + screen[3] / 2);
        expect(select.value).toBe('dark');
        expect(select.isOpen).toBe(false);
        values.dispose();
        const widgets = createUi7Scene(runtime, target, windowId, [width, height]);
        for (let i = 0; i < 4; i++) advanceFrame(runtime, transport);
        const clickWidget = (id: number) => {
          const rect = widgets.realm.getUiLayout(widgets.root.handle, id).absoluteRect;
          click(rect[0] + rect[2] / 2, rect[1] + rect[3] / 2);
        };
        clickWidget(widgets.menuButton.panel.id);
        expect(widgets.menu?.isOpen).toBe(true);
        for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
        const menuRoot = widgets.menu!.popover.root!;
        const menuItem = widgets.menu!.itemPanel('open')!;
        const menuRect = widgets.realm.getUiLayout(menuRoot.handle, menuItem.id).absoluteRect;
        const menuScreen = uiTextRectToWindow(runtime, menuRoot, windowId, menuRect)!;
        click(menuScreen[0] + menuScreen[2] / 2, menuScreen[1] + menuScreen[3] / 2);
        expect(widgets.menu?.isOpen).toBe(false);
        for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
        clickWidget(widgets.menuButton.panel.id);
        for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
        const exportRoot = widgets.menu!.popover.root!;
        const exportRect = widgets.realm.getUiLayout(
          exportRoot.handle,
          widgets.menu!.itemPanel('export')!.id
        ).absoluteRect;
        const exportScreen = uiTextRectToWindow(runtime, exportRoot, windowId, exportRect)!;
        runtime.interaction.handle(
          move(
            windowId,
            exportScreen[0] + exportScreen[2] / 2,
            exportScreen[1] + exportScreen[3] / 2
          ) as PointerEvent
        );
        for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
        const focused = widgets.ui.getFocused(windowId);
        expect(focused?.target.type).toBe('ui');
        if (focused?.target.type === 'ui') expect(focused.target.uiId).not.toBe(exportRoot.uiId);
        widgets.menu!.close();
        for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
        clickWidget(widgets.dialogButton.panel.id);
        expect(widgets.dialog?.isOpen).toBe(true);
        for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
        expect(widgets.menuButton.requestFocus(windowId)).toBe(false);
        click(4, 4);
        expect(widgets.dialog?.isOpen).toBe(false);
        expect(widgets.dialogButton.getInteractionState(windowId).focus).toBe(true);
        widgets.dispose();
        const integrated = createUi8Scene(runtime, target, windowId, [width, height]);
        for (let i = 0; i < 4; i++) advanceFrame(runtime, transport);
        const fieldRect = integrated.realm.getUiLayout(
          integrated.root.handle,
          integrated.input.panel.id
        ).absoluteRect;
        click(fieldRect[0] + 20, fieldRect[1] + fieldRect[3] / 2);
        expect(integrated.input.getInteractionState(windowId).focus).toBe(true);
        runtime.interaction.handleKeyboard({
          kind: 'keyboard',
          type: 'textInput',
          windowId,
          text: 'X'
        });
        expect(integrated.input.value).toContain('X');
        const menuRect8 = integrated.realm.getUiLayout(
          integrated.root.handle,
          integrated.menuButton.panel.id
        ).absoluteRect;
        click(menuRect8[0] + menuRect8[2] / 2, menuRect8[1] + menuRect8[3] / 2);
        expect(integrated.menu?.isOpen).toBe(true);
        integrated.menu?.close();
        for (let i = 0; i < 3; i++) advanceFrame(runtime, transport);
        runtime.interaction.handleKeyboard({
          kind: 'keyboard',
          type: 'input',
          windowId,
          physicalKey: 'Enter',
          logicalKey: 'Enter',
          state: 'pressed',
          repeat: false,
          modifiers: { ctrl: false, shift: false, alt: false, superKey: false }
        });
        runtime.interaction.handleKeyboard({
          kind: 'keyboard',
          type: 'input',
          windowId,
          physicalKey: 'Enter',
          logicalKey: 'Enter',
          state: 'released',
          repeat: false,
          modifiers: { ctrl: false, shift: false, alt: false, superKey: false }
        });
        expect(integrated.menuButton.getInteractionState(windowId).focusVisible).toBe(true);
        expect(integrated.menu?.isOpen).toBe(true);
        integrated.dispose();
      } finally {
        runtime.dispose();
      }
    }
  );
});
