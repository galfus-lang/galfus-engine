import { describe, expect, it } from 'bun:test';
import { SpriteSheet } from '@galfus/engine';
import type { PointerEvent } from '@galfus/transport-types';
import { button, move, setup } from '../../engine/test/interactive-fixture';
import { advanceFrame } from '../../demos/test/test-helpers';
import { createUi, UiCheckbox, UiIconAtlas, UiRadio, UiSelect, UiSwitch } from '../src';

describe('component sprite icons', () => {
  it('renders default state icons and routes pointer activation from the sprite to its control', () => {
    const f = setup();
    try {
      const ui = createUi(f.runtime);
      const root = ui.createComponentRoot(f.realm, { width: 300, height: 200 });
      const box = new UiCheckbox(root.root, { label: 'Choice' });
      const radio = new UiRadio(root.root, { value: true, label: 'Radio' });
      const toggle = new UiSwitch(root.root);
      const atlas = ui.icons;
      expect(box.labelNode.text).toBe('Choice');
      expect(root.nodeSnapshot(box.icon.panel.id).kind).toMatchObject({
        type: 'spritePanel',
        textureId: atlas.sheet.textureId,
        uvRect: atlas.sheet.uvRect(0)
      });
      expect(root.nodeSnapshot(radio.icon.panel.id).kind.uvRect).toEqual(atlas.sheet.uvRect(4));
      expect(root.nodeSnapshot(toggle.icon.panel.id).kind.uvRect).toEqual(atlas.sheet.uvRect(5));
      root.flush();
      advanceFrame(f.runtime, f.transport);
      const interaction = f.runtime.interaction as any;
      const emit = (type: string, pointer: PointerEvent) => {
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
                colliderId: 1,
                elementId: box.icon.panel.id,
                localPos: [0, 0],
                uv: [0, 0],
                delta: [0, 0]
              }
            ])
        });
      };
      emit('hover', move(f.windowId, 10, 10) as PointerEvent);
      emit('down', button(f.windowId, 10, 10, 'pressed') as PointerEvent);
      expect(box.getInteractionState(f.windowId)).toMatchObject({
        hover: true,
        active: true,
        focus: true
      });
      emit('pressup', button(f.windowId, 10, 10, 'released') as PointerEvent);
      emit('click', button(f.windowId, 10, 10, 'released') as PointerEvent);
      expect(box.checked).toBe(true);
      expect(root.nodeSnapshot(box.icon.panel.id).kind.uvRect).toEqual(atlas.sheet.uvRect(1));
      box.setDisabled(true);
      emit('click', button(f.windowId, 10, 10, 'released') as PointerEvent);
      expect(box.checked).toBe(true);
    } finally {
      f.runtime.dispose();
    }
  });

  it('animates custom frames on ticks, preserves staged changes, and cleans up removed icons', () => {
    const f = setup();
    try {
      const ui = createUi(f.runtime);
      const sheet = new SpriteSheet({
        textureId: 42,
        textureSize: [4, 1],
        grid: { columns: 4, rows: 1, frameSize: [1, 1] }
      });
      ui.setIconAtlas(
        new UiIconAtlas(sheet, {
          checkbox: {
            states: { unchecked: 0, checked: 3 },
            transitions: { 'unchecked|checked': { frames: [1, 2], frameDuration: 0.1 } }
          }
        })
      );
      const root = ui.createComponentRoot(f.realm, { width: 300, height: 200 });
      const box = new UiCheckbox(root.root);
      const radio = new UiRadio(root.root);
      expect(root.nodeSnapshot(radio.icon.panel.id).kind.textureId).not.toBe(42);
      root.flush();
      advanceFrame(f.runtime, f.transport);
      box.setChecked(true);
      expect(root.nodeSnapshot(box.icon.panel.id).kind.uvRect).toEqual(sheet.uvRect(1));
      advanceFrame(f.runtime, f.transport, 0.1);
      expect(root.nodeSnapshot(box.icon.panel.id).kind.uvRect).toEqual(sheet.uvRect(2));
      box.labelNode.setText('staged');
      advanceFrame(f.runtime, f.transport, 0.1);
      expect(root.syncState).toBe('pending');
      root.discardChanges();
      advanceFrame(f.runtime, f.transport, 0.1);
      expect(root.nodeSnapshot(box.icon.panel.id).kind.uvRect).toEqual(sheet.uvRect(3));
      box.remove();
      root.flush();
      expect(() => advanceFrame(f.runtime, f.transport, 1)).not.toThrow();
    } finally {
      f.runtime.dispose();
    }
  });

  it('keeps the select indicator in sync when its popover opens and closes', () => {
    const f = setup();
    try {
      const ui = createUi(f.runtime);
      const root = ui.createComponentRoot(f.realm, {
        width: 300,
        height: 200,
        windowId: f.windowId
      });
      const manager = ui.createOverlayManager(root, f.windowId);
      const select = new UiSelect(root.root, manager, { options: [{ value: 'x', label: 'X' }] });
      f.transport.engine.realm2dGetUiLayout = (_realm, model, id) =>
        JSON.stringify({
          absoluteRect:
            model === root.uiId && id === root.root.id ? [0, 0, 300, 200] : [10, 10, 100, 36]
        });
      root.flush();
      advanceFrame(f.runtime, f.transport);
      expect(select.labelNode.text).toBe('Select...');
      select.open();
      expect(root.nodeSnapshot(select.icon.panel.id).kind.uvRect).toEqual(ui.icons.sheet.uvRect(9));
      select.close();
      expect(root.nodeSnapshot(select.icon.panel.id).kind.uvRect).toEqual(ui.icons.sheet.uvRect(7));
    } finally {
      f.runtime.dispose();
    }
  });
});
